/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.Chromecast');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.Chromecast = class extends shaka.device.AbstractDevice {
  constructor() {
    if (!shaka.device.Chromecast.isChromecast_()) {
      throw new Error('Not a Chromecast device!');
    }
    super();

    /** @private {!shaka.util.Lazy<?number>} */
    this.version_ = new shaka.util.Lazy(() => {
      // Looking for something like "Chrome/106.0.0.0"
      const match = navigator.userAgent.match(/Chrome\/(\d+)/);
      if (match) {
        return parseInt(match[1], /* base= */ 10);
      }

      return null;
    });

    /** @private {!shaka.util.Lazy<shaka.device.Chromecast.OsType_>} */
    this.osType_ = new shaka.util.Lazy(() => {
      let fieldToCheck = (navigator.userAgentData &&
          navigator.userAgentData.platform) || navigator.userAgent;
      fieldToCheck = fieldToCheck.toLowerCase();
      if (fieldToCheck.includes('android')) {
        return shaka.device.Chromecast.OsType_.ANDROID;
      } else if (fieldToCheck.includes('fuchsia')) {
        return shaka.device.Chromecast.OsType_.FUCHSIA;
      } else {
        return shaka.device.Chromecast.OsType_.LINUX;
      }
    });
  }

  /**
   * @override
   */
  getVersion() {
    return this.version_.value();
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Chromecast with ' + this.osType_.value();
  }

  /**
   * @override
   */
  getDeviceType() {
    return shaka.device.IDevice.DeviceType.CAST;
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
  supportsMediaCapabilities() {
    return super.supportsMediaCapabilities() &&
        this.osType_.value() !== shaka.device.Chromecast.OsType_.LINUX;
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching() {
    return this.osType_.value() !== shaka.device.Chromecast.OsType_.LINUX;
  }

  /**
   * @override
   */
  seekDelay() {
    switch (this.osType_.value()) {
      case shaka.device.Chromecast.OsType_.ANDROID:
        return 0;
      case shaka.device.Chromecast.OsType_.FUCHSIA:
        return 3;
      default:
        return 1;
    }
  }

  /**
   * @override
   */
  async detectMaxHardwareResolution() {
    // In our tests, the original Chromecast seems to have trouble decoding
    // above 1080p. It would be a waste to select a higher res anyway, given
    // that the device only outputs 1080p to begin with.
    // Chromecast has an extension to query the device/display's resolution.
    const hasCanDisplayType = window.cast && cast.__platform__ &&
        cast.__platform__.canDisplayType;

    // Some hub devices can only do 720p. Default to that.
    const maxResolution = {width: 1280, height: 720};

    try {
      if (hasCanDisplayType && await cast.__platform__.canDisplayType(
          'video/mp4; codecs="avc1.640028"; width=3840; height=2160')) {
        // The device and display can both do 4k. Assume a 4k limit.
        maxResolution.width = 3840;
        maxResolution.height = 2160;
      } else if (hasCanDisplayType && await cast.__platform__.canDisplayType(
          'video/mp4; codecs="avc1.640028"; width=1920; height=1080')) {
        // Most Chromecasts can do 1080p.
        maxResolution.width = 1920;
        maxResolution.height = 1080;
      }
    } catch (error) {
      // This shouldn't generally happen. Log the error.
      shaka.log.alwaysError('Failed to check canDisplayType:', error);
      // Now ignore the error and let the 720p default stand.
    }

    return maxResolution;
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);
    // Chromecast has long hardware pipeline that respond slowly to seeking.
    // Therefore we should not seek when we detect a stall on this platform.
    // Instead, default stallSkip to 0 to force the stall detector to pause
    // and play instead.
    config.streaming.stallSkip = 0;
    return config;
  }

  /**
   * @override
   */
  supportsOfflineStorage() {
    return false;
  }

  /**
   * @override
   */
  supportsCbcsWithoutEncryptionSchemeSupport() {
    return true;
  }

  /**
   * Check if the current platform is Vizio TV.
   * @return {boolean}
   * @private
   */
  static isChromecast_() {
    return navigator.userAgent.includes('CrKey') &&
        !navigator.userAgent.includes('VIZIO SmartCast');
  }
};

/**
 * @private
 * @enum {string}
 */
shaka.device.Chromecast.OsType_ = {
  ANDROID: 'Android',
  FUCHSIA: 'Fuchsia',
  LINUX: 'Linux',
};

if (shaka.device.Chromecast.isChromecast_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.Chromecast());
}
