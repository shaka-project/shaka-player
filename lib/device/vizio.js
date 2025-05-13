/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.Vizio');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');


/**
 * @final
 */
shaka.device.Vizio = class extends shaka.device.AbstractDevice {
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
    return 'Vizio';
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
   * Check if the current platform is Vizio TV.
   * @return {boolean}
   * @private
   */
  static isVizio_() {
    return navigator.userAgent.includes('VIZIO SmartCast');
  }
};

if (shaka.device.Vizio.isVizio_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.Vizio());
}
