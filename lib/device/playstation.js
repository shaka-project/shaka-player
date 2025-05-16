/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.PlayStation');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.PlayStation = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {!shaka.util.Lazy<?number>} */
    this.version_ = new shaka.util.Lazy(() => {
      const match = navigator.userAgent.match(/PlayStation (\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    });
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'PlayStation';
  }

  /**
   * @override
   */
  getDeviceType() {
    return shaka.device.IDevice.DeviceType.CONSOLE;
  }

  /**
   * @override
   */
  getBrowserEngine() {
    return shaka.device.IDevice.BrowserEngine.WEBKIT;
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
  supportsMediaCapabilities() {
    return false;
  }

  /**
   * @override
   */
  supportsSequenceMode() {
    return false;
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
  shouldAvoidUseTextDecoderEncoder() {
    return this.getVersion() === 4;
  }

  /**
   * @override
   */
  async detectMaxHardwareResolution() {
    const maxResolution = {width: 1920, height: 1080};
    let supports4K = false;
    try {
      const result = await window.msdk.device.getDisplayInfo();
      supports4K = result.resolution === '4K';
    } catch (e) {
      try {
        const result = await window.msdk.device.getDisplayInfoImmediate();
        supports4K = result.resolution === '4K';
      } catch (e) {
        shaka.log.alwaysWarn(
            'PlayStation: Failed to get the display info:', e);
      }
    }
    if (supports4K) {
      maxResolution.width = 3840;
      maxResolution.height = 2160;
    }

    return maxResolution;
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);
    // The PS4 only supports the Playready DRM, so it should
    // prefer that key system by default to improve startup performance.
    if (this.getVersion() === 4) {
      config.drm.preferredKeySystems.push('com.microsoft.playready');
    }
    config.streaming.clearDecodingCache = true;
    return config;
  }

  /**
   * @override
   */
  returnLittleEndianUsingPlayReady() {
    return this.getVersion() === 4;
  }

  /**
   * @override
   */
  supportsEncryptionSchemePolyfill() {
    return this.getVersion() !== 4;
  }

  /**
   * @return {boolean}
   * @private
   */
  static isPlayStation_() {
    return navigator.userAgent.includes('PlayStation');
  }
};

if (shaka.device.PlayStation.isPlayStation_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.PlayStation());
}
