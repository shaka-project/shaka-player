/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Vizio', () => {
  /* eslint-disable @stylistic/max-len */
  // cspell:disable
  const vizio = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36 CrKey/1.0.999999 VIZIO SmartCast(Conjure/MTKF-5.1.516.1 FW/0.6.11.1-2 Model/V50C6-J09)';
  // cspell:enable
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('reports the right device name and type', () => {
    Util.setUserAgent(vizio);
    const device = new shaka.device.Vizio();
    expect(device.getDeviceName()).toBe('Vizio');
    expect(device.getDeviceType()).toBe(shaka.device.IDevice.DeviceType.TV);
    expect(device.getVersion()).toBe(null);
  });
});
