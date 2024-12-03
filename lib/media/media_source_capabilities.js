/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.Capabilities');

/**
 * @summary
 * This is for capturing all media source capabilities on current platform.
 * And this is for static check and can not be constructed.
 */
shaka.media.Capabilities = class {
  /**
   * Cache browser engine call to improve performance on some poor platforms
   *
   * @param {string} type
   * @return {boolean}
   */
  static isTypeSupported(type) {
    const supportMap = shaka.media.Capabilities.MediaSourceTypeSupportMap;
    if (supportMap.has(type)) {
      return supportMap.get(type);
    }
    const mediaSource = window.ManagedMediaSource || window.MediaSource;
    if (mediaSource) {
      const currentSupport = mediaSource.isTypeSupported(type);
      supportMap.set(type, currentSupport);
      return currentSupport;
    }
    return false;
  }

  /**
   * Determine support for SourceBuffer.changeType
   * @return {boolean}
   */
  static isChangeTypeSupported() {
    const sourceBuffer = window.ManagedSourceBuffer || window.SourceBuffer;
    return !!sourceBuffer &&
        // eslint-disable-next-line no-restricted-syntax
        !!sourceBuffer.prototype && !!sourceBuffer.prototype.changeType;
  }
};

/**
 * Public it for unit test, and developer could also check the support map.
 * @type {!Map.<string, boolean>}
 */
shaka.media.Capabilities.MediaSourceTypeSupportMap = new Map();
