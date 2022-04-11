/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Ad manager', () => {
  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;
  /** @type {!shaka.Player} */
  let player;
  /** @type {shaka.extern.IAdManager} */
  let adManager;
  /** @type {!HTMLElement} */
  let adContainer;

  beforeEach(() => {
    window['google'] = null;
    mockVideo = new shaka.test.FakeVideo();
    player = new shaka.Player(mockVideo);
    adManager = player.getAdManager();
    expect(adManager instanceof shaka.ads.AdManager).toBe(true);

    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
  });

  it('doesn\'t init CS if CS IMA is missing', () => {
    const error = createError(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Code.CS_IMA_SDK_MISSING);

    expect(() => adManager.initClientSide(
        adContainer, mockVideo)).toThrow(error);
  });

  it('doesn\'t init SS if SS IMA is missing', () => {
    const error = createError(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Code.SS_IMA_SDK_MISSING);

    expect(() => adManager.initServerSide(
        adContainer, mockVideo)).toThrow(error);
  });

  it('doesn\'t request CS ads until CS is initialized', () => {
    setupFakeIMA();
    const error = createError(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Code.CS_AD_MANAGER_NOT_INITIALIZED);

    const request = new google.ima.AdsRequest();
    request.adTagUrl = 'fakeTag';

    expect(() => adManager.requestClientSideAds(request)).toThrow(error);
  });

  it('doesn\'t request SS streams until SS is initialized', () => {
    setupFakeIMA();
    const error = createError(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Code.SS_AD_MANAGER_NOT_INITIALIZED);

    const request = new google.ima.dai.api.StreamRequest();

    expect(() => adManager.requestServerSideStream(request)).toThrow(error);
  });

  /**
   * @param {shaka.util.Error.Severity} severity
   * @param {shaka.util.Error.Code} code
   * @return {Object}
   */
  function createError(severity, code) {
    return shaka.test.Util.jasmineError(new shaka.util.Error(
        severity,
        shaka.util.Error.Category.ADS,
        code));
  }

  function setupFakeIMA() {
    window['google'] = {};
    window['google'].ima = {};
    window['google'].ima.AdsLoader = {};
    window['google'].ima.dai = {};
    window['google'].ima.AdsRequest = class {};
    window['google'].ima.dai.api = {};
    window['google'].ima.dai.api.StreamRequest = class {};
  }
});
