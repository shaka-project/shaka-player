/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.TitanOS');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');


/**
 * @final
 */
shaka.device.TitanOS = class extends shaka.device.AbstractDevice {
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
    return 'TitanOS';
  }

  /**
   * @override
   */
  getDeviceType() {
    return shaka.device.IDevice.DeviceType.TV;
  }

  /**
   * Check if the current platform is TitanOS.
   * @return {boolean}
   * @private
   */
  static isTitanOS_() {
    return navigator.userAgent.includes('TitanOS');
  }
};

if (shaka.device.TitanOS.isTitanOS_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.TitanOS());
}
