/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Reader');
goog.provide('shaka.msf.Writer');

goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.StringUtils');

goog.requireType('shaka.msf.Utils');

/**
 * Reader wraps a stream and provides convenience methods for reading
 * pieces from a stream.
 *
 * @implements {shaka.util.IReleasable}
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
   * @override
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
