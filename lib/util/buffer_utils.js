/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.BufferUtils');


/**
 * @summary A set of BufferSource utility functions.
 * @export
 */
shaka.util.BufferUtils = class {
  /**
   * Compare two buffers for equality.  For buffers of different types, this
   * compares the underlying buffers as binary data.
   *
   * @param {?BufferSource} arr1
   * @param {?BufferSource} arr2
   * @return {boolean}
   * @export
   * @suppress {strictMissingProperties}
   */
  static equal(arr1, arr2) {
    const BufferUtils = shaka.util.BufferUtils;
    if (!arr1 && !arr2) {
      return true;
    }
    if (!arr1 || !arr2) {
      return false;
    }
    if (arr1.byteLength != arr2.byteLength) {
      return false;
    }

    // Quickly check if these are views of the same buffer.  An ArrayBuffer can
    // be passed but doesn't have a byteOffset field, so default to 0.
    if (BufferUtils.unsafeGetArrayBuffer_(arr1) ==
            BufferUtils.unsafeGetArrayBuffer_(arr2) &&
        (arr1.byteOffset || 0) == (arr2.byteOffset || 0)) {
      return true;
    }

    const uint8A = shaka.util.BufferUtils.toUint8(arr1);
    const uint8B = shaka.util.BufferUtils.toUint8(arr2);
    for (let i = 0; i < arr1.byteLength; i++) {
      if (uint8A[i] != uint8B[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Gets the underlying ArrayBuffer of the given view.  The caller needs to
   * ensure it uses the "byteOffset" and "byteLength" fields of the view to
   * only use the same "view" of the data.
   *
   * @param {BufferSource} view
   * @return {!ArrayBuffer}
   * @private
   */
  static unsafeGetArrayBuffer_(view) {
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
   * @export
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
      // the data.  Note that since this isn't an ArrayBuffer, the "new" call
      // will allocate a new buffer to hold the copy.
      return new Uint8Array(view).buffer;
    }
  }

  /**
   * Creates a new Uint8Array view on the same buffer.  This clamps the values
   * to be within the same view (i.e. you can't use this to move past the end
   * of the view, even if the underlying buffer is larger).  However, you can
   * pass a negative offset to access the data before the view.
   *
   * @param {BufferSource} data
   * @param {number=} offset The offset from the beginning of this data's view
   *   to start the new view at.
   * @param {number=} length The byte length of the new view.
   * @return {!Uint8Array}
   * @export
   */
  static toUint8(data, offset = 0, length = Infinity) {
    return shaka.util.BufferUtils.view_(data, offset, length, Uint8Array);
  }

  /**
   * Creates a DataView over the given buffer.
   *
   * @see toUint8
   * @param {BufferSource} buffer
   * @param {number=} offset
   * @param {number=} length
   * @return {!DataView}
   * @export
   */
  static toDataView(buffer, offset = 0, length = Infinity) {
    return shaka.util.BufferUtils.view_(buffer, offset, length, DataView);
  }

  /**
   * @param {BufferSource} data
   * @param {number} offset
   * @param {number} length
   * @param {function(new:T, ArrayBuffer, number, number)} Type
   * @return {!T}
   * @template T
   * @private
   */
  static view_(data, offset, length, Type) {
    const buffer = shaka.util.BufferUtils.unsafeGetArrayBuffer_(data);
    // Absolute end of the |data| view within |buffer|.
    /** @suppress {strictMissingProperties} */
    const dataEnd = (data.byteOffset || 0) + data.byteLength;
    // Absolute start of the result within |buffer|.
    /** @suppress {strictMissingProperties} */
    const rawStart = (data.byteOffset || 0) + offset;
    const start = Math.max(0, Math.min(rawStart, dataEnd));
    // Absolute end of the result within |buffer|.
    const end = Math.min(start + Math.max(length, 0), dataEnd);
    return new Type(buffer, start, end - start);
  }
};
