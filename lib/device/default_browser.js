/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.DefaultBrowser');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.DefaultBrowser = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {!shaka.util.Lazy<?number>} */
    this.version_ = new shaka.util.Lazy(() => {
      // Looking for something like "Chrome/106.0.0.0" or Firefox/135.0
      const match = navigator.userAgent.match(/Chrome|Firefox\/(\d+)/);
      if (match) {
        return parseInt(match[1], /* base= */ 10);
      }

      return null;
    });

    /** @private {!shaka.util.Lazy<string>} */
    this.deviceName_ = new shaka.util.Lazy(() => {
      // Legacy Edge contains "Edge/version".
      // Chromium-based Edge contains "Edg/version" (no "e").
      if (navigator.userAgent.match(/Edge?\//)) {
        return 'Edge';
      } else if (navigator.userAgent.includes('Chrome')) {
        return 'Chrome';
      } else if (navigator.userAgent.includes('Firefox')) {
        return 'Firefox';
      }
      return 'Unknown';
    });

    /** @private {!shaka.util.Lazy<boolean>} */
    this.supportsSmoothCodecSwitching_ = new shaka.util.Lazy(() => {
      if (!navigator.userAgent.match(/Edge?\//)) {
        return true;
      }
      if (navigator.userAgentData && navigator.userAgentData.platform) {
        return navigator.userAgentData.platform.toLowerCase() != 'windows';
      } else if (navigator.platform &&
          navigator.platform.toLowerCase().includes('win32')) {
        return false;
      }
      return true;
    });

    /** @private {!shaka.util.Lazy<boolean>} */
    this.requiresEncryptionInfoInAllInitSegmentsForPlayReady_ =
      new shaka.util.Lazy(() => {
        if (!navigator.userAgent.match(/Edge?\//)) {
          return false;
        }
        if (navigator.userAgentData && navigator.userAgentData.platform) {
          return navigator.userAgentData.platform.toLowerCase() == 'windows';
        } else if (navigator.platform &&
          navigator.platform.toLowerCase().includes('win32')) {
          return true;
        }
        return false;
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
    return this.deviceName_.value();
  }

  /**
   * @override
   */
  requiresEncryptionInfoInAllInitSegments(keySystem) {
    if (shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem)) {
      return this.requiresEncryptionInfoInAllInitSegmentsForPlayReady_.value();
    }
    return false;
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching() {
    return this.supportsSmoothCodecSwitching_.value();
  }
};

shaka.device.DeviceFactory.registerDefaultDeviceFactory(
    () => new shaka.device.DefaultBrowser());
