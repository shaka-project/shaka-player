/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.TiVoAuto');

goog.require('shaka.config.CrossBoundaryStrategy');
goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.TiVoAuto = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {!shaka.util.Lazy<boolean>} */
    this.isAndroid_ = new shaka.util.Lazy(() => {
      return navigator.userAgent.includes('Andr0id');
    });
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'TiVoAuto';
  }

  /**
   * @override
   */
  getVersion() {
    return null;
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
  getDeviceType() {
    return shaka.device.IDevice.DeviceType.AUTOMOTIVE;
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
    const maxResolution = {
      width: window.screen.width * window.devicePixelRatio,
      height: window.screen.height * window.devicePixelRatio,
    };
    return Promise.resolve(maxResolution);
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);
    if (this.isAndroid_.value()) {
      config.streaming.crossBoundaryStrategy =
          shaka.config.CrossBoundaryStrategy.RESET_TO_ENCRYPTED;
    } else {
      config.streaming.crossBoundaryStrategy =
          shaka.config.CrossBoundaryStrategy.RESET;
    }
    return config;
  }

  /**
   * Check if the current platform runs TiVoAuto.
   *
   * @return {boolean}
   * @private
   */
  static isTiVoAuto_() {
    if (navigator.userAgent.includes('Linux') &&
        navigator.userAgent.includes('BMW/')) {
      return true;
    }
    return navigator.userAgent.includes('TiVoAuto');
  }
}

if (shaka.device.TiVoAuto.isTiVoAuto_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.TiVoAuto());
}
