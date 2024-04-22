/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Platform', () => {
  const originalUserAgent = navigator.userAgent;
  // eslint-disable-next-line max-len
  const webOs3 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.2.1 Chrome/38.0.2125.122 Safari/537.36 WebAppManager';
  // eslint-disable-next-line max-len
  const webOs4 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
  // eslint-disable-next-line max-len
  const webOs5 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager';

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  it('checks is webOS 3', () => {
    setUserAgent(webOs3);
    expect(shaka.util.Platform.isWebOS3()).toBe(true);
    setUserAgent(webOs4);
    expect(shaka.util.Platform.isWebOS3()).toBe(false);
    setUserAgent(webOs5);
    expect(shaka.util.Platform.isWebOS3()).toBe(false);
  });

  it('checks is webOS 4', () => {
    setUserAgent(webOs3);
    expect(shaka.util.Platform.isWebOS4()).toBe(false);
    setUserAgent(webOs4);
    expect(shaka.util.Platform.isWebOS4()).toBe(true);
    setUserAgent(webOs5);
    expect(shaka.util.Platform.isWebOS4()).toBe(false);
  });

  it('checks is webOS 5', () => {
    setUserAgent(webOs3);
    expect(shaka.util.Platform.isWebOS5()).toBe(false);
    setUserAgent(webOs4);
    expect(shaka.util.Platform.isWebOS5()).toBe(false);
    setUserAgent(webOs5);
    expect(shaka.util.Platform.isWebOS5()).toBe(true);
  });
});

/** @param {string} userAgent */
function setUserAgent(userAgent) {
  Object.defineProperty(
      navigator, 'userAgent', {value: userAgent, configurable: true});
}
