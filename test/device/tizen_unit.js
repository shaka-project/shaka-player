/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
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
  });
});
