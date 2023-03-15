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

    const config = shaka.util.PlayerConfiguration.createDefault().ads;
    adManager.configure(config);

    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
  });

  describe('client side', () => {
    it('doesn\'t init if CS IMA is missing', () => {
      const error = createError(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Code.CS_IMA_SDK_MISSING);

      expect(() => adManager.initClientSide(
          adContainer, mockVideo)).toThrow(error);
    });

    it('doesn\'t request ads until CS is initialized', () => {
      setupFakeIMA();
      const error = createError(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Code.CS_AD_MANAGER_NOT_INITIALIZED);

      const request = new google.ima.AdsRequest();
      request.adTagUrl = 'fakeTag';

      expect(() => adManager.requestClientSideAds(request)).toThrow(error);
    });

    it('doesn\'t request ads if CS events return no ad', () => {
      setupFakeIMA();

      const request = new google.ima.AdsRequest();
      request.adTagUrl = 'fakeTag';

      /** @type {google.ima.AdsLoader} */
      let mockAdsLoaderInstance;
      let numAdsRequested = 0;
      /** @type {google.ima.AdsManager} */
      let mockAdsManagerInstance;
      /** @type {Event} */
      let loadEvent;
      /** @type {Event} */
      let startedEventA;
      /** @type {Event} */
      let startedEventB;

      /** @suppress {invalidCasts} */
      function makeMocks() {
        const mockAdsLoader = class extends shaka.util.FakeEventTarget {
          constructor(container) {
            super();
            mockAdsLoaderInstance = /** @type {!google.ima.AdsLoader} */ (this);
          }

          getSettings() {
            return {
              setPlayerType: (type) => {},
              setPlayerVersion: (version) => {},
            };
          }

          requestAds(imaRequest) {
            numAdsRequested += 1;
          }
        };
        window['google'].ima.AdsLoader = mockAdsLoader;

        loadEvent = /** @type {!google.ima.AdsManagerLoadedEvent} */ (
          new shaka.util.FakeEvent(
              google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED));
        loadEvent.getAdsManager = () => {
          const MockAdManager = class extends shaka.util.FakeEventTarget {
            constructor() {
              super();
              mockAdsManagerInstance =
              /** @type {!google.ima.AdsManager} */ (this);
            }

            getCuePoints() {
              return [];
            }

            getVolume() {
              return 0;
            }
          };
          return new MockAdManager();
        };
        startedEventA = /** @type {!google.ima.AdEvent} */ (
          new shaka.util.FakeEvent(google.ima.AdEvent.Type.STARTED));
        startedEventA.getAd = () => {
          return null;
        };
        startedEventB = /** @type {!google.ima.AdEvent} */ (
          new shaka.util.FakeEvent(google.ima.AdEvent.Type.STARTED));
        startedEventB.getAd = () => {
          return {
            isLinear: () => true,
          };
        };
      }
      makeMocks();

      // Set up event listeners.
      const eventManager = new shaka.util.EventManager();
      let loaded = false;
      let numAdStarted = 0;
      const AdManager = shaka.ads.AdManager;
      eventManager.listen(adManager, AdManager.IMA_AD_MANAGER_LOADED, () => {
        loaded = true;
      });
      eventManager.listen(adManager, AdManager.AD_STARTED, () => {
        numAdStarted += 1;
      });

      // Set up the ad manager.
      adManager.initClientSide(adContainer, mockVideo);
      goog.asserts.assert(loadEvent != null, 'loadEvent exists');
      mockAdsLoaderInstance.dispatchEvent(/** @type {!Event} */ (loadEvent));
      expect(loaded).toBe(true);

      // Request an ad, but create an event with no ad.
      adManager.requestClientSideAds(request);
      expect(numAdsRequested).toBe(1);
      mockAdsManagerInstance.dispatchEvent(/** @type {!Event} */ (
        startedEventA));
      expect(numAdStarted).toBe(0);

      // Request another ad. This time, the IMA event has an ad, so the ad
      // manager should fire a started event.
      adManager.requestClientSideAds(request);
      expect(numAdsRequested).toBe(2);
      mockAdsManagerInstance.dispatchEvent(/** @type {!Event} */ (
        startedEventB));
      expect(numAdStarted).toBe(1);
    });
  });

  describe('server side', () => {
    it('doesn\'t init if SS IMA is missing', () => {
      const error = createError(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Code.SS_IMA_SDK_MISSING);

      expect(() => adManager.initServerSide(
          adContainer, mockVideo)).toThrow(error);
    });

    it('doesn\'t request streams until SS is initialized', () => {
      setupFakeIMA();
      const error = createError(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Code.SS_AD_MANAGER_NOT_INITIALIZED);

      const request = new google.ima.dai.api.StreamRequest();

      expect(() => adManager.requestServerSideStream(request)).toThrow(error);
    });
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
    window['google'].ima.settings = {};
    window['google'].ima.settings.setLocale = (locale) => {};
    window['google'].ima.AdsManagerLoadedEvent = {};
    window['google'].ima.AdsManagerLoadedEvent.Type = {
      ADS_MANAGER_LOADED: 'ADS_MANAGER_LOADED',
    };
    window['google'].ima.AdErrorEvent = {};
    window['google'].ima.AdErrorEvent.Type = {
      AD_ERROR: 'AD_ERROR',
    };
    window['google'].ima.AdEvent = {};
    window['google'].ima.AdEvent.Type = {
      CONTENT_PAUSE_REQUESTED: 'CONTENT_PAUSE_REQUESTED',
      STARTED: 'STARTED',
      FIRST_QUARTILE: 'FIRST_QUARTILE',
      MIDPOINT: 'MIDPOINT',
      THIRD_QUARTILE: 'THIRD_QUARTILE',
      COMPLETE: 'COMPLETE',
      CONTENT_RESUME_REQUESTED: 'CONTENT_RESUME_REQUESTED',
      ALL_ADS_COMPLETED: 'ALL_ADS_COMPLETED',
      SKIPPED: 'SKIPPED',
      VOLUME_CHANGED: 'VOLUME_CHANGED',
      VOLUME_MUTED: 'VOLUME_MUTED',
      PAUSED: 'PAUSED',
      RESUMED: 'RESUMED',
      SKIPPABLE_STATE_CHANGED: 'SKIPPABLE_STATE_CHANGED',
      CLICK: 'CLICK',
      AD_PROGRESS: 'AD_PROGRESS',
      AD_BUFFERING: 'AD_BUFFERING',
      IMPRESSION: 'IMPRESSION',
      DURATION_CHANGE: 'DURATION_CHANGE',
      USER_CLOSE: 'USER_CLOSE',
      LOADED: 'LOADED',
      LINEAR_CHANGED: 'LINEAR_CHANGED',
      AD_METADATA: 'AD_METADATA',
      LOG: 'LOG',
      AD_BREAK_READY: 'AD_BREAK_READY',
      INTERACTION: 'INTERACTION',
    };
    window['google'].ima.AdDisplayContainer = class { initialize() {} };
  }
});
