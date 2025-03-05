/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.FirefoxBrowser');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');


/**
 * @final
 */
shaka.device.FirefoxBrowser = class extends shaka.device.AbstractDevice {
  /**
   * @override
   */
  getVersion() {
    return null;
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Firefox';
  }

  /**
   * @return {boolean}
   * @private
   */
  static isFirefoxBrowser_() {
    return navigator.userAgent.includes('Firefox');
  }
};

if (shaka.device.FirefoxBrowser.isFirefoxBrowser_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.FirefoxBrowser());
}
