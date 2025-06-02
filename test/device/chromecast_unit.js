/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Chromecast', () => {
  /* eslint-disable @stylistic/max-len */
  // cspell: disable-next-line
  const vizio = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36 CrKey/1.0.999999 VIZIO SmartCast(Conjure/MTKF-5.1.516.1 FW/0.6.11.1-2 Model/V50C6-J09)';
  // cspell: disable-next-line
  const chromecastBuiltinOrOlder = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.225 Safari/537.36 CrKey/1.56.500000 DeviceType/Chromecast';
  // cspell: disable-next-line
  const chromecastFuchsia = 'Mozilla/5.0 (Fuchsia) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 CrKey/1.56.500000';
  // cspell: disable-next-line
  const chromecastAndroid = 'Mozilla/5.0 (Linux; Android 12; Build/STTL.240206.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.0 Safari/537.36 CrKey/1.56.500000 DeviceType/AndroidTV';
  /* eslint-enable @stylistic/max-len */

  const Chromecast = shaka.device.Chromecast;
  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;
  const userAgentData = navigator.userAgentData;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
    Util.setUserAgentData(userAgentData);
  });

  it('checks Chromecast OS type', () => {
    Util.setUserAgentData(null);
    Util.setUserAgent(vizio);
    expect(() => new Chromecast()).toThrow();
    Util.setUserAgent(chromecastBuiltinOrOlder);
    expect(new Chromecast().getDeviceName()).toContain('Linux');
    Util.setUserAgent(chromecastFuchsia);
    expect(new Chromecast().getDeviceName()).toContain('Fuchsia');
    Util.setUserAgent(chromecastAndroid);
    expect(new Chromecast().getDeviceName()).toContain('Android');
  });
});
