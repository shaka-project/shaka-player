/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.ControlStream');
goog.provide('shaka.msf.Reader');
goog.provide('shaka.msf.Receiver');
goog.provide('shaka.msf.Sender');
goog.provide('shaka.msf.TracksManager');
goog.provide('shaka.msf.Writer');

goog.require('shaka.log');
goog.require('shaka.msf.BufferControlWriter');
goog.require('shaka.msf.Utils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Mutex');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');

goog.requireType('shaka.msf.MSFTransport');

/**
 * Reader wraps a stream and provides convenience methods for reading
 * pieces from a stream.
 */
shaka.msf.Reader = class {
  /**
   * @param {!Uint8Array} buffer
   * @param {!ReadableStream<!Uint8Array>} stream
   */
  constructor(buffer, stream) {
    /** @private {!Uint8Array} */
    this.buffer_ = buffer;
    /** @private {!ReadableStream<!Uint8Array>} */
    this.stream_ = stream;
    /** @private {!ReadableStreamDefaultReader<!Uint8Array>} */
    this.reader_ = /** @type {!ReadableStreamDefaultReader<!Uint8Array>} */ (
      stream.getReader());
  }

  /**
   * @return {number}
   */
  getByteLength() {
    return this.buffer_.byteLength;
  }

  /**
   * @return {!Uint8Array}
   */
  getBuffer() {
    return shaka.util.BufferUtils.toUint8(this.buffer_);
  }

  /**
   * Adds more data to the buffer, returning true if more data was added.
   *
   * @return {!Promise<boolean>}
   * @private
   */
  async fill_() {
    const result = await this.reader_.read();
    if (result.done) {
      return false;
    }

    const buffer = shaka.util.BufferUtils.toUint8(result.value);

    if (this.buffer_.byteLength === 0) {
      this.buffer_ = buffer;
    } else {
      const temp = new Uint8Array(this.buffer_.byteLength + buffer.byteLength);
      temp.set(this.buffer_);
      temp.set(buffer, this.buffer_.byteLength);
      this.buffer_ = temp;
    }

    return true;
  }

  /**
   * Add more data to the buffer until it's at least size bytes.
   *
   * @param {number} size
   * @return {!Promise}
   * @private
   */
  async fillTo_(size) {
    while (this.buffer_.byteLength < size) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.fill_())) {
        throw new Error('unexpected end of stream');
      }
    }
  }

  /**
   * Consumes the first size bytes of the buffer.
   *
   * @param {number} size
   * @return {!Uint8Array}
   * @private
   */
  slice_(size) {
    const result = shaka.util.BufferUtils.toUint8(this.buffer_, 0, size);
    this.buffer_ = shaka.util.BufferUtils.toUint8(this.buffer_, size);
    return result;
  }

  /**
   * @param {number} size
   * @return {!Promise<!Uint8Array>}
   */
  async read(size) {
    if (size === 0) {
      return new Uint8Array([]);
    }
    await this.fillTo_(size);
    return this.slice_(size);
  }

  /**
   * @return {!Promise<!Uint8Array>}
   */
  async readAll() {
    // eslint-disable-next-line no-empty,no-await-in-loop
    while (await this.fill_()) {}
    return this.slice_(this.buffer_.byteLength);
  }

  /**
   * @return {!Promise<!Array<string>>}
   */
  async tuple() {
    // Get the count of tuple elements
    const count = await this.u53();

    // Read each tuple element individually
    const tupleElements = [];
    for (let i = 0; i < count; i++) {
      // Each element is a var int length followed by that many bytes
      // eslint-disable-next-line no-await-in-loop
      const length = await this.u53();
      // eslint-disable-next-line no-await-in-loop
      const bytes = await this.read(length);
      const element = shaka.util.StringUtils.fromUTF8(bytes);
      tupleElements.push(element);
    }

    return tupleElements;
  }

  /**
   * @param {(number|undefined)=} maxLength
   * @return {!Promise<string>}
   */
  async string(maxLength) {
    const length = await this.u53();
    if (maxLength !== undefined && length > maxLength) {
      throw new Error(
          `string length ${length} exceeds max length ${maxLength}`);
    }

    const buffer = await this.read(length);
    return shaka.util.StringUtils.fromUTF8(buffer);
  }

  /**
   * @return {!Promise<number>}
   */
  async u8() {
    await this.fillTo_(1);
    return this.slice_(1)[0];
  }

  /**
   * @return {!Promise<boolean>}
   */
  async u8Bool() {
    return (await this.u8()) !== 0;
  }

  /**
   * Returns a Number using 53-bits, the max Javascript can use for integer math
   * @return {!Promise<number>}
   */
  async u53() {
    const result = await this.u53WithSize();
    return result.value;
  }

  /**
   * Returns a Number using 53-bits and tracks the number of bytes read
   * @return {!Promise<{value: number, bytesRead: number}>}
   */
  async u53WithSize() {
    const result = await this.u62WithSize();
    const v = result.value;
    if (v > Number.MAX_SAFE_INTEGER) {
      throw new Error('value larger than 53-bits; use v62 instead');
    }

    return {value: Number(v), bytesRead: result.bytesRead};
  }

  /**
   * If the number is greater than 53 bits, it throws an error.
   *
   * @return {!Promise<number>}
   */
  async u62() {
    const result = await this.u62WithSize();
    return result.value;
  }

  /**
   * Returns a number and tracks the number of bytes read
   * If the number is greater than 53 bits, it throws an error.
   *
   * @return {!Promise<{value: number, bytesRead: number}>}
   */
  async u62WithSize() {
    await this.fillTo_(1);
    const size = (this.buffer_[0] & 0xc0) >> 6;

    let value;
    let bytesRead;

    if (size === 0) {
      bytesRead = 1;
      const first = this.slice_(1)[0];
      value = first & 0x3f; // 6 bits
    } else if (size === 1) {
      bytesRead = 2;
      await this.fillTo_(2);
      const slice = this.slice_(2);
      const view = shaka.util.BufferUtils.toDataView(slice);
      value = view.getInt16(0) & 0x3fff; // 14 bits
    } else if (size === 2) {
      bytesRead = 4;
      await this.fillTo_(4);
      const slice = this.slice_(4);
      const view = shaka.util.BufferUtils.toDataView(slice);
      value = view.getUint32(0) & 0x3fffffff; // 30 bits
    } else if (size === 3) {
      bytesRead = 8;
      await this.fillTo_(8);
      const slice = this.slice_(8);
      const view = shaka.util.BufferUtils.toDataView(slice);
      value = BigInt(view.getBigUint64(0)) & BigInt('0x3fffffffffffffff');
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Number bigger than 53-bits');
      }
      value = Number(value);
    } else {
      throw new Error(`invalid size: ${size}`);
    }
    return {value, bytesRead};
  }

  /**
   * @return {!Promise<!Array<shaka.msf.Utils.KeyValuePair>>}
   */
  async keyValuePairs() {
    const numPairs = await this.u53();
    const result = [];
    for (let i = 0; i < numPairs; i++) {
      // eslint-disable-next-line no-await-in-loop
      const key = await this.u62();
      if (key % 2 === 0) {
        // eslint-disable-next-line no-await-in-loop
        const value = await this.u62();
        result.push({type: key, value});
      } else {
        // eslint-disable-next-line no-await-in-loop
        const length = await this.u53();
        // eslint-disable-next-line no-await-in-loop
        const value = await this.read(length);
        result.push({type: key, value});
      }
    }
    return result;
  }

  /**
   * @return {!Promise<boolean>}
   */
  async done() {
    if (this.buffer_.byteLength > 0) {
      return false;
    }
    return !(await this.fill_());
  }

  /**
   * @return {!Promise}
   */
  async close() {
    this.reader_.releaseLock();
    await this.stream_.cancel('Reader closed');
  }

  /**
   *
   */
  release() {
    this.reader_.releaseLock();
  }
};

/**
 * Writer wraps a stream and writes chunks of data.
 */
shaka.msf.Writer = class {
  /**
   * @param {!WritableStream} stream
   */
  constructor(stream) {
    /** @private {!WritableStream} */
    this.stream_ = stream;
    /** @private {!WritableStreamDefaultWriter} */
    this.writer_ = stream.getWriter();
  }

  /**
   * @param {!Uint8Array} value
   * @return {!Promise}
   */
  async write(value) {
    await this.writer_.write(value);
  }
};

shaka.msf.Receiver = class {
  /**
   * @param {!shaka.msf.Reader} reader
   */
  constructor(reader) {
    /** @private {!shaka.msf.Reader} */
    this.reader_ = reader;
  }

  /**
   * @return {!Promise<shaka.msf.Utils.ServerSetup>}
   */
  async server() {
    const SetupType = shaka.msf.Utils.SetupType;
    shaka.log.debug('Decoding server setup message...');

    const type = await this.reader_.u53();
    shaka.log.debug(`Setup message type: 0x${type.toString(16)}
        (expected 0x${SetupType.SERVER.toString(16)})`);

    if (type !== SetupType.SERVER) {
      const errorMsg =
          `Server SETUP type must be ${SetupType.SERVER}, got ${type}`;
      shaka.log.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Read the 16-bit MSB length field
    const lengthBytes = await this.reader_.read(2);
    const messageLength = (lengthBytes[0] << 8) | lengthBytes[1]; // MSB format
    shaka.log.debug(`Message length (16-bit MSB): ${messageLength} bytes`);

    // Store the current position to validate length later
    const startPosition = this.reader_.getByteLength();

    const version = await this.reader_.u53();
    shaka.log.debug(`Server selected version: 0x${version.toString(16)}`);

    const params = await this.parameters();
    shaka.log.v1(
        `Parameters: ${params ? `${params.length} parameters` : 'none'}`);

    // Log each parameter in detail
    if (params && params.length > 0) {
      for (const param of params) {
        if (typeof param.value === 'number') {
          shaka.log.v1(
              `Parameter ID: ${param.type}, value: ${param.value} (number)`);
        } else {
          shaka.log.v1(`Parameter ID: ${param.type}, length:
              ${param.value.byteLength} bytes, value:
              ${this.formatBytes_(param.value)}`);
        }
      }
    }

    // Validate that we read the expected number of bytes
    const endPosition = this.reader_.getByteLength();
    const bytesRead = startPosition - endPosition;

    if (bytesRead !== messageLength) {
      const warningMsg = `Message length mismatch: expected ${messageLength}
          bytes, read ${bytesRead} bytes`;
      shaka.log.warning(warningMsg);
      // Not throwing an error here as we've already read the data
    }

    const result = {
      version,
      params,
    };

    shaka.log.debug('Server setup message decoded:', result);
    return result;
  }

  /**
   * @param {!Uint8Array} bytes
   * @return {string}
   * @private
   */
  formatBytes_(bytes) {
    if (bytes.length <= 16) {
      return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
    } else {
      const start = Array.from(bytes.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
      const end = Array.from(bytes.slice(-8))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
      return `${start} ... ${end} (${bytes.length} bytes total)`;
    }
  }

  /**
   * @return {!Promise<(Array<shaka.msf.Utils.KeyValuePair> | undefined)>}
   */
  async parameters() {
    const countResult = await this.reader_.u53WithSize();
    const count = countResult.value;

    shaka.log.v1(`Parameter count: ${count}, count field:
        ${countResult.bytesRead} bytes`);

    if (count === 0) {
      return undefined;
    }

    const params = [];

    for (let i = 0; i < count; i++) {
      // Read parameter type (key)
      // eslint-disable-next-line no-await-in-loop
      const typeResult = await this.reader_.u62WithSize();
      const paramType = typeResult.value;

      // Check if the type is even or odd
      const isEven = paramType % 2 === 0;

      if (isEven) {
        // Even type: value is a single var int
        // eslint-disable-next-line no-await-in-loop
        const valueResult = await this.reader_.u62WithSize();
        const value = valueResult.value;
        shaka.log.v1(`Parameter ${i + 1}/${count}: Type ${paramType} (even),
            Value: ${value} (${valueResult.bytesRead} bytes)`);

        // Check for duplicates
        const existingIndex = params.findIndex((p) => p.type === paramType);
        if (existingIndex !== -1) {
          shaka.log.warning(`Duplicate parameter type: ${paramType},
              overwriting previous value`);
          params.splice(existingIndex, 1);
        }

        params.push({type: paramType, value});
      } else {
        // Odd type: value is a byte sequence with length
        // eslint-disable-next-line no-await-in-loop
        const lengthResult = await this.reader_.u53WithSize();
        const length = lengthResult.value;

        // Check maximum length (2^16-1)
        if (length > 65535) {
          const errorMsg =
              `Parameter value length exceeds maximum: ${length} > 65535`;
          shaka.log.error(errorMsg);
          throw new Error(errorMsg);
        }

        // Read the value bytes
        // eslint-disable-next-line no-await-in-loop
        const value = await this.reader_.read(length);
        // At this point, value should always be a Uint8Array
        shaka.log.v1(`Parameter ${i + 1}/${count}: Type ${paramType} (odd),
            Length: ${length}, Value: ${this.formatBytes_(value)}`);

        // Check for duplicates
        const existingIndex = params.findIndex((p) => p.type === paramType);
        if (existingIndex !== -1) {
          shaka.log.warning(`Duplicate parameter type: ${paramType},
              overwriting previous value`);
          params.splice(existingIndex, 1);
        }

        params.push({type: paramType, value});
      }
    }

    return params;
  }
};

shaka.msf.Sender = class {
  /**
   * @param {!shaka.msf.Writer} writer
   */
  constructor(writer) {
    /** @private {!shaka.msf.Writer} */
    this.writer_ = writer;
  }

  /**
   * @param {shaka.msf.Utils.ClientSetup} client
   * @return {!Promise}
   */
  async client(client) {
    shaka.log.debug('Encoding client setup message:', client);

    // Create a BufferControlWriter instance
    const writer = new shaka.msf.BufferControlWriter();

    // Marshal the client setup message
    writer.marshalClientSetup({
      versions: client.versions,
      params: client.params,
    });

    // Get the bytes from the writer
    const bytes = writer.getBytes();
    shaka.log.debug(`Client setup message created: ${bytes.length} bytes`);

    // Write the entire message in a single operation
    await this.writer_.write(bytes);

    shaka.log.debug('Client setup message sent successfully');
  }
};

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
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_DONE:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_DONE;
        break;
      case shaka.msf.Utils.MessageTypeId.SUBSCRIBE_ERROR:
        msgType = shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.UNSUBSCRIBE:
        msgType = shaka.msf.Utils.MessageType.UNSUBSCRIBE;
        break;
      case shaka.msf.Utils.MessageTypeId.ANNOUNCE:
        msgType = shaka.msf.Utils.MessageType.ANNOUNCE;
        break;
      case shaka.msf.Utils.MessageTypeId.ANNOUNCE_OK:
        msgType = shaka.msf.Utils.MessageType.ANNOUNCE_OK;
        break;
      case shaka.msf.Utils.MessageTypeId.ANNOUNCE_ERROR:
        msgType = shaka.msf.Utils.MessageType.ANNOUNCE_ERROR;
        break;
      case shaka.msf.Utils.MessageTypeId.UNANNOUNCE:
        msgType = shaka.msf.Utils.MessageType.UNANNOUNCE;
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
      case shaka.msf.Utils.MessageType.SUBSCRIBE_DONE:
        result = await this.subscribeDone_();
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE:
        result = await this.unsubscribe_();
        break;
      case shaka.msf.Utils.MessageType.ANNOUNCE:
        result = await this.announce_();
        break;
      case shaka.msf.Utils.MessageType.ANNOUNCE_OK:
        result = await this.announceOk_();
        break;
      case shaka.msf.Utils.MessageType.ANNOUNCE_ERROR:
        result = await this.announceError_();
        break;
      case shaka.msf.Utils.MessageType.UNANNOUNCE:
        result = await this.unannounce_();
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

    const trackAlias = await this.reader_.u62();
    shaka.log.debug(`TrackAlias: ${trackAlias}`);

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
      trackAlias,
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
   * @return {!Promise<shaka.msf.Utils.SubscribeDone>}
   * @private
   */
  async subscribeDone_() {
    shaka.log.debug('Parsing SubscribeDone message...');
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
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_DONE,
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
   * @return {!Promise<shaka.msf.Utils.Announce>}
   * @private
   */
  async announce_() {
    shaka.log.debug('Parsing Announce message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    const params = await this.reader_.keyValuePairs();
    shaka.log.debug(`Parameters: ${params.length}`);

    return {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE,
      requestId,
      namespace,
      params,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.AnnounceOk>}
   * @private
   */
  async announceOk_() {
    shaka.log.debug('Parsing AnnounceOk message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    return {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE_OK,
      requestId,
      namespace,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.AnnounceError>}
   * @private
   */
  async announceError_() {
    shaka.log.debug('Parsing AnnounceError message...');
    const requestId = await this.reader_.u62();
    shaka.log.debug(`Request ID: ${requestId}`);

    const code = await this.reader_.u62();
    shaka.log.debug(`Error code: ${code}`);

    const reason = await this.reader_.string();
    shaka.log.debug(`Error reason: ${reason}`);

    return {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE_ERROR,
      requestId,
      code,
      reason,
    };
  }

  /**
   * @return {!Promise<shaka.msf.Utils.Unannounce>}
   * @private
   */
  async unannounce_() {
    shaka.log.debug('Parsing Unannounce message...');
    const namespace = await this.reader_.tuple();
    shaka.log.debug(`Namespace: ${namespace.join('/')}`);

    return {
      kind: shaka.msf.Utils.MessageType.UNANNOUNCE,
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
      case shaka.msf.Utils.MessageType.SUBSCRIBE_DONE:
        writer.marshalSubscribeDone(
            /** @type {!shaka.msf.Utils.SubscribeDone} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.UNSUBSCRIBE:
        writer.marshalUnsubscribe(
            /** @type {!shaka.msf.Utils.Unsubscribe} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.ANNOUNCE:
        writer.marshalAnnounce(
            /** @type {!shaka.msf.Utils.Announce} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.ANNOUNCE_OK:
        writer.marshalAnnounceOk(
            /** @type {!shaka.msf.Utils.AnnounceOk} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.ANNOUNCE_ERROR:
        writer.marshalAnnounceError(
            /** @type {!shaka.msf.Utils.AnnounceError} */ (msg));
        break;
      case shaka.msf.Utils.MessageType.UNANNOUNCE:
        writer.marshalUnannounce(
            /** @type {!shaka.msf.Utils.Unannounce} */ (msg));
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

