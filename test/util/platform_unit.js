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

  /* eslint-disable @stylistic/max-len */
  const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15';
  const ipadSafari = 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
  const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/56.0.2924.75 Mobile/14E5239e Safari/602.1';
  // See: https://developer.samsung.com/smarttv/develop/guides/fundamentals/retrieving-platform-information.html
  const tizen50 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36';
  const tizen55 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36';
  const tizen60 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';
  const tizen65 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';
  const tizen70 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36';

  // See: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine#useragent-string
  const webOs3 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.2.1 Chrome/38.0.2125.122 Safari/537.36 WebAppManager';
  const webOs4 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
  const webOs5 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager';
  const webOs6 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';

  // cspell: disable-next-line
  const vizio = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36 CrKey/1.0.999999 VIZIO SmartCast(Conjure/MTKF-5.1.516.1 FW/0.6.11.1-2 Model/V50C6-J09)';
  // cspell: disable-next-line
  const chromecastBuiltinOrOlder = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.225 Safari/537.36 CrKey/1.56.500000 DeviceType/Chromecast';
  // cspell: disable-next-line
  const chromecastFuchsia = 'Mozilla/5.0 (Fuchsia) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 CrKey/1.56.500000';
  // cspell: disable-next-line
  const chromecastAndroid = 'Mozilla/5.0 (Linux; Android 12; Build/STTL.240206.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.0 Safari/537.36 CrKey/1.56.500000 DeviceType/AndroidTV';
  /* eslint-enable @stylistic/max-len */

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

  describe('Samsung', () => {
    it('checks is Tizen 5', () => {
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isTizen5()).toBe(false);
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isTizen5()).toBe(true);
      setUserAgent(tizen55);
      expect(shaka.util.Platform.isTizen5()).toBe(true);
      setUserAgent(tizen60);
      expect(shaka.util.Platform.isTizen5()).toBe(false);
      setUserAgent(tizen65);
      expect(shaka.util.Platform.isTizen5()).toBe(false);
      setUserAgent(tizen70);
      expect(shaka.util.Platform.isTizen5()).toBe(false);
    });

    it('checks is Tizen 5.0', () => {
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isTizen5_0()).toBe(false);
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isTizen5_0()).toBe(true);
      setUserAgent(tizen55);
      expect(shaka.util.Platform.isTizen5_0()).toBe(false);
      setUserAgent(tizen60);
      expect(shaka.util.Platform.isTizen5_0()).toBe(false);
      setUserAgent(tizen65);
      expect(shaka.util.Platform.isTizen5_0()).toBe(false);
      setUserAgent(tizen70);
      expect(shaka.util.Platform.isTizen5_0()).toBe(false);
    });

    it('checks is Tizen 6', () => {
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isTizen6()).toBe(false);
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isTizen6()).toBe(false);
      setUserAgent(tizen55);
      expect(shaka.util.Platform.isTizen6()).toBe(false);
      setUserAgent(tizen60);
      expect(shaka.util.Platform.isTizen6()).toBe(true);
      setUserAgent(tizen65);
      expect(shaka.util.Platform.isTizen6()).toBe(true);
      setUserAgent(tizen70);
      expect(shaka.util.Platform.isTizen6()).toBe(false);
    });
  });

  describe('LG', () => {
    it('checks is webOS 3', () => {
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isWebOS3()).toBe(false);
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isWebOS3()).toBe(true);
      setUserAgent(webOs4);
      expect(shaka.util.Platform.isWebOS3()).toBe(false);
      setUserAgent(webOs5);
      expect(shaka.util.Platform.isWebOS3()).toBe(false);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.isWebOS3()).toBe(false);
    });

    it('checks is webOS 4', () => {
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isWebOS4()).toBe(false);
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isWebOS4()).toBe(false);
      setUserAgent(webOs4);
      expect(shaka.util.Platform.isWebOS4()).toBe(true);
      setUserAgent(webOs5);
      expect(shaka.util.Platform.isWebOS4()).toBe(false);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.isWebOS4()).toBe(false);
    });

    it('checks is webOS 5', () => {
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isWebOS5()).toBe(false);
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isWebOS5()).toBe(false);
      setUserAgent(webOs4);
      expect(shaka.util.Platform.isWebOS5()).toBe(false);
      setUserAgent(webOs5);
      expect(shaka.util.Platform.isWebOS5()).toBe(true);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.isWebOS5()).toBe(false);
    });

    it('checks is webOS 6', () => {
      setUserAgent(tizen50);
      expect(shaka.util.Platform.isWebOS6()).toBe(false);
      setUserAgent(webOs3);
      expect(shaka.util.Platform.isWebOS6()).toBe(false);
      setUserAgent(webOs4);
      expect(shaka.util.Platform.isWebOS6()).toBe(false);
      setUserAgent(webOs5);
      expect(shaka.util.Platform.isWebOS6()).toBe(false);
      setUserAgent(webOs6);
      expect(shaka.util.Platform.isWebOS6()).toBe(true);
    });
  });

  it('checks is Vizio', () => {
    setUserAgent(vizio);
    expect(shaka.util.Platform.isVizio()).toBe(true);
    expect(shaka.util.Platform.isChromecast()).toBe(false);
  });

  it('checks is Chromecast Fuchsia', () => {
    setUserAgent(chromecastFuchsia);
    setUserAgentData(null);
    expect(shaka.util.Platform.isVizio()).toBe(false);
    expect(shaka.util.Platform.isChromecast()).toBe(true);
    expect(shaka.util.Platform.isAndroidCastDevice()).toBe(false);
    expect(shaka.util.Platform.isFuchsia()).toBe(true);
  });

  it('checks is Chromecast Android', () => {
    setUserAgent(chromecastAndroid);
    setUserAgentData(null);
    expect(shaka.util.Platform.isVizio()).toBe(false);
    expect(shaka.util.Platform.isChromecast()).toBe(true);
    expect(shaka.util.Platform.isAndroidCastDevice()).toBe(true);
    expect(shaka.util.Platform.isFuchsia()).toBe(false);
  });

  it('checks is Chromecast', () => {
    setUserAgent(chromecastBuiltinOrOlder);
    setUserAgentData(null);
    expect(shaka.util.Platform.isVizio()).toBe(false);
    expect(shaka.util.Platform.isChromecast()).toBe(true);
    expect(shaka.util.Platform.isAndroidCastDevice()).toBe(false);
    expect(shaka.util.Platform.isFuchsia()).toBe(false);
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
