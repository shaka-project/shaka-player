/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.Hisense');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');


/**
 * @final
 */
shaka.device.Hisense = class extends shaka.device.AbstractDevice {
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
    return 'Hisense';
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
   * @override
   */
  detectMaxHardwareResolution() {
    const maxResolution = {width: 1920, height: 1080};
    let supports4k = null;
    if (window.Hisense_Get4KSupportState) {
      try {
        // eslint-disable-next-line new-cap
        supports4k = window.Hisense_Get4KSupportState();
      } catch (e) {
        shaka.log.debug('Hisense: Failed to get 4K support state', e);
      }
    }
    if (supports4k == null) {
      // If API is not there or not working for whatever reason, fallback to
      // user agent check, as it contains UHD or FHD info.
      supports4k = navigator.userAgent.includes('UHD');
    }
    if (supports4k) {
      maxResolution.width = 3840;
      maxResolution.height = 2160;
    }

    return Promise.resolve(maxResolution);
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);
    // Hisense has long hardware pipeline that respond slowly to seeking.
    // Therefore we should not seek when we detect a stall on this platform.
    // Instead, default stallSkip to 0 to force the stall detector to pause
    // and play instead.
    config.streaming.stallSkip = 0;
    return config;
  }

  /**
   * @return {boolean}
   * @private
   */
  static isHisense_() {
    return navigator.userAgent.includes('Hisense') ||
        navigator.userAgent.includes('VIDAA');
  }
};

if (shaka.device.Hisense.isHisense_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.Hisense());
}
