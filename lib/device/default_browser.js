/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.DefaultBrowser');

goog.require('shaka.debug.RunningInLab');
goog.require('shaka.device.AbstractDevice');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
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
      // Check Edge before Chrome.  Chromium-based Edge reports both, as in
      // "Chrome/150.0.0.0 ... Edg/150.0.0.0", and Chrome's comes first, so
      // matching Chrome would report the Chromium version rather than the
      // browser's own.  They usually agree, but they are not the same number
      // and callers asking an Edge device for its version mean Edge's.
      // Matches legacy "Edge/18" and Chromium-based "Edg/150" alike.
      const edge = navigator.userAgent.match(/Edge?\/(\d+)/);
      if (edge) {
        return parseInt(edge[1], /* base= */ 10);
      }

      // Opera reports both as well, as in "Chrome/140.0.0.0 ... OPR/125.0",
      // and for the same reason, its own version is the one to report.
      const opera = navigator.userAgent.match(/OPR\/(\d+)/);
      if (opera) {
        return parseInt(opera[1], /* base= */ 10);
      }

      // Looking for something like "Chrome/106.0.0.0" or Firefox/135.0
      const match = navigator.userAgent.match(/(Chrome|Firefox)\/(\d+)/);
      if (match) {
        return parseInt(match[2], /* base= */ 10);
      }

      return null;
    });

    /** @private {!shaka.util.Lazy<string>} */
    this.deviceName_ = new shaka.util.Lazy(() => {
      // Legacy Edge contains "Edge/version".
      // Chromium-based Edge contains "Edg/version" (no "e").
      if (navigator.userAgent.match(/Edge?\//)) {
        return 'Edge';
      } else if (navigator.userAgent.includes('OPR/')) {
        // Opera is Chromium and says "Chrome" too, so it has to be checked
        // first, the same way Edge is.
        return 'Opera';
      } else if (navigator.userAgent.includes('Chrome')) {
        return 'Chrome';
      } else if (navigator.userAgent.includes('Firefox')) {
        return 'Firefox';
      }
      return 'Unknown';
    });

    /** @private {!shaka.util.Lazy<boolean>} */
    this.isMac_ = new shaka.util.Lazy(() => {
      // Try the newer standard first.
      if (navigator.userAgentData && navigator.userAgentData.platform) {
        return navigator.userAgentData.platform.toLowerCase() == 'macos';
      }
      // Fall back to the old API, with less strict matching.
      if (!navigator.platform) {
        return false;
      }
      return navigator.platform.toLowerCase().includes('mac');
    });

    /** @private {!shaka.util.Lazy<boolean>} */
    this.isWindows_ = new shaka.util.Lazy(() => {
      // Try the newer standard first.
      if (navigator.userAgentData && navigator.userAgentData.platform) {
        return navigator.userAgentData.platform.toLowerCase() == 'windows';
      }
      // Fall back to the old API, with less strict matching.
      if (!navigator.platform) {
        return false;
      }
      return navigator.platform.toLowerCase().includes('win32');
    });

    /** @private {!shaka.util.Lazy<boolean>} */
    this.isSonyTV_ = new shaka.util.Lazy(() => {
      return navigator.userAgent.includes('sony.hbbtv.tv');
    });

    this.isAndroid_ = new shaka.util.Lazy(() => {
      if (navigator.userAgentData && navigator.userAgentData.platform) {
        return navigator.userAgentData.platform.toLowerCase() == 'android';
      }
      if (navigator.userAgent.includes('Android')) {
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
      return this.isWindows_.value();
    }
    return false;
  }

  /**
   * @override
   */
  requiresClearAndEncryptedInitSegments(keySystem) {
    if (shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem) ||
        this.deviceName_.value() === 'Edge') {
      return this.isWindows_.value();
    }
    return false;
  }

  /**
   * @override
   */
  supportsContainerChangeType() {
    // Opera on macOS accepts changeType and then cannot decode across the
    // splice.  Playback of content spliced from VP9 to H.264 in one source
    // buffer stops just before the boundary, with VideoToolbox refusing to
    // create a session for the second format: error -12906 out of
    // VTDecompressionSessionCreate().  It is specific to this pairing, since
    // the same content plays on Opera on Linux and on every other browser on
    // macOS.
    if (this.deviceName_.value() === 'Opera' && this.isMac_.value()) {
      return false;
    }
    return super.supportsContainerChangeType();
  }

  /**
   * @override
   */
  insertEncryptionDataBeforeClear(keySystem) {
    if (shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem) ||
        this.deviceName_.value() === 'Edge') {
      return this.isWindows_.value();
    }
    return false;
  }

  /**
   * @override
   */
  supportsSmoothCodecSwitching(keySystem) {
    if (this.isWindows_.value() &&
        shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem)) {
      return false;
    }
    return super.supportsSmoothCodecSwitching(keySystem);
  }

  /**
   * @override
   */
  adjustConfig(config) {
    super.adjustConfig(config);

    if (this.isWindows_.value()) {
      // Other browsers different than Edge only supports PlayReady with the
      // recommendation keysystem on Windows, so we do a direct mapping here.
      // Firefox supports PlayReady 2000 (SW) and 3000 (HW).
      // Chromium support PlayReady 3000 (HW) only.
      switch (this.deviceName_.value()) {
        case 'Firefox':
          config.drm.keySystemsMapping = {
            'com.microsoft.playready':
              'com.microsoft.playready.recommendation',
          };
          break;
        // Opera is Chromium, and took this branch as "Chrome" before it was
        // named separately.
        case 'Opera':
        case 'Chrome':
          config.drm.keySystemsMapping = {
            'com.microsoft.playready':
              'com.microsoft.playready.recommendation.3000',
            'com.microsoft.playready.recommendation':
              'com.microsoft.playready.recommendation.3000',
          };
          break;
      }
    }
    if (this.isAndroid_.value()) {
      config.drm.defaultAudioRobustnessForWidevine = 'SW_SECURE_CRYPTO';
      config.drm.defaultVideoRobustnessForWidevine = 'SW_SECURE_CRYPTO';
    }
    return config;
  }

  /**
   * @override
   */
  returnLittleEndianUsingPlayReady() {
    return this.deviceName_.value() === 'Edge' || this.isSonyTV_.value();
  }

  /**
   * @override
   */
  createMediaKeysWhenCheckingSupport() {
    if (goog.DEBUG && shaka.debug.RunningInLab && this.isWindows_.value() &&
        this.getBrowserEngine() === shaka.device.IDevice.BrowserEngine.GECKO) {
      return false;
    }
    return true;
  }

  /**
   * @override
   */
  disableHEVCSupport() {
    // It seems that HEVC on Firefox Windows is incomplete.
    return this.isWindows_.value() &&
        this.getBrowserEngine() === shaka.device.IDevice.BrowserEngine.GECKO;
  }

  /**
   * @override
   */
  supportsCbcsWithoutEncryptionSchemeSupport() {
    if (this.getBrowserEngine() === shaka.device.IDevice.BrowserEngine.GECKO) {
      const version = this.getVersion();
      return version !== null ?
          version >= 100 : super.supportsCbcsWithoutEncryptionSchemeSupport();
    }
    return super.supportsCbcsWithoutEncryptionSchemeSupport();
  }

  /**
   * @override
   */
  needWaitForEncryptedEvent(keySystem) {
    if (this.getBrowserEngine() === shaka.device.IDevice.BrowserEngine.GECKO) {
      return shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem);
    }
    return super.needWaitForEncryptedEvent(keySystem);
  }
};

shaka.device.DeviceFactory.registerDefaultDeviceFactory(
    () => new shaka.device.DefaultBrowser());
