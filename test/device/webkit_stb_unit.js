/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('WebKitSTB', () => {
  /* eslint-disable @stylistic/max-len */
  const playstation4Pro = 'Mozilla/5.0 (PlayStation 4 PRO WebMAF, HEVC) AppleWebKit/605.1.15 (KHTML, like Gecko) WebMAF/v3.2.4-0-g236ca012 SDK: (0x12008011u), Built: Feb  5 2025 14:07:28';

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;
  const originalVendor = navigator.vendor;
  const originalPlatform = navigator.platform;
  const originalMaxTouchPoints = navigator.maxTouchPoints;
  const originalUserAgentData = navigator.userAgentData;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
    Util.setVendor(originalVendor);
    Util.setPlatform(originalPlatform);
    Util.setMaxTouchPoints(originalMaxTouchPoints);
    Util.setUserAgentData(originalUserAgentData);
  });

  it('does not classify PlayStation as WebKit STB', () => {
    Util.setUserAgent(playstation4Pro);
    Util.setVendor('Apple Computer, Inc.');
    Util.setPlatform('PlayStation');
    Util.setMaxTouchPoints(0);
    Util.setUserAgentData(null);

    expect(shaka.device.WebKitSTB['isWebkitSTB_']()).toBe(false);
  });
});
