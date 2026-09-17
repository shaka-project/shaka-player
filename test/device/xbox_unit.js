/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Xbox', () => {
  /* eslint-disable @stylistic/max-len */
  // Xbox One ships the legacy EdgeHTML browser (token "Edge/").
  const xboxOne = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.18363';
  // Xbox Series X|S ships Chromium-based Edge (token "Edg/", no "e").
  const xboxSeries = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 Edg/113.0.1774.50';
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('checks Xbox version', () => {
    Util.setUserAgent(xboxOne);
    expect(new shaka.device.Xbox().getVersion()).toBe(18);
  });

  it('detects the legacy Edge browser engine', () => {
    Util.setUserAgent(xboxOne);
    expect(new shaka.device.Xbox().getBrowserEngine())
        .toBe(shaka.device.IDevice.BrowserEngine.EDGE);
  });

  it('reports the right device name and type', () => {
    Util.setUserAgent(xboxOne);
    const device = new shaka.device.Xbox();
    expect(device.getDeviceName()).toBe('Xbox');
    expect(device.getDeviceType())
        .toBe(shaka.device.IDevice.DeviceType.CONSOLE);
  });

  it('needs the timestampOffset fudge on legacy Edge', () => {
    Util.setUserAgent(xboxOne);
    expect(new shaka.device.Xbox().requiresTimestampOffsetFudge()).toBe(true);
  });

  it('does not need the timestampOffset fudge on Chromium-based Edge', () => {
    Util.setUserAgent(xboxSeries);
    const device = new shaka.device.Xbox();
    expect(device.getBrowserEngine())
        .toBe(shaka.device.IDevice.BrowserEngine.CHROMIUM);
    expect(device.requiresTimestampOffsetFudge()).toBe(false);
  });

  it('overrides Dolby Vision codecs on legacy Edge', () => {
    Util.setUserAgent(xboxOne);
    expect(new shaka.device.Xbox().shouldOverrideDolbyVisionCodecs())
        .toBe(true);
  });
});
