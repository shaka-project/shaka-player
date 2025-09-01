/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.WebKitSTB');

goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.util.Lazy');


/**
 * @final
 */
shaka.device.WebKitSTB = class extends shaka.device.AbstractDevice {
  constructor() {
    super();

    /**
     * SkyQ STB
     *
     * @private {!shaka.util.Lazy<boolean>}
     */
    this.isSkyQ_ = new shaka.util.Lazy(() => {
      return navigator.userAgent.includes('DT_STB_BCM') ||
        navigator.userAgent.includes('Sky_STB');
    });

    /**
     * Orange STB
     *
     * @private {!shaka.util.Lazy<boolean>}
     */
    this.isOrange_ = new shaka.util.Lazy(() => {
      return navigator.userAgent.includes('SOPOpenBrowser');
    });

    /** @private {!shaka.util.Lazy<?number>} */
    this.version_ = new shaka.util.Lazy(() => {
      if (navigator.userAgent.includes('DT_STB_BCM')) {
        return 11;
      }
      // This works for iOS Safari and desktop Safari, which contain something
      // like "Version/13.0" indicating the major Safari or iOS version.
      let match = navigator.userAgent.match(/Version\/(\d+)/);
      if (match) {
        return parseInt(match[1], /* base= */ 10);
      }

      // This works for all other browsers on iOS, which contain something like
      // "OS 13_3" indicating the major & minor iOS version.
      match = navigator.userAgent.match(/OS (\d+)(?:_\d+)?/);
      if (match) {
        return parseInt(match[1], /* base= */ 10);
      }

      return null;
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
    return 'WebKit STB';
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
  supportsSequenceMode() {
    // See: https://bugs.webkit.org/show_bug.cgi?id=210341
    const version = this.version_.value();
    return version !== null ? version >= 15 : true;
  }

  /**
   * @override
   */
  requiresEncryptionInfoInAllInitSegments(keySystem) {
    return this.isOrange_.value();
  }

  /**
   * @override
   */
  detectMaxHardwareResolution() {
    const maxResolution = {
      width: window.screen.width * window.devicePixelRatio,
      height: window.screen.height * window.devicePixelRatio,
    };
    return Promise.resolve(maxResolution);
  }

  /**
   * @override
   */
  supportsEncryptionSchemePolyfill() {
    return !this.isSkyQ_.value();
  }

  /**
   * @override
   */
  supportsContainerChangeType() {
    return false;
  }

  /**
   * @return {boolean}
   * @private
   */
  static isWebkitSTB_() {
    if (navigator.userAgent.includes('SOPOpenBrowser')) {
      return true;
    }
    if (navigator.userAgent.includes('DT_STB_BCM') ||
        navigator.userAgent.includes('Sky_STB')) {
      return true;
    }
    if (!(navigator.vendor || '').includes('Apple')) {
      return false;
    }
    if (/(?:iPhone|iPad|iPod)/.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 1) {
      return false;
    }
    if (navigator.userAgentData && navigator.userAgentData.platform &&
        navigator.userAgentData.platform.toLowerCase() == 'macos') {
      return false;
    } else if (navigator.platform &&
        navigator.platform.toLowerCase().includes('mac')) {
      return false;
    }
    return true;
  }
};

if (shaka.device.WebKitSTB.isWebkitSTB_()) {
  shaka.device.DeviceFactory.registerDeviceFactory(
      () => new shaka.device.WebKitSTB());
}
