/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TitanOS', () => {
  /* eslint-disable @stylistic/max-len */
  // See: https://docs.titanos.tv/user-agents
  // cspell:disable
  const titanOs = 'Mozilla/5.0 (Linux ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.36 OMI/4.24.3.93.MIKE.227 Model/Vestel-MB190 VSTVB MB100 FVC/9.0 (VESTEL; MB190; ) HbbTV/1.7.1 (+DRM; VESTEL; MB190; 0.9.0.0; ; _TV__2025;) TitanOS/3.0 (Vestel MB190 VESTEL) SmartTvA/3.0.0';
  // cspell:enable
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('reports the right device name and type', () => {
    Util.setUserAgent(titanOs);
    const device = new shaka.device.TitanOS();
    expect(device.getDeviceName()).toBe('TitanOS');
    expect(device.getDeviceType()).toBe(shaka.device.IDevice.DeviceType.TV);
    expect(device.getVersion()).toBe(null);
  });
});
