/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TiVoOS', () => {
  /* eslint-disable @stylistic/max-len */
  // cspell:disable
  const tivoOs = 'Mozilla/5.0 (Linux ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Safari/537.36 OPR/46.0.2207.0 OMI/4.23.2.96.LIMA2.127 Model/Vestel-MB180 VSTVB MB100 HbbTV/1.6.1 (+DRM; VESTEL; MB180; 1.63.0.0; ; _TV_G32_2023;) TiVoOS/1.0.0 (Vestel MB180 VESTEL) SmartTvA/3.0.0';
  // cspell:enable
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('reports the right device name, type and engine', () => {
    Util.setUserAgent(tivoOs);
    const device = new shaka.device.TiVoOS();
    expect(device.getDeviceName()).toBe('TiVoOS');
    expect(device.getDeviceType()).toBe(shaka.device.IDevice.DeviceType.TV);
    expect(device.getBrowserEngine())
        .toBe(shaka.device.IDevice.BrowserEngine.CHROMIUM);
    expect(device.getVersion()).toBe(null);
  });
});
