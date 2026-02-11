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
 * following the draft-14 specification.
 *
 * The typical pattern is to instantiate the class and call one of the
 * marshal methods to write a message to the buffer. The format is always:
 * wire format type, 16-bit length, message fields, etc.
 */
shaka.msf.BufferControlWriter = class {
  /**
   * Creates a new BufferControlWriter with an initial buffer size
   * @param {number=} initialSize
   */
  constructor(initialSize = 1024) {
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
    if (pair.type % 2 === 0) {
      // Even keys have bigint values
      if (typeof pair.value !== 'number') {
        throw new Error(
            'Invalid value type for even key ' + pair.type +
            ': expected number, got ' + typeof pair.value,
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
   * Marshals a Subscribe message to the buffer
   * @param {shaka.msf.Utils.Subscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribe(msg) {
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

      this.writeKeyValuePairs_(msg.params);
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
      this.writeString_(msg.reason);
      this.writer_.writeVarInt62(msg.trackAlias);
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
   * Marshals an PublishNamespace message to the buffer
   * @param {shaka.msf.Utils.PublishNamespace} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE, () => {
      this.writer_.writeVarInt62(msg.requestId);
      this.writeTuple_(msg.namespace);
      this.writeKeyValuePairs_(msg.params);
    });
  }

  /**
   * Marshals an PublishNamespaceOk message to the buffer
   * @param {shaka.msf.Utils.PublishNamespaceOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalPublishNamespaceOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.PUBLISH_NAMESPACE_OK, () => {
      this.writer_.writeVarInt62(msg.requestId);
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
   * Marshals an UnpublishNamespace message to the buffer
   * @param {shaka.msf.Utils.UnpublishNamespace} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalUnpublishNamespace(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    return this.marshal_(MessageTypeId.UNPUBLISH_NAMESPACE, () => {
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
      this.writeArray_(msg.versions || [],
          (version) => this.writer_.writeVarInt53(version));
      this.writeKeyValuePairs_(msg.params);
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
      this.writer_.writeVarInt53(msg.version);
      this.writeKeyValuePairs_(msg.params);
    });
  }
};
