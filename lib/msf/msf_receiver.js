/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Receiver');

goog.require('shaka.log');
goog.require('shaka.msf.Utils');

goog.requireType('shaka.msf.Reader');


shaka.msf.Receiver = class {
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
   * @return {!Promise<shaka.msf.Utils.ServerSetup>}
   */
  async server() {
    const SERVER_SETUP = shaka.msf.Utils.MessageTypeId.SERVER_SETUP;
    shaka.log.v1('Decoding server setup message...');

    const type = await this.reader_.u53();
    shaka.log.v1(`Setup message type: 0x${type.toString(16)}
        (expected 0x${SERVER_SETUP.toString(16)})`);

    if (type !== SERVER_SETUP) {
      const errorMsg =
          `Server SETUP type must be ${SERVER_SETUP}, got ${type}`;
      shaka.log.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Read the 16-bit MSB length field
    const lengthBytes = await this.reader_.read(2);
    const messageLength = (lengthBytes[0] << 8) | lengthBytes[1]; // MSB format
    shaka.log.v1(`Message length (16-bit MSB): ${messageLength} bytes`);

    // Store the current position to validate length later
    const startPosition = this.reader_.getByteLength();

    let version;
    if (!shaka.msf.Utils.isDraft16(this.version_)) {
      version = await this.reader_.u53();
      shaka.log.v1(`Server selected version: 0x${version.toString(16)}`);
    } else {
      version = this.version_;
      shaka.log.v1(
          `Using protocol-negotiated version 0x${version.toString(16)}`);
    }

    const params = shaka.msf.Utils.isDraft16(this.version_) ?
        await this.deltaParameters() : await this.parameters();
    shaka.log.v1(
        `Parameters: ${params ? `${params.length} parameters` : 'none'}`);

    // Log each parameter in detail
    if (params && params.length > 0) {
      for (const param of params) {
        if (typeof param.value === 'bigint') {
          shaka.log.v1(
              `Parameter ID: ${param.type}, value: ${param.value} (bigint)`);
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
      const isEven = paramType % BigInt(2) === BigInt(0);

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

  /**
   * @return {!Promise<(Array<shaka.msf.Utils.KeyValuePair> | undefined)>}
   */
  async deltaParameters() {
    const countResult = await this.reader_.u53WithSize();
    const count = countResult.value;

    shaka.log.v1(`Delta Parameter count: ${count}, count field:
        ${countResult.bytesRead} bytes`);

    if (count === 0) {
      return undefined;
    }

    const params = [];
    let prevType = BigInt(0);

    for (let i = 0; i < count; i++) {
      // Read delta type
      // eslint-disable-next-line no-await-in-loop
      const delta = await this.reader_.u62();
      const paramType = prevType + delta;
      prevType = paramType;

      const isEven = paramType % BigInt(2) === BigInt(0);
      if (isEven) {
        // eslint-disable-next-line no-await-in-loop
        const value = await this.reader_.u62();
        shaka.log.v1(`Delta parameter ${i + 1}/${count}: Type ${paramType}
            (delta ${delta}, even), Value: ${value}`);
        params.push({type: paramType, value});
      } else {
        // eslint-disable-next-line no-await-in-loop
        const length = await this.reader_.u53();
        // Check maximum length (2^16-1)
        if (length > 65535) {
          const errorMsg =
              `Parameter value length exceeds maximum: ${length} > 65535`;
          shaka.log.error(errorMsg);
          throw new Error(errorMsg);
        }
        // eslint-disable-next-line no-await-in-loop
        const value = await this.reader_.read(length);
        shaka.log.v1(`Delta parameter ${i + 1}/${count}: Type ${paramType}
            (delta ${delta}, odd), Length: ${length}`);
        params.push({type: paramType, value});
      }
    }

    return params;
  }
};
