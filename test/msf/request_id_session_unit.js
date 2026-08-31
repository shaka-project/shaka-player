/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.RequestIdSession', isMSFSupported, () => {
  /** @type {!shaka.msf.RequestIdSession} */
  let session;
  /** @type {!Array<shaka.msf.Utils.Message>} */
  let sent;

  beforeEach(() => {
    sent = [];

    // The session listens on both of these for its lifetime, so they must
    // never resolve or the listen loops spin.
    const never = () => new Promise(() => {});

    const webTransport = /** @type {!WebTransport} */ (/** @type {?} */ ({
      incomingUnidirectionalStreams: {getReader: () => ({read: never})},
      close: () => {},
    }));
    const controlStream = /** @type {!shaka.msf.IControlStream} */ (
      /** @type {?} */ ({
        send: (msg) => {
          sent.push(msg);
          return Promise.resolve();
        },
        receive: never,
        close: () => {},
      }));

    session = new shaka.msf.RequestIdSession(
        webTransport, controlStream,
        /** @type {!shaka.extern.MsfDialect} */ (/** @type {?} */ ({})),
        /** @type {!shaka.extern.MsfManifestConfiguration} */ (
          /** @type {?} */ ({})));
  });

  describe('unsubscribe', () => {
    const ALIAS = BigInt(10);
    const NAMESPACE = ['msf', 'clear'];
    const TRACK = 'audio0';

    /** @type {!shaka.msf.TrackAliasRegistry} */
    let registry;

    /**
     * The registry is the session's own state; a subscription can only be
     * established through a full SUBSCRIBE round trip, which is not what
     * these tests are about.
     *
     * @return {!shaka.msf.TrackAliasRegistry}
     * @suppress {visibility}
     */
    function registryOf() {
      return /** @type {!shaka.msf.TrackAliasRegistry} */ (
        session.trackRegistry_);
    }

    /**
     * @param {number} requestId
     */
    function register(requestId) {
      registry.registerTrackWithAlias(
          NAMESPACE, TRACK, BigInt(requestId), ALIAS);
    }

    /**
     * @return {boolean}
     */
    function hasCallbacks() {
      const info = registry.getTrackInfoFromAlias(ALIAS);
      return !!info && info.callbacks.length > 0;
    }

    beforeEach(() => {
      registry = registryOf();
      register(/* requestId= */ 4);
      registry.registerCallback(ALIAS, () => {});
    });

    it('tears the track down when nothing re-subscribed', async () => {
      await session.unsubscribe(ALIAS);

      expect(sent.length).toBe(1);
      const unsubscribe =
      /** @type {shaka.msf.Utils.Unsubscribe} */ (sent[0]);
      expect(unsubscribe.requestId).toBe(BigInt(4));
      expect(hasCallbacks()).toBe(false);
    });

    it('leaves a subscription that replaced it during the delay', async () => {
      // unsubscribe() waits a blind half second for the message to go out,
      // because there is no acknowledgement.  A re-subscribe can complete
      // inside that window, and the relay hands out the same alias for the
      // same track name, so the delayed teardown would kill the NEW
      // subscription: the track goes silent forever with no error raised.
      const done = session.unsubscribe(ALIAS);

      // The relay answers a fresh SUBSCRIBE with the same alias.
      register(/* requestId= */ 6);
      registry.registerCallback(ALIAS, () => {});

      await done;

      const info = registry.getTrackInfoFromAlias(ALIAS);
      expect(info.requestId).toBe(BigInt(6));
      expect(hasCallbacks()).toBe(true);
    });

    it('rejects for an alias it does not know', async () => {
      const expected = jasmine.objectContaining({
        message: jasmine.stringMatching('No track info found'),
      });
      await expectAsync(session.unsubscribe(BigInt(99)))
          .toBeRejectedWith(expected);
    });
  });
});
