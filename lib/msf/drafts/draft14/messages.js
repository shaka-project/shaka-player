/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft14.ClientSetup');
goog.provide('shaka.msf.draft14.MessageWriter');
goog.provide('shaka.msf.draft14.ServerSetup');

goog.require('shaka.msf.Utils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.StringUtils');


/**
 * Serializes draft-14 control messages.
 *
 * Deliberately a self-contained copy rather than something shared with
 * draft-16. Draft-14 is deprecated and scheduled for removal, and keeping its
 * wire format in its own directory means that removal is deleting a directory
 * rather than unpicking conditionals from code draft-16 still depends on --
 * which is exactly the situation this layering was introduced to escape.
 *
 * Every message is a type byte, a 16-bit length, then the payload.
 */
shaka.msf.draft14.MessageWriter = class {
  /**
   * @param {!shaka.extern.MsfCodec} codec
   * @param {number=} initialSize
   */
  constructor(codec, initialSize = 1024) {
    /** @private {!shaka.extern.MsfCodec} */
    this.codec_ = codec;

    /** @private {!shaka.util.DataViewWriter} */
    this.writer_ = new shaka.util.DataViewWriter(
        initialSize, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
  }

  /**
   * @param {bigint|number} value
   * @private
   */
  writeVarInt_(value) {
    this.codec_.encodeVarInt(
        this.writer_, typeof value == 'bigint' ? value : BigInt(value));
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
    this.writeVarInt_(array.length);
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
    const bytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(str));
    this.writeVarInt_(bytes.length);
    this.writer_.writeBytes(bytes);
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
    this.writeVarInt_(location.group);
    this.writeVarInt_(location.object);
  }

  /**
   * Writes a single key-value pair to the buffer
   * @param {shaka.msf.Utils.KeyValuePair} pair
   * @private
   */
  writeKeyValuePair_(pair) {
    this.writeVarInt_(pair.type);

    // Handle the value based on whether the key is odd or even
    if (pair.type % BigInt(2) === BigInt(0)) {
      // Even keys have bigint values
      if (typeof pair.value !== 'bigint') {
        throw new Error(
            'Invalid value type for even key ' + pair.type +
            ': expected bigint, got ' + typeof pair.value,
        );
      }
      this.writeVarInt_(pair.value);
    } else {
      // Odd keys have Uint8Array values
      if (!ArrayBuffer.isView(pair.value)) {
        throw new Error(
            'Invalid value type for odd key ' + pair.type +
          ': expected Uint8Array or ArrayBuffer view, got ' + typeof pair.value,
        );
      }
      const bytes = /** @type {!Uint8Array} */ (pair.value);
      this.writeVarInt_(bytes.byteLength);
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
    this.writeVarInt_(numPairs);

    if (!pairs || !pairs.length) {
      return;
    }

    for (const pair of pairs) {
      this.writeKeyValuePair_(pair);
    }
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
   * @return {!shaka.msf.draft14.MessageWriter}
   * @private
   */
  marshal_(type, fn) {
    this.marshalWithLength(type, fn);
    return this;
  }

  /**
   * Marshals a Goaway message to the buffer
   * @param {shaka.msf.Utils.Goaway} msg
   * @return {!shaka.msf.draft14.MessageWriter}
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
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalMaxRequestId(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.MAX_REQUEST_ID, () => {
      this.writeVarInt_(msg.requestId);
    });
  }

  /**
   * Marshals a RequestsBlocked message to the buffer
   * @param {shaka.msf.Utils.RequestsBlocked} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalRequestsBlocked(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.REQUESTS_BLOCKED, () => {
      this.writeVarInt_(msg.maximumRequestId);
    });
  }

  /**
   * Marshals a Subscribe message to the buffer
   * @param {shaka.msf.Utils.Subscribe} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribe(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE, () => {
      this.writeVarInt_(msg.requestId);
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
        this.writeVarInt_(msg.endGroup);
      }

      this.writeKeyValuePairs_(msg.params);
    });
  }


  /**
   * Marshals a SubscribeOk message to the buffer
   * @param {shaka.msf.Utils.SubscribeOk} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribeOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_OK, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.expires);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeBoolAsUint8_(msg.contentExists);

      if (msg.contentExists) {
        if (!msg.largest) {
          throw new Error('Missing largest for contentExists');
        }
        this.writeLocation_(msg.largest);
      }

      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a SubscribeError message to the buffer
   * @param {shaka.msf.Utils.SubscribeError} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribeError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_ERROR, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals a SubscribeUpdate / REQUEST_UPDATE message to the buffer
   * @param {shaka.msf.Utils.SubscribeUpdate} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribeUpdate(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_UPDATE, () => {
      this.writeVarInt_(msg.requestId);
      this.writeLocation_(msg.startLocation);
      this.writeVarInt_(msg.endGroup);
      this.writer_.writeUint8(msg.subscriberPriority);
      this.writeBoolAsUint8_(msg.forward);
      this.writeKeyValuePairs_(msg.params);
    });
  }


  /**
   * Marshals an Unsubscribe message to the buffer
   * @param {shaka.msf.Utils.Unsubscribe} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalUnsubscribe(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.UNSUBSCRIBE, () => {
      this.writeVarInt_(msg.requestId);
    });
  }

  /**
   * Marshals a PublishDone message to the buffer
   * @param {shaka.msf.Utils.PublishDone} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishDone(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_DONE, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
      this.writeVarInt_(msg.streamCount);
    });
  }

  /**
   * Marshals a Publish message to the buffer
   * @param {shaka.msf.Utils.Publish} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublish(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH, () => {
      this.writeVarInt_(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeString_(msg.name);
      this.writeVarInt_(msg.trackAlias);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeBoolAsUint8_(msg.contentExists);

      if (msg.contentExists) {
        if (!msg.largestLocation) {
          throw new Error('Missing largestLocation for contentExists');
        }
        this.writeLocation_(msg.largestLocation);
      }

      this.writeBoolAsUint8_(msg.forward);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a PublishOk message to the buffer
   * @param {shaka.msf.Utils.PublishOk} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_OK, () => {
      this.writeVarInt_(msg.requestId);
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
        this.writeVarInt_(msg.endGroup);
      }

      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a PublishError message to the buffer
   * @param {shaka.msf.Utils.PublishError} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_ERROR, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals a Fetch message to the buffer (standalone fetch type)
   * @param {shaka.msf.Utils.Fetch} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalFetch(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH, () => {
      this.writeVarInt_(msg.requestId);
      this.writer_.writeUint8(msg.subscriberPriority);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeVarInt_(BigInt(msg.fetchType));
      // Standalone fetch includes namespace, trackName, start/end
      this.writeTuple_(msg.namespace);
      this.writeString_(msg.trackName);
      this.writeVarInt_(msg.startGroup);
      this.writeVarInt_(msg.startObject);
      this.writeVarInt_(msg.endGroup);
      this.writeVarInt_(msg.endObject);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a Fetch message to the buffer (standalone fetch type)
   * @param {shaka.msf.Utils.FetchOk} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalFetchOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH, () => {
      this.writeVarInt_(msg.requestId);
      this.writer_.writeUint8(msg.groupOrder);
      this.writeVarInt_(BigInt(msg.endOfTrack));
      this.writeVarInt_(msg.endGroup);
      this.writeVarInt_(msg.endObject);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a FetchError message to the buffer
   * @param {shaka.msf.Utils.FetchError} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalFetchError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH_ERROR, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals a FetchCancel message to the buffer
   * @param {shaka.msf.Utils.FetchCancel} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalFetchCancel(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.FETCH_CANCEL, () => {
      this.writeVarInt_(msg.requestId);
    });
  }

  /**
   * Marshals an PublishNamespace message to the buffer
   * @param {shaka.msf.Utils.PublishNamespace} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE, () => {
      this.writeVarInt_(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals an PublishNamespaceOk / REQUEST_OK message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceOk} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishNamespaceOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_OK, () => {
      this.writeVarInt_(msg.requestId);
    });
  }

  /**
   * Marshals an PublishNamespaceError message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceError} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishNamespaceError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_ERROR, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals an PublishNamespaceDone message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceDone} msg
   * @return {!shaka.msf.draft14.MessageWriter}
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
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalPublishNamespaceCancel(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_CANCEL, () => {
      this.writeTuple_(msg.namespace);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals an SubscribeNamespace message to the buffer
   * @param {shaka.msf.Utils.SubscribeNamespace} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribeNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_NAMESPACE, () => {
      this.writeVarInt_(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals an SubscribeNamespaceOk message to the buffer
   * @param {shaka.msf.Utils.SubscribeNamespaceOk} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribeNamespaceOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_NAMESPACE_OK, () => {
      this.writeVarInt_(msg.requestId);
    });
  }

  /**
   * Marshals an SubscribeNamespaceError message to the buffer
   * @param {shaka.msf.Utils.SubscribeNamespaceError} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalSubscribeNamespaceError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SUBSCRIBE_NAMESPACE_ERROR, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(msg.code);
      this.writeString_(msg.reason);
    });
  }

  /**
   * Marshals an UnsubscribeNamespace message to the buffer
   * @param {shaka.msf.Utils.UnsubscribeNamespace} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalUnsubscribeNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.UNSUBSCRIBE_NAMESPACE, () => {
      this.writeTuple_(msg.namespace);
    });
  }

  /**
   * Marshals a Client setup message to the buffer
   * @param {shaka.msf.draft14.ClientSetup} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalClientSetup(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.CLIENT_SETUP, () => {
      // Draft-14 negotiates the version in band.
      this.writeArray_(msg.versions || [],
          (version) => this.writeVarInt_(version));
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals a Server setup message to the buffer
   * @param {shaka.msf.draft14.ServerSetup} msg
   * @return {!shaka.msf.draft14.MessageWriter}
   */
  marshalServerSetup(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.SERVER_SETUP, () => {
      this.writeVarInt_(msg.version);
      this.writeKeyValuePairs_(msg.params);
    });
  }
};


/**
 * Draft-14 negotiates the version in band, so CLIENT_SETUP carries the list of
 * versions the client supports. Draft-16 removed this in favour of the
 * WebTransport subprotocol.
 *
 * @typedef {{
 *   versions: Array<number>,
 *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
 * }}
 */
shaka.msf.draft14.ClientSetup;


/**
 * @typedef {{
 *   version: number,
 *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
 * }}
 */
shaka.msf.draft14.ServerSetup;
