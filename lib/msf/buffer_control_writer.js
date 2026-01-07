/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.BufferControlWriter');

goog.require('shaka.msf.Utils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');


/**
 * BufferControlWriter class for writing control messages to a buffer
 * following the draft-11 specification.
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
    /** @private {!Uint8Array} */
    this.buffer_ = new Uint8Array(initialSize);

    /** @private {number} */
    this.position_ = 0;
  }

  /**
   * Ensures the buffer has enough space for the specified number of bytes
   * @param {number} bytesNeeded
   * @private
   */
  ensureSpace_(bytesNeeded) {
    const requiredSize = this.position_ + bytesNeeded;
    if (requiredSize <= this.buffer_.length) {
      return;
    }

    // Double the buffer size or increase to required size, whichever is larger
    const newSize = Math.max(this.buffer_.length * 2, requiredSize);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(this.buffer_.subarray(0, this.position_));
    this.buffer_ = newBuffer;
  }

  /**
   * Gets the current buffer with only the written data
   * @return {!Uint8Array}
   */
  getBytes() {
    return this.buffer_.slice(0, this.position_);
  }

  /**
   * Resets the buffer to start writing from the beginning
   */
  reset() {
    this.position_ = 0;
  }

  /**
   * Writes a uint8 value to the buffer
   * @param {number} value
   * @private
   */
  writeUint8_(value) {
    this.ensureSpace_(1);
    this.buffer_[this.position_++] = value & 0xff;
  }

  /**
   * Writes a boolean value as a uint8 to the buffer
   * @param {boolean} value
   * @private
   */
  writeBoolAsUint8_(value) {
    this.ensureSpace_(1);
    this.buffer_[this.position_++] = value ? 1 : 0;
  }

  /**
   * Writes a uint16 value to the buffer in big-endian format
   * @param {number} value
   * @private
   */
  writeUint16_(value) {
    this.ensureSpace_(2);
    this.buffer_[this.position_++] = (value >> 8) & 0xff; // MSB
    this.buffer_[this.position_++] = value & 0xff; // LSB
  }

  /**
   * Writes a variable-length integer (up to 53 bits)
   * @param {number} value
   * @private
   */
  writeVarInt53_(value) {
    if (value < 0) {
      throw new Error(`Underflow, value is negative: ${value}`);
    }

    const MAX_U6 = Math.pow(2, 6) - 1;
    const MAX_U14 = Math.pow(2, 14) - 1;
    const MAX_U30 = Math.pow(2, 30) - 1;
    const MAX_U53 = Number.MAX_SAFE_INTEGER;

    if (value <= MAX_U6) {
      // 1-byte encoding (0xxxxxxx)
      this.ensureSpace_(1);
      this.buffer_[this.position_++] = value;
    } else if (value <= MAX_U14) {
      // 2-byte encoding (10xxxxxx xxxxxxxx)
      this.ensureSpace_(2);
      this.buffer_[this.position_++] = ((value >> 8) & 0x3f) | 0x40;
      this.buffer_[this.position_++] = value & 0xff;
    } else if (value <= MAX_U30) {
      // 4-byte encoding (110xxxxx xxxxxxxx xxxxxxxx xxxxxxxx)
      this.ensureSpace_(4);
      this.buffer_[this.position_++] = ((value >> 24) & 0x1f) | 0x80;
      this.buffer_[this.position_++] = (value >> 16) & 0xff;
      this.buffer_[this.position_++] = (value >> 8) & 0xff;
      this.buffer_[this.position_++] = value & 0xff;
    } else if (value <= MAX_U53) {
      // 8-byte encoding (1110xxxx xxxxxxxx xxxxxxxx xxxxxxxx
      //                  xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx)
      this.ensureSpace_(8);
      const high = Math.floor(value / 0x100000000);
      const low = value % 0x100000000;

      this.buffer_[this.position_++] = ((high >> 24) & 0x0f) | 0xc0;
      this.buffer_[this.position_++] = (high >> 16) & 0xff;
      this.buffer_[this.position_++] = (high >> 8) & 0xff;
      this.buffer_[this.position_++] = high & 0xff;

      this.buffer_[this.position_++] = (low >> 24) & 0xff;
      this.buffer_[this.position_++] = (low >> 16) & 0xff;
      this.buffer_[this.position_++] = (low >> 8) & 0xff;
      this.buffer_[this.position_++] = low & 0xff;
    } else {
      throw new Error(`Overflow, value larger than 53-bits: ${value}`);
    }
  }

  /**
   * Writes a variable-length integer (up to 62 bits).
   * @param {!number} value
   * @private
   */
  writeVarInt62_(value) {
    if (value < 0) {
      throw new Error(`Underflow, value is negative: ${value}`);
    }
    if (value <= Number.MAX_SAFE_INTEGER) {
      this.writeVarInt53_(value);
      return;
    }
    const valueBig = BigInt(value);

    this.ensureSpace_(8);
    const maskFF = BigInt(0xff);
    const maskPrefix = BigInt(0x0f);
    const prefixC0 = BigInt(0xc0);

    this.buffer_[this.position_++] =
        Number(((valueBig >> BigInt(56)) & maskPrefix) | prefixC0);
    this.buffer_[this.position_++] = Number((valueBig >> BigInt(48)) & maskFF);
    this.buffer_[this.position_++] = Number((valueBig >> BigInt(40)) & maskFF);
    this.buffer_[this.position_++] = Number((valueBig >> BigInt(32)) & maskFF);
    this.buffer_[this.position_++] = Number((valueBig >> BigInt(24)) & maskFF);
    this.buffer_[this.position_++] = Number((valueBig >> BigInt(16)) & maskFF);
    this.buffer_[this.position_++] = Number((valueBig >> BigInt(8)) & maskFF);
    this.buffer_[this.position_++] = Number(valueBig & maskFF);
  }

  /**
   * Writes a string to the buffer
   * @param {string} str
   * @private
   */
  writeString_(str) {
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;
    const bytes = BufferUtils.toUint8(StringUtils.toUTF8(str));

    // Write the length as a var int
    this.writeVarInt53_(bytes.length);

    // Write the string bytes
    this.ensureSpace_(bytes.length);
    this.buffer_.set(bytes, this.position_);
    this.position_ += bytes.length;
  }

  /**
   * Writes a tuple (array of strings) to the buffer
   * @param {Array<string>} tuple
   * @private
   */
  writeTuple_(tuple) {
    // Write the count of tuple elements
    this.writeVarInt53_(tuple.length);

    // Write each tuple element
    for (const element of tuple) {
      this.writeString_(element);
    }
  }

  /**
   * Writes a location to the buffer
   * @param {shaka.msf.Utils.Location} location
   * @private
   */
  writeLocation_(location) {
    this.writeVarInt62_(location.group);
    this.writeVarInt62_(location.object);
  }

  /**
   * Writes an array of key-value pairs to the buffer
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)} pairs
   * @private
   */
  writeKeyValuePairs_(pairs) {
    // Write the number of pairs
    const numPairs = pairs ? pairs.length : 0;
    this.writeVarInt53_(numPairs);

    if (!pairs?.length) {
      return;
    }

    for (const pair of pairs) {
      // Write the key type
      this.writeVarInt62_(pair.type);

      // Handle the value based on whether the key is odd or even
      if (pair.type % 2 === 0) {
        // Even keys have bigint values
        if (typeof pair.value !== 'number') {
          throw new Error(
              `Invalid value type for even key ${pair.type}: expected number,
              got ${typeof pair.value}`);
        }
        this.writeVarInt62_(pair.value);
      } else {
        // Odd keys have Uint8Array values
        // eslint-disable-next-line shaka-rules/buffersource-no-instanceof
        if (!(pair.value instanceof Uint8Array)) {
          throw new Error(
              `Invalid value type for odd key ${pair.type}: expected Uint8Array,
            got ${typeof pair.value}`);
        }
        this.writeVarInt53_(pair.value.byteLength);
        this.ensureSpace_(pair.value.byteLength);
        this.buffer_.set(pair.value, this.position_);
        this.position_ += pair.value.byteLength;
      }
    }
  }

  /**
   * Helper method to marshal a message with proper type and length
   * @param {shaka.msf.Utils.MessageTypeId} messageType
   * @param {function()} writeContent
   */
  marshalWithLength(messageType, writeContent) {
    // Write the message type
    this.writeUint8_(messageType);

    // Reserve space for the 16-bit length field
    const lengthPosition = this.position_;
    this.position_ += 2; // Skip 2 bytes for length

    // Write the message content
    const contentStart = this.position_;
    writeContent();
    const contentLength = this.position_ - contentStart;

    // Go back and write the length
    const currentPosition = this.position_;
    this.position_ = lengthPosition;
    this.writeUint16_(contentLength);

    // Restore position
    this.position_ = currentPosition;
  }

  /**
   * Marshals a Subscribe message to the buffer
   * @param {shaka.msf.Utils.Subscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribe(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.SUBSCRIBE, () => {
      // Write the subscription ID
      this.writeVarInt62_(msg.requestId);

      // Write the track alias
      this.writeVarInt62_(msg.trackAlias);

      // Write the namespace
      this.writeTuple_(msg.namespace);

      // Write the track name
      this.writeString_(msg.name);

      // Write the subscriber priority
      this.writeUint8_(msg.subscriberPriority);

      // Write the group order
      this.writeUint8_(msg.groupOrder);

      // Write the forward flag
      this.writeBoolAsUint8_(msg.forward);

      // Write the filter type
      this.writeUint8_(msg.filterType);

      if (msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_START ||
          msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
        // Write the location
        if (!msg.startLocation) {
          throw new Error('Missing startLocation for absolute filter');
        }
        this.writeLocation_(msg.startLocation);
      }

      if (msg.filterType === shaka.msf.Utils.FilterType.ABSOLUTE_RANGE) {
        // Write the end group
        if (!msg.endGroup) {
          throw new Error('Missing endGroup for absolute range filter');
        }
        this.writeVarInt62_(msg.endGroup);
      }
      // Write parameters (if any)
      this.writeKeyValuePairs_(msg.params);
    });

    return this;
  }

  /**
   * Marshals a SubscribeOk message to the buffer
   * @param {shaka.msf.Utils.SubscribeOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.SUBSCRIBE_OK, () => {
      // Write the request ID
      this.writeVarInt62_(msg.requestId);

      // Write the expires time
      this.writeVarInt62_(msg.expires);

      // Write the group order
      this.writeUint8_(msg.groupOrder);

      // Write the content exists flag
      this.writeBoolAsUint8_(msg.contentExists);

      // Write the latest group/object info (if any)
      if (msg.contentExists) {
        if (!msg.largest) {
          throw new Error('Missing largest for contentExists');
        }
        this.writeLocation_(msg.largest);
      }
      // Write parameters (if any)
      this.writeKeyValuePairs_(msg.params);
    });

    return this;
  }

  /**
   * Marshals a SubscribeError message to the buffer
   * @param {shaka.msf.Utils.SubscribeError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.SUBSCRIBE_ERROR, () => {
      // Write the request ID
      this.writeVarInt62_(msg.requestId);

      // Write the error code
      this.writeVarInt62_(msg.code);

      // Write the error reason
      this.writeString_(msg.reason);

      // Write the track alias
      this.writeVarInt62_(msg.trackAlias);
    });

    return this;
  }

  /**
   * Marshals a SubscribeDone message to the buffer
   * @param {shaka.msf.Utils.SubscribeDone} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalSubscribeDone(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.SUBSCRIBE_DONE, () => {
      // Write the request ID
      this.writeVarInt62_(msg.requestId);

      // Write the code
      this.writeVarInt62_(msg.code);

      // Write the reason
      this.writeString_(msg.reason);

      // Write the stream count
      this.writeVarInt53_(msg.streamCount);
    });

    return this;
  }

  /**
   * Marshals an Announce message to the buffer
   * @param {shaka.msf.Utils.Announce} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalAnnounce(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.ANNOUNCE, () => {
      // Write the request ID
      this.writeVarInt62_(msg.requestId);

      // Write the namespace
      this.writeTuple_(msg.namespace);

      // Convert Parameters map to KeyValuePair array and write them
      this.writeKeyValuePairs_(msg.params);
    });

    return this;
  }

  /**
   * Marshals an AnnounceOk message to the buffer
   * @param {shaka.msf.Utils.AnnounceOk} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalAnnounceOk(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.ANNOUNCE_OK, () => {
      // Write the request ID
      this.writeVarInt62_(msg.requestId);
    });

    return this;
  }

  /**
   * Marshals an Unsubscribe message to the buffer
   * @param {shaka.msf.Utils.Unsubscribe} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalUnsubscribe(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.UNSUBSCRIBE, () => {
      this.writeVarInt62_(msg.requestId);
    });

    return this;
  }

  /**
   * Marshals an AnnounceError message to the buffer
   * @param {shaka.msf.Utils.AnnounceError} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalAnnounceError(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.ANNOUNCE_ERROR, () => {
      // Write the request ID
      this.writeVarInt62_(msg.requestId);

      // Write the error code
      this.writeVarInt62_(msg.code);

      // Write the error reason
      this.writeString_(msg.reason);
    });

    return this;
  }

  /**
   * Marshals an Unannounce message to the buffer
   * @param {shaka.msf.Utils.Unannounce} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalUnannounce(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.UNANNOUNCE, () => {
      // Write the namespace
      this.writeTuple_(msg.namespace);
    });

    return this;
  }

  /**
   * Marshals a Client setup message to the buffer
   * @param {shaka.msf.Utils.ClientSetup} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalClientSetup(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.CLIENT_SETUP, () => {
      // Write version count
      this.writeVarInt53_(msg.versions.length);

      // Write each version
      for (const version of msg.versions) {
        this.writeVarInt53_(version);
      }

      // Write parameters (if any)
      this.writeKeyValuePairs_(msg.params);
    });

    return this;
  }

  /**
   * Marshals a Server setup message to the buffer
   * @param {shaka.msf.Utils.ServerSetup} msg
   * @return {!shaka.msf.BufferControlWriter}
   */
  marshalServerSetup(msg) {
    const MessageTypeId = shaka.msf.Utils.MessageTypeId;
    this.marshalWithLength(MessageTypeId.SERVER_SETUP, () => {
      // Write the selected version
      this.writeVarInt53_(msg.version);

      // Write parameters (if any)
      this.writeKeyValuePairs_(msg.params);
    });

    return this;
  }
};
