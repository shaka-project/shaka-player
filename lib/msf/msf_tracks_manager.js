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
   * Handle an incoming unidirectional stream
   *
   * @param {!ReadableStream} stream
   * @return {!Promise}
   * @private
   */
  async handleIncomingStream_(stream) {
    shaka.log.debug('Received new incoming unidirectional stream');

    const reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    try {
      // Read the stream type
      const streamType = await reader.u62();
      shaka.log.debug(`Incoming Unidirectional Stream. Type: ${streamType}`);

      const FETCH_HEADER = BigInt(0x05);
      const SUBGROUP_HEADER_START_DRAFT_11 = BigInt(0x08);
      const SUBGROUP_HEADER_END_DRAFT_11 = BigInt(0x0d);
      const SUBGROUP_HEADER_WITHOUT_EOG_START = BigInt(0x10);
      const SUBGROUP_HEADER_WITHOUT_EOG_END = BigInt(0x15);
      const SUBGROUP_HEADER_WITH_EOG_START = BigInt(0x18);
      const SUBGROUP_HEADER_WITH_EOG_END = BigInt(0x1D);

      // Check if this is a SUBGROUP_HEADER stream
      // (draft-11, Section 9.4.2)
      // 0x08-0x0D
      // (draft-14, Section 10.4.2)
      // 0x10-0x15: without EndOfGroup
      // 0x18-0x1D: with EndOfGroup
      // (0x16-0x17 are not defined in the spec)
      const isSubgroupHeader =
          (streamType >= SUBGROUP_HEADER_START_DRAFT_11 &&
          streamType <= SUBGROUP_HEADER_END_DRAFT_11) ||
          (streamType >= SUBGROUP_HEADER_WITHOUT_EOG_START &&
          streamType <= SUBGROUP_HEADER_WITHOUT_EOG_END) ||
          (streamType >= SUBGROUP_HEADER_WITH_EOG_START &&
          streamType <= SUBGROUP_HEADER_WITH_EOG_END);
      if (isSubgroupHeader) {
        await this.handleSubgroupStream_(reader, streamType);
      } else if (streamType === FETCH_HEADER) {
        // Handle FETCH_HEADER streams if needed
        shaka.log.debug('Received FETCH_HEADER stream (not implemented yet)');
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
      shaka.log.debug(`Track alias: ${trackAlias} Group ID: ${groupId}`);

      // Determine subgroup ID based on the stream type
      let subgroupId = null;
      const hasExtensions =
        // draft-11
        streamType === BigInt(0x09) || streamType === BigInt(0x0b) ||
        streamType === BigInt(0x0d) ||
        // draft-14
        streamType === BigInt(0x11) || streamType === BigInt(0x13) ||
        streamType === BigInt(0x15) || streamType === BigInt(0x19) ||
        streamType === BigInt(0x1b) || streamType === BigInt(0x1d);

      // SubgroupID = 0 (implicit)
      // draft-11: 0x08-0x09
      if (streamType === BigInt(0x08) || streamType === BigInt(0x09) ||
          streamType === BigInt(0x10) || streamType === BigInt(0x11) ||
          streamType === BigInt(0x18) || streamType === BigInt(0x19)) {
        subgroupId = BigInt(0);
        shaka.log.debug(`Subgroup ID: ${subgroupId} (implicit)`);
      // draft-11: 0x0a-0x0b
      } else if (streamType === BigInt(0x0a) || streamType === BigInt(0x0b) ||
          streamType === BigInt(0x12) || streamType === BigInt(0x13) ||
          streamType === BigInt(0x1a) || streamType === BigInt(0x1b)) {
        // SubgroupID = first Object ID (will be set when first object is read)
        shaka.log.debug('Subgroup ID will be set to the first Object ID');
      // draft-11: 0x0c-0x0d
      } else if (streamType === BigInt(0x0c) || streamType === BigInt(0x0d) ||
           streamType === BigInt(0x14) || streamType === BigInt(0x15) ||
           streamType === BigInt(0x1c) || streamType === BigInt(0x1d)) {
        // SubgroupID is explicitly provided
        subgroupId = await reader.u62();
        shaka.log.debug(`Subgroup ID: ${subgroupId} (explicit)`);
      }

      // Read the Publisher Priority (as specified in the SUBGROUP_HEADER)
      const publisherPriority = await reader.u8();
      shaka.log.debug(`Publisher Priority: ${publisherPriority}`);

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
        shaka.log.debug(`Object ID: ${objectId}`);

        // If this is the first object and subgroupId is null
        // (types 0x0A-0x0B), set the subgroupId to the objectId
        if (isFirstObject && subgroupId === null) {
          subgroupId = objectId;
          shaka.log.debug(`Subgroup ID set to first Object ID: ${subgroupId}`);
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
            shaka.log.debug(
                `Read ${extensionLength} bytes of extension headers`);
          }
        }

        // Read the object payload length
        // eslint-disable-next-line no-await-in-loop
        const payloadLength = await reader.u62();
        shaka.log.debug(`Object payload length: ${payloadLength}`);

        // Read object status if payload length is zero
        let objectStatus = null;
        if (payloadLength === BigInt(0)) {
          // eslint-disable-next-line no-await-in-loop
          objectStatus = await reader.u62();
          shaka.log.debug(`Object status: ${objectStatus}`);
        }

        // Read the object data
        const data = payloadLength > BigInt(0) ?
            // eslint-disable-next-line no-await-in-loop
            await reader.read(Number(payloadLength)) : new Uint8Array([]);
        if (payloadLength > BigInt(0)) {
          shaka.log.debug(`Read ${data.byteLength} bytes of object data`);
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

      shaka.log.debug(`Finished processing SUBGROUP_HEADER stream for track
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
   * Subscribe to a track by namespace and track name
   * Returns the track alias that can be used to unsubscribe later
   *
   * @param {string} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise<bigint>}
   */
  async subscribeTrack(namespace, trackName, callback) {
    shaka.log.debug(`Subscribing to track ${namespace}:${trackName}`);

    // Generate a request ID for this subscription
    const requestId = this.getNextRequestId();

    /** @type {shaka.msf.Utils.Subscribe} */
    const subscribeMsg = {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId,
      namespace: namespace.split('/'),
      name: trackName,
      // Default priority
      subscriberPriority: 0,
      // Use publisher's order by default
      groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
      // Forward mode by default
      forward: true,
      // No filtering by default
      filterType: shaka.msf.Utils.FilterType.NEXT_GROUP_START,
      params: [],
    };

    shaka.log.debug(`Sending subscribe message for ${namespace}:${trackName}
        with requestId ${requestId}`);

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
                ${namespace}:${trackName} with requestId ${requestId},
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
                  ${namespace}:${trackName}: ${JSON.stringify(response)}`);
              reject(
                  new Error(`Subscribe failed: ${JSON.stringify(response)}`));
            });

        // Timeout after 2 seconds
        const timer = new shaka.util.Timer(() => {
          unregisterOk();
          unregisterErr();
          reject(new Error(`Subscribe timeout (2000ms) for
              ${namespace}:${trackName} with requestId ${requestId}`));
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
          ${namespace}:${trackName} with trackAlias ${trackAlias}`);

      return trackAlias;
    } catch (error) {
      shaka.log.error(`Error subscribing to track ${namespace}:${trackName}:`,
          error);
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

    const trackDescription = `${trackInfo.namespace}:${trackInfo.trackName}`;

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
   * @param {string} namespace
   * @param {string} trackName
   * @return {string}
   * @private
   */
  getNamespaceTrackKey_(namespace, trackName) {
    return `${namespace}:${trackName}`;
  }

  /**
   * Register a track with a specific alias (draft-14: server assigns the alias)
   * @param {string} namespace
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
   * @param {string} namespace
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
   * Clear all registered tracks and callbacks
   */
  clear() {
    this.trackNameToInfo_.clear();
    this.trackAliasToInfo_.clear();
    shaka.log.debug('Cleared all track registrations');
  }
};
