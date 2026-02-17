/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.Uint8Array');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary Polyfill for Uint8Array base64/hex methods.
 * @export
 */
shaka.polyfill.Uint8Array = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('Uint8Array.install');

    // Base64 instance method
    // eslint-disable-next-line no-restricted-syntax
    if (!('toBase64' in Uint8Array.prototype)) {
      shaka.log.debug('Uint8Array: Installing toBase64 polyfill.');
      // eslint-disable-next-line no-extend-native, no-restricted-syntax
      Uint8Array.prototype.toBase64 =
          shaka.polyfill.Uint8Array.toBase64_;
    }

    // Base64 static method
    if (!Uint8Array.fromBase64) {
      shaka.log.debug('Uint8Array: Installing fromBase64 polyfill.');
      Uint8Array.fromBase64 =
          shaka.polyfill.Uint8Array.fromBase64_;
    }

    // Hex instance method
    // eslint-disable-next-line no-restricted-syntax
    if (!('toHex' in Uint8Array.prototype)) {
      shaka.log.debug('Uint8Array: Installing toHex polyfill.');
      // eslint-disable-next-line no-extend-native, no-restricted-syntax
      Uint8Array.prototype.toHex =
          shaka.polyfill.Uint8Array.toHex_;
    }

    // Hex static method
    if (!Uint8Array.fromHex) {
      shaka.log.debug('Uint8Array: Installing fromHex polyfill.');
      Uint8Array.fromHex =
          shaka.polyfill.Uint8Array.fromHex_;
    }
  }

  /**
   * @param {(shaka.polyfill.Uint8Array.ToBase64Options|
   *          null|undefined)=} options
   * @return {string}
   * @this {Uint8Array}
   * @private
   */
  static toBase64_(options) {
    if (options != null && typeof options !== 'object') {
      throw new TypeError('options must be an object or undefined');
    }

    let alphabet = 'base64';
    let omitPadding = false;

    if (options) {
      if (options.alphabet !== undefined) {
        alphabet = options.alphabet;
      }
      if (options.omitPadding !== undefined) {
        omitPadding = options.omitPadding;
      }
    }

    if (alphabet !== 'base64' && alphabet !== 'base64url') {
      throw new TypeError('alphabet must be "base64" or "base64url"');
    }

    let binary = '';
    for (let i = 0; i < this.length; ++i) {
      binary += String.fromCharCode(this[i]);
    }

    let base64 = btoa(binary);

    if (alphabet === 'base64url') {
      base64 = base64.replace(/\+/g, '-').replace(/\//g, '_');
    }
    if (omitPadding) {
      base64 = base64.replace(/[=]+$/, '');
    }
    return base64;
  }

  /**
   * @param {string} str
   * @param {(shaka.polyfill.Uint8Array.FromBase64Options|
   *          null|undefined)=} options
   * @return {!Uint8Array}
   * @throws {TypeError|SyntaxError}
   * @private
   */
  static fromBase64_(str, options) {
    if (typeof str !== 'string') {
      throw new TypeError('base64 input must be a string');
    }

    if (options != null && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    let alphabet = 'base64';
    let lastChunkHandling = 'loose';

    if (options) {
      if (options.alphabet !== undefined) {
        alphabet = options.alphabet;
      }
      if (options.lastChunkHandling !== undefined) {
        lastChunkHandling = options.lastChunkHandling;
      }
    }

    if (alphabet !== 'base64' && alphabet !== 'base64url') {
      throw new TypeError('alphabet must be "base64" or "base64url"');
    }

    if (lastChunkHandling !== 'loose' &&
        lastChunkHandling !== 'strict' &&
        lastChunkHandling !== 'stop-before-partial') {
      throw new TypeError('lastChunkHandling must be "loose", "strict", or ' +
          '"stop-before-partial"');
    }

    let input = str.replace(/\s+/g, '');

    if (alphabet === 'base64') {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input)) {
        throw new SyntaxError('Invalid base64 character');
      }
    } else { // base64url
      if (!/^[A-Za-z0-9\-_]*={0,2}$/.test(input)) {
        throw new SyntaxError('Invalid base64url character');
      }
      input = input.replace(/-/g, '+').replace(/_/g, '/');
    }

    const remainder = input.length % 4;

    if (remainder !== 0) {
      if (lastChunkHandling === 'loose') {
        input += '==='.slice(0, (4 - remainder) % 4);
      } else if (lastChunkHandling === 'stop-before-partial') {
        input = input.slice(0, input.length - remainder);
      } else if (lastChunkHandling === 'strict') {
        throw new SyntaxError('Invalid base64 length in strict mode');
      }
    }

    let binary;
    try {
      binary = atob(input);
    } catch (e) {
      throw new SyntaxError('Invalid base64 string');
    }

    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; ++i) {
      result[i] = binary.charCodeAt(i);
    }

    return result;
  }

  /**
   * @return {string}
   * @this {Uint8Array}
   * @private
   */
  static toHex_() {
    let hex = '';
    for (let i = 0; i < this.length; ++i) {
      const byteHex = this[i].toString(16).padStart(2, '0');
      hex += byteHex;
    }
    return hex;
  }

  /**
   * @param {string} str
   * @return {!Uint8Array}
   * @throws {TypeError|SyntaxError}
   * @private
   */
  static fromHex_(str) {
    if (typeof str !== 'string') {
      throw new TypeError('hex input must be a string');
    }
    if (str.length % 2 !== 0) {
      throw new SyntaxError('hex string length must be even');
    }
    if (!/^[0-9A-Fa-f]*$/.test(str)) {
      throw new SyntaxError('Invalid hex character');
    }

    const length = str.length / 2;
    const result = new Uint8Array(length);
    for (let i = 0; i < length; ++i) {
      result[i] = parseInt(str.substr(i * 2, 2), 16);
    }
    return result;
  }
};

/**
 * @typedef {{
 *   alphabet: (string|undefined),
 *   omitPadding: (boolean|undefined)
 * }}
 */
shaka.polyfill.Uint8Array.ToBase64Options;

/**
 * @typedef {{
 *   alphabet: (string|undefined),
 *   lastChunkHandling: (string|undefined)
 * }}
 */
shaka.polyfill.Uint8Array.FromBase64Options;

shaka.polyfill.register(shaka.polyfill.Uint8Array.install);
