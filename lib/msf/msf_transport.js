/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MSFTransport');

goog.require('shaka.log');
goog.require('shaka.msf.ControlStream');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.Receiver');
goog.require('shaka.msf.Sender');
goog.require('shaka.msf.TracksManager');
goog.require('shaka.msf.Utils');
goog.require('shaka.msf.Writer');
goog.require('shaka.util.Error');
goog.require('shaka.util.IReleasable');


/**
 * MoQT (Media over QUIC Transport).
 *
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.msf.MSFTransport = class {
  constructor() {
    /** @private {?WebTransport} */
    this.webTransport_ = null;

    /** @private {number} */
    this.nextRequestId_ = 0;

    /** @private {!Set<function(Array<string>)>} */
    this.publishNamespaceCallbacks_ = new Set();

    /**
     * @private {!Map<shaka.msf.Utils.MessageType,
     *                Map<number, shaka.msf.Utils.MessageHandler>>}
     */
    this.messageHandlers_ = new Map();

    /** @private {shaka.msf.TracksManager} */
    this.tracksManager_ = null;
  }

  /**
   * @param {string} uri
   * @param {?Uint8Array} fingerprint
   */
  async connect(uri, fingerprint) {
    if (!('WebTransport' in window)) {
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
    this.webTransport_ = new WebTransport(uri, options);
    await this.webTransport_.ready;
    shaka.log.debug('WebTransport connection established');

    /** @type {!WebTransportBidirectionalStream} */
    const stream = await this.webTransport_.createBidirectionalStream();
    shaka.log.debug('Bidirectional stream created', stream);

    const writer = new shaka.msf.Writer(stream.writable);
    const reader = new shaka.msf.Reader(new Uint8Array([]), stream.readable);

    const sender = new shaka.msf.Sender(writer);
    // Send the client setup message
    shaka.log.debug('Sending client setup message');
    const versions = [
      shaka.msf.Utils.Version.DRAFT_14,
    ];
    const params = [
      {
        // MAX_REQUEST_ID parameter type
        type: 0x02,
        // Allow server to send up to 64 request-type messages
        value: 64,
      },
    ];
    await sender.client({versions, params});

    const receiver = new shaka.msf.Receiver(reader);
    // Receive the server setup message
    shaka.log.debug('Waiting for server setup message');
    const server = await receiver.server();
    shaka.log.debug('Received server setup:', server);

    if (!versions.includes(server.version)) {
      throw new Error(`Unsupported server version: ${server.version}`);
    }

    // Create control stream for handling control messages
    const controlStream = new shaka.msf.ControlStream(reader, writer);
    shaka.log.debug('Control stream established');

    // Create tracks manager for handling data streams
    this.tracksManager_ = new shaka.msf.TracksManager(
        this.webTransport_, controlStream, this);
    shaka.log.debug(
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
    shaka.log.debug('Closing client connection');
    this.publishNamespaceCallbacks_.clear();

    if (this.tracksManager_) {
      this.tracksManager_.close();
      this.tracksManager_ = null;
    }
  }

  /**
   * Get the next available request ID and increment for future use.
   * According to the MoQ Transport spec, client request IDs are even numbers
   * starting at 0 and increment by 2 for each new request.
   *
   * @return {number}
   */
  getNextRequestId() {
    const requestId = this.nextRequestId_;
    this.nextRequestId_ += 2;
    shaka.log.debug(`Generated new request ID: ${requestId}`);
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
    shaka.log.debug('Starting to listen for control messages');
    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const msg = await controlStream.receive();
        if (msg.kind === shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE) {
          const publishNamespaceMessage =
          /** @type {shaka.msf.Utils.PublishNamespace} */(msg);
          shaka.log.info(`Received PublishNamespace message with namespace:
              ${publishNamespaceMessage.namespace.join('/')}`);

          // Notify all registered PublishNamespace callbacks
          for (const callback of this.publishNamespaceCallbacks_) {
            try {
              callback(publishNamespaceMessage.namespace);
            } catch (error) {
              shaka.log.error(`Error in PublishNamespace callback: ${
                  error instanceof Error ? error.message : String(error)}`);
            }
          }
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
   * @param {number} requestId
   * @param {shaka.msf.Utils.MessageHandler} handler
   * @return {function()} A function to unregister the handler
   */
  registerMessageHandler(kind, requestId, handler) {
    shaka.log.debug(`Registering handler for message kind ${kind} with
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
      shaka.log.debug(`Unregistering handler for message kind ${kind} with
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
   * @param {string} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise<number>}
   */
  subscribeTrack(namespace, trackName, callback) {
    if (!this.tracksManager_) {
      throw new Error('Cannot subscribe: Tracks manager not initialized');
    }

    shaka.log.debug(`Client subscribing to track ${namespace}:${trackName}`);
    return this.tracksManager_.subscribeTrack(namespace, trackName, callback);
  }

  /**
   * Unsubscribe from a track by track alias
   *
   * @param {number} trackAlias
   * @return {!Promise}
   */
  async unsubscribeTrack(trackAlias) {
    if (!this.tracksManager_) {
      throw new Error('Cannot unsubscribe: Tracks manager not initialized');
    }

    shaka.log.debug(`Client unsubscribing from track with alias ${trackAlias}`);
    await this.tracksManager_.unsubscribeTrack(trackAlias);
  }

  /**
   * Register a callback to be notified when an PublishNamespace message is
   * received.
   * @param {function(Array<string>)} callback
   * @return {function()} A function to unregister the callback
   */
  registerPublishNamespaceCallback(callback) {
    shaka.log.debug('Registering PublishNamespace callback');
    this.publishNamespaceCallbacks_.add(callback);

    // Return a function to unregister the callback
    return () => {
      shaka.log.debug('Unregistering PublishNamespace callback');
      this.publishNamespaceCallbacks_.delete(callback);
    };
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
   * @return {number}
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
    shaka.log.debug(`Closing connection with code ${code}: ${reason}`);
    this.webTransport_.close({closeCode: code, reason});
    await this.webTransport_.closed;
  }
};
