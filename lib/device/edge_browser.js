/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.EdgeBrowser');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.drm.DrmUtils');


/**
 * @final
 */
shaka.device.EdgeBrowser = class extends shaka.device.AbstractDevice {
  /**
   * @override
   */
  getVersion() {
    // Looking for something like "Edg/106.0.0.0".
    const match = navigator.userAgent.match(/Edg\/(\d+)/);
    if (match) {
      return parseInt(match[1], /* base= */ 10);
    }

    return null;
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Edge';
  }

  /**
   * @override
   */
  requiresEncryptionInfoInAllInitSegments(keySystem) {
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
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase() != 'windows';
    } else if (navigator.platform &&
        navigator.platform.toLowerCase().includes('win32')) {
      return false;
    }
    return true;
  }

  /**
   * @return {boolean}
   * @private
   */
  static isEdgeBrowser_() {
    // Legacy Edge contains "Edge/version".
    // Chromium-based Edge contains "Edg/version" (no "e").
    if (navigator.userAgent.match(/Edge?\//)) {
      return true;
    }
    return false;
  }
};

if (shaka.device.EdgeBrowser.isEdgeBrowser_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.EdgeBrowser());
}
