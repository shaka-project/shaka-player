/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Platform');

goog.require('shaka.drm.DrmUtils');
goog.require('shaka.log');
goog.require('shaka.util.Timer');


/**
 * A wrapper for platform-specific functions.
 *
 * @final
 */
shaka.util.Platform = class {
  /**
   * Check if the current platform supports media source. We assume that if
   * the current platform supports media source, then we can use media source
   * as per its design.
   *
   * @return {boolean}
   */
  static supportsMediaSource() {
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
   * Returns true if the media type is supported natively by the platform.
   *
   * @param {string} mimeType
   * @return {boolean}
   */
  static supportsMediaType(mimeType) {
    const video = shaka.util.Platform.anyMediaElement();
    return video.canPlayType(mimeType) != '';
  }

  /**
   * Check if the current platform is MS Edge.
   *
   * @return {boolean}
   */
  static isEdge() {
    // Legacy Edge contains "Edge/version".
    // Chromium-based Edge contains "Edg/version" (no "e").
    if (navigator.userAgent.match(/Edge?\//)) {
      return true;
    }

    return false;
  }

  /**
   * Check if the current platform is Legacy Edge.
   *
   * @return {boolean}
   */
  static isLegacyEdge() {
    // Legacy Edge contains "Edge/version".
    // Chromium-based Edge contains "Edg/version" (no "e").
    if (navigator.userAgent.match(/Edge\//)) {
      return true;
    }

    return false;
  }

  /**
   * Check if the current platform is MS IE.
   *
   * @return {boolean}
   */
  static isIE() {
    return shaka.util.Platform.userAgentContains_('Trident/');
  }

  /**
   * Check if the current platform is an Xbox One.
   *
   * @return {boolean}
   */
  static isXboxOne() {
    return shaka.util.Platform.userAgentContains_('Xbox One');
  }

  /**
   * Check if the current platform is a Tizen TV.
   *
   * @return {boolean}
   */
  static isTizen() {
    return shaka.util.Platform.userAgentContains_('Tizen');
  }

  /**
   * Check if the current platform is a Tizen 6 TV.
   *
   * @return {boolean}
   */
  static isTizen6() {
    return shaka.util.Platform.userAgentContains_('Tizen 6');
  }

  /**
   * Check if the current platform is a Tizen 5.0 TV.
   *
   * @return {boolean}
   */
  static isTizen5_0() {
    return shaka.util.Platform.userAgentContains_('Tizen 5.0');
  }

  /**
   * Check if the current platform is a Tizen 5 TV.
   *
   * @return {boolean}
   */
  static isTizen5() {
    return shaka.util.Platform.userAgentContains_('Tizen 5');
  }

  /**
   * Check if the current platform is a Tizen 4 TV.
   *
   * @return {boolean}
   */
  static isTizen4() {
    return shaka.util.Platform.userAgentContains_('Tizen 4');
  }

  /**
   * Check if the current platform is a Tizen 3 TV.
   *
   * @return {boolean}
   */
  static isTizen3() {
    return shaka.util.Platform.userAgentContains_('Tizen 3');
  }

  /**
   * Check if the current platform is a Tizen 2 TV.
   *
   * @return {boolean}
   */
  static isTizen2() {
    return shaka.util.Platform.userAgentContains_('Tizen 2');
  }

  /**
   * Check if the current platform is a WebOS.
   *
   * @return {boolean}
   */
  static isWebOS() {
    return shaka.util.Platform.userAgentContains_('Web0S');
  }

  /**
   * Check if the current platform is a WebOS 3.
   *
   * @return {boolean}
   */
  static isWebOS3() {
    // See: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine#useragent-string
    return shaka.util.Platform.isWebOS() &&
        shaka.util.Platform.chromeVersion() === 38;
  }

  /**
   * Check if the current platform is a WebOS 4.
   *
   * @return {boolean}
   */
  static isWebOS4() {
    // See: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine#useragent-string
    return shaka.util.Platform.isWebOS() &&
        shaka.util.Platform.chromeVersion() === 53;
  }

  /**
   * Check if the current platform is a WebOS 5.
   *
   * @return {boolean}
   */
  static isWebOS5() {
    // See: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine#useragent-string
    return shaka.util.Platform.isWebOS() &&
        shaka.util.Platform.chromeVersion() === 68;
  }

  /**
   * Check if the current platform is a WebOS 6.
   *
   * @return {boolean}
   */
  static isWebOS6() {
    // See: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine#useragent-string
    return shaka.util.Platform.isWebOS() &&
        shaka.util.Platform.chromeVersion() === 79;
  }

  /**
   * Check if the current platform is a Google Chromecast.
   *
   * @return {boolean}
   */
  static isChromecast() {
    const Platform = shaka.util.Platform;
    return Platform.userAgentContains_('CrKey') && !Platform.isVizio();
  }

  /**
   * Check if the current platform is a Google Chromecast without
   * Android or Fuchsia.
   *
   * @return {boolean}
   */
  static isOlderChromecast() {
    const Platform = shaka.util.Platform;
    return Platform.isChromecast() &&
        !Platform.isAndroid() && !Platform.isFuchsia();
  }

  /**
   * Check if the current platform is a Google Chromecast with Android
   * (i.e. Chromecast with GoogleTV).
   *
   * @return {boolean}
   */
  static isAndroidCastDevice() {
    const Platform = shaka.util.Platform;
    return Platform.isChromecast() && Platform.isAndroid();
  }

  /**
   * Check if the current platform is a Google Chromecast with Fuchsia
   * (i.e. Google Nest Hub).
   *
   * @return {boolean}
   */
  static isFuchsiaCastDevice() {
    const Platform = shaka.util.Platform;
    return Platform.isChromecast() && Platform.isFuchsia();
  }

  /**
   * Returns a major version number for Chrome, or Chromium-based browsers.
   *
   * For example:
   *   - Chrome 106.0.5249.61 returns 106.
   *   - Edge 106.0.1370.34 returns 106 (since this is based on Chromium).
   *   - Safari returns null (since this is independent of Chromium).
   *
   * @return {?number} A major version number or null if not Chromium-based.
   */
  static chromeVersion() {
    if (!shaka.util.Platform.isChrome()) {
      return null;
    }

    // Looking for something like "Chrome/106.0.0.0".
    const match = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (match) {
      return parseInt(match[1], /* base= */ 10);
    }

    return null;
  }

  /**
   * Check if the current platform is Google Chrome.
   *
   * @return {boolean}
   */
  static isChrome() {
    // The Edge Legacy user agent will also contain the "Chrome" keyword, so we
    // need to make sure this is not Edge Legacy.
    return shaka.util.Platform.userAgentContains_('Chrome') &&
           !shaka.util.Platform.isLegacyEdge();
  }

  /**
   * Check if the current platform is Firefox.
   *
   * @return {boolean}
   */
  static isFirefox() {
    return shaka.util.Platform.userAgentContains_('Firefox');
  }

  /**
   * Check if the current platform is from Apple.
   *
   * Returns true on all iOS browsers and on desktop Safari.
   *
   * Returns false for non-Safari browsers on macOS, which are independent of
   * Apple.
   *
   * @return {boolean}
   */
  static isApple() {
    return shaka.util.Platform.isAppleVendor_() &&
        (shaka.util.Platform.isMac() || shaka.util.Platform.isIOS());
  }

  /**
   * Check if the current platform is Playstation 5.
   *
   * Returns true on Playstation 5 browsers.
   *
   * Returns false for Playstation 5 browsers
   *
   * @return {boolean}
   */
  static isPS5() {
    return shaka.util.Platform.userAgentContains_('PlayStation 5');
  }

  /**
   * Check if the current platform is Playstation 4.
   * @return {boolean}
   */
  static isPS4() {
    return shaka.util.Platform.userAgentContains_('PlayStation 4');
  }

  /**
   * Check if the current platform is Hisense.
   * @return {boolean}
   */
  static isHisense() {
    return shaka.util.Platform.userAgentContains_('Hisense') ||
        shaka.util.Platform.userAgentContains_('VIDAA');
  }

  /**
   * Check if the current platform is Vizio TV.
   * @return {boolean}
   */
  static isVizio() {
    return shaka.util.Platform.userAgentContains_('VIZIO SmartCast');
  }

  /**
   * Check if the current platform is Orange.
   * @return {boolean}
   */
  static isOrange() {
    return shaka.util.Platform.userAgentContains_('SOPOpenBrowser');
  }

  /**
   * Check if the current platform is SkyQ STB.
   * @return {boolean}
   */
  static isSkyQ() {
    return shaka.util.Platform.userAgentContains_('Sky_STB');
  }

  /**
   * Check if the current platform is Deutsche Telecom Zenterio STB.
   * @return {boolean}
   */
  static isZenterio() {
    return shaka.util.Platform.userAgentContains_('DT_STB_BCM');
  }

  /**
   * Returns a major version number for Safari, or Webkit-based STBs,
   * or Safari-based iOS browsers.
   *
   * For example:
   *   - Safari 13.0.4 on macOS returns 13.
   *   - Safari on iOS 13.3.1 returns 13.
   *   - Chrome on iOS 13.3.1 returns 13 (since this is based on Safari/WebKit).
   *   - Chrome on macOS returns null (since this is independent of Apple).
   *
   * Returns null on Firefox on iOS, where this version information is not
   * available.
   *
   * @return {?number} A major version number or null if not iOS.
   */
  static safariVersion() {
    // All iOS browsers and desktop Safari will return true for isApple().
    if (!shaka.util.Platform.isApple() && !shaka.util.Platform.isWebkitSTB()) {
      return null;
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
  }

  /**
   * Guesses if the platform is an Apple mobile one (iOS, iPad, iPod).
   * @return {boolean}
   */
  static isIOS() {
    if (/(?:iPhone|iPad|iPod)/.test(navigator.userAgent)) {
      // This is Android, iOS, or iPad < 13.
      return true;
    }

    // Starting with iOS 13 on iPad, the user agent string no longer has the
    // word "iPad" in it.  It looks very similar to desktop Safari.  This seems
    // to be intentional on Apple's part.
    // See: https://forums.developer.apple.com/thread/119186
    //
    // So if it's an Apple device with multi-touch support, assume it's a mobile
    // device.  If some future iOS version starts masking their user agent on
    // both iPhone & iPad, this clause should still work.  If a future
    // multi-touch desktop Mac is released, this will need some adjustment.
    //
    // As of January 2020, this is mainly used to adjust the default UI config
    // for mobile devices, so it's low risk if something changes to break this
    // detection.
    return shaka.util.Platform.isAppleVendor_() && navigator.maxTouchPoints > 1;
  }

  /**
   * Guesses if the platform is a mobile one.
   * @return {boolean}
   */
  static isMobile() {
    if (navigator.userAgentData) {
      return navigator.userAgentData.mobile;
    }
    return shaka.util.Platform.isIOS() || shaka.util.Platform.isAndroid();
  }

  /**
   * Return true if the platform is a Mac, regardless of the browser.
   *
   * @return {boolean}
   */
  static isMac() {
    // Try the newer standard first.
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase() == 'macos';
    }
    // Fall back to the old API, with less strict matching.
    if (!navigator.platform) {
      return false;
    }
    return navigator.platform.toLowerCase().includes('mac');
  }

  /**
   * Return true if the platform is a VisionOS.
   *
   * @return {boolean}
   */
  static isVisionOS() {
    if (!shaka.util.Platform.isMac()) {
      return false;
    }
    if (!('xr' in navigator)) {
      return false;
    }
    return true;
  }

  /**
   * Checks is non-Apple STB based on Webkit.
   * @return {boolean}
   */
  static isWebkitSTB() {
    return shaka.util.Platform.isAppleVendor_() &&
        !shaka.util.Platform.isApple();
  }

  /**
   * Return true if the platform is a Windows, regardless of the browser.
   *
   * @return {boolean}
   */
  static isWindows() {
    // Try the newer standard first.
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase() == 'windows';
    }
    // Fall back to the old API, with less strict matching.
    if (!navigator.platform) {
      return false;
    }
    return navigator.platform.toLowerCase().includes('win32');
  }

  /**
   * Return true if the platform is a Android, regardless of the browser.
   *
   * @return {boolean}
   */
  static isAndroid() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase() == 'android';
    }
    return shaka.util.Platform.userAgentContains_('Android');
  }

  /**
   * Return true if the platform is a Fuchsia, regardless of the browser.
   *
   * @return {boolean}
   */
  static isFuchsia() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase() == 'fuchsia';
    }
    return shaka.util.Platform.userAgentContains_('Fuchsia');
  }

  /**
   * Return true if the platform is controlled by a remote control.
   *
   * @return {boolean}
   */
  static isSmartTV() {
    const Platform = shaka.util.Platform;
    if (Platform.isTizen() || Platform.isWebOS() ||
        Platform.isXboxOne() || Platform.isPS4() ||
        Platform.isPS5() || Platform.isChromecast() ||
        Platform.isHisense() || Platform.isVizio() ||
        Platform.isWebkitSTB()) {
      return true;
    }
    return false;
  }

  /**
   * Check if the user agent contains a key. This is the best way we know of
   * right now to detect platforms. If there is a better way, please send a
   * PR.
   *
   * @param {string} key
   * @return {boolean}
   * @private
   */
  static userAgentContains_(key) {
    const userAgent = navigator.userAgent || '';
    return userAgent.includes(key);
  }

  /**
   * @return {boolean}
   * @private
   */
  static isAppleVendor_() {
    return (navigator.vendor || '').includes('Apple');
  }

  /**
   * For canPlayType queries, we just need any instance.
   *
   * First, use a cached element from a previous query.
   * Second, search the page for one.
   * Third, create a temporary one.
   *
   * Cached elements expire in one second so that they can be GC'd or removed.
   *
   * @return {!HTMLMediaElement}
   */
  static anyMediaElement() {
    const Platform = shaka.util.Platform;
    if (Platform.cachedMediaElement_) {
      return Platform.cachedMediaElement_;
    }

    if (!Platform.cacheExpirationTimer_) {
      Platform.cacheExpirationTimer_ = new shaka.util.Timer(() => {
        Platform.cachedMediaElement_ = null;
      });
    }

    Platform.cachedMediaElement_ = /** @type {HTMLMediaElement} */(
      document.getElementsByTagName('video')[0] ||
      document.getElementsByTagName('audio')[0]);

    if (!Platform.cachedMediaElement_) {
      Platform.cachedMediaElement_ = /** @type {!HTMLMediaElement} */(
        document.createElement('video'));
    }

    Platform.cacheExpirationTimer_.tickAfter(/* seconds= */ 1);
    return Platform.cachedMediaElement_;
  }

  /**
   * Returns true if the platform requires encryption information in all init
   * segments.  For such platforms, MediaSourceEngine will attempt to work
   * around a lack of such info by inserting fake encryption information into
   * initialization segments.
   *
   * @param {?string} keySystem
   * @return {boolean}
   * @see https://github.com/shaka-project/shaka-player/issues/2759
   */
  static requiresEncryptionInfoInAllInitSegments(keySystem) {
    const Platform = shaka.util.Platform;
    const isPlayReady = shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem);
    return Platform.isTizen() || Platform.isXboxOne() || Platform.isOrange() ||
      (Platform.isEdge() && Platform.isWindows() && isPlayReady);
  }

  /**
   * Returns true if the platform requires AC-3 signalling in init
   * segments to be replaced with EC-3 signalling.
   * For such platforms, MediaSourceEngine will attempt to work
   * around it by inserting fake EC-3 signalling into
   * initialization segments.
   *
   * @return {boolean}
   */
  static requiresEC3InitSegments() {
    return shaka.util.Platform.isTizen3();
  }

  /**
   * Returns true if the platform supports SourceBuffer "sequence mode".
   *
   * @return {boolean}
   */
  static supportsSequenceMode() {
    const Platform = shaka.util.Platform;
    if (Platform.isTizen3() || Platform.isTizen2() ||
        Platform.isWebOS3() || Platform.isPS4() || Platform.isPS5()) {
      return false;
    }
    // See: https://bugs.webkit.org/show_bug.cgi?id=210341
    const safariVersion = Platform.safariVersion();
    if (Platform.isWebkitSTB() && safariVersion != null && safariVersion < 15) {
      return false;
    }
    return true;
  }

  /**
   * Returns if codec switching SMOOTH is known reliable device support.
   *
   * Some devices are known not to support <code>SourceBuffer.changeType</code>
   * well. These devices should use the reload strategy. If a device
   * reports that it supports <code<changeType</code> but supports it unreliably
   * it should be disallowed in this method.
   *
   * @return {boolean}
   */
  static supportsSmoothCodecSwitching() {
    const Platform = shaka.util.Platform;
    // All Tizen versions (up to Tizen 8) do not support SMOOTH so far.
    // webOS seems to support SMOOTH from webOS 22.
    if (Platform.isTizen() || Platform.isPS4() || Platform.isPS5() ||
        Platform.isWebOS6()) {
      return false;
    }
    // Older chromecasts without GoogleTV seem to not support SMOOTH properly.
    if (Platform.isOlderChromecast()) {
      return false;
    }
    // See: https://chromium-review.googlesource.com/c/chromium/src/+/4577759
    if (Platform.isWindows() && Platform.isEdge()) {
      return false;
    }
    return true;
  }

  /**
   * On some platforms, such as v1 Chromecasts, the act of seeking can take a
   * significant amount of time.
   *
   * @return {boolean}
   */
  static isSeekingSlow() {
    const Platform = shaka.util.Platform;
    if (Platform.isChromecast()) {
      if (Platform.isAndroidCastDevice()) {
        // Android-based Chromecasts are new enough to not be a problem.
        return false;
      } else {
        return true;
      }
    }
    return false;
  }


  /**
   * Detect the maximum resolution that the platform's hardware can handle.
   *
   * @return {!Promise<shaka.extern.Resolution>}
   */
  static async detectMaxHardwareResolution() {
    const Platform = shaka.util.Platform;

    /** @type {shaka.extern.Resolution} */
    const maxResolution = {
      width: Infinity,
      height: Infinity,
    };

    if (Platform.isChromecast()) {
      // In our tests, the original Chromecast seems to have trouble decoding
      // above 1080p. It would be a waste to select a higher res anyway, given
      // that the device only outputs 1080p to begin with.
      // Chromecast has an extension to query the device/display's resolution.
      const hasCanDisplayType = window.cast && cast.__platform__ &&
          cast.__platform__.canDisplayType;

      // Some hub devices can only do 720p. Default to that.
      maxResolution.width = 1280;
      maxResolution.height = 720;

      try {
        if (hasCanDisplayType && await cast.__platform__.canDisplayType(
            'video/mp4; codecs="avc1.640028"; width=3840; height=2160')) {
          // The device and display can both do 4k. Assume a 4k limit.
          maxResolution.width = 3840;
          maxResolution.height = 2160;
        } else if (hasCanDisplayType && await cast.__platform__.canDisplayType(
            'video/mp4; codecs="avc1.640028"; width=1920; height=1080')) {
          // Most Chromecasts can do 1080p.
          maxResolution.width = 1920;
          maxResolution.height = 1080;
        }
      } catch (error) {
        // This shouldn't generally happen. Log the error.
        shaka.log.alwaysError('Failed to check canDisplayType:', error);
        // Now ignore the error and let the 720p default stand.
      }
    } else if (Platform.isTizen()) {
      const devicePixelRatio = window.devicePixelRatio;
      maxResolution.width = window.screen.width * devicePixelRatio > 1920 ?
          3840 : 1920;
      maxResolution.height = window.screen.height * devicePixelRatio > 1080 ?
          2160 : 1080;
      try {
        if (webapis.systeminfo && webapis.systeminfo.getMaxVideoResolution) {
          const maxVideoResolution =
              webapis.systeminfo.getMaxVideoResolution();
          maxResolution.width = maxVideoResolution.width;
          maxResolution.height = maxVideoResolution.height;
        } else {
          if (webapis.productinfo.is8KPanelSupported &&
              webapis.productinfo.is8KPanelSupported()) {
            maxResolution.width = 7680;
            maxResolution.height = 4320;
          } else if (webapis.productinfo.isUdPanelSupported &&
              webapis.productinfo.isUdPanelSupported()) {
            maxResolution.width = 3840;
            maxResolution.height = 2160;
          }
        }
      } catch (e) {
        shaka.log.alwaysWarn('Tizen: Error detecting screen size, default ' +
            'screen size 1920x1080.');
      }
    } else if (Platform.isWebOS()) {
      try {
        const deviceInfo =
        /** @type {{screenWidth: number, screenHeight: number}} */(
            JSON.parse(window.PalmSystem.deviceInfo));
        // WebOS has always been able to do 1080p.  Assume a 1080p limit.
        maxResolution.width = Math.max(1920, deviceInfo['screenWidth']);
        maxResolution.height = Math.max(1080, deviceInfo['screenHeight']);
      } catch (e) {
        shaka.log.alwaysWarn('WebOS: Error detecting screen size, default ' +
            'screen size 1920x1080.');
        maxResolution.width = 1920;
        maxResolution.height = 1080;
      }
    } else if (Platform.isHisense()) {
      let supports4k = null;
      if (window.Hisense_Get4KSupportState) {
        try {
          // eslint-disable-next-line new-cap
          supports4k = window.Hisense_Get4KSupportState();
        } catch (e) {
          shaka.log.debug('Hisense: Failed to get 4K support state', e);
        }
      }
      if (supports4k == null) {
        // If API is not there or not working for whatever reason, fallback to
        // user agent check, as it contains UHD or FHD info.
        supports4k = Platform.userAgentContains_('UHD');
      }
      if (supports4k) {
        maxResolution.width = 3840;
        maxResolution.height = 2160;
      } else {
        maxResolution.width = 1920;
        maxResolution.height = 1080;
      }
    } else if (Platform.isPS4() || Platform.isPS5()) {
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
      } else {
        maxResolution.width = 1920;
        maxResolution.height = 1080;
      }
    } else {
      // For Xbox and UWP apps.
      let winRT = undefined;
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
      if (winRT) {
        maxResolution.width = 1920;
        maxResolution.height = 1080;
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
      } else if (Platform.isXboxOne()) {
        maxResolution.width = 1920;
        maxResolution.height = 1080;
        shaka.log.alwaysWarn('Xbox: Error detecting screen size, default ' +
            'screen size 1920x1080.');
      }
    }
    return maxResolution;
  }
};

/** @private {shaka.util.Timer} */
shaka.util.Platform.cacheExpirationTimer_ = null;

/** @private {HTMLMediaElement} */
shaka.util.Platform.cachedMediaElement_ = null;
