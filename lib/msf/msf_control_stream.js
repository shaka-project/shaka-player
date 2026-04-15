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

goog.requireType('shaka.config.MsfFilterType');
goog.requireType('shaka.msf.Reader');
goog.requireType('shaka.msf.Writer');

shaka.msf.ControlStream = class {
  /**
   * @param {!shaka.msf.Reader} reader
   * @param {!shaka.msf.Writer} writer
   * @param {!shaka.msf.Utils.Version} version
   */
  constructor(reader, writer, version) {
    /** @private {!shaka.msf.ControlStreamDecoder} */
    this.decoder_ = new shaka.msf.ControlStreamDecoder(reader, version);
    /** @private {!shaka.msf.ControlStreamEncoder} */
    this.encoder_ = new shaka.msf.ControlStreamEncoder(writer, version);
    /** @private {!shaka.util.Mutex} */
    this.mutex_ = new shaka.util.Mutex();
  }

  /**
   * Will error if two messages are read at once.
   *
   * @return {!Promise<shaka.msf.Utils.Message>}
   */
  async receive() {
    const message = await this.decoder_.message();
    return message;
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
   * @param {!shaka.msf.Utils.Version} version
   */
  constructor(reader, version) {
    /** @private {!shaka.msf.Reader} */
    this.reader_ = reader;

    /** @private {!shaka.msf.Utils.Version} */
    this.version_ = version;
  }

  /**
   * @return {!Promise<shaka.msf.Utils.MessageType>}
   * @private
   */
  async messageType_() {
    const type = await this.reader_.u53();

    // Read the 16-bit MSB length field
    const lengthBytes = await this.reader_.read(2);
    const messageLength = (lengthBytes[0] << 8) | lengthBytes[1]; // MSB format
    shaka.log.v1(`Raw message type: 0x${type.toString(16)}`,
        `Message length (16-bit MSB): ${messageLength} bytes,
        actual length: ${this.reader_.getByteLength()}`);

    let msgType;
    switch (type) {
      case shaka.msf.Utils.MessageTypeId.GOAWAY:
        msgType = shaka.msf.Utils.MessageType.GOAWAY;
        break;
      case shaka.msf.Utils.MessageTypeId.MAX_REQUEST_ID:
        msgType = shaka.msf.Utils.MessageType.MAX_REQUEST_ID;
        break;
      case shaka.msf.Utils.MessageTypeId.REQUESTS_BLOCKED:
        msgType = shaka.msf.Utils.MessageType.REQUESTS_BLOCKED;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_OK:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_ERROR:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_UPDATE:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE;
        break;
      case shaka.msf.Utils.MessageTypeId.UNSUBSCRIBE:
        msgType = shaka.msf.Utils.MessageType.UNSUBSCRIBE;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_DONE:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_DONE;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH:
        msgType = shaka.msf.Utils.MessageType.PUBLISH;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_OK:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_ERROR:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.FETCH:
        msgType = shaka.msf.Utils.MessageType.FETCH;
        break;
      case shaka.msf.Utils.MessageTypeId.FETCH_OK:
        msgType = shaka.msf.Utils.MessageType.FETCH_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.FETCH_ERROR:
        msgType = shaka.msf.Utils.MessageType.FETCH_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.FETCH_CANCEL:
        msgType = shaka.msf.Utils.MessageType.FETCH_CANCEL;
        break;
      case shaka.msf.Utils.MessageTypeId.TRACK_STATUS:
        msgType = shaka.msf.Utils.MessageType.TRACK_STATUS;
        break;
      case shaka.msf.Utils.MessageTypeId.TRACK_STATUS_OK:
        msgType = shaka.msf.Utils.MessageType.TRACK_STATUS_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.TRACK_STATUS_ERROR:
        msgType = shaka.msf.Utils.MessageType.TRACK_STATUS_ERROR;
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
      case shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_DONE:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE;
        break;
      case shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_CANCEL:
        msgType = shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_NAMESPACE:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_NAMESPACE_OK:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_NAMESPACE_ERROR:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.UNSUBSCRIBE_NAMESPACE:
        msgType = shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE;
        break;
      default:
        throw new Error(`Unknown message type: 0x${type.toString(16)}`);
    }

    shaka.log.v1(`Parsed message type: ${msgType} (0x${type.toString(16)})`);
    return msgType;
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Message>}
   */
  async message() {
    const type = await this.messageType_();

    /** @type {shaka.msf.Utils.Message} */
    let result;
    switch (type) {
      case shaka.msf.Utils.MessageType.GOAWAY:
        result = await this.goaway_();
        break;
      case shaka.msf.Utils.MessageType.MAX_REQUEST_ID:
        result = await this.maxRequestId_();
        break;
      case shaka.msf.Utils.MessageType.REQUESTS_BLOCKED:
        result = await this.requestsBlocked_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE:
        result = await this.subscribe_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_OK:
        result = await this.subscribeOk_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR:
        result = await this.subscribeError_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE:
        result = await this.subscribeUpdate_();
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE:
        result = await this.unsubscribe_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_DONE:
        result = await this.publishDone_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH:
        result = await this.publish_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_OK:
        result = await this.publishOk_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_ERROR:
        result = await this.publishError_();
        break;
      case shaka.msf.Utils.MessageType.FETCH:
        throw new Error(`Unsupported message type: ${type}`);
      case shaka.msf.Utils.MessageType.FETCH_OK:
        result = await this.fetchOk_();
        break;
      case shaka.msf.Utils.MessageType.FETCH_ERROR:
        result = await this.fetchError_();
        break;
      case shaka.msf.Utils.MessageType.FETCH_CANCEL:
      case shaka.msf.Utils.MessageType.TRACK_STATUS:
      case shaka.msf.Utils.MessageType.TRACK_STATUS_OK:
      case shaka.msf.Utils.MessageType.TRACK_STATUS_ERROR:
        throw new Error(`Unsupported message type: ${type}`);
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE:
        result = await this.publishNamespace_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK:
        result = await this.publishNamespaceOk_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR:
        result = await this.publishNamespaceError_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE:
        result = await this.publishNamespaceDone_();
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL:
        result = await this.publishNamespaceCancel_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE:
        result = await this.subscribeNamespace_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK:
        result = await this.subscribeNamespaceOk_();
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR:
        result = await this.subscribeNamespaceError_();
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE:
        result = await this.unsubscribeNamespace_();
        break;
      default:
        throw new Error(`Unsupported message type: ${type}`);
    }

    shaka.log.debug(`Successfully parsed ${type} message:`, result);
    return result;
  }

  /**
   * Read params using the appropriate decoding for the current version
   * @return {!Promise<!Array<shaka.msf.Utils.KeyValuePair>>}
   * @private
   */
  readParams_() {
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      return this.reader_.deltaKeyValuePairs();
    }
    return this.reader_.keyValuePairs();
  }

  /**
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} params
   * @param {bigint} key
   * @param {bigint} defaultValue
   * @return {bigint}
   * @private
   */
  findParamVarInt_(params, key, defaultValue) {
    const p = params.find((p) => p.type === key);
    if (p && typeof p.value === 'bigint') {
      return p.value;
    }
    return defaultValue;
  }

  /**
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} params
   * @param {bigint} key
   * @return {Uint8Array}
   * @private
   */
  findParamBytes_(params, key) {
    const p = params.find((p) => p.type === key);
    if (p && ArrayBuffer.isView(p.value)) {
      const bytes = /** @type {!Uint8Array} */ (p.value);
      return bytes;
    }
    return null;
  }

  /**
   * @param {number} orderCode
   * @return {!shaka.msf.Utils.GroupOrder}
   * @private
   */
  parseGroupOrder_(orderCode) {
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
   * @param {!Uint8Array} bytes
   * @return {!shaka.msf.Utils.Location}
   * @private
   */
  parseLocationFromBytes_(bytes) {
    let offset = 0;
    const {value: group, bytesRead: gb} =
        this.decodeVarIntFromBytes_(bytes, offset);
    offset += gb;
    const {value: object} = this.decodeVarIntFromBytes_(bytes, offset);
    return {group, object};
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @return {!{ value: bigint, bytesRead: number }}
   * @private
   */
  decodeVarIntFromBytes_(bytes, offset) {
    const first = bytes[offset];
    const prefix = first >> 6;
    let length;
    switch (prefix) {
      case 0:
        length = 1;
        break;
      case 1:
        length = 2;
        break;
      case 2:
        length = 4;
        break;
      case 3:
        length = 8;
        break;
      default:
        throw new Error(`Invalid var int prefix: ${prefix}`);
    }
    let value = BigInt(first & 0x3f);
    for (let i = 1; i < length; i++) {
      value = (value << BigInt(8)) | BigInt(bytes[offset + i]);
    }
    return {value, bytesRead: length};
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
   * @return {!Promise<shaka.msf.Utils.Goaway>}
   * @private
   */
  async goaway_() {
    const newSessionUri = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.GOAWAY,
      newSessionUri,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.MaxRequestId>}
   * @private
   */
  async maxRequestId_() {
    const requestId = await this.reader_.u62();

    return {
      kind: shaka.msf.Utils.MessageType.MAX_REQUEST_ID,
      requestId,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.RequestsBlocked>}
   * @private
   */
  async requestsBlocked_() {
    const maximumRequestId = await this.reader_.u62();

    return {
      kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
      maximumRequestId,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Subscribe>}
   * @private
   */
  async subscribe_() {
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const name = await this.reader_.string();
    const subscriberPriority = await this.reader_.u8();
    const groupOrder = await this.decodeGroupOrder_();
    const forward = await this.reader_.u8Bool();
    const filterType = /** @type {shaka.msf.Utils.FilterType} */(
      await this.reader_.u8());

    let startLocation;
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
        filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      startLocation = await this.location_();
    }

    let endGroup;
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      endGroup = await this.reader_.u62();
    }

    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId,
      namespace,
      name,
      subscriberPriority,
      groupOrder,
      forward,
      filterType: /** @type {shaka.config.MsfFilterType} */(filterType),
      startLocation,
      endGroup,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeOk>}
   * @private
   */
  subscribeOk_() {
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      return this.subscribeOkDraft16_();
    }
    return this.subscribeOkDraft14_();
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeOk>}
   * @private
   */
  async subscribeOkDraft14_() {
    const requestId = await this.reader_.u62();
    const trackAlias = await this.reader_.u62();
    const expires = await this.reader_.u62();
    const groupOrder = await this.decodeGroupOrder_();
    const contentExists = await this.reader_.u8Bool();

    let largest;
    if (contentExists) {
      largest = await this.location_();
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
   * @return {!Promise<shaka.msf.Utils.SubscribeOk>}
   * @private
   */
  async subscribeOkDraft16_() {
    const requestId = await this.reader_.u62();
    const trackAlias = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();

    const PARAM_EXPIRES = BigInt(0x08);
    const PARAM_LARGEST_OBJECT = BigInt(0x09);
    const PARAM_GROUP_ORDER = BigInt(0x22);

    const expires =
        this.findParamVarInt_(params, PARAM_EXPIRES, BigInt(0));
    const groupOrderVal =
        this.findParamVarInt_(params, PARAM_GROUP_ORDER, BigInt(0));
    const groupOrder =
        this.parseGroupOrder_(Number(groupOrderVal));
    const largestBytes =
        this.findParamBytes_(params, PARAM_LARGEST_OBJECT);

    let contentExists = false;
    let largest;
    if (largestBytes && largestBytes.length > 0) {
      contentExists = true;
      largest = this.parseLocationFromBytes_(largestBytes);
    }

    // TODO: read track extensions (currently skip any remaining bytes)

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
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    let retryInterval;
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      retryInterval = await this.reader_.u62();
    }
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
      requestId,
      code,
      retryInterval,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeUpdate>}
   * @private
   */
  async subscribeUpdate_() {
    const requestId = await this.reader_.u62();
    const subscriptionRequestId = await this.reader_.u62();
    const startLocation = await this.location_();
    const endGroup = await this.reader_.u62();
    const subscriberPriority = await this.reader_.u8();
    const forward = await this.reader_.u8Bool();
    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
      requestId,
      subscriptionRequestId,
      startLocation,
      endGroup,
      subscriberPriority,
      forward,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Unsubscribe>}
   * @private
   */
  async unsubscribe_() {
    const requestId = await this.reader_.u62();

    return {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      requestId,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishDone>}
   * @private
   */
  async publishDone_() {
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    const streamCount = await this.reader_.u53();
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
      requestId,
      code,
      streamCount,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Publish>}
   * @private
   */
  async publish_() {
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const name = await this.reader_.string();
    const trackAlias = await this.reader_.u62();
    const groupOrder = await this.decodeGroupOrder_();
    const contentExists = await this.reader_.u8Bool();

    let largestLocation;
    if (contentExists) {
      largestLocation = await this.location_();
    }

    const forward = await this.reader_.u8Bool();
    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH,
      requestId,
      namespace,
      name,
      trackAlias,
      groupOrder,
      contentExists,
      largestLocation,
      forward,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishOk>}
   * @private
   */
  async publishOk_() {
    const requestId = await this.reader_.u62();
    const forward = await this.reader_.u8Bool();
    const subscriberPriority = await this.reader_.u8();
    const groupOrder = await this.decodeGroupOrder_();
    const filterType = /** @type {shaka.msf.Utils.FilterType} */(
      await this.reader_.u8());

    let startLocation;
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
        filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      startLocation = await this.location_();
    }

    let endGroup;
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      endGroup = await this.reader_.u62();
    }

    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
      requestId,
      forward,
      subscriberPriority,
      groupOrder,
      filterType,
      startLocation,
      endGroup,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishError>}
   * @private
   */
  async publishError_() {
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    let retryInterval;
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      retryInterval = await this.reader_.u62();
    }
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_ERROR,
      requestId,
      code,
      retryInterval,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.FetchOk>}
   * @private
   */
  async fetchOk_() {
    const requestId = await this.reader_.u62();
    const groupOrder = await this.decodeGroupOrder_();
    const endOfTrack = await this.reader_.u8();
    const endGroup = await this.reader_.u62();
    const endObject = await this.reader_.u62();
    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.FETCH_OK,
      requestId,
      groupOrder,
      endOfTrack,
      endGroup,
      endObject,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.FetchError>}
   * @private
   */
  async fetchError_() {
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    let retryInterval;
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      retryInterval = await this.reader_.u62();
    }
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.FETCH_ERROR,
      requestId,
      code,
      retryInterval,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespace>}
   * @private
   */
  async publishNamespace_() {
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const params = await this.readParams_();

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
    const requestId = await this.reader_.u62();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
      requestId,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceError>}
   * @private
   */
  async publishNamespaceError_() {
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    let retryInterval;
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      retryInterval = await this.reader_.u62();
    }
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
      requestId,
      code,
      retryInterval,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceDone>}
   * @private
   */
  async publishNamespaceDone_() {
    const namespace = await this.reader_.tuple();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
      namespace,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceCancel>}
   * @private
   */
  async publishNamespaceCancel_() {
    const namespace = await this.reader_.tuple();
    const code = await this.reader_.u62();
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
      namespace,
      code,
      reason,
    };
  }

  /**
   * Parse SUBSCRIBE_NAMESPACE message. The relay sends this to ask us to
   * announce any namespaces we want to publish. As a pure subscriber,
   * we have nothing to announce — the message is parsed and ignored.
   *
   * @return {!Promise<shaka.msf.Utils.SubscribeNamespace>}
   * @private
   */
  async subscribeNamespace_() {
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const params = await this.reader_.keyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE,
      requestId,
      namespace,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeNamespaceOk>}
   * @private
   */
  async subscribeNamespaceOk_() {
    const requestId = await this.reader_.u62();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK,
      requestId,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeNamespaceError>}
   * @private
   */
  async subscribeNamespaceError_() {
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    let retryInterval;
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      retryInterval = await this.reader_.u62();
    }
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR,
      requestId,
      code,
      retryInterval,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.UnsubscribeNamespace>}
   * @private
   */
  async unsubscribeNamespace_() {
    const namespace = await this.reader_.tuple();

    return {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE,
      namespace,
    };
  }
};

shaka.msf.ControlStreamEncoder = class {
  /**
   * @param {!shaka.msf.Writer} writer
   * @param {!shaka.msf.Utils.Version} version
   */
  constructor(writer, version) {
    /** @private {!shaka.msf.Writer} */
    this.writer_ = writer;

    /** @private {!shaka.msf.Utils.Version} */
    this.version_ = version;
  }

  /**
   * @param {shaka.msf.Utils.Message} msg
   * @return {!Promise}
   */
  async message(msg) {
    shaka.log.debug(`Encoding message of type: ${msg.kind}`);

    // Create a BufferControlWriter to marshal the message
    const writer = new shaka.msf.BufferControlWriter(this.version_);

    // Marshal the message based on its type
    switch (msg.kind) {
      case shaka.msf.Utils.MessageType.GOAWAY:
        writer.marshalGoaway(
            /** @type {!shaka.msf.Utils.Goaway} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.MAX_REQUEST_ID:
        writer.marshalMaxRequestId(
            /** @type {!shaka.msf.Utils.MaxRequestId} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.REQUESTS_BLOCKED:
        writer.marshalRequestsBlocked(
            /** @type {!shaka.msf.Utils.RequestsBlocked} */ (msg));
        break;
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
      case shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE:
        writer.marshalSubscribeUpdate(
            /** @type {!shaka.msf.Utils.SubscribeUpdate} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE:
        writer.marshalUnsubscribe(
            /** @type {!shaka.msf.Utils.Unsubscribe} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_DONE:
        writer.marshalPublishDone(
            /** @type {!shaka.msf.Utils.PublishDone} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH:
        writer.marshalPublish(
            /** @type {!shaka.msf.Utils.Publish} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_OK:
        writer.marshalPublishOk(
            /** @type {!shaka.msf.Utils.PublishOk} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_ERROR:
        writer.marshalPublishError(
            /** @type {!shaka.msf.Utils.PublishError} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.FETCH:
        writer.marshalFetch(
            /** @type {!shaka.msf.Utils.Fetch} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.FETCH_OK:
        writer.marshalFetchOk(
            /** @type {!shaka.msf.Utils.FetchOk} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.FETCH_ERROR:
        writer.marshalFetchError(
            /** @type {!shaka.msf.Utils.FetchError} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.FETCH_CANCEL:
        writer.marshalFetchCancel(
            /** @type {!shaka.msf.Utils.FetchCancel} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.TRACK_STATUS:
      case shaka.msf.Utils.MessageType.TRACK_STATUS_OK:
      case shaka.msf.Utils.MessageType.TRACK_STATUS_ERROR:
        throw new Error(`Unsupported message type for encoding: ${msg.kind}`);
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
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE:
        writer.marshalPublishNamespaceDone(
            /** @type {!shaka.msf.Utils.PublishNamespaceDone} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL:
        writer.marshalPublishNamespaceCancel(
            /** @type {!shaka.msf.Utils.PublishNamespaceCancel} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE:
        writer.marshalSubscribeNamespace(
            /** @type {!shaka.msf.Utils.SubscribeNamespace} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK:
        writer.marshalSubscribeNamespaceOk(
            /** @type {!shaka.msf.Utils.SubscribeNamespaceOk} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR:
        writer.marshalSubscribeNamespaceError(
            /** @type {!shaka.msf.Utils.SubscribeNamespaceError} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE:
        writer.marshalUnsubscribeNamespace(
            /** @type {!shaka.msf.Utils.UnsubscribeNamespace} */ (msg));
        break;
      default:
        throw new Error(`Unsupported message type for encoding: ${msg.kind}`);
    }

    // Get the marshaled bytes and write them to the output stream
    const bytes = writer.getBytes();
    shaka.log.v1(
        `Marshaled ${bytes.length} bytes for message type: ${msg.kind}`);

    // Write the bytes directly to the output stream
    await this.writer_.write(bytes);
  }
};
