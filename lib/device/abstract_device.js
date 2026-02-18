/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.AbstractDevice');

goog.require('shaka.device.IDevice');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Lazy');


/**
 * @abstract
 * @implements {shaka.device.IDevice}
 */
shaka.device.AbstractDevice = class {
  constructor() {
    /** @private {!shaka.util.Lazy<!shaka.device.IDevice.DeviceType>} */
    this.abstractDeviceType_ = new shaka.util.Lazy(() => {
      const ua = navigator.userAgent.toLowerCase();
      const rules = [
        {
          type: shaka.device.IDevice.DeviceType.VR,
          regex: /oculus|quest/,
        },
        {
          type: shaka.device.IDevice.DeviceType.TV,
          regex: /smart[ _]?tv|android ?tv/,
        },
        {
          type: shaka.device.IDevice.DeviceType.MOBILE,
          regex: /iphone|ipad|ipod|android/,
        },
      ];
      for (const rule of rules) {
        if (rule.regex.test(ua)) {
          return rule.type;
        }
      }
      const uaData = navigator.userAgentData;
      const platform = uaData?.platform?.toLowerCase() || '';
      if (uaData) {
        if (uaData.mobile) {
          return shaka.device.IDevice.DeviceType.MOBILE;
        }
        // Android not mobile, possibly Android TV.
        if (platform.includes('android')) {
          return shaka.device.IDevice.DeviceType.TV;
        }
        return shaka.device.IDevice.DeviceType.DESKTOP;
      }
      return shaka.device.IDevice.DeviceType.DESKTOP;
    });

    /** @private {!shaka.util.Lazy<shaka.device.IDevice.BrowserEngine>} */
    this.browserEngine_ = new shaka.util.Lazy(() => {
      const ua = navigator.userAgent;
      if (navigator.vendor.includes('Apple') &&
          (ua.includes('Version/') || ua.includes('OS/'))) {
        return shaka.device.IDevice.BrowserEngine.WEBKIT;
      }
      if (ua.includes('Edge/')) {
        return shaka.device.IDevice.BrowserEngine.EDGE;
      }
      if (ua.includes('Chrome/')) {
        return shaka.device.IDevice.BrowserEngine.CHROMIUM;
      }
      if (ua.includes('Firefox/')) {
        return shaka.device.IDevice.BrowserEngine.GECKO;
      }
      return shaka.device.IDevice.BrowserEngine.UNKNOWN;
    });
  }

  /**
   * @override
   */
  supportsMediaSource() {
    const mediaSource = window.ManagedMediaSource || window.MediaSource;
    // Browsers that lack a media source implementation will have no reference
    // to |window.MediaSource|. Platforms that we see having problematic media
    // source implementations will have this reference removed via a polyfill.
    if (!mediaSource) {
      return false;
    }

    // Some very old MediaSource implementations didn't have isTypeSupported.
    if (!mediaSource.isTypeSupported) {
      return false;
    }

    return true;
  }

  /**
   * @override
   */
  supportsMediaType(mimeType) {
    const video = shaka.util.Dom.anyMediaElement();
    return video.canPlayType(mimeType) != '';
  }

  /**
   * @override
   */
  supportsMediaCapabilities() {
    return !!navigator.mediaCapabilities;
  }

  /**
   * @override
   */
  getDeviceType() {
    return this.abstractDeviceType_.value();
  }

  /**
   * @override
   */
  getBrowserEngine() {
    return this.browserEngine_.value();
  }

  /**
   * @override
   */
  requiresEncryptionInfoInAllInitSegments(keySystem, contentType) {
    return false;
  }

  /**
   * @override
   */
  requiresClearAndEncryptedInitSegments() {
    return false;
  }

  /**
   * @override
   */
  insertEncryptionDataBeforeClear() {
    return false;
  }

  /**
   * @override
   */
  requiresTfhdFix(contentType) {
    return false;
  }

  /**
   * @override
   */
  requiresEC3InitSegments() {
    return false;
  }

  /**
   * @override
   */
  supportsSequenceMode() {
    return true;
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching() {
    return true;
  }

  /**
   * @override
   */
  supportsServerCertificate() {
    return true;
  }

  /**
   * @override
   */
  seekDelay() {
    return 0;
  }

  /**
   * @override
   */
  detectMaxHardwareResolution() {
    return Promise.resolve({width: Infinity, height: Infinity});
  }

  /**
   * @override
   */
  shouldOverrideDolbyVisionCodecs() {
    return false;
  }

  /**
   * @override
   */
  shouldAvoidUseTextDecoderEncoder() {
    return false;
  }

  /**
   * @override
   */
  adjustConfig(config) {
    const deviceType = this.getDeviceType();
    if (deviceType === shaka.device.IDevice.DeviceType.TV ||
        deviceType === shaka.device.IDevice.DeviceType.CONSOLE ||
        deviceType === shaka.device.IDevice.DeviceType.CAST) {
      config.ads.customPlayheadTracker = true;
      config.ads.skipPlayDetection = true;
      config.ads.supportsMultipleMediaElements = false;
    }
    return config;
  }

  /**
   * @override
   */
  supportsOfflineStorage() {
    return !!window.indexedDB;
  }

  /**
   * @override
   */
  rejectCodecs() {
    return [];
  }

  /**
   * @override
   */
  getHdrLevel(preferHLG) {
    if (window.matchMedia !== undefined &&
        window.matchMedia('(color-gamut: p3)').matches) {
      return preferHLG ? 'HLG' : 'PQ';
    }
    return 'SDR';
  }

  /**
   * @override
   */
  supportsAirPlay() {
    return false;
  }

  /**
   * @override
   */
  misreportAC3UsingDrm() {
    return false;
  }

  /**
   * @override
   */
  returnLittleEndianUsingPlayReady() {
    return false;
  }

  /**
   * @override
   */
  supportsEncryptionSchemePolyfill() {
    return true;
  }

  /**
   * @override
   */
  misreportsSupportForPersistentLicenses() {
    return false;
  }

  /**
   * @override
   */
  supportStandardVP9Checking() {
    return true;
  }

  /**
   * @override
   */
  createMediaKeysWhenCheckingSupport() {
    return true;
  }

  /**
   * @override
   */
  disableHEVCSupport() {
    return false;
  }

  /**
   * @override
   */
  supportsCbcsWithoutEncryptionSchemeSupport() {
    return false;
  }

  /**
   * @override
   */
  needWaitForEncryptedEvent(keySystem) {
    return keySystem === 'com.apple.fps';
  }

  /**
   * @override
   */
  toString() {
    return `Device: ${this.getDeviceName()} v${this.getVersion()}; ` +
        `Type: ${this.getDeviceType()}`;
  }
};
