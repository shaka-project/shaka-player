/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.ChromeBrowser');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');


/**
 * @final
 */
shaka.device.ChromeBrowser = class extends shaka.device.AbstractDevice {
  /**
   * @override
   */
  getVersion() {
    // Looking for something like "Chrome/106.0.0.0".
    const match = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (match) {
      return parseInt(match[1], /* base= */ 10);
    }

    return null;
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Chrome';
  }

  /**
   * @return {boolean}
   * @private
   */
  static isChromeBrowser_() {
    return navigator.userAgent.includes('Chrome') &&
        !navigator.userAgent.match(/Edge\//);
  }
};

if (shaka.device.ChromeBrowser.isChromeBrowser_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.ChromeBrowser());
}
