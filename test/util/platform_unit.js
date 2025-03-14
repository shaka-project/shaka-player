/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Platform', () => {
  const originalUserAgent = navigator.userAgent;
  const originalUserAgentData = navigator.userAgentData;
  const originalVendor = navigator.vendor;
  const originalPlatform = navigator.platform;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  /* eslint-disable max-len */
  const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15';
  const ipadSafari = 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
  const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/56.0.2924.75 Mobile/14E5239e Safari/602.1';
  const webOs6 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
  /* eslint-enable max-len */

  afterEach(() => {
    setUserAgent(originalUserAgent);
    setUserAgentData(originalUserAgentData);
    setVendor(originalVendor);
    setPlatform(originalPlatform);
    setMaxTouchPoints(originalMaxTouchPoints);
  });

  describe('Apple', () => {
    beforeEach(() => {
      setVendor('Apple Computer, Inc.');
      setMaxTouchPoints(0);
    });

    it('checks Safari version', () => {
      setUserAgentData(null);
      setPlatform('MacIntel');
      setUserAgent(macSafari);
      expect(shaka.util.Platform.safariVersion()).toBe(18);
      setUserAgent(ipadSafari);
      expect(shaka.util.Platform.safariVersion()).toBe(18);
      setUserAgent(iosChrome);
      expect(shaka.util.Platform.safariVersion()).toBe(10);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.safariVersion()).toBe(null);

      setVendor('Google Inc.');
      setUserAgent(macSafari);
      expect(shaka.util.Platform.safariVersion()).toBe(null);
      setUserAgent(ipadSafari);
      expect(shaka.util.Platform.safariVersion()).toBe(null);
      setUserAgent(iosChrome);
      expect(shaka.util.Platform.safariVersion()).toBe(null);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.safariVersion()).toBe(null);
    });

    it('checks is iOS', () => {
      setUserAgent(macSafari);
      expect(shaka.util.Platform.isIOS()).toBe(false);
      setUserAgent(ipadSafari);
      expect(shaka.util.Platform.isIOS()).toBe(true);
      setUserAgent(iosChrome);
      expect(shaka.util.Platform.isIOS()).toBe(true);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.isIOS()).toBe(false);
    });

    it('checks is Mac', () => {
      setUserAgentData({platform: 'macOS'});
      expect(shaka.util.Platform.isMac()).toBe(true);

      setUserAgentData(null);
      setPlatform('MacIntel');
      expect(shaka.util.Platform.isMac()).toBe(true);

      setPlatform('Win32');
      expect(shaka.util.Platform.isMac()).toBe(false);
    });

    it('checks is Webkit STB', () => {
      setUserAgent(ipadSafari);
      setUserAgentData({platform: 'macOS'});
      expect(shaka.util.Platform.isWebkitSTB()).toBe(false);

      setUserAgentData(null);
      setPlatform('MacIntel');
      expect(shaka.util.Platform.isWebkitSTB()).toBe(false);

      setPlatform('Win32');
      expect(shaka.util.Platform.isWebkitSTB()).toBe(false);

      setUserAgent(macSafari);
      expect(shaka.util.Platform.isWebkitSTB()).toBe(true);

      setVendor('Google Inc.');
      expect(shaka.util.Platform.isWebkitSTB()).toBe(false);
    });
  });

  /** @param {string} userAgent */
  function setUserAgent(userAgent) {
    setNavigatorProperty('userAgent', userAgent);
  }

  /** @param {?Object} userAgentData */
  function setUserAgentData(userAgentData) {
    setNavigatorProperty('userAgentData', userAgentData);
  }

  /** @param {string} vendor */
  function setVendor(vendor) {
    setNavigatorProperty('vendor', vendor);
  }

  /** @param {string} platform */
  function setPlatform(platform) {
    setNavigatorProperty('platform', platform);
  }

  /** @param {number} maxTouchPoints */
  function setMaxTouchPoints(maxTouchPoints) {
    setNavigatorProperty('maxTouchPoints', maxTouchPoints);
  }

  /**
   * @param {string} key
   * @param {*} value
   */
  function setNavigatorProperty(key, value) {
    Object.defineProperty(navigator, key, {value, configurable: true});
  }
});
