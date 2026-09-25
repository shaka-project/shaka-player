/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.AppleBrowser');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.AppleBrowser = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /** @private {!shaka.util.Lazy<!Array<number>>} */
    this.version_ = new shaka.util.Lazy(() => {
      // This works for iOS Safari and desktop Safari, which contain something
      // like "Version/13.0" indicating the major.minor Safari or iOS version.
      let match = navigator.userAgent.match(/Version\/(\d+)(?:\.(\d+))?/);
      if (!match) {
        // This works for all other browsers on iOS, which contain something
        // like "OS 13_3" indicating the major & minor iOS version.
        match = navigator.userAgent.match(/OS (\d+)(?:_(\d+))?/);
      }
      if (match) {
        return [parseInt(match[1], 10), parseInt(match[2] || '0', 10)];
      }
      return [0, 0];
    });

    /** @private {!shaka.util.Lazy<!shaka.device.IDevice.DeviceType>} */
    this.deviceType_ = new shaka.util.Lazy(() => {
      if (/(?:iPhone|iPad|iPod)/.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 1) {
        if ('xr' in navigator) {
          return shaka.device.IDevice.DeviceType.APPLE_VR;
        }
        return shaka.device.IDevice.DeviceType.MOBILE;
      }
      if ('xr' in navigator) {
        return shaka.device.IDevice.DeviceType.APPLE_VR;
      }
      return shaka.device.IDevice.DeviceType.DESKTOP;
    });
  }

  /**
   * @override
   */
  getVersion() {
    return this.version_.value()[0];
  }

  /**
   * @override
   */
  getDeviceName() {
    return 'Apple Browser';
  }

  /**
   * @override
   */
  getDeviceType() {
    return this.deviceType_.value();
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
  supportsMediaCapabilities() {
    return false;
  }

  /**
   * @override
   */
  requiresEncryptionInfoInAllInitSegments(keySystem, contentType) {
    return !this.supportsMixedClearEncryptedContent_() &&
      contentType === 'audio';
  }

  /**
   * @override
   */
  insertEncryptionDataBeforeClear() {
    return !this.supportsMixedClearEncryptedContent_();
  }

  /**
   * @override
   */
  requiresTfhdFix(contentType) {
    return !this.supportsMixedClearEncryptedContent_() &&
      contentType === 'audio';
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);
    config.abr.minTimeToSwitch = 0.5;
    // With a non-zero tolerance, the first segment fetched after a buffer
    // clear can lie entirely before the playhead.  Safari then plays through
    // that segment from its start before resuming at the playhead, even with
    // the playhead nudge, so the tolerance is set to zero here.
    config.streaming.inaccurateManifestTolerance = 0;
    return config;
  }

  /**
   * @override
   */
  supportsAirPlay() {
    return true;
  }

  /**
   * @override
   */
  supportsContainerChangeType() {
    return false;
  }

  /**
   * @override
   */
  hasWorkingClearKeySupport() {
    return false;
  }

  /**
   * @override
   */
  requiresPlayheadNudgeAfterBufferClear() {
    // After the buffer is cleared on a quality switch, Safari presents the
    // new content from the start of the appended data instead of from the
    // playhead, so playback jumps back and fast-forwards.  Nudging the
    // playhead once the buffer is empty makes it resume at the playhead, as
    // long as the first segment appended afterwards contains the playhead
    // (see adjustConfig).
    return true;
  }

  /**
   * Apple has fixed the mixed clear/encrypted content issue in Safari 26.4
   * @return {boolean}
   * @private
   */
  supportsMixedClearEncryptedContent_() {
    const version = this.version_.value();
    if (version[0] >= 27) {
      return true;
    }
    return version[0] === 26 && version[1] >= 4;
  }

  /**
   * @return {boolean}
   * @private
   */
  static isAppleBrowser_() {
    if (!(navigator.vendor || '').includes('Apple')) {
      return false;
    }
    if (/(?:iPhone|iPad|iPod)/.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 1) {
      return true;
    }
    if (navigator.userAgentData && navigator.userAgentData.platform &&
        navigator.userAgentData.platform.toLowerCase() == 'macos') {
      return true;
    } else if (navigator.platform &&
        navigator.platform.toLowerCase().includes('mac')) {
      return true;
    }
    return false;
  }
};

if (shaka.device.AppleBrowser.isAppleBrowser_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.AppleBrowser());
}
