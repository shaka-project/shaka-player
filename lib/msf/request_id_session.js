/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.RequestIdSession');

goog.require('shaka.log');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.TrackAliasRegistry');
goog.require('shaka.msf.Utils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Functional');


/**
 * A draft-16 MoQT session.
 *
 * Owns everything about the draft that the layers above must not know:
 *
 *  - Topology. Draft-16 carries every control message over one bidirectional
 *    stream, and object data over incoming unidirectional streams.
 *  - Correlation. Responses carry the Request ID of the request they answer,
 *    so pending requests are tracked in a map keyed by message kind and
 *    Request ID. Draft-17 moved each request onto its own bidirectional
 *    stream and dropped the Request ID from responses, so this scheme is
 *    specific to draft-16 and earlier.
 *  - The data plane, including the SUBGROUP_HEADER and FETCH_HEADER wire
 *    formats.
 *
 * It exposes only intent -- subscribe, fetch, unsubscribe -- and delivers
 * objects as the draft-neutral shaka.msf.Utils.MOQObject.
 *
 * @implements {shaka.extern.MsfSession}
 * @final
 */
shaka.msf.RequestIdSession = class {
  /**
   * @param {!WebTransport} webTransport
   * @param {!shaka.extern.MsfControlStream} controlStream
   * @param {!shaka.extern.MsfDialect} dialect
   * @param {!shaka.extern.MsfManifestConfiguration} config
   */
  constructor(webTransport, controlStream, dialect, config) {
    /** @private {!WebTransport} */
    this.webTransport_ = webTransport;
    /** @private {!shaka.extern.MsfControlStream} */
    this.controlStream_ = controlStream;
    /** @private {!shaka.extern.MsfDialect} */
    this.dialect_ = dialect;
    /** @private {!shaka.extern.MsfManifestConfiguration} */
    this.config_ = config;
    /** @private {shaka.msf.TrackAliasRegistry} */
    this.trackRegistry_ = new shaka.msf.TrackAliasRegistry();
    /** @private {bigint} */
    this.nextRequestId_ = BigInt(0);
    /** @private {!Set<shaka.util.Timer>} */
    this.timersSet_ = new Set();
    /** @private {boolean} */
    this.isClosing_ = false;
    /** @private {Map<bigint, !shaka.msf.Utils.ObjectCallback>} */
    this.fetchCallbacks_ = new Map();

    /** @private {!Set<function(Array<string>)>} */
    this.publishNamespaceCallbacks_ = new Set();

    /**
     * Pending requests, keyed by the kind of response expected and then by the
     * Request ID that will carry it.
     *
     * @private {!Map<shaka.msf.Utils.MessageType,
     *                Map<bigint, shaka.msf.Utils.MessageHandler>>}
     */
    this.messageHandlers_ = new Map();

    this.startListeningForStreams_();
    this.listenForControlMessages_();
  }

  /**
   * @param {!shaka.extern.MsfManifestConfiguration} config
   * @override
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * Get the next request ID. Client request IDs are even numbers starting at
   * 0, incrementing by 2.
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
   * Registers a one-shot handler for the response to a request.
   *
   * @param {shaka.msf.Utils.MessageType} kind
   * @param {bigint} requestId
   * @param {shaka.msf.Utils.MessageHandler} handler
   * @return {function()} Unregisters the handler.
   * @private
   */
  registerMessageHandler_(kind, requestId, handler) {
    if (!this.messageHandlers_.has(kind)) {
      this.messageHandlers_.set(kind, new Map());
    }
    const handlersForKind = this.messageHandlers_.get(kind);
    handlersForKind.set(requestId, handler);

    return () => {
      this.messageHandlers_.get(kind)?.delete(requestId);
    };
  }

  /**
   * Reads control messages until the session closes, answering the ones the
   * session handles itself and routing the rest to whoever is waiting on that
   * Request ID.
   *
   * @return {!Promise}
   * @private
   */
  async listenForControlMessages_() {
    shaka.log.v1('Starting to listen for control messages');
    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const msg = await this.controlStream_.receive();

        if (msg.kind === shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE) {
          // eslint-disable-next-line no-await-in-loop
          await this.handlePublishNamespace_(
              /** @type {shaka.msf.Utils.PublishNamespace} */ (msg));
        } else if (msg.kind === shaka.msf.Utils.MessageType.PUBLISH_DONE) {
          this.handlePublishDone_(
              /** @type {shaka.msf.Utils.PublishDone} */ (msg).requestId);
        } else if ('requestId' in msg) {
          // Not every message carries a Request ID, hence the bracket access.
          const requestId = msg['requestId'];
          const handlersForKind = this.messageHandlers_.get(msg.kind);
          const handler = handlersForKind?.get(requestId);
          if (handler) {
            try {
              handler(msg);
            } catch (error) {
              shaka.log.error(`Error in message handler for kind ${msg.kind} ` +
                  `with requestId ${requestId}:`, error);
            }
            // One-shot.
            handlersForKind.delete(requestId);
          } else {
            shaka.log.debug(`No handler for message kind ${msg.kind} with ` +
                `requestId ${requestId}`);
          }
        } else {
          shaka.log.debug(
              `Received message of kind ${msg.kind} without a request ID`);
        }
      }
    } catch (error) {
      if (error instanceof Error &&
          error.message.includes('session is closed')) {
        shaka.log.debug('Control message listener stopped: connection closed');
      } else if (!this.isClosing_) {
        shaka.log.error('Error while listening for control messages:', error);
      }
    }
  }

  /**
   * The relay announces namespaces it can serve. Acknowledge, then tell
   * anyone listening.
   *
   * @param {shaka.msf.Utils.PublishNamespace} msg
   * @return {!Promise}
   * @private
   */
  async handlePublishNamespace_(msg) {
    shaka.log.info(
        `Received PublishNamespace: ${msg.namespace.join('/')}`);

    try {
      await this.controlStream_.send({
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
        requestId: msg.requestId,
        namespace: msg.namespace,
      });
    } catch (error) {
      shaka.log.error('Error sending PublishNamespaceOk:', error);
    }

    for (const callback of this.publishNamespaceCallbacks_) {
      try {
        callback(msg.namespace);
      } catch (error) {
        shaka.log.error('Error in PublishNamespace callback:', error);
      }
    }
  }

  /**
   * @param {function(Array<string>)} callback
   * @return {function()} Unregisters the callback.
   * @override
   */
  onNamespacePublished(callback) {
    this.publishNamespaceCallbacks_.add(callback);
    return () => {
      this.publishNamespaceCallbacks_.delete(callback);
    };
  }

  /**
   * @param {number=} code
   * @param {string=} reason
   * @return {!Promise}
   * @override
   */
  async close(code = 0, reason = '') {
    shaka.log.v1(`Closing connection with code ${code}: ${reason}`);
    this.webTransport_.close({closeCode: code, reason});
    await this.webTransport_.closed;
  }

  /**
   * Start listening for incoming unidirectional streams
   *
   * @return {!Promise}
   * @private
   */
  async startListeningForStreams_() {
    shaka.log.debug('Starting to listen for incoming unidirectional streams');

    try {
      const reader =
          this.webTransport_.incomingUnidirectionalStreams.getReader();

      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const {value: stream, done} = await reader.read();

        if (done) {
          shaka.log.debug('Incoming stream reader is done');
          break;
        }

        // Handle the stream in a separate task
        this.handleIncomingStream_(stream).catch((error) => {
          shaka.log.error('Error handling incoming stream:', error);
        });
      }
    } catch (error) {
      shaka.log.error('Error listening for incoming streams:', error);
    }
  }

  /**
   * Check if a stream type is a valid SUBGROUP_HEADER type.
   * Draft-11: 0x08-0x0D
   * Draft-14: 0x10-0x15, 0x18-0x1D
   * Draft-16: adds 0x30-0x35, 0x38-0x3D (with DEFAULT_PRIORITY bit 0x20)
   *
   * @param {bigint} streamType
   * @return {boolean}
   * @private
   */
  isSubgroupStreamType_(streamType) {
    // Strip the DEFAULT_PRIORITY bit (0x20) to normalize
    const low = streamType & BigInt(0x1f);
    return (low >= BigInt(0x08) && low <= BigInt(0x0d)) ||
           (low >= BigInt(0x10) && low <= BigInt(0x15))||
           (low >= BigInt(0x18) && low <= BigInt(0x1d));
  }

  /**
   * Draft-16: returns true when the DEFAULT_PRIORITY bit (0x20) is set
   *
   * @param {bigint} streamType
   * @return {boolean}
   * @private
   */
  hasDefaultPriority_(streamType) {
    return (streamType & BigInt(0x20)) !== BigInt(0);
  }

  /**
   * Handle an incoming unidirectional stream
   *
   * @param {!ReadableStream} stream
   * @return {!Promise}
   * @private
   */
  async handleIncomingStream_(stream) {
    shaka.log.v1('Received new incoming unidirectional stream');

    const reader = new shaka.msf.Reader(
        new Uint8Array([]), stream, this.dialect_.getCodec());

    try {
      // Read the stream type
      const streamType = await reader.u62();
      shaka.log.v1(`Incoming Unidirectional Stream. Type: ${streamType}`);

      const FETCH_HEADER = BigInt(0x05);

      if (this.isSubgroupStreamType_(streamType)) {
        await this.handleSubgroupStream_(reader, streamType);
      } else if (streamType === FETCH_HEADER) {
        await this.handleFetchStream_(reader);
      } else {
        shaka.log.warning(`Unknown stream type: ${streamType}`);
      }
    } catch (error) {
      // Suppress errors during shutdown - they are expected
      if (!this.isClosing_) {
        shaka.log.error('Error processing incoming stream:', error);
      } else {
        shaka.log.debug('Stream processing ended during shutdown');
      }
    } finally {
      reader.close();
    }
  }

  /**
   * Handle a SUBGROUP_HEADER stream with automatic buffering and retry.
   *
   * @param {!shaka.msf.Reader} reader
   * @param {bigint} streamType
   * @return {!Promise}
   * @private
   */
  async handleSubgroupStream_(reader, streamType) {
    try {
      // Read the track alias
      const trackAlias = await reader.u62();

      // Read the group ID
      const groupId = await reader.u62();
      shaka.log.v1(`Track alias: ${trackAlias} Group ID: ${groupId}`);

      // Determine subgroup ID based on the stream type
      // Strip the DEFAULT_PRIORITY bit (0x20) to get the base type for SID mode
      // Bit 0: has extensions
      // Bits 1-2: SID mode (00=zero, 01=firstObjID, 10=explicit)
      // Bit 3: contains End of Group, Bit 5: DEFAULT_PRIORITY (draft-16)
      let subgroupId = null;
      // strip DEFAULT_PRIORITY bit
      const normalizedType = streamType & BigInt(0x1f);
      const hasExtensions = (normalizedType & BigInt(0x01)) === BigInt(0x01);
      const baseType = normalizedType & BigInt(0x07);

      if (baseType === BigInt(0x00) || baseType === BigInt(0x01)) {
        // ZeroSID: Subgroup ID is implicitly 0
        subgroupId = BigInt(0);
        shaka.log.v1(`Subgroup ID: ${subgroupId} (implicit zero)`);
      } else if (baseType === BigInt(0x02) || baseType === BigInt(0x03)) {
        // NoSID: Subgroup ID is the first Object ID
        shaka.log.v1('Subgroup ID will be set to the first Object ID');
      } else if (baseType === BigInt(0x04) || baseType === BigInt(0x05)) {
        // ExplicitSID: Subgroup ID is explicitly provided
        subgroupId = await reader.u62();
        shaka.log.v1(`Subgroup ID: ${subgroupId} (explicit)`);
      } else {
        throw new Error(`Reserved SID mode: ${streamType}`);
      }

      // Read Publisher Priority unless DEFAULT_PRIORITY bit is set (draft-16)
      let publisherPriority = 0;
      if (this.hasDefaultPriority_(streamType)) {
        shaka.log.v1(
            'Publisher Priority: default (omitted, DEFAULT_PRIORITY bit set)');
      } else {
        publisherPriority = await reader.u8();
        shaka.log.v1(`Publisher Priority: ${publisherPriority}`);
      }

      // Buffer for objects while waiting for track registration
      /** @type {!Array<!shaka.msf.Utils.MOQObject>} */
      const bufferedObjects = [];
      const retryInterval = 0.1;
      const maxRetries = 5;
      const maxBufferedObjects = 50;

      // Process objects in the stream
      let isFirstObject = true;
      /** @type {bigint} */
      let previousObjectId = BigInt(0);
      // eslint-disable-next-line no-await-in-loop
      while (!(await reader.done())) {
        const payloadReadStartMs = Date.now();
        // The field is an Object ID Delta, not the Object ID: the first
        // object in the subgroup carries its ID directly, and each one after
        // that is the previous ID plus the delta plus one.
        // eslint-disable-next-line no-await-in-loop
        const objectIdDelta = await reader.u62();
        const objectId = isFirstObject ?
            objectIdDelta :
            previousObjectId + objectIdDelta + BigInt(1);
        previousObjectId = objectId;
        shaka.log.v1(`Object ID: ${objectId} (delta ${objectIdDelta})`);

        // If this is the first object and subgroupId is null
        // (types 0x0A-0x0B), set the subgroupId to the objectId
        if (isFirstObject && subgroupId === null) {
          subgroupId = objectId;
          shaka.log.v1(`Subgroup ID set to first Object ID: ${subgroupId}`);
        }
        isFirstObject = false;

        // Handle extension headers if present
        let extensions = null;
        if (hasExtensions) {
          // eslint-disable-next-line no-await-in-loop
          const extensionHeadersLength = await reader.u62();
          if (extensionHeadersLength > BigInt(0)) {
            // Convert bigint to number for reading bytes
            const extensionLength = Number(extensionHeadersLength);
            // eslint-disable-next-line no-await-in-loop
            extensions = await reader.read(extensionLength);
            shaka.log.v1(
                `Read ${extensionLength} bytes of extension headers`);
          }
        }

        // Read the object payload length
        // eslint-disable-next-line no-await-in-loop
        const payloadLength = await reader.u62();
        shaka.log.v1(`Object payload length: ${payloadLength}`);

        // Read object status if payload length is zero
        let objectStatus = null;
        if (payloadLength === BigInt(0)) {
          // eslint-disable-next-line no-await-in-loop
          objectStatus = await reader.u62();
          shaka.log.v1(`Object status: ${objectStatus}`);
        }

        // Read the object data
        const data = payloadLength > BigInt(0) ?
            // eslint-disable-next-line no-await-in-loop
            await reader.read(Number(payloadLength)) : new Uint8Array([]);
        if (payloadLength > BigInt(0)) {
          shaka.log.v1(`Read ${data.byteLength} bytes of object data`);
        }

        /** @type {shaka.msf.Utils.MOQObject} */
        const obj = {
          trackAlias,
          location: {
            group: groupId,
            object: objectId,
            subgroup: subgroupId,
          },
          data,
          extensions,
          status: objectStatus,
          payloadReadStartMs,
          receiveTimestampMs: Date.now(),
        };

        // Try to deliver immediately with retry logic
        let delivered = false;
        let retryCount = 0;

        while (!delivered && retryCount < maxRetries) {
          if (this.isClosing_) {
            shaka.log.debug(`Track ${trackAlias} data discarded during shutdown
                (buffered ${bufferedObjects.length} objects)`);
            return;
          }

          const trackInfo =
            this.trackRegistry_.getTrackInfoFromAlias(trackAlias);

          if (trackInfo?.closed) {
            shaka.log.debug(`Ignoring object for closed track ${trackAlias}`);
            return;
          }

          if (trackInfo && trackInfo.callbacks.length > 0) {
            // Track registered! Deliver buffered objects first
            if (bufferedObjects.length > 0) {
              shaka.log.info(`Track ${trackAlias} now registered, delivering
                  ${bufferedObjects.length} buffered objects`);
              for (const bufferedObj of bufferedObjects) {
                for (const callback of trackInfo.callbacks) {
                  callback(bufferedObj);
                }
              }
              bufferedObjects.length = 0;
            }

            // Deliver current object
            for (const callback of trackInfo.callbacks) {
              callback(obj);
            }
            delivered = true;
          } else {
            // Track not registered yet, buffer and retry
            if (retryCount === 0) {
              shaka.log.debug(`Track ${trackAlias} not registered yet, buffering
                 object (group=${groupId}, obj=${objectId})`);
              bufferedObjects.push(obj);

              // Enforce buffer size limit
              if (bufferedObjects.length > maxBufferedObjects) {
                shaka.log.warning(`Buffer overflow for track ${trackAlias},
                    dropping oldest object
                    (buffered: ${bufferedObjects.length})`);
                bufferedObjects.shift();
              }
            }

            retryCount++;
            if (retryCount < maxRetries) {
              shaka.log.debug(`Retry ${retryCount}/${maxRetries} for track
                  ${trackAlias} (buffered: ${bufferedObjects.length})`);

              // eslint-disable-next-line no-await-in-loop
              await shaka.util.Functional.delay(retryInterval);

              // Check again after waiting in case close() was called during
              // sleep
              if (this.isClosing_) {
                shaka.log.debug(`Track ${trackAlias} data discarded during
                    shutdown (buffered ${bufferedObjects.length} objects)`);
                return;
              }
            } else {
              if (this.isClosing_) {
                // During shutdown, this is expected - just log and discard
                shaka.log.debug(`Track ${trackAlias} data discarded during
                    shutdown (buffered ${bufferedObjects.length} objects)`);
                return;
              } else {
                // Connection is broken, fail the stream
                const errorMsg = `Track ${trackAlias} not registered after
                  ${maxRetries * retryInterval}s. SUBSCRIBE_OK not received in
                  time. Connection may be broken. (buffered
                  ${bufferedObjects.length} objects that will be discarded)`;
                throw new Error(errorMsg);
              }
            }
          }
        }
      }

      shaka.log.v1(`Finished processing SUBGROUP_HEADER stream for track
          ${trackAlias}`);
    } catch (error) {
      // Suppress errors during shutdown - they are expected
      if (!this.isClosing_) {
        shaka.log.error('Error processing SUBGROUP_HEADER stream:', error);
        throw error;
      } else {
        shaka.log.debug(
            'SUBGROUP_HEADER stream processing ended during shutdown');
      }
    }
  }

  /**
   * Handle an incoming FETCH_HEADER stream.
   *
   * @param {!shaka.msf.Reader} reader
   * @return {!Promise}
   * @private
   */
  async handleFetchStream_(reader) {
    const requestId = await reader.u62();
    shaka.log.debug(`Received FETCH_HEADER stream, requestId=${requestId}`);

    const callback = this.fetchCallbacks_.get(requestId);
    if (!callback) {
      shaka.log.warning(
          `No callback registered for fetch requestId=${requestId}`);
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    while (!(await reader.done())) {
      const payloadReadStartMs = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const groupId = await reader.u62();
      // eslint-disable-next-line no-await-in-loop
      const subgroupId = await reader.u62();
      // eslint-disable-next-line no-await-in-loop
      const objectId = await reader.u62();
      // publisherPriority - not needed
      // eslint-disable-next-line no-await-in-loop
      await reader.u8();
      let extensions = null;
      // eslint-disable-next-line no-await-in-loop
      const extensionHeadersLength = await reader.u62();
      if (extensionHeadersLength > BigInt(0)) {
        // Convert bigint to number for reading bytes
        const extensionLength = Number(extensionHeadersLength);
        // eslint-disable-next-line no-await-in-loop
        extensions = await reader.read(extensionLength);
      }
      // eslint-disable-next-line no-await-in-loop
      const payloadLen = await reader.u62();
      const payload = payloadLen > BigInt(0) ?
          // eslint-disable-next-line no-await-in-loop
          await reader.read(Number(payloadLen)) :
          new Uint8Array(0);

      shaka.log.v1(`Fetch object: group=${groupId}, subgroup=${subgroupId},
          obj=${objectId}, len=${payload.length}`);

      /** @type {shaka.msf.Utils.MOQObject} */
      const obj = {
        trackAlias: BigInt(0),
        location: {
          group: groupId,
          object: objectId,
          subgroup: null,
        },
        data: payload,
        extensions,
        status: null,
        payloadReadStartMs,
        receiveTimestampMs: Date.now(),
      };
      callback(obj);
    }

    // Clean up the callback
    this.fetchCallbacks_.delete(requestId);
  }

  /**
   * Notify all callbacks registered for a track
   *
   * @param {bigint} trackAlias
   * @param {shaka.msf.Utils.MOQObject} obj
   * @private
   */
  notifyCallbacks_(trackAlias, obj) {
    const key = trackAlias.toString();
    shaka.log.debug(`Notifying callbacks for track ${trackAlias} (key: ${key}),
        object ID: ${obj.location.object}`);

    const trackInfo = this.trackRegistry_.getTrackInfoFromAlias(trackAlias);
    if (trackInfo && trackInfo.callbacks.length > 0) {
      shaka.log.debug(`Found ${trackInfo.callbacks.length} callbacks in
          registry for track ${trackAlias}` );

      for (let i = 0; i < trackInfo.callbacks.length; i++) {
        try {
          shaka.log.debug(`Executing registry callback #${i + 1} for track
              ${trackAlias}`);
          trackInfo.callbacks[i](obj);
          shaka.log.debug(`Successfully executed registry callback #${i + 1}
              for track ${trackAlias}`);
        } catch (error) {
          shaka.log.error(`Error in registry object callback #${i + 1} for
            track ${trackAlias}:`, error);
        }
      }
    }
  }

  /** @override */
  release() {
    shaka.log.debug('Releasing draft-16 session');
    this.publishNamespaceCallbacks_.clear();
    this.messageHandlers_.clear();
    // Set closing flag to suppress errors from ongoing streams
    this.isClosing_ = true;
    this.trackRegistry_.clear();
    for (const timer of this.timersSet_) {
      timer.stop();
    }
    this.timersSet_.clear();
  }

  /**
   * Send a FETCH request for a track and register a callback for the
   * response data.
   * Returns a promise that resolves when the FETCH_OK is received.
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise}
   * @override
   */
  async fetch(namespace, trackName, callback) {
    const namespaceStr = namespace.join('/');
    shaka.log.debug(`Fetching track ${namespaceStr}:${trackName}`);

    const requestId = this.getNextRequestId_();

    /** @type {shaka.msf.Utils.Fetch} */
    const fetchMsg = {
      kind: shaka.msf.Utils.MessageType.FETCH,
      requestId,
      subscriberPriority: 0,
      // Use publisher's order by default
      groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
      fetchType: shaka.msf.Utils.FetchType.STANDALONE,
      namespace,
      trackName,
      startGroup: BigInt(0),
      startObject: BigInt(0),
      endGroup: BigInt(0),
      endObject: BigInt(0),
      params: [],
    };

    this.fetchCallbacks_.set(requestId, callback);

    const fetchPromise = new Promise((resolve, reject) => {
      const unregisterOk = this.registerMessageHandler_(
          shaka.msf.Utils.MessageType.FETCH_OK,
          requestId,
          () => {
            shaka.log.debug(`Received FetchOk for
                ${namespaceStr}:${trackName} with requestId ${requestId}`);
            unregisterErr();
            resolve();
          });

      const unregisterErr = this.registerMessageHandler_(
          shaka.msf.Utils.MessageType.FETCH_ERROR,
          requestId,
          (response) => {
            shaka.log.error(`Fetch error for
                ${namespaceStr}:${trackName}:`, response);
            unregisterOk();
            this.fetchCallbacks_.delete(requestId);
            reject(response);
          },
      );
    });

    shaka.log.debug(`Sending FETCH for ${namespaceStr}:${trackName}
        with requestId ${requestId}`);
    await this.controlStream_.send(fetchMsg);
    await fetchPromise;
  }

  /**
   * Subscribe to a track by namespace and track name
   * Returns the track alias that can be used to unsubscribe later
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise<bigint>}
   * @override
   */
  async subscribe(namespace, trackName, callback) {
    const namespaceStr = namespace.join('/');
    shaka.log.debug(`Subscribing to track ${namespaceStr}:${trackName}`);

    // Generate a request ID for this subscription
    const requestId = this.getNextRequestId_();

    /** @type {shaka.msf.Utils.Subscribe} */
    const subscribeMsg = {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId,
      namespace,
      name: trackName,
      // Default priority
      subscriberPriority: 0,
      // Use publisher's order by default
      groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
      // Forward mode by default
      forward: true,
      filterType: this.config_.subscribeFilterType,
      params: [],
    };

    shaka.log.debug(`Sending subscribe message for
        ${namespaceStr}:${trackName} with requestId ${requestId}`);

    try {
      // Set up Promise for SUBSCRIBE_OK response
      const subscribePromise = new Promise((resolve, reject) => {
        // Register handler for SUBSCRIBE_OK
        const unregisterOk = this.registerMessageHandler_(
            shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
            requestId,
            (response) => {
              const msg =
                /** @type {shaka.msf.Utils.SubscribeOk} */(response);
              shaka.log.debug(`Received SubscribeOk for
                ${namespaceStr}:${trackName} with requestId ${requestId},
                trackAlias ${msg.trackAlias}`);
              resolve(msg.trackAlias);
            });

        // Register handler for SUBSCRIBE_ERROR
        const unregisterErr = this.registerMessageHandler_(
            shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
            requestId,
            (response) => {
              unregisterOk();
              shaka.log.error(`Received SubscribeError for
                  ${namespaceStr}:${trackName}:`, response);
              reject(response);
            });

        // Timeout after 2 seconds
        const timer = new shaka.util.Timer(() => {
          unregisterOk();
          unregisterErr();
          reject(new Error(`Subscribe timeout (2000ms) for
              ${namespaceStr}:${trackName} with requestId ${requestId}`));
        });
        timer.tickAfter(/* seconds= */ 2);
      });

      // Send the subscribe message
      await this.controlStream_.send(subscribeMsg);

      // Wait for the SUBSCRIBE_OK
      const trackAlias = await subscribePromise;

      // Register the callback
      // Stream handler will immediately find it and deliver any buffered
      // objects
      this.trackRegistry_.registerTrackWithAlias(
          namespace, trackName, requestId, trackAlias);

      this.trackRegistry_.registerCallback(trackAlias, callback);

      shaka.log.debug(`Successfully subscribed to
          ${namespaceStr}:${trackName} with trackAlias ${trackAlias}`);

      return trackAlias;
    } catch (error) {
      shaka.log.error(
          `Error subscribing to track ${namespaceStr}:${trackName}:`, error);
      // We'll keep the registration in the registry even if the subscription
      // fails. This allows for retry attempts without creating new aliases
      throw error;
    }
  }

  /**
   * Unsubscribe from a track by track alias
   *
   * @param {bigint} trackAlias
   * @return {!Promise}
   * @override
   */
  async unsubscribe(trackAlias) {
    shaka.log.debug(`Unsubscribing from track with alias ${trackAlias}`);

    // Get track info from registry if available
    const trackInfo = this.trackRegistry_.getTrackInfoFromAlias(trackAlias);
    if (!trackInfo) {
      throw new Error(`Cannot unsubscribe: No track info found for alias
          ${trackAlias}`);
    }

    const namespaceStr = trackInfo.namespace.join('/');
    const trackDescription = `${namespaceStr}:${trackInfo.trackName}`;

    // The unsubscribe message must use the same request ID that was used in
    // the original subscribe message
    const requestId = trackInfo.requestId;

    /** @type {shaka.msf.Utils.Message} */
    const unsubscribeMsg = {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      requestId,
    };

    shaka.log.debug(`Sending unsubscribe message for track ${trackDescription}
        with original requestId ${requestId}`);

    try {
      // Create a Promise that will be resolved after a short delay
      // Note: The MOQ spec doesn't require an acknowledgment for unsubscribe
      // messages, so we'll just wait a short time to allow the message to be
      // sent
      const unsubscribePromise =
          shaka.util.Functional.delay(/* seconds= */ 0.5);

      // Send the unsubscribe message
      await this.controlStream_.send(unsubscribeMsg);

      // Wait for the unsubscribe to complete (or timeout)
      await unsubscribePromise;

      // Unregister all callbacks for this track
      this.trackRegistry_.unregisterAllCallbacks(trackAlias);

      shaka.log.debug(
          `Successfully unsubscribed from track ${trackDescription}`);
    } catch (error) {
      shaka.log.error(`Error unsubscribing from track ${trackDescription}:`,
          error);
      throw error;
    }
  }

  /**
   * Handle PublishDone message (end of stream for a track)
   *
   * @param {bigint} requestId
   * @private
   */
  handlePublishDone_(requestId) {
    shaka.log.debug(`PublishDone received for requestId ${requestId}`);

    const trackInfo =
        this.trackRegistry_.getTrackInfoFromRequestId(requestId);

    if (!trackInfo) {
      shaka.log.warning(
          `PublishDone received for unknown requestId ${requestId}`);
      return;
    }

    const trackAlias = trackInfo.trackAlias;

    shaka.log.debug(`Marking track ${trackAlias} as closed`);

    // Mark track as closed
    trackInfo.closed = true;

    // Optional: remove callbacks to avoid further delivery
    this.trackRegistry_.unregisterAllCallbacks(trackAlias);
  }
};
