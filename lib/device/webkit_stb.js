/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.WebKitSTB');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');


/**
 * @final
 */
shaka.device.WebKitSTB = class extends shaka.device.AbstractDevice {
  /**
   * @override
   */
  getVersion() {
    // This works for iOS Safari and desktop Safari, which contain something
    // like "Version/13.0" indicating the major Safari or iOS version.
    let match = navigator.userAgent.match(/Version\/(\d+)/);
    if (match) {
      return parseInt(match[1], /* base= */ 10);
    }

    // This works for all other browsers on iOS, which contain something like
    // "OS 13_3" indicating the major & minor iOS version.
    match = navigator.userAgent.match(/OS (\d+)(?:_\d+)?/);
    if (match) {
      return parseInt(match[1], /* base= */ 10);
    }

    return null;
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'WebKit STB';
  }

  /**
   * @override
   */
  getDeviceType() {
    return shaka.device.IDevice.DeviceType.TV;
  }

  /**
   * @override
   */
  supportsMediaCapabilities() {
    return false;
  }

  /**
   * @return {boolean}
   * @private
   */
  static isWebkitSTB_() {
    if (!(navigator.vendor || '').includes('Apple')) {
      return false;
    }
    if (/(?:iPhone|iPad|iPod)/.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 1) {
      return false;
    }
    if (navigator.userAgentData && navigator.userAgentData.platform &&
        navigator.userAgentData.platform.toLowerCase() == 'macos') {
      return false;
    } else if (navigator.platform &&
        navigator.platform.toLowerCase().includes('mac')) {
      return false;
    }
    return true;
  }
};

if (shaka.device.WebKitSTB.isWebkitSTB_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.WebKitSTB());
}
