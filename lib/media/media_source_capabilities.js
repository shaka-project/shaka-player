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
    const currentSupport = MediaSource.isTypeSupported(type);
    supportMap.set(type, currentSupport);
    return currentSupport;
  }

  /**
   * Determine support for SourceBuffer.changeType
   * @return {boolean}
   */
  static isChangeTypeSupported() {
    // eslint-disable-next-line no-restricted-syntax
    return SourceBuffer !== undefined && SourceBuffer.prototype !== undefined &&
    // eslint-disable-next-line no-restricted-syntax, no-prototype-builtins
    SourceBuffer.prototype.hasOwnProperty('changeType');
  }
};

/**
 * Public it for unit test, and developer could also check the support map.
 * @type {!Map.<string, boolean>}
 */
shaka.media.Capabilities.MediaSourceTypeSupportMap = new Map();
