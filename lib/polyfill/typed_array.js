/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.TypedArray');

goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide missing TypedArray indexOf methods for older
 * browsers.
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
      if (typedArray.prototype.indexOf) {
        continue;
      }
      // eslint-disable-next-line no-restricted-syntax
      typedArray.prototype.indexOf = shaka.polyfill.TypedArray.indexOf_;
    }
  }

  /**
   * @param {number} searchElement
   * @param {number} fromIndex
   * @return {number}
   * @this {TypedArray}
   * @private
   */
  static indexOf_(searchElement, fromIndex) {
    // eslint-disable-next-line no-restricted-syntax
    return Array.prototype.indexOf.call(this, searchElement, fromIndex);
  }
};

shaka.polyfill.register(shaka.polyfill.TypedArray.install);
