/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.Xbox');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');


/**
 * @final
 */
shaka.device.Xbox = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {boolean} */
    this.isLegacyEdge_ = navigator.userAgent.includes('Edge/');

    // Looking for something like "Edg/106.0.0.0".
    const match = navigator.userAgent.match(/Edge?\/(\d+)/);

    /** @private {?number} */
    this.version_ = match ? parseInt(match[1], /* base= */ 10) : null;
  }

  /**
   * @override
   */
  getVersion() {
    return this.version_;
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Xbox';
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
    return this.isLegacyEdge_ ? shaka.device.IDevice.BrowserEngine.EDGE :
        shaka.device.IDevice.BrowserEngine.CHROMIUM;
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
  insertEncryptionDataBeforeClear() {
    return true;
  }

  /**
   * @override
   */
  shouldOverrideDolbyVisionCodecs() {
    return this.isLegacyEdge_;
  }

  /**
   * @override
   */
  detectMaxHardwareResolution() {
    const maxResolution = {width: 1920, height: 1080};
    const winRT = shaka.device.Xbox.getWinRT_();

    if (winRT) {
      try {
        const protectionCapabilities =
            new winRT.Media.Protection.ProtectionCapabilities();
        const protectionResult =
            winRT.Media.Protection.ProtectionCapabilityResult;
        // isTypeSupported may return "maybe", which means the operation
        // is not completed. This means we need to retry
        // https://learn.microsoft.com/en-us/uwp/api/windows.media.protection.protectioncapabilityresult?view=winrt-22621
        let result = null;
        const type =
            'video/mp4;codecs="hvc1,mp4a";features="decode-res-x=3840,' +
            'decode-res-y=2160,decode-bitrate=20000,decode-fps=30,' +
            'decode-bpc=10,display-res-x=3840,display-res-y=2160,' +
            'display-bpc=8"';
        const keySystem = 'com.microsoft.playready.recommendation';
        do {
          result = protectionCapabilities.isTypeSupported(type, keySystem);
        } while (result === protectionResult.maybe);
        if (result === protectionResult.probably) {
          maxResolution.width = 3840;
          maxResolution.height = 2160;
        }
      } catch (e) {
        shaka.log.alwaysWarn('Xbox: Error detecting screen size, default ' +
            'screen size 1920x1080.');
      }
    }

    return Promise.resolve(maxResolution);
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);

    // The Xbox One browser does not detect DRM key changes signalled by a
    // change in the PSSH in media segments. We need to parse PSSH from media
    // segments to detect key changes.
    config.drm.parseInbandPsshEnabled = this.isLegacyEdge_;
    // The Xbox only supports the Playready DRM, so it should
    // prefer that key system by default to improve startup performance.
    config.drm.preferredKeySystems.push('com.microsoft.playready');
    if (this.isLegacyEdge_) {
      config.streaming.gapPadding = 0.01;
    }
    return config;
  }

  /**
   * @override
   */
  supportsOfflineStorage() {
    return false;
  }


  /**
   * @return {?WinRT}
   * @private
   */
  static getWinRT_() {
    let winRT = null;
    try {
      // Try to access to WinRT for WebView, if it's not defined,
      // try to access to WinRT for WebView2, if it's not defined either,
      // let it throw.
      if (typeof Windows !== 'undefined') {
        winRT = Windows;
      } else {
        winRT = chrome.webview.hostObjects.sync.Windows;
      }
    } catch (e) {}
    return winRT;
  }

  /**
   * Check if the current platform is an Xbox One.
   *
   * @return {boolean}
   * @private
   */
  static isXbox_() {
    return navigator.userAgent.includes('Xbox One') ||
        shaka.device.Xbox.getWinRT_() !== null;
  }
};

if (shaka.device.Xbox.isXbox_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.Xbox());
}
