/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.TracksManager');

goog.require('shaka.log');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.Utils');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Functional');

goog.requireType('shaka.msf.ControlStream');
goog.requireType('shaka.msf.MSFTransport');

/**
 * Tracks manager to handle incoming data streams
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.msf.TracksManager = class {
  /**
   * @param {!WebTransport} webTransport
   * @param {!shaka.msf.ControlStream} controlStream
   * @param {!shaka.msf.MSFTransport} msfTransport
   */
  constructor(webTransport, controlStream, msfTransport) {
    /** @private {!WebTransport} */
    this.webTransport_ = webTransport;
    /** @private {!shaka.msf.ControlStream} */
    this.controlStream_ = controlStream;
    /** @private {!shaka.msf.MSFTransport} */
    this.msfTransport_ = msfTransport;
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

    this.startListeningForStreams_();
  }

  /**
   * Get the next request ID (even numbers for client requests)
   *
   * @return {bigint}
   */
  getNextRequestId() {
    const requestId = this.nextRequestId_;
    this.nextRequestId_ += BigInt(2);
    return requestId;
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

    const reader = new shaka.msf.Reader(new Uint8Array([]), stream);

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
      // eslint-disable-next-line no-await-in-loop
      while (!(await reader.done())) {
        // Read the object ID
        // eslint-disable-next-line no-await-in-loop
        const objectId = await reader.u62();
        shaka.log.v1(`Object ID: ${objectId}`);

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

  /**
   * @override
   */
  release() {
    shaka.log.debug('Release tracks manager');
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
   */
  async fetchTrack(namespace, trackName, callback) {
    const namespaceStr = namespace.join('/');
    shaka.log.debug(`Fetching track ${namespaceStr}:${trackName}`);

    const requestId = this.getNextRequestId();

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

    // Store msfTransport reference for use in Promise callbacks
    const msfTransport = this.msfTransport_;

    const fetchPromise = new Promise((resolve, reject) => {
      const unregisterOk = msfTransport.registerMessageHandler(
          shaka.msf.Utils.MessageType.FETCH_OK,
          requestId,
          () => {
            shaka.log.debug(`Received FetchOk for
                ${namespaceStr}:${trackName} with requestId ${requestId}`);
            unregisterErr();
            resolve();
          });

      const unregisterErr = msfTransport.registerMessageHandler(
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
   */
  async subscribeTrack(namespace, trackName, callback) {
    const namespaceStr = namespace.join('/');
    shaka.log.debug(`Subscribing to track ${namespaceStr}:${trackName}`);

    // Generate a request ID for this subscription
    const requestId = this.getNextRequestId();

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
      filterType: this.msfTransport_.getConfiguration().subscribeFilterType,
      params: [],
    };

    shaka.log.debug(`Sending subscribe message for
        ${namespaceStr}:${trackName} with requestId ${requestId}`);

    try {
      // Store msfTransport reference for use in Promise callbacks
      const msfTransport = this.msfTransport_;

      // Set up Promise for SUBSCRIBE_OK response
      const subscribePromise = new Promise((resolve, reject) => {
        // Register handler for SUBSCRIBE_OK
        const unregisterOk = msfTransport.registerMessageHandler(
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
        const unregisterErr = msfTransport.registerMessageHandler(
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
   */
  async unsubscribeTrack(trackAlias) {
    shaka.log.debug(`Unsubscribing from track with alias ${trackAlias}`);

    // Get track info from registry if available
    const trackInfo = this.trackRegistry_.getTrackInfoFromAlias(trackAlias);
    if (!trackInfo) {
      throw new Error(`Cannot unsubscribe: No track info found for alias
          ${trackAlias}`);
    }

    const namespaceStr = trackInfo.namespace.join('/');
    const trackDescription = `${namespaceStr}:${trackInfo.trackName}`;

    // According to MOQT draft-14, the unsubscribe message must use the
    // same request ID that was used in the original subscribe message
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
   */
  handlePublishDone(requestId) {
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


/**
 * Registry for track aliases that maps between namespace+trackName and
 * trackAlias and stores callbacks for incoming objects.
 */
shaka.msf.TrackAliasRegistry = class {
  constructor() {
    /** @private {Map<string, shaka.msf.Utils.TrackInfo>} */
    this.trackNameToInfo_ = new Map();

    /** @private {Map<string, shaka.msf.Utils.TrackInfo>} */
    this.trackAliasToInfo_ = new Map();
  }

  /**
   * Generate a key for namespace+trackName
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @return {string}
   * @private
   */
  getNamespaceTrackKey_(namespace, trackName) {
    return `${namespace.join('/')}:${trackName}`;
  }

  /**
   * Register a track with a specific alias (draft-14: server assigns the alias)
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {bigint} requestId
   * @param {bigint} trackAlias
   */
  registerTrackWithAlias(namespace, trackName, requestId, trackAlias) {
    const key = this.getNamespaceTrackKey_(namespace, trackName);

    // Check if the track is already registered
    if (this.trackNameToInfo_.has(key)) {
      shaka.log.warning( `Track ${namespace}:${trackName} already registered,
          updating with new alias ${trackAlias}`);
    }

    /** @type {shaka.msf.Utils.TrackInfo} */
    const info = {
      namespace,
      trackName,
      trackAlias,
      requestId,
      callbacks: [],
      closed: false,
    };

    // Store in both maps
    this.trackNameToInfo_.set(key, info);
    this.trackAliasToInfo_.set(trackAlias.toString(), info);

    shaka.log.debug(`Registered track ${namespace}:${trackName} with
        server-assigned alias ${trackAlias} and request ID ${requestId}`);
  }

  /**
   * Get track info from namespace+trackName
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @return {shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromName(namespace, trackName) {
    const key = this.getNamespaceTrackKey_(namespace, trackName);
    return this.trackNameToInfo_.get(key);
  }

  /**
   * Get track info from trackAlias
   *
   * @param {bigint} trackAlias
   * @return {shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromAlias(trackAlias) {
    return this.trackAliasToInfo_.get(trackAlias.toString());
  }

  /**
   * Register a callback for a track
   *
   * @param {bigint} trackAlias
   * @param {shaka.msf.Utils.ObjectCallback} callback
   */
  registerCallback(trackAlias, callback) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());

    if (!info) {
      shaka.log.warning(`Attempted to register callback for unknown track
          alias ${trackAlias}`);
      return;
    }

    info.callbacks.push(callback);
    shaka.log.debug(`Registered callback for track
        ${info.namespace}:${info.trackName} (alias: ${trackAlias}),
        total callbacks: ${info.callbacks.length}`);
  }

  /**
   * Unregister a specific callback for a track
   *
   * @param {bigint} trackAlias
   * @param {shaka.msf.Utils.ObjectCallback} callback
   */
  unregisterCallback(trackAlias, callback) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());

    if (!info) {
      shaka.log.warning(`Attempted to unregister callback for unknown track
          alias ${trackAlias}`);
      return;
    }

    const index = info.callbacks.indexOf(callback);
    if (index !== -1) {
      info.callbacks.splice(index, 1);
      shaka.log.debug(`Unregistered callback for track
          ${info.namespace}:${info.trackName} (alias: ${trackAlias}),
          remaining callbacks: ${info.callbacks.length}`);
    }
  }

  /**
   * Unregister all callbacks for a track
   *
   * @param {bigint} trackAlias
   */
  unregisterAllCallbacks(trackAlias) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());

    if (!info) {
      shaka.log.warning(`Attempted to unregister callback for unknown track
          alias ${trackAlias}`);
      return;
    }

    const callbackCount = info.callbacks.length;
    info.callbacks = [];
    shaka.log.debug(`Unregistered all ${callbackCount} callbacks for track
        ${info.namespace}:${info.trackName} (alias: ${trackAlias})`);
  }

  /**
   * Get all callbacks for a track
   *
   * @param {bigint} trackAlias
   * @return {!Array<shaka.msf.Utils.ObjectCallback>}
   */
  getCallbacks(trackAlias) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());
    return info ? [...info.callbacks] : [];
  }

  /**
   * Get track info from requestId
   *
   * @param {bigint} requestId
   * @return {?shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromRequestId(requestId) {
    for (const info of this.trackAliasToInfo_.values()) {
      if (info.requestId === requestId) {
        return info;
      }
    }
    return null;
  }

  /**
   * Clear all registered tracks and callbacks
   */
  clear() {
    this.trackNameToInfo_.clear();
    this.trackAliasToInfo_.clear();
    shaka.log.debug('Cleared all track registrations');
  }
};
