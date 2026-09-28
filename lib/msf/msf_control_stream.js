/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.ControlStream');

goog.require('shaka.log');
goog.require('shaka.msf.BufferControlWriter');
goog.require('shaka.msf.IControlStream');
goog.require('shaka.msf.Utils');
goog.require('shaka.util.Mutex');

goog.requireType('shaka.config.MsfFilterType');
goog.requireType('shaka.msf.Reader');
goog.requireType('shaka.msf.Writer');

/**
 * @implements {shaka.msf.IControlStream}
 */
shaka.msf.ControlStream = class {
  /**
   * @param {!shaka.msf.Reader} reader
   * @param {!shaka.msf.Writer} writer
   * @param {!shaka.extern.MsfCodec} codec
   */
  constructor(reader, writer, codec) {
    /** @private {!shaka.msf.ControlStreamDecoder} */
    this.decoder_ = new shaka.msf.ControlStreamDecoder(reader, codec);
    /** @private {!shaka.msf.ControlStreamEncoder} */
    this.encoder_ = new shaka.msf.ControlStreamEncoder(writer, codec);
    /** @private {!shaka.util.Mutex} */
    this.mutex_ = new shaka.util.Mutex();
  }

  /**
   * Will error if two messages are read at once.
   *
   * @override
   */
  async receive() {
    const message = await this.decoder_.message();
    return message;
  }

  /** @override */
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
   * @param {!shaka.extern.MsfCodec} codec
   */
  constructor(reader, codec) {
    /**
     * The control stream.
     * @private {!shaka.msf.Reader}
     */
    this.stream_ = reader;

    /** @private {!shaka.extern.MsfCodec} */
    this.codec_ = codec;

    /**
     * A reader over exactly the payload of the message being parsed.
     * @private {!shaka.msf.Reader}
     */
    this.reader_ = this.readerOver_(new Uint8Array([]));
  }

  /**
   * @param {!Uint8Array} bytes
   * @return {!shaka.msf.Reader} A reader that ends after these bytes.
   * @private
   */
  readerOver_(bytes) {
    const ended = new ReadableStream({
      start: (controller) => controller.close(),
    });
    return new shaka.msf.Reader(bytes, ended, this.codec_);
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Message>}
   */
  async message() {
    const type = await this.stream_.u53();
    const lengthBytes = await this.stream_.read(2);
    const length = (lengthBytes[0] << 8) | lengthBytes[1]; // MSB format
    shaka.log.v1(`Raw message type: 0x${type.toString(16)}, ` +
        `length: ${length} bytes`);

    // Every message is parsed from a reader over exactly its payload, so a
    // trailing field this decoder does not read cannot be taken for the
    // start of the next message.
    this.reader_ = this.readerOver_(await this.stream_.read(length));

    // The draft-16 message types. Draft-16 folded every per-request OK and
    // ERROR into REQUEST_OK and REQUEST_ERROR, dropped the namespace
    // subscription's OK, ERROR and UNSUBSCRIBE, and reused 0x8 and 0xE for
    // NAMESPACE and NAMESPACE_DONE.
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    /** @type {shaka.msf.Utils.Message} */
    let result;
    switch (type) {
      case MessageTypeId.GOAWAY:
        result = await this.goaway_();
        break;
      case MessageTypeId.MAX_REQUEST_ID:
        result = await this.maxRequestId_();
        break;
      case MessageTypeId.REQUESTS_BLOCKED:
        result = await this.requestsBlocked_();
        break;
      case MessageTypeId.REQUEST_OK:
        result = await this.requestOk_();
        break;
      case MessageTypeId.REQUEST_ERROR:
        result = await this.requestError_();
        break;
      case MessageTypeId.SUBSCRIBE:
        result = await this.subscribe_();
        break;
      case MessageTypeId.SUBSCRIBE_OK:
        result = await this.subscribeOk_();
        break;
      case MessageTypeId.SUBSCRIBE_UPDATE:
        result = await this.subscribeUpdate_();
        break;
      case MessageTypeId.UNSUBSCRIBE:
        result = await this.unsubscribe_();
        break;
      case MessageTypeId.PUBLISH:
        result = await this.publish_();
        break;
      case MessageTypeId.PUBLISH_OK:
        result = await this.publishOk_();
        break;
      case MessageTypeId.PUBLISH_DONE:
        result = await this.publishDone_();
        break;
      case MessageTypeId.FETCH_OK:
        result = await this.fetchOk_();
        break;
      case MessageTypeId.PUBLISH_NAMESPACE:
        result = await this.publishNamespace_();
        break;
      case MessageTypeId.NAMESPACE:
        result = await this.namespace_();
        break;
      case MessageTypeId.PUBLISH_NAMESPACE_DONE:
        result = await this.publishNamespaceDone_();
        break;
      case MessageTypeId.NAMESPACE_DONE:
        result = await this.namespaceDone_();
        break;
      case MessageTypeId.PUBLISH_NAMESPACE_CANCEL:
        result = await this.publishNamespaceCancel_();
        break;
      case MessageTypeId.SUBSCRIBE_NAMESPACE:
        result = await this.subscribeNamespace_();
        break;
      case MessageTypeId.FETCH:
      case MessageTypeId.FETCH_CANCEL:
      case MessageTypeId.TRACK_STATUS:
        throw new Error(`Unsupported message type: 0x${type.toString(16)}`);
      default:
        throw new Error(`Unknown message type: 0x${type.toString(16)}`);
    }

    shaka.log.debug(`Successfully parsed ${result.kind} message:`, result);
    return result;
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
   * @param {!Uint8Array} bytes
   * @return {!shaka.msf.Utils.Location}
   * @private
   */
  parseLocationFromBytes_(bytes) {
    const {value: group, bytesRead} = this.codec_.decodeVarIntAt(bytes, 0);
    const {value: object} = this.codec_.decodeVarIntAt(bytes, bytesRead);
    return {group, object};
  }

  /**
   * The LARGEST_OBJECT parameter, whose absence means no Object has been
   * published on the Track yet.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} params
   * @return {?shaka.msf.Utils.Location}
   * @private
   */
  largestObjectParam_(params) {
    const PARAM_LARGEST_OBJECT = BigInt(0x09);
    const bytes = this.findParamBytes_(params, PARAM_LARGEST_OBJECT);
    if (!bytes || !bytes.length) {
      return null;
    }
    return this.parseLocationFromBytes_(bytes);
  }

  /**
   * The subscription settings carried as parameters by SUBSCRIBE and
   * PUBLISH_OK, with the defaults draft-16 section 9.2.2 gives for the ones
   * left out.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} params
   * @return {{
   *   forward: boolean,
   *   subscriberPriority: number,
   *   groupOrder: shaka.msf.Utils.GroupOrder,
   *   filterType: shaka.msf.Utils.FilterType,
   *   startLocation: (shaka.msf.Utils.Location|undefined),
   *   endGroup: (bigint|undefined),
   * }}
   * @private
   */
  subscriptionFromParams_(params) {
    const PARAM_SUBSCRIBER_PRIORITY = BigInt(0x20);
    const PARAM_SUBSCRIPTION_FILTER = BigInt(0x21);
    const PARAM_GROUP_ORDER = BigInt(0x22);

    const subscriberPriority = Number(this.findParamVarInt_(
        params, PARAM_SUBSCRIBER_PRIORITY, BigInt(128)));
    const groupOrderParam = params.find((p) => p.type === PARAM_GROUP_ORDER);
    const groupOrder = groupOrderParam ?
        this.parseGroupOrderParam_(groupOrderParam.value) :
        shaka.msf.Utils.GroupOrder.PUBLISHER;

    // No filter is an unfiltered subscription; draft-16 has no Filter Type
    // for it, so NONE stands in.
    let filterType = shaka.msf.Utils.FilterType.NONE;
    let startLocation;
    let endGroup;
    const filterBytes =
        this.findParamBytes_(params, PARAM_SUBSCRIPTION_FILTER);
    if (filterBytes) {
      ({filterType, startLocation, endGroup} =
          this.parseFilterBytes_(filterBytes));
    }

    return {
      forward: this.forwardParam_(params),
      subscriberPriority,
      groupOrder,
      filterType,
      startLocation,
      endGroup,
    };
  }

  /**
   * The FORWARD parameter. Omitted, it is 1.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} params
   * @return {boolean}
   * @private
   */
  forwardParam_(params) {
    const PARAM_FORWARD = BigInt(0x10);
    const forward = this.findParamVarInt_(params, PARAM_FORWARD, BigInt(1));
    if (forward > BigInt(1)) {
      throw new Error(`Invalid FORWARD value: ${forward}`);
    }
    return forward == BigInt(1);
  }

  /**
   * The value of a GROUP_ORDER parameter or DEFAULT_PUBLISHER_GROUP_ORDER
   * extension. Unlike draft-14's fixed field, neither has a 0: only
   * Ascending and Descending are legal.
   *
   * @param {(bigint|!Uint8Array)} value
   * @return {shaka.msf.Utils.GroupOrder}
   * @private
   */
  parseGroupOrderParam_(value) {
    if (value === BigInt(shaka.msf.Utils.GroupOrder.ASCENDING)) {
      return shaka.msf.Utils.GroupOrder.ASCENDING;
    }
    if (value === BigInt(shaka.msf.Utils.GroupOrder.DESCENDING)) {
      return shaka.msf.Utils.GroupOrder.DESCENDING;
    }
    throw new Error(`Invalid GroupOrder value: ${value}`);
  }

  /**
   * The publisher's group order, from the DEFAULT_PUBLISHER_GROUP_ORDER
   * Track Extension. Omitted, it is Ascending.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} extensions
   * @return {shaka.msf.Utils.GroupOrder}
   * @private
   */
  defaultPublisherGroupOrder_(extensions) {
    const EXT_DEFAULT_PUBLISHER_GROUP_ORDER = BigInt(0x22);
    const extension = extensions.find(
        (e) => e.type === EXT_DEFAULT_PUBLISHER_GROUP_ORDER);
    if (!extension) {
      return shaka.msf.Utils.GroupOrder.ASCENDING;
    }
    return this.parseGroupOrderParam_(extension.value);
  }

  /**
   * Decodes the value of a SUBSCRIPTION_FILTER parameter.
   *
   * @param {!Uint8Array} bytes
   * @return {{
   *   filterType: shaka.msf.Utils.FilterType,
   *   startLocation: (shaka.msf.Utils.Location|undefined),
   *   endGroup: (bigint|undefined),
   * }}
   * @private
   */
  parseFilterBytes_(bytes) {
    const FilterType = shaka.msf.Utils.FilterType;
    let offset = 0;
    const next = () => {
      if (offset >= bytes.length) {
        throw new Error('SUBSCRIPTION_FILTER is shorter than its filter');
      }
      const {value, bytesRead} = this.codec_.decodeVarIntAt(bytes, offset);
      offset += bytesRead;
      return value;
    };

    const filterType =
    /** @type {shaka.msf.Utils.FilterType} */(Number(next()));
    let startLocation;
    let endGroup;
    switch (filterType) {
      case FilterType.NEXT_GROUP_START:
      case FilterType.LARGEST_OBJECT:
        break;
      case FilterType.ABSOLUTE_START:
        startLocation = {group: next(), object: next()};
        break;
      case FilterType.ABSOLUTE_RANGE:
        startLocation = {group: next(), object: next()};
        endGroup = next();
        break;
      default:
        throw new Error(`Invalid filter type: ${filterType}`);
    }
    if (offset != bytes.length) {
      throw new Error('SUBSCRIPTION_FILTER length does not match its filter');
    }
    return {filterType, startLocation, endGroup};
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
    // Draft-16 SUBSCRIBE is the track and parameters; every fixed field
    // draft-14 had moved into them.
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const name = await this.reader_.string();
    const params = await this.reader_.deltaKeyValuePairs();

    const sub = this.subscriptionFromParams_(params);

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId,
      namespace,
      name,
      subscriberPriority: sub.subscriberPriority,
      groupOrder: sub.groupOrder,
      forward: sub.forward,
      filterType: /** @type {shaka.config.MsfFilterType} */(sub.filterType),
      startLocation: sub.startLocation,
      endGroup: sub.endGroup,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeOk>}
   * @private
   */
  async subscribeOk_() {
    const requestId = await this.reader_.u62();
    const trackAlias = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();
    // Track Extensions run to the end of the payload.
    const extensions = await this.reader_.deltaKeyValuePairsToEnd();

    const PARAM_EXPIRES = BigInt(0x08);

    const expires =
        this.findParamVarInt_(params, PARAM_EXPIRES, BigInt(0));
    const largest = this.largestObjectParam_(params);
    // SUBSCRIBE_OK carries no GROUP_ORDER parameter. The order the
    // subscription is delivered in is the publisher's, which is a Track
    // Extension.
    const groupOrder = this.defaultPublisherGroupOrder_(extensions);

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      requestId,
      trackAlias,
      expires,
      groupOrder,
      contentExists: !!largest,
      largest: largest || undefined,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.SubscribeUpdate>}
   * @private
   */
  async subscribeUpdate_() {
    // Draft-16 REQUEST_UPDATE. A parameter it leaves out keeps its value,
    // so an omitted field stays undefined rather than taking a default.
    const requestId = await this.reader_.u62();
    const subscriptionRequestId = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();

    const PARAM_FORWARD = BigInt(0x10);
    const PARAM_SUBSCRIBER_PRIORITY = BigInt(0x20);
    const PARAM_SUBSCRIPTION_FILTER = BigInt(0x21);

    const has = (type) => params.some((p) => p.type === type);

    let startLocation;
    let endGroup;
    const filterBytes =
        this.findParamBytes_(params, PARAM_SUBSCRIPTION_FILTER);
    if (filterBytes) {
      const filter = this.parseFilterBytes_(filterBytes);
      // Only an absolute filter says what this message models, a Start
      // Location and an End Group, which is draft-14's last group plus 1.
      // Any other filter is still in params.
      if (filter.startLocation) {
        startLocation = filter.startLocation;
        endGroup = filter.endGroup === undefined ?
            BigInt(0) : filter.endGroup + BigInt(1);
      }
    }

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
      requestId,
      subscriptionRequestId,
      startLocation,
      endGroup,
      subscriberPriority: has(PARAM_SUBSCRIBER_PRIORITY) ?
          Number(this.findParamVarInt_(
              params, PARAM_SUBSCRIBER_PRIORITY, BigInt(0))) :
          undefined,
      forward: has(PARAM_FORWARD) ? this.forwardParam_(params) : undefined,
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
    // Draft-16 moved the group order, largest location and forward state out
    // of fixed fields: the last two are parameters, and the publisher's group
    // order is a Track Extension, which runs to the end of the payload.
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const name = await this.reader_.string();
    const trackAlias = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();
    const extensions = await this.reader_.deltaKeyValuePairsToEnd();

    const largestLocation = this.largestObjectParam_(params);

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH,
      requestId,
      namespace,
      name,
      trackAlias,
      groupOrder: this.defaultPublisherGroupOrder_(extensions),
      contentExists: !!largestLocation,
      largestLocation: largestLocation || undefined,
      forward: this.forwardParam_(params),
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishOk>}
   * @private
   */
  async publishOk_() {
    // Draft-16 PUBLISH_OK is a Request ID and parameters; everything that was
    // a fixed field moved into them.
    const requestId = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();

    const sub = this.subscriptionFromParams_(params);

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
      requestId,
      forward: sub.forward,
      subscriberPriority: sub.subscriberPriority,
      groupOrder: sub.groupOrder,
      filterType: sub.filterType,
      startLocation: sub.startLocation,
      endGroup: sub.endGroup,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.FetchOk>}
   * @private
   */
  async fetchOk_() {
    // Draft-16 FETCH_OK has no Group Order field. It ends with Track
    // Extensions, which nothing here uses.
    const requestId = await this.reader_.u62();
    const endOfTrack = await this.reader_.u8();
    const endGroup = await this.reader_.u62();
    const endObject = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.FETCH_OK,
      requestId,
      groupOrder: undefined,
      endOfTrack,
      endGroup,
      endObject,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespace>}
   * @private
   */
  async publishNamespace_() {
    const requestId = await this.reader_.u62();
    const namespace = await this.reader_.tuple();
    const params = await this.reader_.deltaKeyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
      requestId,
      namespace,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceDone>}
   * @private
   */
  async publishNamespaceDone_() {
    // Draft-16 names the PUBLISH_NAMESPACE by its Request ID, not by its
    // namespace as draft-14 did.
    const requestId = await this.reader_.u62();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
      requestId,
      namespace: undefined,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.PublishNamespaceCancel>}
   * @private
   */
  async publishNamespaceCancel_() {
    // Draft-16 names the PUBLISH_NAMESPACE by its Request ID, not by its
    // namespace as draft-14 did.
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
      requestId,
      namespace: undefined,
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
    const subscribeOptions = await this.reader_.u53();
    const params = await this.reader_.deltaKeyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE,
      requestId,
      namespace,
      subscribeOptions,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.RequestOk>}
   * @private
   */
  async requestOk_() {
    const requestId = await this.reader_.u62();
    const params = await this.reader_.deltaKeyValuePairs();

    return {
      kind: shaka.msf.Utils.MessageType.REQUEST_OK,
      requestId,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.RequestError>}
   * @private
   */
  async requestError_() {
    const requestId = await this.reader_.u62();
    const code = await this.reader_.u62();
    const retryInterval = await this.reader_.u62();
    const reason = await this.reader_.string();

    return {
      kind: shaka.msf.Utils.MessageType.REQUEST_ERROR,
      requestId,
      code,
      retryInterval,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Namespace>}
   * @private
   */
  async namespace_() {
    return {
      kind: shaka.msf.Utils.MessageType.NAMESPACE,
      namespace: await this.reader_.tuple(),
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Namespace>}
   * @private
   */
  async namespaceDone_() {
    return {
      kind: shaka.msf.Utils.MessageType.NAMESPACE_DONE,
      namespace: await this.reader_.tuple(),
    };
  }
};

shaka.msf.ControlStreamEncoder = class {
  /**
   * @param {!shaka.msf.Writer} writer
   * @param {!shaka.extern.MsfCodec} codec
   */
  constructor(writer, codec) {
    /** @private {!shaka.msf.Writer} */
    this.writer_ = writer;

    /** @private {!shaka.extern.MsfCodec} */
    this.codec_ = codec;
  }

  /**
   * @param {shaka.msf.Utils.Message} msg
   * @return {!Promise}
   */
  async message(msg) {
    shaka.log.debug(`Encoding message of type: ${msg.kind}`);

    // Create a BufferControlWriter to marshal the message
    const writer = new shaka.msf.BufferControlWriter(this.codec_);

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
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK:
      case shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR:
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE:
        // Draft-16 runs a namespace subscription on a bidirectional stream of
        // its own: SUBSCRIBE_NAMESPACE opens it, the answer and the NAMESPACE
        // messages come back on it, and closing it unsubscribes. None of that
        // belongs on the control stream.
        throw new Error(`${msg.kind} is not sent on the draft-16 control ` +
            'stream; it needs a SUBSCRIBE_NAMESPACE stream of its own');
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
