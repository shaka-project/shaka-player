/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Tizen', () => {
  /* eslint-disable @stylistic/max-len */
  // See: https://developer.samsung.com/smarttv/develop/guides/fundamentals/retrieving-platform-information.html
  const tizen50 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36';
  const tizen55 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36';
  const tizen60 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';
  const tizen65 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';
  const tizen70 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36';
  const tizen80 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) 108.0.5359.1/8.0 TV Safari/537.36';
  const tizen90 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) 120.0.6099.5/9.0 TV Safari/537.36';
  const tizen100 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 10.0) AppleWebKit/537.36 (KHTML, like Gecko) 130.0.6723.116/10.0 TV Safari/537.36';

  const webOs3 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.2.1 Chrome/38.0.2125.122 Safari/537.36 WebAppManager';
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('checks Tizen version', () => {
    Util.setUserAgent(webOs3);
    expect(new shaka.device.Tizen().getVersion()).toBe(null);
    Util.setUserAgent(tizen50);
    expect(new shaka.device.Tizen().getVersion()).toBe(5);
    Util.setUserAgent(tizen55);
    expect(new shaka.device.Tizen().getVersion()).toBe(5);
    Util.setUserAgent(tizen60);
    expect(new shaka.device.Tizen().getVersion()).toBe(6);
    Util.setUserAgent(tizen65);
    expect(new shaka.device.Tizen().getVersion()).toBe(6);
    Util.setUserAgent(tizen70);
    expect(new shaka.device.Tizen().getVersion()).toBe(7);
    Util.setUserAgent(tizen80);
    expect(new shaka.device.Tizen().getVersion()).toBe(8);
    Util.setUserAgent(tizen90);
    expect(new shaka.device.Tizen().getVersion()).toBe(9);
    Util.setUserAgent(tizen100);
    expect(new shaka.device.Tizen().getVersion()).toBe(10);
  });

  // See: https://github.com/shaka-project/shaka-player/issues/11071
  describe('isStreamSupported', () => {
    it('rejects H.264 above FHD', () => {
      Util.setUserAgent(tizen65);
      const device = new shaka.device.Tizen();
      expect(device.isStreamSupported(videoStream('avc1.640033', 3840, 2160)))
          .toBe(false);
      expect(device.isStreamSupported(videoStream('avc3.640033', 2560, 1440)))
          .toBe(false);
    });

    it('accepts H.264 up to FHD', () => {
      Util.setUserAgent(tizen65);
      const device = new shaka.device.Tizen();
      expect(device.isStreamSupported(videoStream('avc1.640028', 1920, 1080)))
          .toBe(true);
    });

    it('accepts other codecs above FHD', () => {
      Util.setUserAgent(tizen65);
      const device = new shaka.device.Tizen();
      const hevc = videoStream('hvc1.2.4.L153.B0', 3840, 2160);
      expect(device.isStreamSupported(hevc)).toBe(true);
      expect(device.isStreamSupported(videoStream('vp09.00.51.08', 3840, 2160)))
          .toBe(true);
    });
  });

  /**
   * @param {string} codecs
   * @param {number} width
   * @param {number} height
   * @return {shaka.extern.Stream}
   */
  function videoStream(codecs, width, height) {
    return /** @type {shaka.extern.Stream} */ ({
      type: 'video',
      codecs,
      width,
      height,
    });
  }
});
