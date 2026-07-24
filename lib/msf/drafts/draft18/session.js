/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft18.Session');

goog.require('shaka.log');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.TrackAliasRegistry');
goog.require('shaka.msf.Utils');
goog.require('shaka.msf.Writer');
goog.require('shaka.msf.draft18.MessageTypeId');
goog.require('shaka.msf.draft18.MessageWriter');
goog.require('shaka.util.Functional');


/**
 * A draft-18 MoQT session.
 *
 * The topology is what separates this from draft-16:
 *
 *  - Control messages travel on a *pair* of unidirectional streams, one
 *    opened by each peer, each beginning with a SETUP message. Incoming
 *    unidirectional streams therefore carry either the peer's control stream
 *    or object data, told apart by the first message type on the stream.
 *  - Every request gets its own bidirectional stream, and the response comes
 *    back on that same stream. There is no Request ID on responses and no
 *    dispatch table: the stream *is* the correlation, so a request is just an
 *    await on its own reader.
 *
 * @implements {shaka.extern.MsfSession}
 * @final
 */
shaka.msf.draft18.Session = class {
  /**
   * @param {!WebTransport} webTransport
   * @param {!shaka.msf.Writer} controlWriter Our outgoing control stream,
   *   already carrying our SETUP.
   * @param {!shaka.extern.MsfDialect} dialect
   * @param {!shaka.extern.MsfManifestConfiguration} config
   */
  constructor(webTransport, controlWriter, dialect, config) {
    /** @private {!WebTransport} */
    this.webTransport_ = webTransport;
    /** @private {!shaka.msf.Writer} */
    this.controlWriter_ = controlWriter;
    /** @private {!shaka.extern.MsfDialect} */
    this.dialect_ = dialect;
    /** @private {!shaka.extern.MsfManifestConfiguration} */
    this.config_ = config;
    /** @private {!shaka.msf.TrackAliasRegistry} */
    this.trackRegistry_ = new shaka.msf.TrackAliasRegistry();
    /** @private {bigint} */
    this.nextRequestId_ = BigInt(0);
    /** @private {boolean} */
    this.isClosing_ = false;
    /** @private {!Set<function(Array<string>)>} */
    this.publishNamespaceCallbacks_ = new Set();
    /** @private {!Map<bigint, !shaka.msf.Utils.ObjectCallback>} */
    this.fetchCallbacks_ = new Map();

    this.startListeningForStreams_();
  }

  /** @override */
  configure(config) {
    this.config_ = config;
  }

  /**
   * Client Request IDs are even and start at 0.
   *
   * @return {bigint}
   * @private
   */
  getNextRequestId_() {
    const requestId = this.nextRequestId_;
    this.nextRequestId_ += BigInt(2);
    return requestId;
  }

  /**
   * Opens a bidirectional stream, writes a request onto it and returns the
   * reader the response will arrive on. The stream is the correlation, so
   * nothing is registered anywhere.
   *
   * @param {!Uint8Array} requestBytes
   * @return {!Promise<!shaka.msf.Reader>}
   * @private
   */
  async openRequest_(requestBytes) {
    const stream = await this.webTransport_.createBidirectionalStream();
    const writer = new shaka.msf.Writer(stream.writable);
    await writer.write(requestBytes);
    return new shaka.msf.Reader(
        new Uint8Array([]), stream.readable, this.dialect_.getCodec());
  }

  /**
   * Reads one control message header from a stream.
   *
   * @param {!shaka.msf.Reader} reader
   * @return {!Promise<{type: number, length: number}>}
   * @private
   */
  async readMessageHeader_(reader) {
    const type = await reader.u53();
    const lengthBytes = await reader.read(2);
    return {type, length: (lengthBytes[0] << 8) | lengthBytes[1]};
  }

  /**
   * Waits for the response to a request, which is either a REQUEST_OK-shaped
   * acknowledgement or a REQUEST_ERROR.
   *
   * @param {!shaka.msf.Reader} reader
   * @param {number} okType The success message type for this request.
   * @param {string} description Used in error messages.
   * @return {!Promise<!shaka.msf.Reader>} The reader, positioned just after
   *   the response header.
   * @private
   */
  async awaitResponse_(reader, okType, description) {
    const header = await this.readMessageHeader_(reader);

    if (header.type == shaka.msf.draft18.MessageTypeId.REQUEST_ERROR) {
      // REQUEST_ERROR: Error Code, Reason, then an optional Redirect we do
      // not act on.
      const code = await reader.u62();
      const reason = await reader.string();
      throw new Error(
          `${description} failed: code ${code}, reason "${reason}"`);
    }

    if (header.type != okType) {
      throw new Error(`${description}: unexpected response type ` +
          `0x${header.type.toString(16)}`);
    }

    return reader;
  }

  /** @override */
  async subscribe(namespace, trackName, callback) {
    const description = `subscribe ${namespace.join('/')}:${trackName}`;
    const requestId = this.getNextRequestId_();

    const writer = new shaka.msf.draft18.MessageWriter(
        this.dialect_.getCodec());
    writer.marshalSubscribe({
      requestId,
      namespace,
      trackName,
      params: this.buildSubscribeParams_(),
    });

    const reader = await this.openRequest_(writer.getBytes());
    await this.awaitResponse_(
        reader, shaka.msf.draft18.MessageTypeId.SUBSCRIBE_OK, description);

    // SUBSCRIBE_OK leads with the Track Alias; draft-16 put a Request ID
    // ahead of it, which is gone here.
    const trackAlias = await reader.u62();

    this.trackRegistry_.registerTrackWithAlias(
        namespace, trackName, requestId, trackAlias);
    this.trackRegistry_.registerCallback(trackAlias, callback);

    shaka.log.debug(`Subscribed to ${description}, alias ${trackAlias}`);

    // Hold the stream open: it is the subscription's lifetime, and
    // REQUEST_UPDATE and PUBLISH_DONE arrive on it.
    this.listenOnRequestStream_(reader, trackAlias);

    return trackAlias;
  }

  /**
   * Builds the parameter list carried by SUBSCRIBE. Draft-16 moved the
   * subscriber priority, forward flag, filter and group order out of fixed
   * fields into parameters, and draft-18 keeps them there.
   *
   * @return {!Array<shaka.msf.Utils.KeyValuePair>}
   * @private
   */
  buildSubscribeParams_() {
    const PARAM_FORWARD = BigInt(0x10);
    const PARAM_SUBSCRIBER_PRIORITY = BigInt(0x20);
    const PARAM_GROUP_ORDER = BigInt(0x22);

    return [
      {type: PARAM_FORWARD, value: BigInt(1)},
      {type: PARAM_SUBSCRIBER_PRIORITY, value: BigInt(0)},
      {
        type: PARAM_GROUP_ORDER,
        value: BigInt(shaka.msf.Utils.GroupOrder.PUBLISHER),
      },
    ];
  }

  /**
   * Keeps reading a subscription's request stream after the SUBSCRIBE_OK so
   * that PUBLISH_DONE closes the track.
   *
   * @param {!shaka.msf.Reader} reader
   * @param {bigint} trackAlias
   * @return {!Promise}
   * @private
   */
  async listenOnRequestStream_(reader, trackAlias) {
    try {
      // eslint-disable-next-line no-await-in-loop
      while (!(await reader.done())) {
        // eslint-disable-next-line no-await-in-loop
        const header = await this.readMessageHeader_(reader);
        if (header.type == shaka.msf.draft18.MessageTypeId.PUBLISH_DONE) {
          shaka.log.debug(`PUBLISH_DONE for track ${trackAlias}`);
          const trackInfo =
              this.trackRegistry_.getTrackInfoFromAlias(trackAlias);
          if (trackInfo) {
            trackInfo.closed = true;
            this.trackRegistry_.unregisterAllCallbacks(trackAlias);
          }
          return;
        }
        // Anything else on this stream is not something we act on; skip its
        // payload so the stream stays framed.
        // eslint-disable-next-line no-await-in-loop
        await reader.read(header.length);
      }
    } catch (error) {
      if (!this.isClosing_) {
        shaka.log.debug(
            `Request stream for track ${trackAlias} ended:`, error);
      }
    }
  }

  /** @override */
  unsubscribe(trackAlias) {
    const trackInfo = this.trackRegistry_.getTrackInfoFromAlias(trackAlias);
    if (!trackInfo) {
      throw new Error(`Cannot unsubscribe: unknown alias ${trackAlias}`);
    }

    // Draft-17 removed the cancel messages: a subscriber withdraws by
    // resetting the request's bidirectional stream, so there is no
    // UNSUBSCRIBE to send. We drop the callbacks and let the stream close.
    this.trackRegistry_.unregisterAllCallbacks(trackAlias);
    shaka.log.debug(`Unsubscribed from track ${trackAlias}`);
    return Promise.resolve();
  }

  /** @override */
  async fetch(namespace, trackName, callback) {
    const description = `fetch ${namespace.join('/')}:${trackName}`;
    const requestId = this.getNextRequestId_();

    const writer = new shaka.msf.draft18.MessageWriter(
        this.dialect_.getCodec());
    writer.marshalFetch({
      requestId,
      namespace,
      trackName,
      startLocation: {group: BigInt(0), object: BigInt(0)},
      endLocation: {group: BigInt(0), object: BigInt(0)},
      params: [],
    });

    this.fetchCallbacks_.set(requestId, callback);

    try {
      const reader = await this.openRequest_(writer.getBytes());
      await this.awaitResponse_(
          reader, shaka.msf.draft18.MessageTypeId.FETCH_OK, description);
      shaka.log.debug(`${description} accepted`);
    } catch (error) {
      this.fetchCallbacks_.delete(requestId);
      throw error;
    }
  }

  /** @override */
  onNamespacePublished(callback) {
    this.publishNamespaceCallbacks_.add(callback);
    return () => {
      this.publishNamespaceCallbacks_.delete(callback);
    };
  }

  /**
   * Reads incoming unidirectional streams. Each is either the peer's control
   * stream, which begins with SETUP, or object data.
   *
   * @return {!Promise}
   * @private
   */
  async startListeningForStreams_() {
    try {
      const streams =
          this.webTransport_.incomingUnidirectionalStreams.getReader();

      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const {value: stream, done} = await streams.read();
        if (done) {
          return;
        }

        this.handleIncomingStream_(stream).catch((error) => {
          if (!this.isClosing_) {
            shaka.log.error('Error handling incoming stream:', error);
          }
        });
      }
    } catch (error) {
      if (!this.isClosing_) {
        shaka.log.error('Error listening for incoming streams:', error);
      }
    }
  }

  /**
   * @param {!ReadableStream} stream
   * @return {!Promise}
   * @private
   */
  async handleIncomingStream_(stream) {
    const reader = new shaka.msf.Reader(
        new Uint8Array([]), stream, this.dialect_.getCodec());

    try {
      const streamType = await reader.u62();

      if (streamType == BigInt(shaka.msf.draft18.MessageTypeId.SETUP)) {
        await this.handlePeerControlStream_(reader);
      } else if (this.isSubgroupStreamType_(streamType)) {
        await this.handleSubgroupStream_(reader, streamType);
      } else if (streamType == BigInt(shaka.msf.draft18.StreamType.FETCH)) {
        await this.handleFetchStream_(reader);
      } else {
        shaka.log.warning(`Unknown stream type: ${streamType}`);
      }
    } catch (error) {
      if (!this.isClosing_) {
        shaka.log.error('Error processing incoming stream:', error);
      }
    } finally {
      reader.close();
    }
  }

  /**
   * Reads the peer's SETUP and then keeps the control stream open for GOAWAY
   * and namespace announcements.
   *
   * @param {!shaka.msf.Reader} reader Positioned just after the SETUP type.
   * @return {!Promise}
   * @private
   */
  async handlePeerControlStream_(reader) {
    const lengthBytes = await reader.read(2);
    const length = (lengthBytes[0] << 8) | lengthBytes[1];
    // Setup Options span the payload; we do not need any of them yet.
    await reader.read(length);
    shaka.log.info('Received peer SETUP (draft-18)');

    // eslint-disable-next-line no-await-in-loop
    while (!(await reader.done())) {
      // eslint-disable-next-line no-await-in-loop
      const header = await this.readMessageHeader_(reader);
      // eslint-disable-next-line no-await-in-loop
      const payload = await reader.read(header.length);

      if (header.type == shaka.msf.draft18.MessageTypeId.GOAWAY) {
        shaka.log.info('Received GOAWAY on the control stream');
      } else {
        shaka.log.debug(
            `Ignoring control message type 0x${header.type.toString(16)} ` +
            `(${payload.byteLength} bytes)`);
      }
    }
  }

  /**
   * Draft-18 SUBGROUP_HEADER types have bit 4 set, spanning 0x10-0x1F,
   * 0x30-0x3F, 0x50-0x5F and 0x70-0x7F.
   *
   * @param {bigint} streamType
   * @return {boolean}
   * @private
   */
  isSubgroupStreamType_(streamType) {
    if (streamType > BigInt(0x7f)) {
      return false;
    }
    return (streamType & BigInt(0x10)) != BigInt(0);
  }

  /**
   * @param {!shaka.msf.Reader} reader
   * @param {bigint} streamType
   * @return {!Promise}
   * @private
   */
  async handleSubgroupStream_(reader, streamType) {
    const PROPERTIES_BIT = BigInt(0x01);
    const SUBGROUP_ID_MODE_MASK = BigInt(0x06);
    const DEFAULT_PRIORITY_BIT = BigInt(0x20);

    const hasProperties = (streamType & PROPERTIES_BIT) != BigInt(0);
    const subgroupIdMode =
        (streamType & SUBGROUP_ID_MODE_MASK) >> BigInt(1);

    if (subgroupIdMode == BigInt(0x03)) {
      throw new Error(`Reserved SUBGROUP_ID_MODE in type ${streamType}`);
    }

    const trackAlias = await reader.u62();
    const groupId = await reader.u62();

    /** @type {?bigint} */
    let subgroupId = null;
    if (subgroupIdMode == BigInt(0x00)) {
      subgroupId = BigInt(0);
    } else if (subgroupIdMode == BigInt(0x02)) {
      subgroupId = await reader.u62();
    }
    // Mode 0x01 leaves it as the first Object ID, filled in below.

    if ((streamType & DEFAULT_PRIORITY_BIT) == BigInt(0)) {
      await reader.u8(); // Publisher Priority, unused.
    }

    /** @type {bigint} */
    let previousObjectId = BigInt(0);
    let isFirstObject = true;

    // eslint-disable-next-line no-await-in-loop
    while (!(await reader.done())) {
      const payloadReadStartMs = Date.now();

      // Object IDs are delta encoded: the first is absolute, and each
      // subsequent one is previous + delta + 1.
      // eslint-disable-next-line no-await-in-loop
      const objectIdDelta = await reader.u62();
      const objectId = isFirstObject ?
          objectIdDelta :
          previousObjectId + objectIdDelta + BigInt(1);
      previousObjectId = objectId;

      if (isFirstObject && subgroupId === null) {
        subgroupId = objectId;
      }
      isFirstObject = false;

      /** @type {?Uint8Array} */
      let properties = null;
      if (hasProperties) {
        // eslint-disable-next-line no-await-in-loop
        const propertiesLength = await reader.u62();
        if (propertiesLength > BigInt(0)) {
          // eslint-disable-next-line no-await-in-loop
          properties = await reader.read(Number(propertiesLength));
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const payloadLength = await reader.u62();

      /** @type {?bigint} */
      let objectStatus = null;
      if (payloadLength == BigInt(0)) {
        // eslint-disable-next-line no-await-in-loop
        objectStatus = await reader.u62();
      }

      const data = payloadLength > BigInt(0) ?
          // eslint-disable-next-line no-await-in-loop
          await reader.read(Number(payloadLength)) :
          new Uint8Array([]);

      /** @type {shaka.msf.Utils.MOQObject} */
      const obj = {
        trackAlias,
        location: {group: groupId, object: objectId, subgroup: subgroupId},
        data,
        extensions: properties,
        status: objectStatus,
        payloadReadStartMs,
        receiveTimestampMs: Date.now(),
      };

      // eslint-disable-next-line no-await-in-loop
      await this.deliver_(trackAlias, obj);
    }
  }

  /**
   * Delivers an object, waiting briefly for the subscription to be registered
   * if the data stream beat the SUBSCRIBE_OK.
   *
   * @param {bigint} trackAlias
   * @param {shaka.msf.Utils.MOQObject} obj
   * @return {!Promise}
   * @private
   */
  async deliver_(trackAlias, obj) {
    const RETRY_INTERVAL = 0.1;
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (this.isClosing_) {
        return;
      }

      const trackInfo = this.trackRegistry_.getTrackInfoFromAlias(trackAlias);
      if (trackInfo?.closed) {
        return;
      }

      if (trackInfo && trackInfo.callbacks.length) {
        for (const callback of trackInfo.callbacks) {
          try {
            callback(obj);
          } catch (error) {
            shaka.log.error(`Error in object callback for ${trackAlias}:`,
                error);
          }
        }
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await shaka.util.Functional.delay(RETRY_INTERVAL);
    }

    if (!this.isClosing_) {
      shaka.log.warning(
          `Dropping object for unregistered track ${trackAlias}`);
    }
  }

  /**
   * @param {!shaka.msf.Reader} reader
   * @return {!Promise}
   * @private
   */
  async handleFetchStream_(reader) {
    const requestId = await reader.u62();
    const callback = this.fetchCallbacks_.get(requestId);
    if (!callback) {
      shaka.log.warning(`No callback for fetch requestId ${requestId}`);
      return;
    }

    // Draft-18 delta encodes Group ID as well as Object ID in fetch
    // responses (#1586), unlike the absolute values draft-16 sent.
    let previousGroupId = BigInt(0);
    let previousObjectId = BigInt(0);
    let isFirst = true;

    // eslint-disable-next-line no-await-in-loop
    while (!(await reader.done())) {
      const payloadReadStartMs = Date.now();

      // eslint-disable-next-line no-await-in-loop
      const groupIdDelta = await reader.u62();
      const groupId =
          isFirst ? groupIdDelta : previousGroupId + groupIdDelta;

      // eslint-disable-next-line no-await-in-loop
      const subgroupId = await reader.u62();

      // eslint-disable-next-line no-await-in-loop
      const objectIdDelta = await reader.u62();
      const objectId = (isFirst || groupId != previousGroupId) ?
          objectIdDelta :
          previousObjectId + objectIdDelta + BigInt(1);

      previousGroupId = groupId;
      previousObjectId = objectId;
      isFirst = false;

      // eslint-disable-next-line no-await-in-loop
      await reader.u8(); // Publisher Priority, unused.

      /** @type {?Uint8Array} */
      let properties = null;
      // eslint-disable-next-line no-await-in-loop
      const propertiesLength = await reader.u62();
      if (propertiesLength > BigInt(0)) {
        // eslint-disable-next-line no-await-in-loop
        properties = await reader.read(Number(propertiesLength));
      }

      // eslint-disable-next-line no-await-in-loop
      const payloadLength = await reader.u62();
      const data = payloadLength > BigInt(0) ?
          // eslint-disable-next-line no-await-in-loop
          await reader.read(Number(payloadLength)) :
          new Uint8Array([]);

      callback({
        trackAlias: BigInt(0),
        location: {group: groupId, object: objectId, subgroup: subgroupId},
        data,
        extensions: properties,
        status: null,
        payloadReadStartMs,
        receiveTimestampMs: Date.now(),
      });
    }

    this.fetchCallbacks_.delete(requestId);
  }

  /** @override */
  async close(code = 0, reason = '') {
    this.isClosing_ = true;
    this.webTransport_.close({closeCode: code, reason});
    await this.webTransport_.closed;
  }

  /** @override */
  release() {
    shaka.log.debug('Releasing draft-18 session');
    this.isClosing_ = true;
    this.publishNamespaceCallbacks_.clear();
    this.fetchCallbacks_.clear();
    this.trackRegistry_.clear();
  }
};


/**
 * Unidirectional stream types that are not control streams.
 *
 * @enum {number}
 */
shaka.msf.draft18.StreamType = {
  FETCH: 0x05,
};
