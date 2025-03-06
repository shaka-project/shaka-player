/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.AbstractDevice');

goog.require('shaka.device.IDevice');
goog.require('shaka.util.Platform');
goog.require('shaka.util.Lazy');


/**
 * @abstract
 * @implements {shaka.device.IDevice}
 */
shaka.device.AbstractDevice = class {
  constructor() {
    /** @private {!shaka.util.Lazy<!shaka.device.IDevice.DeviceType>} */
    this.abstractDeviceType_ = new shaka.util.Lazy(() => {
      if (navigator.userAgentData) {
        if (navigator.userAgentData.mobile) {
          return shaka.device.IDevice.DeviceType.MOBILE;
        } else {
          return shaka.device.IDevice.DeviceType.DESKTOP;
        }
      }
      if (/(?:iPhone|iPad|iPod)/.test(navigator.userAgent)) {
        return shaka.device.IDevice.DeviceType.MOBILE;
      }
      if (navigator.userAgentData && navigator.userAgentData.platform) {
        if (navigator.userAgentData.platform.toLowerCase() == 'android') {
          return shaka.device.IDevice.DeviceType.MOBILE;
        } else {
          return shaka.device.IDevice.DeviceType.DESKTOP;
        }
      }
      if (navigator.userAgent.includes('Android')) {
        return shaka.device.IDevice.DeviceType.MOBILE;
      }
      return shaka.device.IDevice.DeviceType.DESKTOP;
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
    const video = shaka.util.Platform.anyMediaElement();
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
  requiresEncryptionInfoInAllInitSegments(keySystem) {
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
  isSeekingSlow() {
    return false;
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
  adjustConfig(config) {
    return config;
  }

  /**
   * @override
   */
  toString() {
    return `Device: ${this.getDeviceName()} v${this.getVersion()}; ` +
        `Type: ${this.getDeviceType()}`;
  }
};
