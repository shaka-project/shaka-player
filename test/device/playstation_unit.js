/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('PlayStation', () => {
  /* eslint-disable @stylistic/max-len */
  // cspell:disable
  const ps4 = 'Mozilla/5.0 (PlayStation 4 WebMAF) AppleWebKit/538.8 (KHTML, like Gecko) WebMAF/v2.3.0-0-g349b724';
  const ps4Pro = 'Mozilla/5.0 (PlayStation 4 PRO WebMAF, HEVC) AppleWebKit/605.1.15 (KHTML, like Gecko) WebMAF/v3.2.4-0-g236ca012 SDK: (0x12008011u), Built: Feb  5 2025 14:07:28';
  const ps5 = 'Mozilla/5.0 (PlayStation; PlayStation 5/10.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  // cspell:enable
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('checks PlayStation version', () => {
    Util.setUserAgent(ps4);
    expect(new shaka.device.PlayStation().getVersion()).toBe(4);
    Util.setUserAgent(ps4Pro);
    expect(new shaka.device.PlayStation().getVersion()).toBe(4);
    Util.setUserAgent(ps5);
    expect(new shaka.device.PlayStation().getVersion()).toBe(5);
  });

  it('reports the right device name, type and engine', () => {
    Util.setUserAgent(ps5);
    const device = new shaka.device.PlayStation();
    expect(device.getDeviceName()).toBe('PlayStation');
    expect(device.getDeviceType())
        .toBe(shaka.device.IDevice.DeviceType.CONSOLE);
    expect(device.getBrowserEngine())
        .toBe(shaka.device.IDevice.BrowserEngine.WEBKIT);
  });

  it('applies PS4-specific quirks only on PlayStation 4', () => {
    Util.setUserAgent(ps4);
    const ps4Device = new shaka.device.PlayStation();
    expect(ps4Device.shouldAvoidUseTextDecoderEncoder()).toBe(true);
    expect(ps4Device.returnLittleEndianUsingPlayReady()).toBe(true);
    expect(ps4Device.supportsEncryptionSchemePolyfill()).toBe(false);

    Util.setUserAgent(ps5);
    const ps5Device = new shaka.device.PlayStation();
    expect(ps5Device.shouldAvoidUseTextDecoderEncoder()).toBe(false);
    expect(ps5Device.returnLittleEndianUsingPlayReady()).toBe(false);
    expect(ps5Device.supportsEncryptionSchemePolyfill()).toBe(true);
  });
});
