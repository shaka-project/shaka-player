/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Platform', () => {
  const originalUserAgent = navigator.userAgent;

  /* eslint-disable max-len */
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
  /* eslint-enable max-len */

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

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

  it('checks is webOS 3', () => {
    setUserAgent(tizen50);
    expect(shaka.util.Platform.isWebOS3()).toBe(false);
    setUserAgent(webOs3);
    expect(shaka.util.Platform.isWebOS3()).toBe(true);
    setUserAgent(webOs4);
    expect(shaka.util.Platform.isWebOS3()).toBe(false);
    setUserAgent(webOs5);
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
  });

  describe('isMediaKeysPolyfilled', () => {
    let shakaMediaKeysPolyfill;

    beforeAll(() => {
      shakaMediaKeysPolyfill = window.shakaMediaKeysPolyfill;
    });

    afterAll(() => {
      window.shakaMediaKeysPolyfill = shakaMediaKeysPolyfill;
    });

    it('should return true if media keys are polyfilled', () => {
      window.shakaMediaKeysPolyfill = 'webkit';
      const result = shaka.util.Platform.isMediaKeysPolyfilled();
      expect(result).toBe(true);
    });

    it('should return false if media keys are not polyfilled', () => {
      window.shakaMediaKeysPolyfill = '';
      const result = shaka.util.Platform.isMediaKeysPolyfilled();
      expect(result).toBe(false);
    });

    it('should return true with a matching polyfill type', () => {
      window.shakaMediaKeysPolyfill = 'webkit';
      const result = shaka.util.Platform.isMediaKeysPolyfilled('webkit');
      expect(result).toBe(true);
    });

    it('should return false with a non-matching polyfill type', () => {
      window.shakaMediaKeysPolyfill = 'webkit';
      const result = shaka.util.Platform.isMediaKeysPolyfilled('apple');
      expect(result).toBe(false);
    });
  });
});

/** @param {string} userAgent */
function setUserAgent(userAgent) {
  Object.defineProperty(
      navigator, 'userAgent', {value: userAgent, configurable: true});
}
