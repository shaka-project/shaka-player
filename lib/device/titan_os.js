/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.TitanOS');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');


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
   * @override
   */
  detectMaxHardwareResolution() {
    const maxResolution = {width: 1920, height: 1080};
    try {
      // eslint-disable-next-line camelcase
      if (SmartTvA_API.hasCapability('UHD')) {
        maxResolution.width = 3840;
        maxResolution.height = 2160;
      // eslint-disable-next-line camelcase
      } else if (SmartTvA_API.hasCapability('FHD')) {
        maxResolution.width = 1920;
        maxResolution.height = 1080;
      } else {
        maxResolution.width = 1280;
        maxResolution.height = 720;
      }
    } catch (e) {
      shaka.log.alwaysWarn('Titan OS: Error detecting screen size, default ' +
          'screen size 1920x1080.', e);
    }
    return Promise.resolve(maxResolution);
  }

  /**
   * @override
   */
  getHdrLevel(preferHLG) {
    try {
      // eslint-disable-next-line camelcase
      if (SmartTvA_API.hasCapability('HDR', 'HDR10') ||
          // eslint-disable-next-line camelcase
          SmartTvA_API.hasCapability('HDR', 'DV')) {
        return preferHLG ? 'HLG' : 'PQ';
      }
    } catch (error) {
      shaka.log.alwaysWarn('Titan OS: Error checking HDR support', error);
      return super.getHdrLevel(preferHLG);
    }
    return 'SDR';
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
