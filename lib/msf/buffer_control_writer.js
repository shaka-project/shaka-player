/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.BufferControlWriter');

goog.require('shaka.msf.Utils');
goog.require('shaka.util.DataViewWriter');


/**
 * BufferControlWriter class for writing control messages to a buffer
 * following the draft-14/16 specification.
 *
 * The typical pattern is to instantiate the class and call one of the
 * marshal methods to write a message to the buffer. The format is always:
 * wire format type, 16-bit length, message fields, etc.
 */
shaka.msf.BufferControlWriter = class {
  /**
   * Creates a new BufferControlWriter with an initial buffer size
   * @param {!shaka.msf.Utils.Version} version
   * @param {number=} initialSize
   */
  constructor(version, initialSize = 1024) {
    /** @private {!shaka.msf.Utils.Version} */
    this.version_ = version;

    /** @private {!shaka.util.DataViewWriter} */
    this.writer_ = new shaka.util.DataViewWriter(
        initialSize, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
  }

  /**
   * Gets the current buffer with only the written data
   * @return {!Uint8Array}
   */
  getBytes() {
    return this.writer_.getBytes();
  }

  /**
   * Resets the buffer to start writing from the beginning
   */
  reset() {
    this.writer_.reset();
  }

  /**
   * Writes a boolean value as a uint8 to the buffer
   * @param {boolean} value
   * @private
   */
  writeBoolAsUint8_(value) {
    this.writer_.writeUint8(value ? 1 : 0);
  }

  /**
   * Writes an array with a var int length prefix
   * @param {!Array<T>} array
   * @param {function(T)} writeFn
   * @template T
   * @private
   */
  writeArray_(array, writeFn) {
    this.writer_.writeVarInt53(array.length);
    for (const item of array) {
      writeFn(item);
    }
  }

  /**
   * Writes a string to the buffer
   * @param {string} str
   * @private
   */
  writeString_(str) {
    this.writer_.writeStringVarInt(str);
  }

  /**
   * Writes a tuple (array of strings) to the buffer
   * @param {Array<string>} tuple
   * @private
   */
  writeTuple_(tuple) {
    this.writeArray_(tuple || [], (element) => {
      this.writeString_(element);
    });
  }

  /**
   * Writes a location to the buffer
   * @param {shaka.msf.Utils.Location} location
   * @private
   */
  writeLocation_(location) {
    this.writer_.writeVarInt62(location.group);
    this.writer_.writeVarInt62(location.object);
  }

  /**
   * Writes a single key-value pair to the buffer
   * @param {shaka.msf.Utils.KeyValuePair} pair
   * @private
   */
  writeKeyValuePair_(pair) {
    this.writer_.writeVarInt62(pair.type);

    // Handle the value based on whether the key is odd or even
    if (pair.type % BigInt(2) === BigInt(0)) {
      // Even keys have bigint values
      if (typeof pair.value !== 'bigint') {
        throw new Error(
            'Invalid value type for even key ' + pair.type +
            ': expected bigint, got ' + typeof pair.value,
        );
      }
      this.writer_.writeVarInt62(pair.value);
    } else {
      // Odd keys have Uint8Array values
      if (!ArrayBuffer.isView(pair.value)) {
        throw new Error(
            'Invalid value type for odd key ' + pair.type +
          ': expected Uint8Array or ArrayBuffer view, got ' + typeof pair.value,
        );
      }
      const bytes = /** @type {!Uint8Array} */ (pair.value);
      this.writer_.writeVarInt53(bytes.byteLength);
      this.writer_.writeBytes(bytes);
    }
  }

  /**
   * Writes an array of key-value pairs to the buffer
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)} pairs
   * @private
   */
  writeKeyValuePairs_(pairs) {
    const numPairs = pairs ? pairs.length : 0;
    this.writer_.writeVarInt53(numPairs);

    if (!pairs || !pairs.length) {
      return;
    }

    for (const pair of pairs) {
      this.writeKeyValuePair_(pair);
    }
  }

  /**
   * Writes delta-encoded key-value pairs (draft-16+).
   * Parameters are sorted by ascending type, then each type is encoded
   * as a delta from the previous type.
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)} pairs
   * @private
   */
  writeDeltaKeyValuePairs_(pairs) {
    const numPairs = pairs ? pairs.length : 0;
    this.writer_.writeVarInt53(numPairs);

    if (!pairs || !pairs.length) {
      return;
    }

    // Sort by ascending type for delta encoding
    /** @type {!Array<shaka.msf.Utils.KeyValuePair>} */
    const sorted = [...pairs].sort((a, b) => {
      if (a.type < b.type) {
        return -1;
      }
      if (a.type > b.type) {
        return 1;
      }
      return 0;
    });

    let prevType = BigInt(0);
    for (const pair of sorted) {
      // Write delta type
      const delta = pair.type - prevType;
      this.writer_.writeVarInt62(delta);
      prevType = pair.type;

      if (pair.type % BigInt(2) === BigInt(0)) {
        // Even keys have bigint values
        if (typeof pair.value !== 'bigint') {
          throw new Error(
              'Invalid value type for even key ' + pair.type +
              ': expected bigint, got ' + typeof pair.value,
          );
        }
        this.writer_.writeVarInt62(pair.value);
      } else {
        // Odd keys have Uint8Array values
        if (!ArrayBuffer.isView(pair.value)) {
          throw new Error('Invalid value type for odd key ' +
              pair.type + ': expected Uint8Array');
        }
        const bytes = /** @type {!Uint8Array} */ (pair.value);
        this.writer_.writeVarInt53(bytes.byteLength);
        this.writer_.writeBytes(bytes);
      }
    }
  }

  /**
   * Writes params using the appropriate encoding for the current version
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)} pairs
   * @private
   */
  writeParams_(pairs) {
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      this.writeDeltaKeyValuePairs_(pairs);
    } else {
      this.writeKeyValuePairs_(pairs);
    }
  }

  /**
   * Encodes a subscription filter into bytes for the SUBSCRIPTION_FILTER
   * parameter
   *
   * @param {shaka.msf.Utils.FilterType} filterType
   * @param {(shaka.msf.Utils.Location|undefined)} startLocation
   * @param {(bigint|undefined)} endGroup
   * @return {!Uint8Array}
   * @private
   */
  encodeFilterBytes_(filterType, startLocation, endGroup) {
    const tempWriter = new shaka.util.DataViewWriter(
        /* initialSize= */ 32, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
    tempWriter.writeVarInt53(filterType);

    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
        filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
      if (!startLocation) {
        throw new Error('Missing startLocation for absolute filter');
      }
      tempWriter.writeVarInt62(startLocation.group);
      tempWriter.writeVarInt62(startLocation.object);
    }
    if (filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START) {
      if (endGroup === undefined) {
        throw new Error('Missing endGroup for absolute range filter');
      }
      tempWriter.writeVarInt62(endGroup);
    }
    return tempWriter.getBytes();
  }


  /**
   * Helper method to marshal a message with proper type and length
   * @param {shaka.msf.Utils.MessageTypeId} messageType
   * @param {function()} writeContent
   */
  marshalWithLength(messageType, writeContent) {
    this.writer_.writeUint8(messageType);

    // Reserve space for the 16-bit length field
    const lengthPosition = this.writer_.getPosition();
    this.writer_.writeUint16(0); // Placeholder

    const contentStart = this.writer_.getPosition();
    writeContent();
    const contentLength = this.writer_.getPosition() - contentStart;

    this.writer_.patchUint16(lengthPosition, contentLength);
  }

  /**
   * Helper to marshal a message and return this
   * @param {shaka.msf.Utils.MessageTypeId} type
   * @param {function()} fn
   * @return {!shaka.msf.BufferControlWriter}
   * @private
   */
  marshal_(type, fn) {
    this.marshalWithLength(type, fn);
    return this;
  }

  /**
   * Marshals a Goaway message to the buffer
   * @param {shaka.msf.Utils.Goaway} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalGoaway(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.GOAWAY, () => {
      this.writeString_(msg.newSessionUri);
    });
  }

  /**
   * Marshals a MaxRequestId message to the buffer
   * @param {shaka.msf.Utils.MaxRequestId} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalMaxRequestId(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.MAX_REQUEST_ID, () => {
      this.writer_.writeVarInt62(msg.requestId);
    });
  }

  /**
   * Marshals a RequestsBlocked message to the buffer
   * @param {shaka.msf.Utils.RequestsBlocked} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalRequestsBlocked(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.REQUESTS_BLOCKED, () => {
      this.writer_.writeVarInt62(msg.maximumRequestId);
    });
  }

  /**
   * Marshals a Subscribe message to the buffer
   * @param {shaka.msf.Utils.Subscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribe(msg) {
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      return this.marshalSubscribeDraft16_(msg);
    }
    return this.marshalSubscribeDraft14_(msg);
  }

  /**
   * Marshals a Subscribe message to the buffer
   * @param {shaka.msf.Utils.Subscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   * @private
   */
  marshalSubscribeDraft14_(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeString_(msg.name);
      this.writer_.writeUint8(msg.subscriberPriority);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeBoolAsUint8_(msg.forward);
      this.writer_.writeUint8(msg.filterType);

      if (msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
          msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
        if (!msg.startLocation) {
          throw new Error('Missing startLocation for absolute filter');
        }
        this.writeLocation_(msg.startLocation);
      }

      if (msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
        if (!msg.endGroup) {
          throw new Error('Missing endGroup for absolute range filter');
        }
        this.writer_.writeVarInt62(msg.endGroup);
      }

      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a Subscribe message to the buffer
   * @param {shaka.msf.Utils.Subscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   * @private
   */
  marshalSubscribeDraft16_(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeString_(msg.name);

      /** @type {!Array<shaka.msf.Utils.KeyValuePair>} */
      const params = msg.params || [];

      const PARAM_FORWARD = BigInt(0x10);
      const PARAM_SUBSCRIBER_PRIORITY = BigInt(0x20);
      const PARAM_SUBSCRIPTION_FILTER = BigInt(0x21);
      const PARAM_GROUP_ORDER = BigInt(0x22);

      params.push({
        type: PARAM_FORWARD,
        value: BigInt(msg.forward ? 1 : 0),
      });
      params.push({
        type: PARAM_SUBSCRIBER_PRIORITY,
        value: BigInt(msg.subscriberPriority),
      });
      const filterType =
      /** @type {shaka.msf.Utils.FilterType} */(msg.filterType);
      params.push({
        type: PARAM_SUBSCRIPTION_FILTER,
        value: this.encodeFilterBytes_(
            filterType, msg.startLocation, msg.endGroup),
      });
      params.push({
        type: PARAM_GROUP_ORDER,
        value: BigInt(msg.groupOrder),
      });
      this.writeDeltaKeyValuePairs_(params);
    });
  }

  /**
   * Marshals a SubscribeOk message to the buffer
   * @param {shaka.msf.Utils.SubscribeOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_OK, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.expires);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeBoolAsUint8_(msg.contentExists);

      if (msg.contentExists) {
        if (!msg.largest) {
          throw new Error('Missing largest for contentExists');
        }
        this.writeLocation_(msg.largest);
      }

      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals a SubscribeError message to the buffer
   * @param {shaka.msf.Utils.SubscribeError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_ERROR, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.code);
      if (shaka.msf.Utils.isDraft16(this.version_)) {
        // Draft-16 REQUEST_ERROR: includes retryInterval
        this.writer_.writeVarInt62(msg.retryInterval ?? BigInt(0));
      }
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals a SubscribeUpdate / REQUEST_UPDATE message to the buffer
   * @param {shaka.msf.Utils.SubscribeUpdate} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeUpdate(msg) {
    if (shaka.msf.Utils.isDraft16(this.version_)) {
      return this.marshalSubscribeUpdateDraft16_(msg);
    }
    return this.marshalSubscribeUpdateDraft14_(msg);
  }

  /**
   * Marshals a SubscribeUpdate / REQUEST_UPDATE message to the buffer
   * @param {shaka.msf.Utils.SubscribeUpdate} msg
   * @return {!shaka.msf.BufferControlWriter}
   * @private
   */
  marshalSubscribeUpdateDraft14_(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_UPDATE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeLocation_(msg.startLocation);
      this.writer_.writeVarInt62(msg.endGroup);
      this.writer_.writeUint8(msg.subscriberPriority);
      this.writeBoolAsUint8_(msg.forward);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a SubscribeUpdate / REQUEST_UPDATE message to the buffer
   * @param {shaka.msf.Utils.SubscribeUpdate} msg
   * @return {!shaka.msf.BufferControlWriter}
   * @private
   */
  marshalSubscribeUpdateDraft16_(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_UPDATE, () => {
      this.writer_.writeVarInt62(msg.requestId);

      /** @type {!Array<shaka.msf.Utils.KeyValuePair>} */
      const params = msg.params || [];

      const PARAM_FORWARD = BigInt(0x10);
      const PARAM_SUBSCRIBER_PRIORITY = BigInt(0x20);
      const PARAM_SUBSCRIPTION_FILTER = BigInt(0x21);

      params.push({
        type: PARAM_FORWARD,
        value: BigInt(msg.forward ? 1 : 0),
      });
      params.push({
        type: PARAM_SUBSCRIBER_PRIORITY,
        value: BigInt(msg.subscriberPriority),
      });
      // Encode filter
      const filterType = msg.endGroup > BigInt(0) ?
          shaka.msf.Utils.FilterType.ABSOLUTE_RANGE :
          shaka.msf.Utils.FilterType.ABSOLUTE_START;
      params.push({
        type: PARAM_SUBSCRIPTION_FILTER,
        value: this.encodeFilterBytes_(
            filterType, msg.startLocation, msg.endGroup),
      });
      this.writeDeltaKeyValuePairs_(params);
    });
  }

  /**
   * Marshals an Unsubscribe message to the buffer
   * @param {shaka.msf.Utils.Unsubscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalUnsubscribe(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.UNSUBSCRIBE, () => {
      this.writer_.writeVarInt62(msg.requestId);
    });
  }

  /**
   * Marshals a PublishDone message to the buffer
   * @param {shaka.msf.Utils.PublishDone} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishDone(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_DONE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.code);
      this.writeString_(msg.reason);
      this.writer_.writeVarInt53(msg.streamCount);
    });
  }

  /**
   * Marshals a Publish message to the buffer
   * @param {shaka.msf.Utils.Publish} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublish(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeString_(msg.name);
      this.writer_.writeVarInt62(msg.trackAlias);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeBoolAsUint8_(msg.contentExists);

      if (msg.contentExists) {
        if (!msg.largestLocation) {
          throw new Error('Missing largestLocation for contentExists');
        }
        this.writeLocation_(msg.largestLocation);
      }

      this.writeBoolAsUint8_(msg.forward);
      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals a PublishOk message to the buffer
   * @param {shaka.msf.Utils.PublishOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_OK, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeBoolAsUint8_(msg.forward);
      this.writer_.writeUint8(msg.subscriberPriority);
      this.writer_.writeUint8(msg.groupOrder);
      this.writer_.writeUint8(msg.filterType);

      if (msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
          msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
        if (!msg.startLocation) {
          throw new Error('Missing startLocation for absolute filter');
        }
        this.writeLocation_(msg.startLocation);
      }

      if (msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
        if (!msg.endGroup) {
          throw new Error('Missing endGroup for absolute range filter');
        }
        this.writer_.writeVarInt62(msg.endGroup);
      }

      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals a PublishError message to the buffer
   * @param {shaka.msf.Utils.PublishError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_ERROR, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals a Fetch message to the buffer (standalone fetch type)
   * @param {shaka.msf.Utils.Fetch} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalFetch(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeUint8(msg.subscriberPriority);
      this.writer_.writeUint8(msg.groupOrder);
      this.writer_.writeVarInt62(BigInt(msg.fetchType));
      // Standalone fetch includes namespace, trackName, start/end
      this.writeTuple_(msg.namespace);
      this.writeString_(msg.trackName);
      this.writer_.writeVarInt62(msg.startGroup);
      this.writer_.writeVarInt62(msg.startObject);
      this.writer_.writeVarInt62(msg.endGroup);
      this.writer_.writeVarInt62(msg.endObject);
      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals a Fetch message to the buffer (standalone fetch type)
   * @param {shaka.msf.Utils.FetchOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalFetchOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeUint8(msg.groupOrder);
      this.writer_.writeVarInt62(BigInt(msg.endOfTrack));
      this.writer_.writeVarInt62(msg.endGroup);
      this.writer_.writeVarInt62(msg.endObject);
      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals a FetchError message to the buffer
   * @param {shaka.msf.Utils.FetchError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalFetchError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH_ERROR, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals a FetchCancel message to the buffer
   * @param {shaka.msf.Utils.FetchCancel} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalFetchCancel(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH_CANCEL, () => {
      this.writer_.writeVarInt62(msg.requestId);
    });
  }

  /**
   * Marshals an PublishNamespace message to the buffer
   * @param {shaka.msf.Utils.PublishNamespace} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals an PublishNamespaceOk / REQUEST_OK message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespaceOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_OK, () => {
      this.writer_.writeVarInt62(msg.requestId);
      if (shaka.msf.Utils.isDraft16(this.version_)) {
        // Draft-16 REQUEST_OK includes parameters
        this.writeDeltaKeyValuePairs_([]);
      }
    });
  }

  /**
   * Marshals an PublishNamespaceError message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespaceError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_ERROR, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals an PublishNamespaceDone message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceDone} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespaceDone(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_DONE, () => {
      this.writeTuple_(msg.namespace);
    });
  }

  /**
   * Marshals an PublishNamespaceCancel message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceCancel} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespaceCancel(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_CANCEL, () => {
      this.writeTuple_(msg.namespace);
      this.writer_.writeVarInt62(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals an SubscribeNamespace message to the buffer
   * @param {shaka.msf.Utils.SubscribeNamespace} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_NAMESPACE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals an SubscribeNamespaceOk message to the buffer
   * @param {shaka.msf.Utils.SubscribeNamespaceOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeNamespaceOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_NAMESPACE_OK, () => {
      this.writer_.writeVarInt62(msg.requestId);
    });
  }

  /**
   * Marshals an SubscribeNamespaceError message to the buffer
   * @param {shaka.msf.Utils.SubscribeNamespaceError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeNamespaceError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_NAMESPACE_ERROR, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writer_.writeVarInt62(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals an UnsubscribeNamespace message to the buffer
   * @param {shaka.msf.Utils.UnsubscribeNamespace} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalUnsubscribeNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.UNSUBSCRIBE_NAMESPACE, () => {
      this.writeTuple_(msg.namespace);
    });
  }

  /**
   * Marshals a Client setup message to the buffer
   * @param {shaka.msf.Utils.ClientSetup} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalClientSetup(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.CLIENT_SETUP, () => {
      if (!shaka.msf.Utils.isDraft16(this.version_)) {
        // Draft-14: include version list for in-band negotiation
        this.writeArray_(msg.versions || [],
            (version) => this.writer_.writeVarInt53(version));
      }
      this.writeParams_(msg.params);
    });
  }

  /**
   * Marshals a Server setup message to the buffer
   * @param {shaka.msf.Utils.ServerSetup} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalServerSetup(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SERVER_SETUP, () => {
      if (!shaka.msf.Utils.isDraft16(this.version_)) {
        // Draft-14: include selected version
        this.writer_.writeVarInt53(msg.version);
      }
      // Draft-16 omits selected version (negotiated via protocol)
      this.writeParams_(msg.params);
    });
  }
};
