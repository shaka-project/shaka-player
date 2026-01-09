/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.ControlStream');

goog.require('shaka.log');
goog.require('shaka.msf.BufferControlWriter');
goog.require('shaka.msf.Utils');
goog.require('shaka.util.Mutex');

goog.requireType('shaka.msf.Reader');
goog.requireType('shaka.msf.Writer');

shaka.msf.ControlStream = class {
  /**
   * @param {!shaka.msf.Reader} reader
   * @param {!shaka.msf.Writer} writer
   */
  constructor(reader, writer) {
    /** @private {!shaka.msf.ControlStreamDecoder} */
    this.decoder_ = new shaka.msf.ControlStreamDecoder(reader);
    /** @private {!shaka.msf.ControlStreamEncoder} */
    this.encoder_ = new shaka.msf.ControlStreamEncoder(writer);
    /** @private {!shaka.util.Mutex} */
    this.mutex_ = new shaka.util.Mutex();
  }

  /**
   * Will error if two messages are read at once.
   *
   * @return {!Promise<shaka.msf.Utils.Message>}
   */
  async receive() {
    shaka.log.debug('Attempting to receive a control message...');
    const msg = await this.decoder_.message();
    shaka.log.debug('Received control message:', msg);
    return msg;
  }

  /**
   * @param {shaka.msf.Utils.Message} msg
   * @return {!Promise}
   */
  async send(msg) {
    await this.mutex_.acquire('ControlStream.send');
    try {
      shaka.log.debug('Sending control message:', msg);
      await this.encoder_.message(msg);
    } finally {
      this.mutex_.release();
    }
  }
};

shaka.msf.ControlStreamDecoder = class {
  /**
   * @param {!shaka.msf.Reader} reader
   */
  constructor(reader) {
    this.reader_ = reader;
  }

  /**
   * @return {!Promise<shaka.msf.Utils.MessageType>}
   * @private
   */
  async messageType_() {
    shaka.log.debug('Reading message type...');
    const type = await this.reader_.u53();
    shaka.log.debug(`Raw message type: 0x${type.toString(16)}`);

    // Read the 16-bit MSB length field
    const lengthBytes = await this.reader_.read(2);
    const messageLength = (lengthBytes[0] << 8) | lengthBytes[1]; // MSB format
    shaka.log.debug(`Message length (16-bit MSB): ${messageLength} bytes,
        actual length: ${this.reader_.getByteLength()}`);

    let msgType;
    switch (type) {
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_OK:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_DONE:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_DONE;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_ERROR:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.UNSUBSCRIBE:
        msgType = shaka.msf.Utils.MessageType.UNSUBSCRIBE;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_OK:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_ERROR:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.UNPUBLISH_NAMESPACE:
        msgType = shaka.msf.Utils.MessageType.UNPUBLISH_NAMESPACE;
        break;
      case shaka.msf.Utils.MessageTypeId.REQUESTS_BLOCKED:
        msgType = shaka.msf.Utils.MessageType.REQUESTS_BLOCKED;
        break;
      default:
        throw new Error(`Unknown message type: 0x${type.toString(16)}`);
    }

    shaka.log.debug(`Parsed message type: ${msgType} (0x${type.toString(16)})`);
    return msgType;
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Message>}
   */
  async message() {
    shaka.log.debug('Parsing control message...');
    const type = await this.messageType_();

    /** @type {shaka.msf.Utils.Message} */
    let result;
    switch (type) {
      case shaka.msf.Utils.MessageType.SUBSCRIBE:
        result = await this.subscribe_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_OK:
        result = await this.subscribeOk_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR:
        result = await this.subscribeError_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_DONE:
        result = await this.publishDone_();
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE:
        result = await this.unsubscribe_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE:
        result = await this.publishNamespace_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK:
        result = await this.publishNamespaceOk_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR:
        result = await this.publishNamespaceError_();
        break;
      case shaka.msf.Utils.MessageType.UNPUBLISH_NAMESPACE:
        result = await this.unpublishNamespace_();
        break;
      case shaka.msf.Utils.MessageType.REQUESTS_BLOCKED:
        result = await this.requestsBlocked_();
        break;
      default:
        throw new Error(`Unsupported message type: ${type}`);
    }

    shaka.log.debug('Successfully parsed control message:', result);
    return result;
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Subscribe>}
   * @private
   */
  async subscribe_() {
    shaka.log.debug('Parsing Subscribe message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`RequestID: ${requestId}`);

    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    const name = await this.reader_.string();
    shaka.log.debug(`Name: ${name}`);

    const subscriberPriority = await this.reader_.u8();
    shaka.log.debug(`Subscriber priority: ${subscriberPriority}`);

    const groupOrder = await this.decodeGroupOrder_();
    shaka.log.debug(`Group order: ${groupOrder}`);

    const forward = await this.reader_.u8Bool();
    shaka.log.debug(`Forward: ${forward}`);

    const filterType = /** @type {shaka.msf.Utils.FilterType} */(
      await this.reader_.u8());
    shaka.log.debug(`Filter type: ${filterType}`);

    let startLocation;
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
        filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      startLocation = await this.location_();
      shaka.log.debug(`Start Location: ${JSON.stringify(startLocation)}`);
    }

    let endGroup;
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      endGroup = await this.reader_.u62();
      shaka.log.debug(`End group: ${endGroup}`);
    }

    const params = await this.reader_.keyValuePairs();
    shaka.log.debug(`Parameters: ${params.length}`);

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId,
      namespace,
      name,
      subscriberPriority,
      groupOrder,
      forward,
      filterType,
      startLocation,
      endGroup,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.GroupOrder>}
   * @private
   */
  async decodeGroupOrder_() {
    const orderCode = await this.reader_.u8();
    shaka.log.debug(`Raw group order code: ${orderCode}`);

    switch (orderCode) {
      case 0:
        return shaka.msf.Utils.GroupOrder.PUBLISHER;
      case 1:
        return shaka.msf.Utils.GroupOrder.ASCENDING;
      case 2:
        return shaka.msf.Utils.GroupOrder.DESCENDING;
      default:
        throw new Error(`Invalid GroupOrder value: ${orderCode}`);
    }
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Location>}
   * @private
   */
  async location_() {
    return {
      group: await this.reader_.u62(),
      object: await this.reader_.u62(),
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeOk>}
   * @private
   */
  async subscribeOk_() {
    shaka.log.debug('Parsing SubscribeOk message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const trackAlias = await this.reader_.u62();
    shaka.log.debug(`Track Alias: ${trackAlias}`);

    const expires = await this.reader_.u62();
    shaka.log.debug(`Expires: ${expires}`);

    const groupOrder = await this.decodeGroupOrder_();
    shaka.log.debug(`Group order: ${groupOrder}`);

    const contentExists = await this.reader_.u8Bool();
    shaka.log.debug(`Content exists: ${contentExists}`);

    let largest;
    if (contentExists) {
      largest = await this.location_();
      shaka.log.debug(
          `Largest: group ${largest.group}, object ${largest.object}`,
      );
    }

    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      requestId,
      trackAlias,
      expires,
      groupOrder,
      contentExists,
      largest,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeError>}
   * @private
   */
  async subscribeError_() {
    shaka.log.debug('Parsing SubscribeError message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Subscribe ID: ${requestId}`);

    const code = await this.reader_.u62();
    shaka.log.debug(`Code: ${code}`);

    const reason = await this.reader_.string();
    shaka.log.debug(`Reason: ${reason}`);

    const trackAlias = await this.reader_.u62();
    shaka.log.debug(`Track Alias: ${trackAlias}`);

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
      requestId,
      code,
      reason,
      trackAlias,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishDone>}
   * @private
   */
  async publishDone_() {
    shaka.log.debug('Parsing PublishDone message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Subscribe ID: ${requestId}`);

    const code = await this.reader_.u62();
    shaka.log.debug(`Code: ${code}`);

    const reason = await this.reader_.string();
    shaka.log.debug(`Reason: ${reason}`);

    // Read the stream count
    const streamCount = await this.reader_.u53();
    shaka.log.debug(`Stream count: ${streamCount}`);

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
      requestId,
      code,
      streamCount,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Unsubscribe>}
   * @private
   */
  async unsubscribe_() {
    shaka.log.debug('Parsing Unsubscribe message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Subscribe ID: ${requestId}`);

    return {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      requestId,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespace>}
   * @private
   */
  async publishNamespace_() {
    shaka.log.debug('Parsing PublishNamespace message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    const params = await this.reader_.keyValuePairs();
    shaka.log.debug(`Parameters: ${params.length}`);

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
      requestId,
      namespace,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceOk>}
   * @private
   */
  async publishNamespaceOk_() {
    shaka.log.debug('Parsing PublishNamespaceOk message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
      requestId,
      namespace,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceError>}
   * @private
   */
  async publishNamespaceError_() {
    shaka.log.debug('Parsing PublishNamespaceError message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const code = await this.reader_.u62();
    shaka.log.debug(`Error code: ${code}`);

    const reason = await this.reader_.string();
    shaka.log.debug(`Error reason: ${reason}`);

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
      requestId,
      code,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.UnpublishNamespace>}
   * @private
   */
  async unpublishNamespace_() {
    shaka.log.debug('Parsing UnpublishNamespace message...');
    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    return {
      kind: shaka.msf.Utils.MessageType.UNPUBLISH_NAMESPACE,
      namespace,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.RequestsBlocked>}
   * @private
   */
  async requestsBlocked_() {
    shaka.log.debug('Parsing REQUESTS_BLOCKED message...');
    const maximumRequestId = await this.reader_.u62();
    shaka.log.debug(`Server sent REQUESTS_BLOCKED: maximum request ID is
        ${maximumRequestId}`);

    return {
      kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
      maximumRequestId,
    };
  }
};

shaka.msf.ControlStreamEncoder = class {
  /**
   * @param {!shaka.msf.Writer} writer
   */
  constructor(writer) {
    /** @private {!shaka.msf.Writer} */
    this.writer_ = writer;
  }

  /**
   * @param {shaka.msf.Utils.Message} msg
   * @return {!Promise}
   */
  async message(msg) {
    shaka.log.debug(`Encoding message of type: ${msg.kind}`);

    // Create a BufferControlWriter to marshal the message
    const writer = new shaka.msf.BufferControlWriter();

    // Marshal the message based on its type
    switch (msg.kind) {
      case shaka.msf.Utils.MessageType.SUBSCRIBE:
        writer.marshalSubscribe(
            /** @type {!shaka.msf.Utils.Subscribe} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_OK:
        writer.marshalSubscribeOk(
            /** @type {!shaka.msf.Utils.SubscribeOk} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR:
        writer.marshalSubscribeError(
            /** @type {!shaka.msf.Utils.SubscribeError} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_DONE:
        writer.marshalPublishDone(
            /** @type {!shaka.msf.Utils.PublishDone} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE:
        writer.marshalUnsubscribe(
            /** @type {!shaka.msf.Utils.Unsubscribe} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE:
        writer.marshalPublishNamespace(
            /** @type {!shaka.msf.Utils.PublishNamespace} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK:
        writer.marshalPublishNamespaceOk(
            /** @type {!shaka.msf.Utils.PublishNamespaceOk} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR:
        writer.marshalPublishNamespaceError(
            /** @type {!shaka.msf.Utils.PublishNamespaceError} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.UNPUBLISH_NAMESPACE:
        writer.marshalUnpublishNamespace(
            /** @type {!shaka.msf.Utils.UnpublishNamespace} */ (msg));
        break;
      default:
        throw new Error(`Unsupported message type for encoding: ${msg.kind}`);
    }

    // Get the marshaled bytes and write them to the output stream
    const bytes = writer.getBytes();
    shaka.log.debug(
        `Marshaled ${bytes.length} bytes for message type: ${msg.kind}`);

    // Write the bytes directly to the output stream
    await this.writer_.write(bytes);
  }
};
