/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('WebOS', () => {
  /* eslint-disable @stylistic/max-len */
  // See: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine#useragent-string
  const webOs3 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.2.1 Chrome/38.0.2125.122 Safari/537.36 WebAppManager';
  const webOs4 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
  const webOs5 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager';
  const webOs6 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
  const webOs22 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager';
  const webOs23 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 WebAppManager';
  const webOs24 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager';
  const webOs25 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.270 Safari/537.36 WebAppManager';
  const webOs26 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.207 Safari/537.36 WebAppManager';

  const tizen50 = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36';
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('checks webOS version', () => {
    Util.setUserAgent(tizen50);
    expect(new shaka.device.WebOS().getVersion()).toBe(null);
    Util.setUserAgent(webOs3);
    expect(new shaka.device.WebOS().getVersion()).toBe(3);
    Util.setUserAgent(webOs4);
    expect(new shaka.device.WebOS().getVersion()).toBe(4);
    Util.setUserAgent(webOs5);
    expect(new shaka.device.WebOS().getVersion()).toBe(5);
    Util.setUserAgent(webOs6);
    expect(new shaka.device.WebOS().getVersion()).toBe(6);
    Util.setUserAgent(webOs22);
    expect(new shaka.device.WebOS().getVersion()).toBe(22);
    Util.setUserAgent(webOs23);
    expect(new shaka.device.WebOS().getVersion()).toBe(23);
    Util.setUserAgent(webOs24);
    expect(new shaka.device.WebOS().getVersion()).toBe(24);
    Util.setUserAgent(webOs25);
    expect(new shaka.device.WebOS().getVersion()).toBe(25);
    Util.setUserAgent(webOs26);
    expect(new shaka.device.WebOS().getVersion()).toBe(26);
  });
});
