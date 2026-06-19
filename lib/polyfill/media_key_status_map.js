/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MediaKeyStatusMap');

goog.require('goog.asserts');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.util.BufferUtils');


/**
 * @summary An implementation of MediaKeyStatusMap.
 * This fakes a map with a single key ID.
 * Used by the EME polyfills (Apple and WebKit).
 *
 * @implements {MediaKeyStatusMap}
 */
shaka.polyfill.MediaKeyStatusMap = class {
  /** */
  constructor() {
    /**
     * @type {number}
     */
    this.size = 0;

    /**
     * @private {string|undefined}
     */
    this.status_ = undefined;
  }

  /**
   * An internal method used by the session to set key status.
   * @param {string|undefined} status
   */
  setStatus(status) {
    this.size = status == undefined ? 0 : 1;
    this.status_ = status;
  }

  /**
   * An internal method used by the session to get key status.
   * @return {string|undefined}
   */
  getStatus() {
    return this.status_;
  }

  /** @override */
  forEach(fn) {
    if (this.status_) {
      fn(this.status_, shaka.drm.DrmUtils.DUMMY_KEY_ID.value());
    }
  }

  /** @override */
  get(keyId) {
    if (this.has(keyId)) {
      return this.status_;
    }
    return undefined;
  }

  /** @override */
  has(keyId) {
    const fakeKeyId = shaka.drm.DrmUtils.DUMMY_KEY_ID.value();
    if (this.status_ && shaka.util.BufferUtils.equal(keyId, fakeKeyId)) {
      return true;
    }
    return false;
  }

  /**
   * @suppress {missingReturn}
   * @override
   */
  entries() {
    goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
  }

  /**
   * @suppress {missingReturn}
   * @override
   */
  keys() {
    goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
  }

  /**
   * @suppress {missingReturn}
   * @override
   */
  values() {
    goog.asserts.assert(false, 'Not used!  Provided only for the compiler.');
  }
};
