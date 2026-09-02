/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Hisense', () => {
  /* eslint-disable @stylistic/max-len */
  // cspell:disable
  const hisenseUhd = 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Odin/88.4324.2.10 Safari/537.36 Model/Hisense-NT72671D VIDAA/6.0(Hisense;SmartTV;55A66GXVT;NT72671/V0000.06.12X.N1212;UHD;55A6GX;)';
  const hisenseFhd = 'Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36 OMI/4.20.3.54 Model/Hisense-MSD6886 VIDAA/4.0(Hisense;SmartTV;HE43A6100;mstar6886/V0000.01.00T.K1112;FHD)';
  // cspell:enable
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('reports the right device name and type', () => {
    Util.setUserAgent(hisenseUhd);
    const device = new shaka.device.Hisense();
    expect(device.getDeviceName()).toBe('Hisense');
    expect(device.getDeviceType()).toBe(shaka.device.IDevice.DeviceType.TV);
    expect(device.getVersion()).toBe(null);
  });

  it('detects max hardware resolution from the user agent', async () => {
    Util.setUserAgent(hisenseUhd);
    expect(await new shaka.device.Hisense().detectMaxHardwareResolution())
        .toEqual({width: 3840, height: 2160});

    Util.setUserAgent(hisenseFhd);
    expect(await new shaka.device.Hisense().detectMaxHardwareResolution())
        .toEqual({width: 1920, height: 1080});
  });
});
