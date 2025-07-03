/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TiVo Auto', () => {
  /* eslint-disable @stylistic/max-len */
  const bmwLinux = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/573.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 BMW/162';
  const bmwAndroid = 'Mozilla/5.0 (Linux; Andr0id 13; bmw_idc23 for arm64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Safari/537.36 OMI/4.25.1.126.Optimus.244.4 Model/BMW-Andr0id21screen TiVoAuto';
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const CrossBoundaryStrategy = shaka.config.CrossBoundaryStrategy;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
  });

  it('should use RESET crossBoundaryStrategy on BMW Linux', () => {
    Util.setUserAgent(bmwLinux);
    const device = new shaka.device.TiVoAuto();
    const config = shaka.util.PlayerConfiguration.createDefault();
    device.adjustConfig(config);
    expect(config.streaming.crossBoundaryStrategy)
        .toBe(CrossBoundaryStrategy.RESET);
  });

  it('should use RESET_TO_ENCRYPTED crossBoundaryStrategy on BMW Android', () => {
    Util.setUserAgent(bmwAndroid);
    const device = new shaka.device.TiVoAuto();
    const config = shaka.util.PlayerConfiguration.createDefault();
    device.adjustConfig(config);
    expect(config.streaming.crossBoundaryStrategy)
        .toBe(CrossBoundaryStrategy.RESET_TO_ENCRYPTED);
  });
});
