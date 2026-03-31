/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.TiVoOS');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');


/**
 * @final
 */
shaka.device.TiVoOS = class extends shaka.device.AbstractDevice {
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
    return 'TiVoOS';
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
  getBrowserEngine() {
    return shaka.device.IDevice.BrowserEngine.CHROMIUM;
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching(keySystem) {
    return false;
  }

  /**
   * Check if the current platform is TiVoOS.
   * @return {boolean}
   * @private
   */
  static isTiVoOS_() {
    return navigator.userAgent.includes('TiVoOS');
  }
};

if (shaka.device.TiVoOS.isTiVoOS_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.TiVoOS());
}
