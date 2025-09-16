/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.WebOS');

goog.require('shaka.config.CrossBoundaryStrategy');
goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');


/**
 * @final
 */
shaka.device.WebOS = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {?number} */
    this.osVersion_ = this.guessWebOSVersion_();

    /** @private {?boolean} */
    this.supportHdr_ = null;

    try {
      const bridge = new PalmServiceBridge();
      bridge.onservicecallback = (n) => {
        shaka.log.info(n);
        const configsJSON =
        /** @type {shaka.device.WebOS.PalmServiceBridgeResponse} */ (
            JSON.parse(n));
        this.supportHdr_ = configsJSON.configs['tv.model.supportHDR'] ||
            configsJSON.configs['tv.config.supportDolbyHDRContents'] || false;
      };
      const configs = {
        configNames: [
          'tv.model.supportHDR',
          'tv.config.supportDolbyHDRContents',
        ],
      };
      // eslint-disable-next-line no-restricted-syntax
      bridge.call('luna://com.webos.service.config/getConfigs',
          JSON.stringify(configs));
    } catch (e) {
      shaka.log.alwaysWarn('WebOS: getConfigs call failed', e);
      // Ignore errors.
    }
  }

  /**
   * @override
   */
  getVersion() {
    return this.osVersion_;
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'WebOS';
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
  supportsMediaCapabilities() {
    return false;
  }

  /**
   * @override
   */
  supportsSequenceMode() {
    const version = this.getVersion();
    return version !== null ? version > 3 : super.supportsSequenceMode();
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching() {
    const version = this.getVersion();
    return version !== null ?
        version > 6 : super.supportsSmoothCodecSwitching();
  }

  /**
   * @override
   */
  supportsServerCertificate() {
    const version = this.getVersion();
    return version !== null ? version > 3 : super.supportsServerCertificate();
  }

  /**
   * @override
   */
  detectMaxHardwareResolution() {
    const maxResolution = {width: 1920, height: 1080};
    try {
      const deviceInfo =
      /** @type {{screenWidth: number, screenHeight: number}} */(
          JSON.parse(window.PalmSystem.deviceInfo));
      // WebOS has always been able to do 1080p.  Assume a 1080p limit.
      maxResolution.width = Math.max(1920, deviceInfo['screenWidth']);
      maxResolution.height = Math.max(1080, deviceInfo['screenHeight']);
    } catch (e) {
      shaka.log.alwaysWarn('WebOS: Error detecting screen size, default ' +
          'screen size 1920x1080.');
    }

    return Promise.resolve(maxResolution);
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);

    if (this.getVersion() === 3) {
      config.streaming.crossBoundaryStrategy =
          shaka.config.CrossBoundaryStrategy.RESET;
    }
    config.streaming.shouldFixTimestampOffset = true;
    // WebOS has long hardware pipeline that respond slowly to seeking.
    // Therefore we should not seek when we detect a stall on this platform.
    // Instead, default stallSkip to 0 to force the stall detector to pause
    // and play instead.
    config.streaming.stallSkip = 0;
    return config;
  }

  /**
   * @override
   */
  getHdrLevel(preferHLG) {
    if (this.supportHdr_ == null) {
      shaka.log.alwaysWarn('WebOS: getConfigs call haven\'t finished');
      return super.getHdrLevel(preferHLG);
    }
    if (this.supportHdr_) {
      // It relies on previous codec filtering
      return preferHLG ? 'HLG' : 'PQ';
    }
    return 'SDR';
  }

  /**
   * @return {?number}
   * @private
   */
  guessWebOSVersion_() {
    let browserVersion = null;
    const match = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (match) {
      browserVersion = parseInt(match[1], /* base= */ 10);
    }

    switch (browserVersion) {
      case 38:
        return 3;
      case 53:
        return 4;
      case 68:
        return 5;
      case 79:
        return 6;
      case 87:
        return 22;
      case 94:
        return 23;
      case 108:
        return 24;
      case 120:
        return 25;
      default:
        return null;
    }
  }

  /**
   * @override
   */
  supportStandardVP9Checking() {
    return false;
  }

  /**
   * @override
   */
  supportsCbcsWithoutEncryptionSchemeSupport() {
    const version = this.getVersion();
    return version !== null ?
        version >= 6 : super.supportsCbcsWithoutEncryptionSchemeSupport();
  }

  /**
   * @return {boolean}
   * @private
   */
  static isWebOS_() {
    return navigator.userAgent.includes('Web0S');
  }
};


/**
 * @typedef {{
 *   configs: Object,
 * }}
 *
 * @property {Object} configs
 */
shaka.device.WebOS.PalmServiceBridgeResponse;

if (shaka.device.WebOS.isWebOS_()) {
  const webOSDevice = new shaka.device.WebOS();
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => webOSDevice);
}
