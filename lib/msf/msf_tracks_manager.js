/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.TracksManager');

goog.require('shaka.log');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.Utils');
goog.require('shaka.util.Timer');

goog.requireType('shaka.msf.ControlStream');
goog.requireType('shaka.msf.MSFTransport');

/**
 * Tracks manager to handle incoming data streams
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
    /** @private {number} */
    this.nextRequestId_ = 0;
    /** @private {!Set<shaka.util.Timer>} */
    this.timersSet_ = new Set();

    this.startListeningForStreams_();
  }

  /**
   * Get the next request ID (even numbers for client requests)
   *
   * @return {number}
   */
  getNextRequestId() {
    const requestId = this.nextRequestId_;
    this.nextRequestId_ += 2;
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

      // Check if this is a SUBGROUP_HEADER stream
      if (streamType >= shaka.msf.TracksManager.SUBGROUP_HEADER_START_BIGINT &&
          streamType <= shaka.msf.TracksManager.SUBGROUP_HEADER_END_BIGINT) {
        await this.handleSubgroupStream_(reader, streamType);
      } else if (streamType === shaka.msf.TracksManager.FETCH_HEADER_BIGINT) {
        // Handle FETCH_HEADER streams if needed
        shaka.log.debug('Received FETCH_HEADER stream (not implemented yet)');
      } else {
        shaka.log.warning(`Unknown stream type: ${streamType}`);
      }
    } catch (error) {
      shaka.log.error('Error processing incoming stream:', error);
    } finally {
      reader.close();
    }
  }

  /**
   * Handle a SUBGROUP_HEADER stream according to section 9.4.2 of the MoQ
   * transport draft
   *
   * @param {!shaka.msf.Reader} reader
   * @param {number} streamType
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
      // According to section 9.4.2, there are 6 defined Type values for
      // SUBGROUP_HEADER (0x08-0x0D)
      let subgroupId = null;
      const hasExtensions =
        streamType === 0x09 || streamType === 0x0b || streamType === 0x0d;

      if (streamType === 0x08 || streamType === 0x09) {
        // Type 0x08-0x09: Subgroup ID is implicitly 0
        subgroupId = 0;
        shaka.log.debug(`Subgroup ID: ${subgroupId} (implicit)`);
      } else if (streamType === 0x0a || streamType === 0x0b) {
        // Type 0x0A-0x0B: Subgroup ID is the first Object ID
        // (will be set when first object is read)
        shaka.log.debug('Subgroup ID will be set to the first Object ID');
      } else if (streamType === 0x0c || streamType === 0x0d) {
        // Type 0x0C-0x0D: Subgroup ID is explicitly provided
        subgroupId = await reader.u62();
        shaka.log.debug(`Subgroup ID: ${subgroupId} (explicit)`);
      }

      // Read the Publisher Priority (as specified in the SUBGROUP_HEADER)
      const publisherPriority = await reader.u8();
      shaka.log.debug(`Publisher Priority: ${publisherPriority}`);

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
          if (extensionHeadersLength > 0) {
            // eslint-disable-next-line no-await-in-loop
            extensions = await reader.read(extensionHeadersLength);
            shaka.log.debug(
                `Read ${extensionHeadersLength} bytes of extension headers`);
          }
        }

        // Read the object payload length
        // eslint-disable-next-line no-await-in-loop
        const payloadLength = await reader.u62();
        shaka.log.debug(`Object payload length: ${payloadLength}`);

        // Read object status if payload length is zero
        let objectStatus = null;
        if (payloadLength === 0) {
          // eslint-disable-next-line no-await-in-loop
          objectStatus = await reader.u62();
          shaka.log.debug(`Object status: ${objectStatus}`);
        }

        // Read the object data
        const data = payloadLength > 0 ?
            // eslint-disable-next-line no-await-in-loop
            await reader.read(Number(payloadLength)) : new Uint8Array([]);
        if (payloadLength > 0) {
          shaka.log.debug(`Read ${data.byteLength} bytes of object data`);
        }

        /** @type {shaka.msf.Utils.MoQObject} */
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

        this.notifyCallbacks_(trackAlias, obj);
      }

      shaka.log.debug(`Finished processing SUBGROUP_HEADER stream for track
          ${trackAlias}`);
    } catch (error) {
      if (error instanceof Error &&
        !error.message.includes('session is closed')) {
        shaka.log.error('Error processing SUBGROUP_HEADER stream:', error);
      }
    }
  }

  /**
   * Notify all callbacks registered for a track
   *
   * @param {number} trackAlias
   * @param {shaka.msf.Utils.MoQObject} obj
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
   * Close the tracks manager and clean up resources
   */
  close() {
    shaka.log.debug('Closing tracks manager');
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
   * @return {!Promise<number>}
   */
  async subscribeTrack(namespace, trackName, callback) {
    shaka.log.debug(`Subscribing to track ${namespace}:${trackName}`);

    // Generate a request ID for this subscription
    const requestId = this.getNextRequestId();

    // Register the track in the registry and get its alias
    const trackAlias = this.trackRegistry_.registerTrack(
        namespace, trackName, requestId);

    // Register the callback for this track alias
    this.trackRegistry_.registerCallback(trackAlias, callback);

    /** @type {shaka.msf.Utils.Subscribe} */
    const subscribeMsg = {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId,
      trackAlias,
      namespace: [namespace],
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
        with alias ${trackAlias} and requestId ${requestId}`);

    try {
      // Create a Promise that will be resolved when we receive the
      // SubscribeOk response
      const subscribePromise = new Promise((resolve, reject) => {
        // Register a handler for the SubscribeOk message with this request ID
        const unregisterHandler = this.msfTransport_.registerMessageHandler(
            shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
            requestId,
            () => {
              shaka.log.debug(`Received SubscribeOk for
                ${namespace}:${trackName} with requestId ${requestId}`);
              resolve();
            },
        );

        // Set a timeout to reject the promise if we don't receive a response
        // in time
        const timer = new shaka.util.Timer(() => {
          unregisterHandler(); // Clean up the handler
          reject(new Error(`Subscribe timeout for ${namespace}:${trackName} with
            requestId ${requestId}`));
        });
        timer.tickAfter(/* seconds= */ 10);

        this.timersSet_.add(timer);

        // Also register a handler for SubscribeError
        this.msfTransport_.registerMessageHandler(
            shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
            requestId,
            (response) => {
              timer.stop();
              if (this.timersSet_.has(timer)) {
                this.timersSet_.delete(timer);
              }
              unregisterHandler(); // Clean up the success handler
              shaka.log.error(`Received SubscribeError for
                ${namespace}:${trackName}: ${JSON.stringify(response)}`);
              reject(new Error(
                  `Subscribe failed: ${JSON.stringify(response)}`));
            },
        );
      });

      // Send the subscribe message
      await this.controlStream_.send(subscribeMsg);

      // Wait for the subscribe response
      await subscribePromise;

      shaka.log.debug(`Successfully subscribed to track
          ${namespace}:${trackName} with alias ${trackAlias}`);
    } catch (error) {
      shaka.log.error(`Error subscribing to track ${namespace}:${trackName}:`,
          error);
      // We'll keep the registration in the registry even if the subscription
      // fails. This allows for retry attempts without creating new aliases
      throw error;
    }

    return trackAlias;
  }

  /**
   * Unsubscribe from a track by track alias
   *
   * @param {number} trackAlias
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

    // According to MoQ Transport draft 11, the unsubscribe message must use the
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
      // Note: The MoQ spec doesn't require an acknowledgment for unsubscribe
      // messages, so we'll just wait a short time to allow the message to be
      // sent
      const unsubscribePromise = new Promise((resolve) => {
        new shaka.util.Timer(() => {
          resolve();
        }).tickAfter(/* seconds= */ 0.5);
      });

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
 * @private @const {number}
 */
shaka.msf.TracksManager.FETCH_HEADER_BIGINT = 0x05;

/**
 * @private @const {number}
 */
shaka.msf.TracksManager.SUBGROUP_HEADER_START_BIGINT = 0x08;

/**
 * @private @const {number}
 */
shaka.msf.TracksManager.SUBGROUP_HEADER_END_BIGINT = 0x0d;


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

    /** @private {number} */
    this.nextTrackAlias_ = 1;
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
   * Register a track and get its alias
   * If the track is already registered, returns the existing alias
   * If not, creates a new unique alias
   *
   * @param {string} namespace
   * @param {string} trackName
   * @param {(number|undefined)} requestId
   * @return {number}
   */
  registerTrack(namespace, trackName, requestId) {
    // Validate that a request ID is provided
    if (requestId === undefined) {
      throw new Error(`Request ID is required for track registration
          ${namespace}:${trackName}`);
    }

    const key = this.getNamespaceTrackKey_(namespace, trackName);

    // Check if the track is already registered
    if (this.trackNameToInfo_.has(key)) {
      const info = this.trackNameToInfo_.get(key);
      // This should never be null since we just checked with has()
      if (!info) {
        throw new Error(`Track info for ${namespace}:${trackName} not found
            despite being registered`);
      }
      shaka.log.debug(`Track ${namespace}:${trackName} already registered with
          alias ${info.trackAlias} and requestId ${info.requestId}`);
      return info.trackAlias;
    }

    // Generate a new unique track alias
    const trackAlias = this.nextTrackAlias_;
    this.nextTrackAlias_++; ;

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

    shaka.log.debug(`Registered new track ${namespace}:${trackName} with
        alias ${trackAlias} and request ID ${requestId}`);
    return trackAlias;
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
   * @param {number} trackAlias
   * @return {shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromAlias(trackAlias) {
    return this.trackAliasToInfo_.get(trackAlias.toString());
  }

  /**
   * Register a callback for a track
   *
   * @param {number} trackAlias
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
   * @param {number} trackAlias
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
   * @param {number} trackAlias
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
   * @param {number} trackAlias
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
    this.nextTrackAlias_ = 1;
    shaka.log.debug('Cleared all track registrations');
  }
};
