/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.MatrixQuaternion');

/**
 * Quaternion in the format XYZW
 */
shaka.ui.MatrixQuaternion = class {
  /**
   * Creates a new identity quaternion
   *
   * @return {!Float32Array} a new quaternion
   */
  static create() {
    const out = new Float32Array(4);
    out[3] = 1;
    return out;
  }

  /**
   * Normalize a quaternion
   *
   * @param {!Float32Array} out the receiving quaternion
   * @param {!Float32Array} a quaternion to normalize
   */
  static normalize(out, a) {
    const x = a[0];
    const y = a[1];
    const z = a[2];
    const w = a[3];
    let len = x * x + y * y + z * z + w * w;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
    }
    out[0] = x * len;
    out[1] = y * len;
    out[2] = z * len;
    out[3] = w * len;
  }
};
