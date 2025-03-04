/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.Tizen');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.Tizen = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {!shaka.util.Lazy<?number>} */
    this.osVersion_ = new shaka.util.Lazy(() => {
      const match = navigator.userAgent.match(/Tizen (\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    });
  }

  /**
   * @override
   */
  getVersion() {
    return this.osVersion_.value();
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Tizen';
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
  requiresEncryptionInfoInAllInitSegments(keySystem) {
    return true;
  }

  /**
   * @override
   */
  requiresEC3InitSegments() {
    return this.getVersion() === 3;
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
  supportsSequenceMode() {
    const version = this.getVersion();
    return version !== null ? version >= 4 : super.supportsSequenceMode();
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching() {
    return false;
  }

  /**
   * @override
   */
  supportsServerCertificate() {
    const version = this.getVersion();
    return version !== null ? version > 5 : super.supportsServerCertificate();
  }

  /**
   * @override
   */
  detectMaxHardwareResolution() {
    const maxResolution = {width: 1920, height: 1080};
    try {
      if (webapis.systeminfo && webapis.systeminfo.getMaxVideoResolution) {
        const maxVideoResolution =
            webapis.systeminfo.getMaxVideoResolution();
        maxResolution.width = maxVideoResolution.width;
        maxResolution.height = maxVideoResolution.height;
      } else {
        if (webapis.productinfo.is8KPanelSupported &&
            webapis.productinfo.is8KPanelSupported()) {
          maxResolution.width = 7680;
          maxResolution.height = 4320;
        } else if (webapis.productinfo.isUdPanelSupported &&
            webapis.productinfo.isUdPanelSupported()) {
          maxResolution.width = 3840;
          maxResolution.height = 2160;
        }
      }
    } catch (e) {
      shaka.log.alwaysWarn('Tizen: Error detecting screen size, default ' +
          'screen size 1920x1080.');
    }

    return Promise.resolve(maxResolution);
  }

  /**
   * @return {boolean}
   * @private
   */
  static isTizen_() {
    return navigator.userAgent.includes('Tizen');
  }
};

if (shaka.device.Tizen.isTizen_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.Tizen());
}
