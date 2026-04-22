/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MSFTransport');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.log');
goog.require('shaka.config.MsfVersion');
goog.require('shaka.msf.ControlStream');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.Receiver');
goog.require('shaka.msf.Sender');
goog.require('shaka.msf.TracksManager');
goog.require('shaka.msf.Utils');
goog.require('shaka.msf.Writer');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.Error');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.StringUtils');


/**
 * MOQT (Media over QUIC Transport).
 *
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.msf.MSFTransport = class {
  /**
   *
   */
  constructor(config) {
    /** @private {?WebTransport} */
    this.webTransport_ = null;

    /** @private {?shaka.msf.Utils.Version} */
    this.negotiatedVersion_ = null;

    /** @private {!shaka.extern.MsfManifestConfiguration} */
    this.config_ = config;

    /** @private {bigint} */
    this.nextRequestId_ = BigInt(0);

    /** @private {!Set<function(Array<string>)>} */
    this.publishNamespaceCallbacks_ = new Set();

    /**
     * @private {!Map<shaka.msf.Utils.MessageType,
     *                Map<bigint, shaka.msf.Utils.MessageHandler>>}
     */
    this.messageHandlers_ = new Map();

    /** @private {shaka.msf.TracksManager} */
    this.tracksManager_ = null;
  }

  /**
   * @param {!shaka.extern.MsfManifestConfiguration} config
   */
  configure(config) {
    this.config_ = config;
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

    //  WebTransport protocol strings for version negotiation
    const PROTOCOL_DRAFT_14 = 'moq-00';
    const PROTOCOL_DRAFT_16 = 'moqt-16';

    // Set WebTransport protocols for version negotiation
    switch (this.config_.version) {
      case shaka.config.MsfVersion.AUTO:
        options.protocols = [PROTOCOL_DRAFT_16, PROTOCOL_DRAFT_14];
        break;
      case shaka.config.MsfVersion.DRAFT_16:
        options.protocols = [PROTOCOL_DRAFT_16];
        break;
    }

    this.webTransport_ = new WebTransport(uri, options);
    await this.webTransport_.ready;
    shaka.log.v1('WebTransport connection established');

    // Determine negotiated version from WebTransport protocol
    if (this.config_.version === shaka.config.MsfVersion.DRAFT_14) {
      this.negotiatedVersion_ = shaka.msf.Utils.Version.DRAFT_14;
    } else if (this.webTransport_.protocol === PROTOCOL_DRAFT_16) {
      this.negotiatedVersion_ = shaka.msf.Utils.Version.DRAFT_16;
    } else {
      // Fall back to draft-14 in-band negotiation
      this.negotiatedVersion_ = shaka.msf.Utils.Version.DRAFT_14;
    }
    goog.asserts.assert(this.negotiatedVersion_ != null,
        'this.negotiatedVersion_ must be non-null.');

    /** @type {!WebTransportBidirectionalStream} */
    const stream = await this.webTransport_.createBidirectionalStream();
    shaka.log.v1('Bidirectional stream created', stream);

    const writer = new shaka.msf.Writer(stream.writable);
    const reader = new shaka.msf.Reader(new Uint8Array([]), stream.readable);

    const sender = new shaka.msf.Sender(writer, this.negotiatedVersion_);
    // Send the client setup message
    shaka.log.v1('Sending client setup message');
    const versions = shaka.msf.Utils.isDraft16(this.negotiatedVersion_) ?
        [] : [shaka.msf.Utils.Version.DRAFT_14];
    const implementation = 'ShakaPlayer/' + shaka.Player.version;
    const params = [
      {
        type: BigInt(shaka.msf.Utils.SetupOption.MAX_REQUEST_ID),
        value: BigInt(42069),
      },
      {
        type: BigInt(shaka.msf.Utils.SetupOption.IMPLEMENTATION),
        value: shaka.util.BufferUtils.toUint8(
            shaka.util.StringUtils.toUTF8(implementation)),
      },
    ];
    if (authorizationToken) {
      params.push({
        type: BigInt(shaka.msf.Utils.SetupOption.AUTHORIZATION_TOKEN),
        value: this.buildAuthToken_(authorizationToken),
      });
    }
    await sender.client({versions, params});

    const receiver = new shaka.msf.Receiver(reader, this.negotiatedVersion_);
    // Receive the server setup message
    shaka.log.v1('Waiting for server setup message');
    const server = await receiver.server();
    shaka.log.v1('Received server setup:', server);

    if (!shaka.msf.Utils.isDraft16(this.negotiatedVersion_)) {
      if (!versions.includes(server.version)) {
        throw new Error(`Unsupported server version: ${server.version}`);
      }
    }

    // Create control stream for handling control messages
    const controlStream =
        new shaka.msf.ControlStream(reader, writer, this.negotiatedVersion_);
    shaka.log.v1(`Control stream established (${this.negotiatedVersion_})`);
    if (goog.DEBUG) {
      switch (this.negotiatedVersion_) {
        case shaka.msf.Utils.Version.DRAFT_14:
          shaka.log.info('Connection established with draft-14');
          break;
        case shaka.msf.Utils.Version.DRAFT_16:
          shaka.log.info('Connection established with draft-16');
          break;
      }
    }

    // Create tracks manager for handling data streams
    this.tracksManager_ = new shaka.msf.TracksManager(
        this.webTransport_, controlStream, this);
    shaka.log.v1(
        'Tracks manager created with control stream and client reference');

    // Create a Connection object with the client instance to access
    // request ID management
    const connection = new shaka.msf.MSFConnection(
        this.webTransport_, controlStream, this);

    // Start listening for control messages
    this.listenForControlMessages_(controlStream);

    return connection;
  }

  /** @override */
  release() {
    shaka.log.v1('Closing client connection');
    this.publishNamespaceCallbacks_.clear();

    this.tracksManager_?.release();
    this.tracksManager_ = null;
  }

  /**
   * Get the next available request ID and increment for future use.
   * According to the MOQ Transport spec, client request IDs are even numbers
   * starting at 0 and increment by 2 for each new request.
   *
   * @return {bigint}
   */
  getNextRequestId() {
    const requestId = this.nextRequestId_;
    this.nextRequestId_ += BigInt(2);
    shaka.log.v1(`Generated new request ID: ${requestId}`);
    return requestId;
  }

  /**
   * Listen for control messages and dispatch them to registered handlers
   *
   * @param {shaka.msf.ControlStream} controlStream
   * @return {!Promise}
   * @private
   */
  async listenForControlMessages_(controlStream) {
    shaka.log.v1('Starting to listen for control messages');
    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const msg = await controlStream.receive();
        if (msg.kind === shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE) {
          const publishNamespaceMessage =
          /** @type {shaka.msf.Utils.PublishNamespace} */(msg);
          shaka.log.info(`Received PublishNamespace message with namespace:
              ${publishNamespaceMessage.namespace.join('/')}`);

          try {
            /** @type {shaka.msf.Utils.Message} */
            const publishNamespaceOkMessage = {
              kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
              requestId: publishNamespaceMessage.requestId,
              namespace: publishNamespaceMessage.namespace,
            };

            // eslint-disable-next-line no-await-in-loop
            await controlStream.send(publishNamespaceOkMessage);
            shaka.log.debug('Sent PublishNamespaceOk for requestId',
                publishNamespaceMessage.requestId);
          } catch (error) {
            shaka.log.error(`Error sending PublishNamespaceOk: ${
              error instanceof Error ? error.message : String(error)
            }`);
          }

          // Notify all registered PublishNamespace callbacks
          for (const callback of this.publishNamespaceCallbacks_) {
            try {
              callback(publishNamespaceMessage.namespace);
            } catch (error) {
              shaka.log.error(`Error in PublishNamespace callback: ${
                  error instanceof Error ? error.message : String(error)}`);
            }
          }
        } else if (msg.kind === shaka.msf.Utils.MessageType.PUBLISH_DONE) {
          const publishDoneMsg =
            /** @type {shaka.msf.Utils.PublishDone} */ (msg);

          shaka.log.debug(`Received PublishDone for requestId ${
            publishDoneMsg.requestId}`);

          this.tracksManager_?.handlePublishDone(publishDoneMsg.requestId);
        } else if ('requestId' in msg) {
          // For messages with request IDs, check if we have a handler
          // registered.
          // Since not all messages have a requestId, we have to use
          // this notation.
          const requestId = msg['requestId'];
          const handlersForKind = this.messageHandlers_.get(msg.kind);

          if (handlersForKind && handlersForKind.has(requestId)) {
            shaka.log.debug(`Found handler for message kind ${msg.kind} with
                requestId ${requestId}`);
            try {
              // Call the handler with the message
              const handler = handlersForKind.get(requestId);
              if (handler) {
                handler(msg);
              } else {
                shaka.log.warning(`Handler for message kind ${msg.kind} with
                    requestId ${requestId} was null`);
              }
              // Remove the handler after it's been called (one-time use)
              handlersForKind.delete(requestId);
            } catch (error) {
              shaka.log.error(`Error in message handler for kind ${msg.kind}
                  with requestId ${requestId}: ${
                  error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            shaka.log.debug(`No handler found for message kind ${msg.kind}
                with requestId ${requestId}`);
          }
        } else {
          shaka.log.debug(
              `Received message of kind ${msg.kind} without a request ID`);
        }
      }
    } catch (error) {
      // Check if this is a WebTransportError due to session closure
      if (error instanceof Error &&
        error.message.includes('session is closed')) {
        shaka.log.debug('Control message listener stopped: connection closed');
      } else {
        shaka.log.error('Error while listening for control messages:', error);
      }
    }
  }

  /**
   * Register a handler for a specific message kind and request ID
   *
   * @param {shaka.msf.Utils.MessageType} kind
   * @param {bigint} requestId
   * @param {shaka.msf.Utils.MessageHandler} handler
   * @return {function()} A function to unregister the handler
   */
  registerMessageHandler(kind, requestId, handler) {
    shaka.log.v1(`Registering handler for message kind ${kind} with
        requestId ${requestId}`);

    // Initialize the map for this message kind if it doesn't exist
    if (!this.messageHandlers_.has(kind)) {
      this.messageHandlers_.set(kind, new Map());
    }

    // Get the map for this message kind
    const handlersForKind = this.messageHandlers_.get(kind);

    // This should never be null since we just initialized it if needed
    if (!handlersForKind) {
      throw new Error(`Handler map for message kind ${kind} not found`);
    }

    // Register the handler for this request ID
    handlersForKind.set(requestId, handler);

    // Return a function to unregister the handler
    return () => {
      shaka.log.v1(`Unregistering handler for message kind ${kind} with
          requestId ${requestId}`);
      const handlersMap = this.messageHandlers_.get(kind);
      if (handlersMap) {
        handlersMap.delete(requestId);
      }
    };
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
    if (!this.tracksManager_) {
      throw new Error('Cannot subscribe: Tracks manager not initialized');
    }

    shaka.log.v1(
        `Client subscribing to track ${namespace.join('/')}:${trackName}`);
    return this.tracksManager_.subscribeTrack(namespace, trackName, callback);
  }

  /**
   * Unsubscribe from a track by track alias
   *
   * @param {bigint} trackAlias
   * @return {!Promise}
   */
  async unsubscribeTrack(trackAlias) {
    if (!this.tracksManager_) {
      throw new Error('Cannot unsubscribe: Tracks manager not initialized');
    }

    shaka.log.v1(`Client unsubscribing from track with alias ${trackAlias}`);
    await this.tracksManager_.unsubscribeTrack(trackAlias);
  }

  /**
   * Fetch a track (one-shot retrieval instead of ongoing subscription)
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise}
   */
  async fetchTrack(namespace, trackName, callback) {
    if (!this.tracksManager_) {
      throw new Error('Cannot fetch: Tracks manager not initialized');
    }

    shaka.log.v1(`Client fetching track ${namespace.join('/')}:${trackName}`);
    await this.tracksManager_.fetchTrack(namespace, trackName, callback);
  }

  /**
   * Register a callback to be notified when an PublishNamespace message is
   * received.
   * @param {function(Array<string>)} callback
   * @return {function()} A function to unregister the callback
   */
  registerPublishNamespaceCallback(callback) {
    shaka.log.v1('Registering PublishNamespace callback');
    this.publishNamespaceCallbacks_.add(callback);

    // Return a function to unregister the callback
    return () => {
      shaka.log.v1('Unregistering PublishNamespace callback');
      this.publishNamespaceCallbacks_.delete(callback);
    };
  }

  /**
   * @param {string} token
   * @return {!Uint8Array}
   * @private
   */
  buildAuthToken_(token) {
    const tokenBytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(token));

    const writer = new shaka.util.DataViewWriter(
        2 + tokenBytes.length, // alias + type + token,
        shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);

    // Alias Type = USE_VALUE (0x03)
    writer.writeVarInt53(0x03);

    // Token Type = 0 (not defined)
    writer.writeVarInt53(0x00);

    // Token Value
    writer.writeBytes(tokenBytes);

    return writer.getBytes();
  }
};


shaka.msf.MSFConnection = class {
  /**
   * @param {!WebTransport} webTransport
   * @param {!shaka.msf.ControlStream} controlStream
   * @param {!shaka.msf.MSFTransport} moqtTransport
   */
  constructor(webTransport, controlStream, moqtTransport) {
    /** @private {!WebTransport} */
    this.webTransport_ = webTransport;
    /** @private {!shaka.msf.ControlStream} */
    this.controlStream_ = controlStream;
    /** @private {!shaka.msf.MSFTransport} */
    this.msfTransport_ = moqtTransport;
  }

  /**
   * Get the control stream for sending messages
   * @return {!shaka.msf.ControlStream}
   */
  control() {
    return this.controlStream_;
  }

  /**
   * Get the next request ID from the client
   * @return {bigint}
   */
  getNextRequestId() {
    return this.msfTransport_.getNextRequestId();
  }

  /**
   * @param {number=} code
   * @param {string=} reason
   * @return {!Promise}
   */
  async close(code = 0, reason = '') {
    shaka.log.v1(`Closing connection with code ${code}: ${reason}`);
    this.webTransport_.close({closeCode: code, reason});
    await this.webTransport_.closed;
  }
};
