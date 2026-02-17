/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Uint8ArrayUtils');

goog.require('shaka.util.BufferUtils');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary A set of Uint8Array utility functions.
 * @export
 */
shaka.util.Uint8ArrayUtils = class {
  /**
   * Convert a buffer to a base64 string. The output will be standard
   * alphabet as opposed to base64url safe alphabet.
   * @param {BufferSource} data
   * @return {string}
   * @export
   */
  static toStandardBase64(data) {
    const arr = shaka.util.BufferUtils.toUint8(data);
    return arr.toBase64({alphabet: 'base64', omitPadding: false});
  }

  /**
   * Convert a buffer to a base64 string.  The output will always use the
   * alternate encoding/alphabet also known as "base64url".
   * @param {BufferSource} data
   * @param {boolean=} padding If true, pad the output with equals signs.
   *   Defaults to true.
   * @return {string}
   * @export
   */
  static toBase64(data, padding) {
    padding = (padding == undefined) ? true : padding;
    const arr = shaka.util.BufferUtils.toUint8(data);
    return arr.toBase64({alphabet: 'base64url', omitPadding: !padding});
  }

  /**
   * Convert a base64 string to a Uint8Array.  Accepts either the standard
   * alphabet or the alternate "base64url" alphabet.
   * @param {string} str
   * @return {!Uint8Array}
   * @export
   */
  static fromBase64(str) {
    const input = str.replace(/\s+/g, '');
    const usesUrlAlphabet = /[-_]/.test(input);
    return Uint8Array.fromBase64(input, {
      alphabet: usesUrlAlphabet ? 'base64url' : 'base64',
    });
  }


  /**
   * Convert a hex string to a Uint8Array.
   * @param {string} str
   * @return {!Uint8Array}
   * @export
   */
  static fromHex(str) {
    return Uint8Array.fromHex(str);
  }


  /**
   * Convert a buffer to a hex string.
   * @param {BufferSource} data
   * @return {string}
   * @export
   */
  static toHex(data) {
    return shaka.util.BufferUtils.toUint8(data).toHex();
  }


  /**
   * Concatenate buffers.
   * @param {...BufferSource} varArgs
   * @return {!Uint8Array}
   * @export
   */
  static concat(...varArgs) {
    const BufferUtils = shaka.util.BufferUtils;
    let totalLength = 0;
    for (let i = 0; i < varArgs.length; ++i) {
      const value = varArgs[i];
      totalLength += value.byteLength;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (let i = 0; i < varArgs.length; ++i) {
      const value = varArgs[i];
      if (ArrayBuffer.isView(value) &&
      /** @type {TypedArray} */ (value).BYTES_PER_ELEMENT === 1) {
        result.set(/** @type {!Uint8Array} */(value), offset);
      } else {
        result.set(BufferUtils.toUint8(value), offset);
      }
      offset += value.byteLength;
    }

    return result;
  }
};
