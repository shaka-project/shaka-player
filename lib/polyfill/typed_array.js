/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.TypedArray');

goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide missing TypedArray methods for older
 * browsers (indexOf/lastIndexOf/includes).
 * @export
 */
shaka.polyfill.TypedArray = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    const typedArrays = [
      Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
      Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
    ];
    for (const typedArray of typedArrays) {
      // eslint-disable-next-line no-restricted-syntax
      typedArray.prototype.indexOf ??= Array.prototype.indexOf;
      // eslint-disable-next-line no-restricted-syntax
      typedArray.prototype.lastIndexOf ??= Array.prototype.lastIndexOf;
      // eslint-disable-next-line no-restricted-syntax
      typedArray.prototype.includes ??= Array.prototype.includes;
    }
  }
};

shaka.polyfill.register(shaka.polyfill.TypedArray.install);
