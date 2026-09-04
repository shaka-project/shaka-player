/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MSFTransport');

goog.require('shaka.log');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.util.Error');
goog.require('shaka.util.IReleasable');

goog.requireType('shaka.msf.Utils');


/**
 * MOQT (Media over QUIC Transport).
 *
 * Owns the WebTransport connection and the choice of draft; everything that
 * depends on which draft was negotiated lives behind the session that the
 * dialect hands back. The methods here are pure delegation, so the manifest
 * parser above never sees a draft-specific concept.
 *
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.msf.MSFTransport = class {
  /**
   * @param {!shaka.extern.MsfManifestConfiguration} config
   */
  constructor(config) {
    /** @private {?WebTransport} */
    this.webTransport_ = null;

    /** @private {!shaka.extern.MsfManifestConfiguration} */
    this.config_ = config;

    /** @private {?shaka.extern.MsfSession} */
    this.session_ = null;

    /** @private {?shaka.extern.MsfCodec} */
    this.codec_ = null;
  }

  /**
   * @param {!shaka.extern.MsfManifestConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.session_?.configure(config);
  }

  /**
   * @return {!shaka.extern.MsfManifestConfiguration}
   */
  getConfiguration() {
    return this.config_;
  }

  /**
   * @param {string} uri
   * @param {?Uint8Array} fingerprint
   * @param {?string=} authorizationToken
   * @return {!Promise<!shaka.extern.MsfSession>}
   */
  async connect(uri, fingerprint, authorizationToken) {
    if (!window.WebTransport) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.WEBTRANSPORT_NOT_AVAILABLE);
    }

    const options = {
      allowPooling: false,
      congestionControl: 'low-latency',
    };
    if (fingerprint) {
      options.serverCertificateHashes = [
        {
          algorithm: 'sha-256',
          value: fingerprint,
        },
      ];
    }

    // Offer every draft this build speaks that the configuration allows,
    // newest first, as WebTransport subprotocols.
    const offered =
        shaka.msf.DialectRegistry.getForVersion(this.config_.version);

    let webTransport = await this.open_(
        uri, options, offered.map((dialect) => dialect.getSubprotocol()));
    let dialect =
        shaka.msf.DialectRegistry.select(offered, webTransport.protocol);

    if (!dialect) {
      // The server took one of our offers but did not say which. The opening
      // handshake is itself a version negotiator — a server rejects a
      // connection whose subprotocols it does not speak — so ask again with
      // one draft at a time, newest first, and let the first server that
      // accepts answer the question the echo did not.
      shaka.log.debug(
          'Server accepted a MoQT subprotocol without echoing it; ' +
          'negotiating one draft at a time');
      webTransport.close();

      /** @type {?WebTransport} */
      let negotiated = null;
      for (const candidate of offered) {
        try {
          // The attempts are a negotiation: each one asks whether the server
          // speaks this draft, so they must run in order, newest first.
          // eslint-disable-next-line no-await-in-loop
          negotiated = await this.open_(
              uri, options, [candidate.getSubprotocol()]);
        } catch (error) {
          shaka.log.debug(
              `Server rejected ${candidate.getSubprotocol()}`, error);
          continue;
        }
        dialect = candidate;
        break;
      }

      if (!dialect || !negotiated) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.WEBTRANSPORT_INITIALIZATION_FAILED,
            'Server accepted no MoQT subprotocol on its own');
      }
      webTransport = negotiated;
    }

    this.webTransport_ = webTransport;
    shaka.log.info(`Connection established with ${dialect.getName()}`);

    this.codec_ = dialect.getCodec();
    this.session_ = await dialect.connect(
        this.webTransport_, this.config_, authorizationToken);

    return this.session_;
  }

  /**
   * Opens a WebTransport connection offering the given subprotocols, and
   * resolves once it is ready.
   *
   * @param {string} uri
   * @param {!Object} options The connection options, minus the subprotocols.
   * @param {!Array<string>} protocols
   * @return {!Promise<!WebTransport>}
   * @private
   */
  async open_(uri, options, protocols) {
    const webTransport =
        new WebTransport(uri, Object.assign({}, options, {protocols}));
    // Attach a handler to wt.closed up front. When the handshake fails (e.g.
    // self-signed cert with no fingerprint to pin against), Safari rejects
    // both wt.ready and wt.closed; without a handler on closed, Safari
    // surfaces an "Unhandled Promise Rejection: WebTransportError". The
    // rejection is also seen later by Connection.closed() — promises stay
    // rejected, so multiple handlers each see the same value.
    webTransport.closed.catch(() => {});
    await webTransport.ready;
    shaka.log.v1(
        `WebTransport connection established offering ${protocols.join(', ')}`);
    return webTransport;
  }
  
  /**
   * The primitive codec of the draft that was negotiated, or null before a
   * connection has been made. Packagings need it to read the MoQT-encoded
   * fields their objects carry.
   *
   * @return {?shaka.extern.MsfCodec}
   */
  getCodec() {
    return this.codec_;
  }

  /** @override */
  release() {
    shaka.log.v1('Closing client connection');
    this.session_?.release();
    this.session_ = null;
    this.codec_ = null;
  }

  /**
   * Subscribe to a track by namespace and track name
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise<bigint>}
   */
  subscribeTrack(namespace, trackName, callback) {
    if (!this.session_) {
      throw new Error('Cannot subscribe: not connected');
    }
    return this.session_.subscribe(namespace, trackName, callback);
  }

  /**
   * Unsubscribe from a track by track alias
   *
   * @param {bigint} trackAlias
   * @return {!Promise}
   */
  unsubscribeTrack(trackAlias) {
    if (!this.session_) {
      throw new Error('Cannot unsubscribe: not connected');
    }
    return this.session_.unsubscribe(trackAlias);
  }

  /**
   * Fetch a track (one-shot retrieval instead of ongoing subscription)
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise}
   */
  fetchTrack(namespace, trackName, callback) {
    if (!this.session_) {
      throw new Error('Cannot fetch: not connected');
    }
    return this.session_.fetch(namespace, trackName, callback);
  }

  /**
   * Register a callback to be notified when a PublishNamespace message is
   * received.
   *
   * @param {function(Array<string>)} callback
   * @return {function()} A function to unregister the callback
   */
  registerPublishNamespaceCallback(callback) {
    if (!this.session_) {
      throw new Error('Cannot register callback: not connected');
    }
    return this.session_.onNamespacePublished(callback);
  }
};
