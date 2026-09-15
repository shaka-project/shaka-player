/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DefaultBrowser', () => {
  /* eslint-disable @stylistic/max-len */
  // Legacy Edge carries the token "Edge/"; Chromium-based Edge carries "Edg/".
  const legacyEdge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763';
  const chromiumEdge = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0';
  const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
  const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0';
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15';
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;
  const originalVendor = navigator.vendor;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
    Util.setVendor(originalVendor);
  });

  // The 0.001 nudge that MediaSourceEngine applies to negative timestamp
  // offsets (https://github.com/shaka-project/shaka-player/issues/1281) keys
  // off BrowserEngine.EDGE, which must mean EdgeHTML and nothing else.  The
  // matching integration test measures the real SourceBuffer behaviour that
  // justifies leaving every other engine out.
  describe('requiresTimestampOffsetFudge', () => {
    it('is true for legacy Edge', () => {
      Util.setUserAgent(legacyEdge);
      Util.setVendor('');
      const device = new shaka.device.DefaultBrowser();
      expect(device.getBrowserEngine())
          .toBe(shaka.device.IDevice.BrowserEngine.EDGE);
      expect(device.requiresTimestampOffsetFudge()).toBe(true);
    });

    it('is false for Chromium-based Edge', () => {
      Util.setUserAgent(chromiumEdge);
      Util.setVendor('Google Inc.');
      const device = new shaka.device.DefaultBrowser();
      expect(device.getBrowserEngine())
          .toBe(shaka.device.IDevice.BrowserEngine.CHROMIUM);
      expect(device.requiresTimestampOffsetFudge()).toBe(false);
    });

    it('is false for Chrome', () => {
      Util.setUserAgent(chrome);
      Util.setVendor('Google Inc.');
      expect(new shaka.device.DefaultBrowser().requiresTimestampOffsetFudge())
          .toBe(false);
    });

    it('is false for Firefox', () => {
      Util.setUserAgent(firefox);
      Util.setVendor('');
      expect(new shaka.device.DefaultBrowser().requiresTimestampOffsetFudge())
          .toBe(false);
    });

    it('is false for Safari', () => {
      Util.setUserAgent(safari);
      Util.setVendor('Apple Computer, Inc.');
      expect(new shaka.device.DefaultBrowser().requiresTimestampOffsetFudge())
          .toBe(false);
    });
  });
});
