/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft18.Session', isMSFSupported, () => {
  const NAMESPACE = ['cmsf/clear'];
  const TRACK = 'catalog';

  /** @type {!shaka.msf.draft18.Session} */
  let session;
  /** @type {!Array<!Uint8Array>} */
  let written;
  /** @type {!ReadableStreamDefaultController} */
  let responses;

  /**
   * A bidirectional stream whose write side records bytes and whose read side
   * is fed by the test through `responses`.
   *
   * @return {!Object}
   */
  function fakeBidirectionalStream() {
    const writable = new WritableStream({
      write: (chunk) => {
        written.push(chunk);
      },
    });
    const readable = new ReadableStream({
      start: (controller) => {
        responses = controller;
      },
    });
    return {writable, readable};
  }

  beforeEach(() => {
    written = [];

    // The session listens on this for its lifetime, so it must never resolve
    // or the listen loop spins.
    const never = () => new Promise(() => {});

    const webTransport = /** @type {!WebTransport} */ (/** @type {?} */ ({
      incomingUnidirectionalStreams: {getReader: () => ({read: never})},
      createBidirectionalStream: () =>
        Promise.resolve(fakeBidirectionalStream()),
      close: () => {},
    }));

    const dialect = /** @type {!shaka.extern.MsfDialect} */ (/** @type {?} */ ({
      getCodec: () => new shaka.msf.draft18.Codec(),
    }));

    session = new shaka.msf.draft18.Session(
        webTransport,
        /** @type {!shaka.msf.Writer} */ (/** @type {?} */ ({
          write: () => Promise.resolve(),
        })),
        dialect,
        /** @type {!shaka.extern.MsfManifestConfiguration} */ (
          /** @type {?} */ ({})));
  });

  afterEach(() => {
    session.release();
  });

  /**
   * The registry is the session's own state, and a subscription can only be
   * established through a full SUBSCRIBE round trip.
   *
   * @return {!shaka.msf.TrackAliasRegistry}
   * @suppress {visibility}
   */
  function registryOf() {
    return session.trackRegistry_;
  }

  /**
   * The SUBSCRIBE_OK moqlivemock answers with: Track Alias 7, one
   * LARGEST_OBJECT parameter at {0, 0}, and no Track Properties.
   *
   * @return {!Uint8Array}
   */
  function subscribeOk() {
    return new Uint8Array([
      0x04, // SUBSCRIBE_OK
      0x00, 0x05, // Length
      0x07, // Track Alias
      0x01, // Parameter count
      0x09, 0x00, 0x00, // LARGEST_OBJECT = {group 0, object 0}
    ]);
  }

  /**
   * @return {!Uint8Array}
   */
  function publishDone() {
    return new Uint8Array([
      0x0b, // PUBLISH_DONE
      0x00, 0x03, // Length
      0x00, 0x00, 0x00, // Status Code, Stream Count, empty Reason
    ]);
  }

  /**
   * The bytes of the SUBSCRIBE this session sent, minus the type and length.
   *
   * @return {!Uint8Array}
   */
  function subscribePayload() {
    expect(written.length).toBe(1);
    const bytes = written[0];
    expect(bytes[0]).toBe(0x03); // SUBSCRIBE
    return bytes.subarray(3);
  }

  describe('subscribe', () => {
    it('omits GROUP_ORDER rather than asking for the publisher order',
        async () => {
          // Draft-16 said "the publisher's own order" with the value 0 of a
          // fixed field. As a parameter that value does not exist, and a
          // publisher that rejects the SUBSCRIBE over it answers nothing at
          // all, so the subscription hangs instead of failing.
          const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
          await shaka.test.Util.shortDelay();
          responses.enqueue(subscribeOk());
          await subscribed;

          const payload = subscribePayload();
          // Request ID 0, one namespace field, the track name, then the
          // parameters.
          const params = payload.subarray(
              1 + 1 + 1 + NAMESPACE[0].length + 1 + TRACK.length);
          expect(Array.from(params)).toEqual([
            0x02, // Parameter count
            0x10, 0x01, // FORWARD = 1
            0x10, 0x00, // delta 0x10 -> SUBSCRIBER_PRIORITY = 0
          ]);
        });

    it('resolves with the Track Alias', async () => {
      const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
      await shaka.test.Util.shortDelay();
      responses.enqueue(subscribeOk());
      expect(await subscribed).toBe(BigInt(7));
    });

    it('consumes the whole SUBSCRIBE_OK before reading the next message',
        async () => {
          // The parameters after the Track Alias are not read, but they still
          // have to be skipped: left in the stream, LARGEST_OBJECT's bytes
          // would be taken for the header of the next message and PUBLISH_DONE
          // would never be seen.
          const subscribed = session.subscribe(NAMESPACE, TRACK, () => {});
          await shaka.test.Util.shortDelay();
          responses.enqueue(subscribeOk());
          const alias = await subscribed;

          responses.enqueue(publishDone());
          await shaka.test.Util.shortDelay();

          expect(registryOf().getTrackInfoFromAlias(alias).closed).toBe(true);
        });
  });
});
