/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.DefaultBrowser');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.drm.DrmUtils');


/**
 * @final
 */
shaka.device.DefaultBrowser = class extends shaka.device.AbstractDevice {
  /**
   * @override
   */
  getVersion() {
    // Looking for something like "Chrome/106.0.0.0" or Firefox/135.0
    const match = navigator.userAgent.match(/Chrome|Firefox\/(\d+)/);
    if (match) {
      return parseInt(match[1], /* base= */ 10);
    }

    return null;
  }

  /**
   * @override
   */
  getDeviceName() {
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
  }

  /**
   * @override
   */
  requiresEncryptionInfoInAllInitSegments(keySystem) {
    if (!navigator.userAgent.match(/Edge?\//)) {
      return false;
    }
    if (shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem)) {
      if (navigator.userAgentData && navigator.userAgentData.platform) {
        return navigator.userAgentData.platform.toLowerCase() == 'windows';
      } else if (navigator.platform &&
        navigator.platform.toLowerCase().includes('win32')) {
        return true;
      }
    }
    return false;
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching() {
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
  }
};

shaka.device.DeviceFactory.registerDefaultDeviceFactory(
    () => new shaka.device.DefaultBrowser());
