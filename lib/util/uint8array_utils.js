/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.util.Uint8ArrayUtils');

goog.require('shaka.util.Iterables');
goog.require('shaka.util.StringUtils');


/**
 * @summary A set of Uint8Array utility functions.
 * @exportDoc
 */
shaka.util.Uint8ArrayUtils = class {
  /**
   * Convert a Uint8Array to a base64 string. The output will be standard
   * alphabet as opposed to base64url safe alphabet.
   * @param {!Uint8Array} u8Arr
   * @return {string}
   * @export
   */
  static toStandardBase64(u8Arr) {
    const bytes = shaka.util.StringUtils.fromCharCode(u8Arr);
    return btoa(bytes);
  }

  /**
   * Convert a Uint8Array to a base64 string.  The output will always use the
   * alternate encoding/alphabet also known as "base64url".
   * @param {!Uint8Array} arr
   * @param {boolean=} padding If true, pad the output with equals signs.
   *   Defaults to true.
   * @return {string}
   * @export
   */
  static toBase64(arr, padding) {
    padding = (padding == undefined) ? true : padding;
    const base64 = shaka.util.Uint8ArrayUtils.toStandardBase64(arr)
        .replace(/\+/g, '-').replace(/\//g, '_');
    return padding ? base64 : base64.replace(/[=]*$/, '');
  }

  /**
   * Convert a base64 string to a Uint8Array.  Accepts either the standard
   * alphabet or the alternate "base64url" alphabet.
   * @param {string} str
   * @return {!Uint8Array}
   * @export
   */
  static fromBase64(str) {
    // atob creates a "raw string" where each character is interpreted as a
    // byte.
    const bytes = window.atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const result = new Uint8Array(bytes.length);
    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item} of enumerate(bytes)) {
      result[i] = item.charCodeAt(0);
    }
    return result;
  }


  /**
   * Convert a hex string to a Uint8Array.
   * @param {string} str
   * @return {!Uint8Array}
   * @export
   */
  static fromHex(str) {
    const size = str.length / 2;
    const arr = new Uint8Array(size);
    for (const i of shaka.util.Iterables.range(size)) {
      arr[i] = window.parseInt(str.substr(i * 2, 2), 16);
    }
    return arr;
  }


  /**
   * Convert a Uint8Array to a hex string.
   * @param {!Uint8Array} arr
   * @return {string}
   * @export
   */
  static toHex(arr) {
    let hex = '';
    for (let value of arr) {
      value = value.toString(16);
      if (value.length == 1) {
        value = '0' + value;
      }
      hex += value;
    }
    return hex;
  }


  /**
   * Compare two Uint8Arrays for equality.
   * For convenience, this also accepts Arrays, so that one can trivially
   * compare a Uint8Array to an Array of numbers.
   *
   * @param {(Uint8Array|Array.<number>)} arr1
   * @param {(Uint8Array|Array.<number>)} arr2
   * @return {boolean}
   * @export
   */
  static equal(arr1, arr2) {
    if (!arr1 && !arr2) {
      return true;
    }
    if (!arr1 || !arr2) {
      return false;
    }
    if (arr1.length != arr2.length) {
      return false;
    }
    for (const i of shaka.util.Iterables.range(arr1.length)) {
      if (arr1[i] != arr2[i]) {
        return false;
      }
    }
    return true;
  }


  /**
   * Concatenate Uint8Arrays.
   * @param {...!Uint8Array} varArgs
   * @return {!Uint8Array}
   * @export
   */
  static concat(...varArgs) {
    let totalLength = 0;
    for (const arr of varArgs) {
      totalLength += arr.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of varArgs) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }


  /**
   * Creates a DataView over the given buffer.
   * @param {!BufferSource} buffer
   * @return {!DataView}
   */
  static toDataView(buffer) {
    if (buffer instanceof ArrayBuffer) {
      return new DataView(buffer);
    } else {
      return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
  }


  /**
   * Gets the underlying ArrayBuffer of the given view.  The caller needs to
   * ensure it uses the "byteOffset" and "byteLength" fields of the view to
   * only use the same "view" of the data.
   *
   * @param {!BufferSource} view
   * @return {!ArrayBuffer}
   */
  static unsafeGetArrayBuffer(view) {
    if (view instanceof ArrayBuffer) {
      return view;
    } else {
      return view.buffer;
    }
  }


  /**
   * Gets an ArrayBuffer that contains the data from the given TypedArray.  Note
   * this will allocate a new ArrayBuffer if the object is a partial view of
   * the data.
   *
   * @param {!BufferSource} view
   * @return {!ArrayBuffer}
   */
  static toArrayBuffer(view) {
    if (view instanceof ArrayBuffer) {
      return view;
    } else {
      if (view.byteOffset == 0 && view.byteLength == view.buffer.byteLength) {
        // This is a TypedArray over the whole buffer.
        return view.buffer;
      }
      // This is a "view" on the buffer.  Create a new buffer that only contains
      // the data.
      const ret = new Uint8Array(view.byteLength);
      ret.set(view);
      return ret.buffer;
    }
  }
};
