/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.Tizen');

goog.require('shaka.config.CrossBoundaryStrategy');
goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');


/**
 * @final
 */
shaka.device.Tizen = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    const match = navigator.userAgent.match(/Tizen (\d+).(\d+)/);

    /** @private {?number} */
    this.osMajorVersion_ = match ? parseInt(match[1], 10) : null;

    /** @private {?number} */
    this.osMinorVersion_ = match ? parseInt(match[2], 10) : null;
  }

  /**
   * @override
   */
  getVersion() {
    return this.osMajorVersion_;
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
  getBrowserEngine() {
    return shaka.device.IDevice.BrowserEngine.CHROMIUM;
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
    // Tizen 5.0 and earlier do not support server certificates.
    if (!this.osMajorVersion_ || !this.osMinorVersion_) {
      return super.supportsServerCertificate();
    }
    if (this.osMajorVersion_ === 5) {
      return this.osMinorVersion_ >= 5;
    }
    return this.osMajorVersion_ > 5;
  }

  /**
   * @override
   */
  detectMaxHardwareResolution() {
    const devicePixelRatio = window.devicePixelRatio;
    const maxResolution = {
      width: window.screen.width * devicePixelRatio > 1920 ? 3840 : 1920,
      height: window.screen.height * devicePixelRatio > 1080 ? 2160 : 1080,
    };
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
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);

    config.drm.ignoreDuplicateInitData = this.getVersion() !== 2;

    if (this.getVersion() === 3) {
      config.streaming.crossBoundaryStrategy =
          shaka.config.CrossBoundaryStrategy.RESET_TO_ENCRYPTED;
    }
    config.streaming.shouldFixTimestampOffset = true;
    // Tizen has long hardware pipeline that respond slowly to seeking.
    // Therefore we should not seek when we detect a stall on this platform.
    // Instead, default stallSkip to 0 to force the stall detector to pause
    // and play instead.
    config.streaming.stallSkip = 0;
    config.streaming.gapPadding = 2;
    return config;
  }

  /**
   * @override
   */
  rejectCodecs() {
    // Tizen's implementation of MSE does not work well with opus. To prevent
    // the player from trying to play opus on Tizen, we will override media
    // source to always reject opus content.
    const codecs = [];
    if (this.osMajorVersion_ !== null && this.osMajorVersion_ < 5) {
      codecs.push('opus');
    }
    return codecs;
  }

  /**
   * @override
   */
  getHdrLevel(preferHLG) {
    try {
      if (webapis.avinfo.isHdrTvSupport()) {
        // It relies on previous codec filtering
        return preferHLG ? 'HLG' : 'PQ';
      }
    } catch (e) {
      return super.getHdrLevel(preferHLG);
    }
    return 'SDR';
  }

  /**
   * @override
   */
  misreportAC3UsingDrm() {
    return true;
  }

  /**
   * @override
   */
  misreportsSupportForPersistentLicenses() {
    return this.getVersion() === 3;
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
