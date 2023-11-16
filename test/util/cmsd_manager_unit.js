/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CmsdManager', () => {
  const CmsdManager = shaka.util.CmsdManager;

  /** @type shaka.util.CmsdManager */
  let cmsdManager;

  /** @type {shaka.extern.CmsdConfiguration} */
  const defaultConfig = {
    enabled: true,
    applyMaximumSuggestedBitrate: true,
    estimatedThroughputWeightRatio: 0.5,
  };

  /** @type {shaka.extern.CmsdConfiguration} */
  const disabledConfig = {
    enabled: false,
    applyMaximumSuggestedBitrate: true,
    estimatedThroughputWeightRatio: 0.5,
  };

  /** @type {shaka.extern.CmsdConfiguration} */
  const noBitrateConfig = {
    enabled: true,
    applyMaximumSuggestedBitrate: false,
    estimatedThroughputWeightRatio: 0.5,
  };

  beforeAll(() => {
    cmsdManager = new CmsdManager(defaultConfig);
  });

  afterEach(() => {
    cmsdManager.configure(defaultConfig);
  });

  it('getMaxBitrate', () => {
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663";etp=115;rtt=16;mb=5000',
    });
    expect(cmsdManager.getMaxBitrate()).toBe(5000000);

    cmsdManager.configure(disabledConfig);
    expect(cmsdManager.getMaxBitrate()).toBeNull();

    cmsdManager.configure(defaultConfig);
    expect(cmsdManager.getMaxBitrate()).toBe(5000000);

    cmsdManager.configure(noBitrateConfig);
    expect(cmsdManager.getMaxBitrate()).toBeNull();

    cmsdManager.configure(defaultConfig);
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663"',
    });
    expect(cmsdManager.getMaxBitrate()).toBeNull();
  });

  it('getEstimatedThroughput', () => {
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663";etp=115;rtt=16;mb=5000',
    });
    expect(cmsdManager.getEstimatedThroughput()).toBe(115000);

    cmsdManager.configure(disabledConfig);
    expect(cmsdManager.getEstimatedThroughput()).toBeNull();

    cmsdManager.configure(defaultConfig);
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663"',
    });
    expect(cmsdManager.getEstimatedThroughput()).toBeNull();
  });

  it('getResponseDelay', () => {
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663";etp=115;rd=16;mb=5000',
    });
    expect(cmsdManager.getResponseDelay()).toBe(16);

    cmsdManager.configure(disabledConfig);
    expect(cmsdManager.getResponseDelay()).toBeNull();

    cmsdManager.configure(defaultConfig);
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663"',
    });
    expect(cmsdManager.getResponseDelay()).toBeNull();
  });

  it('getRoundTripTime', () => {
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663";etp=115;rtt=16;mb=5000',
    });
    expect(cmsdManager.getRoundTripTime()).toBe(16);

    cmsdManager.configure(disabledConfig);
    expect(cmsdManager.getRoundTripTime()).toBeNull();

    cmsdManager.configure(defaultConfig);
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663"',
    });
    expect(cmsdManager.getRoundTripTime()).toBeNull();
  });

  it('getBandwidthEstimate', () => {
    expect(cmsdManager.getBandwidthEstimate(1000)).toBe(1000);
    cmsdManager.processHeaders({
      'cmsd-static': 'ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"',
      'cmsd-dynamic': '"CDNA-312.663";etp=115;rtt=16;mb=5000',
    });
    expect(cmsdManager.getBandwidthEstimate(1000)).toBe(58000);

    cmsdManager.configure(disabledConfig);
    expect(cmsdManager.getBandwidthEstimate(1000)).toBe(1000);
  });
});
