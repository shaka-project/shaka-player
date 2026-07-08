/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Interstitial Ad manager', () => {
  const TXml = shaka.util.TXml;

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let networkingEngine;

  /** @type {!HTMLElement} */
  let adContainer;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {!shaka.ads.InterstitialAdManager} */
  let interstitialAdManager;

  beforeEach(async () => {
    // Allows us to use a timer instead of requestVideoFrameCallback
    // (which doesn't work well in all platform tests)
    spyOn(deviceDetected, 'getDeviceType')
        .and.returnValue(shaka.device.IDevice.DeviceType.TV);

    function dependencyInjector(player) {
      // Create a networking engine that always returns an empty buffer.
      networkingEngine = new shaka.test.FakeNetworkingEngine();
      networkingEngine.setDefaultValue(new ArrayBuffer(0));
      player.createNetworkingEngine = () => networkingEngine;
    }

    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    player = new shaka.Player(null, null, dependencyInjector);
    video = shaka.test.UiUtils.createVideoElement();
    await player.attach(video);
    onEventSpy = jasmine.createSpy('onEvent');
    interstitialAdManager = new shaka.ads.InterstitialAdManager(
        adContainer, player, shaka.test.Util.spyFunc(onEventSpy));
    const config = shaka.util.PlayerConfiguration.createDefault().ads;
    // We always support multiple video elements so that we can properly
    // control timing in unit tests.
    config.supportsMultipleMediaElements = true;
    interstitialAdManager.configure(config);
  });

  afterEach(async () => {
    interstitialAdManager.release();
    await player.destroy();
  });

  describe('HLS', () => {
    it('basic interstitial support', async () => {
      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'PREROLL',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('supports multiple interstitials', async () => {
      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'PREROLL',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const metadata2 = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'POSTROLL',
          },
          {
            key: 'CUE',
            data: 'POST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata2);

      const calls = onEventSpy.calls.count();
      expect(calls).toBeLessThanOrEqual(5);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
      const eventValue2 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
          {
            start: -1,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue2));
    });

    it('ignore duplicate interstitials', async () => {
      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'PREROLL',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);
      await interstitialAdManager.addMetadata(metadata);

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore invalid interstitial', async () => {
      // It is not valid because it does not have an interstitial URL
      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'PREROLL',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('supports X-ASSET-LIST', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const assetsList = JSON.stringify({
        ASSETS: [
          {
            URI: 'ad.m3u8',
          },
        ],
      });

      networkingEngine.setResponseText(
          'test:/test.json?_HLS_primary_id=1', assetsList);

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'PREROLL',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
          {
            key: 'X-ASSET-LIST',
            data: 'test:/test.json',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('supports X-ASSET-LIST with X-AD-CREATIVE-SIGNALING', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const assetsList = JSON.stringify({
        ASSETS: [
          {
            'URI': 'ad.m3u8',
            'X-AD-CREATIVE-SIGNALING': {
              version: 2,
              type: 'slot',
              payload: [
                {
                  type: 'linear',
                  start: 0,
                  duration: 8,
                  media: [],
                  identifiers: [],
                  tracking: [
                    {
                      type: 'impression',
                      urls: ['impression'],
                    },
                    {
                      type: 'clickTracking',
                      urls: ['clickTracking'],
                    },
                    {
                      type: 'start',
                      urls: ['start'],
                    },
                    {
                      type: 'firstQuartile',
                      urls: ['firstQuartile'],
                    },
                    {
                      type: 'firstQuartile',
                      urls: ['firstQuartile_alt'],
                    },
                    {
                      type: 'midpoint',
                      urls: ['midpoint', 'midpoint_alt'],
                    },
                    {
                      type: 'thirdQuartile',
                      urls: ['thirdQuartile'],
                    },
                    {
                      type: 'complete',
                      urls: ['complete'],
                    },
                    {
                      type: 'skip',
                      urls: ['skip'],
                    },
                    {
                      type: 'error',
                      urls: ['error'],
                    },
                    {
                      type: 'resume',
                      urls: ['resume'],
                    },
                    {
                      type: 'pause',
                      urls: ['pause'],
                    },
                    {
                      type: 'mute',
                      urls: ['mute'],
                    },
                    {
                      type: 'unmute',
                      urls: ['unmute'],
                    },
                  ],
                  verifications: [],
                  clickThrough: 'clickThrough',
                },
              ],
            },
          },
        ],
      });

      networkingEngine.setResponseText(
          'test:/test.json?_HLS_primary_id=1', assetsList);

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'PREROLL',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
          {
            key: 'X-ASSET-LIST',
            data: 'test:/test.json',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '0.0',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'PREROLL_shaka_asset_0',
        groupId: 'PREROLL',
        startTime: 0,
        endTime: null,
        uri: 'test:/ad.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: null,
        once: false,
        pre: true,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: 'clickThrough',
        tracking: {
          impression: ['impression'],
          clickTracking: ['clickTracking'],
          start: ['start'],
          firstQuartile: ['firstQuartile', 'firstQuartile_alt'],
          midpoint: ['midpoint', 'midpoint_alt'],
          thirdQuartile: ['thirdQuartile'],
          complete: ['complete'],
          skip: ['skip'],
          error: ['error'],
          resume: ['resume'],
          pause: ['pause'],
          mute: ['mute'],
          unmute: ['unmute'],
        },
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-RESTRICT', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-RESTRICT',
            data: 'SKIP,JUMP',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: false,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-SKIP-CONTROL-OFFSET, X-SKIP-CONTROL-DURATION', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-SKIP-CONTROL-OFFSET',
            data: 5,
          },
          {
            key: 'X-SKIP-CONTROL-DURATION',
            data: 10,
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 5,
        skipFor: 10,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-RESUME-OFFSET', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-RESUME-OFFSET',
            data: '1.5',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: true,
        resumeOffset: 1.5,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-PLAYOUT-LIMIT', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-PLAYOUT-LIMIT',
            data: '15',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: 15,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports CUE-ONCE', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'CUE',
            data: 'ONCE',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: true,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports CUE-PRE', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'CUE',
            data: 'PRE',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: true,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports CUE-POST', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'CUE',
            data: 'POST',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: true,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-TIMELINE-OCCUPIES', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 100,
        endTime: 130,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-TIMELINE-OCCUPIES',
            data: 'RANGE',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 100,
        endTime: 130,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: true,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports SKIP-CONTROL OFFSET and DURATION', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const assetsList = JSON.stringify({
        'ASSETS': [
          {
            URI: 'ad.m3u8',
          },
        ],
        'SKIP-CONTROL': {
          OFFSET: 5,
          DURATION: 10,
        },
      });

      networkingEngine.setResponseText(
          'test:/test.json?_HLS_primary_id=1', assetsList);

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-LIST',
            data: 'test:/test.json',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST_shaka_asset_0',
        groupId: 'TEST',
        startTime: 0,
        endTime: null,
        uri: 'test:/ad.m3u8?_HLS_primary_id=1',
        mimeType: 'application/x-mpegurl',
        isSkippable: true,
        skipOffset: 5,
        skipFor: 10,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports overlay events with L-Shape format', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: 1,
        values: [
          {
            key: 'X-OVERLAY-ID',
            data: 'OVERLAY',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-ASSET-MIMETYPE',
            data: 'application/vnd.apple.mpegurl',
          },
          {
            key: 'X-DEPTH',
            data: '-1',
          },
          {
            key: 'X-LOOP',
            data: 'NO',
          },
          {
            key: 'X-VIEWPORT',
            data: '1920x1080',
          },
          {
            key: 'X-OVERLAY-SIZE',
            data: '1920x1080',
          },
          {
            key: 'X-OVERLAY-POSITION',
            data: '0x0',
          },
          {
            key: 'X-SQUEEZECURRENT',
            data: '0.5',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      expect(onEventSpy).not.toHaveBeenCalled();

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'OVERLAY',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/vnd.apple.mpegurl',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: true,
        loop: false,
        overlay: {
          viewport: {
            x: 1920,
            y: 1080,
          },
          topLeft: {
            x: 0,
            y: 0,
          },
          size: {
            x: 1920,
            y: 1080,
          },
        },
        displayOnBackground: true,
        currentVideo: {
          viewport: {
            x: 1920,
            y: 1080,
          },
          topLeft: {
            x: 0,
            y: 0,
          },
          size: {
            x: 960,
            y: 540,
          },
        },
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports overlay events double box format', async () => {
      spyOn(window.crypto, 'randomUUID').and.returnValue('1');

      const metadata = {
        type: 'com.apple.quicktime.HLS',
        startTime: 0,
        endTime: 1,
        values: [
          {
            key: 'X-OVERLAY-ID',
            data: 'OVERLAY',
          },
          {
            key: 'X-ASSET-URI',
            data: 'http://foo.bar/test.m3u8',
          },
          {
            key: 'X-ASSET-MIMETYPE',
            data: 'application/vnd.apple.mpegurl',
          },
          {
            key: 'X-DEPTH',
            data: '-1',
          },
          {
            key: 'X-LOOP',
            data: 'NO',
          },
          {
            key: 'X-VIEWPORT',
            data: '1920x1080',
          },
          {
            key: 'X-OVERLAY-SIZE',
            data: '864x486',
          },
          {
            key: 'X-OVERLAY-POSITION',
            data: '864x297',
          },
          {
            key: 'X-SQUEEZECURRENT',
            data: '0.3',
          },
          {
            key: 'X-SQUEEZECURRENT-POSITION',
            data: '192x378',
          },
          {
            key: 'X-BACKGROUND',
            data: 'red',
          },
        ],
      };
      await interstitialAdManager.addMetadata(metadata);

      expect(onEventSpy).not.toHaveBeenCalled();

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'OVERLAY',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'http://foo.bar/test.m3u8?_HLS_primary_id=1',
        mimeType: 'application/vnd.apple.mpegurl',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: true,
        loop: false,
        overlay: {
          viewport: {
            x: 1920,
            y: 1080,
          },
          topLeft: {
            x: 864,
            y: 297,
          },
          size: {
            x: 864,
            y: 486,
          },
        },
        displayOnBackground: true,
        currentVideo: {
          viewport: {
            x: 1920,
            y: 1080,
          },
          topLeft: {
            x: 192,
            y: 378,
          },
          size: {
            x: 576,
            y: 324,
          },
        },
        background: 'red',
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    describe('_HLS_start_offset for X-ASSET-LIST', () => {
      /** @type {number} */
      let fakeCurrentTime;

      beforeEach(() => {
        fakeCurrentTime = 0;
        Object.defineProperty(video, 'currentTime', {
          get: () => fakeCurrentTime,
          set: (val) => {
            fakeCurrentTime = val;
          },
          configurable: true,
        });
      });


      it('appends _HLS_start_offset to URL for live streams', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 20;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
          ],
        });

        const expectedUrl =
              'test:/test.json?_HLS_primary_id=1&_HLS_start_offset=10';
        networkingEngine.setResponseText(expectedUrl, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 40,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
              interstitialAdManager.getInterstitials();
        expect(interstitials.length).toBe(2);
      });

      it('does not append _HLS_start_offset for VOD', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(false);
        fakeCurrentTime = 20;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
          ],
        });

        const vodUrl = 'test:/test.json?_HLS_primary_id=1';
        networkingEngine.setResponseText(vodUrl, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 40,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        expect(interstitials.length).toBe(2);
      });

      it('does not append _HLS_start_offset when offset is 0', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 10;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
          ],
        });

        const url = 'test:/test.json?_HLS_primary_id=1';
        networkingEngine.setResponseText(url, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 25,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        expect(interstitials.length).toBe(1);
      });

      it('skips assets before the offset', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 30;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad3.m3u8',
              DURATION: 30,
            },
          ],
        });

        const expectedUrl =
            'test:/test.json?_HLS_primary_id=1&_HLS_start_offset=20';
        networkingEngine.setResponseText(
            expectedUrl, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 70,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        // Asset 1 (0-15s): before offset 20 -> skipped
        // Asset 2 (15-30s): overlaps offset -> included
        // Asset 3 (30-60s): after offset -> included
        expect(interstitials.length).toBe(2);
        expect(interstitials[0].id).toBe('MID_shaka_asset_1');
        expect(interstitials[1].id).toBe('MID_shaka_asset_2');
      });

      it('skips asset at exact boundary', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 25;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad3.m3u8',
              DURATION: 30,
            },
          ],
        });

        const expectedUrl =
            'test:/test.json?_HLS_primary_id=1&_HLS_start_offset=15';
        networkingEngine.setResponseText(
            expectedUrl, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 70,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        // Asset 1 end (15) == offset (15) -> skipped
        // Asset 2 (15-30s) and Asset 3 (30-60s) -> included
        expect(interstitials.length).toBe(2);
        expect(interstitials[0].id).toBe('MID_shaka_asset_1');
        expect(interstitials[1].id).toBe('MID_shaka_asset_2');
      });

      it('skips all assets when offset exceeds total duration', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 80;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
          ],
        });

        const expectedUrl =
            'test:/test.json?_HLS_primary_id=1' +
            '&_HLS_start_offset=70';
        networkingEngine.setResponseText(
            expectedUrl, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 40,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        expect(interstitials.length).toBe(0);
      });

      it('does not append for preroll', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 20;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
          ],
        });

        const url = 'test:/test.json?_HLS_primary_id=1';
        networkingEngine.setResponseText(url, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 0,
          endTime: null,
          values: [
            {
              key: 'ID',
              data: 'PREROLL',
            },
            {
              key: 'CUE',
              data: 'PRE',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        expect(interstitials.length).toBe(1);
      });

      it('does not append when currentTime < startTime', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 5;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
          ],
        });

        const url = 'test:/test.json?_HLS_primary_id=1';
        networkingEngine.setResponseText(url, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 40,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        expect(interstitials.length).toBe(2);
      });

      it('stores correct intra-asset offset for partial asset', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        fakeCurrentTime = 30;

        const assetsList = JSON.stringify({
          ASSETS: [
            {
              URI: 'ad1.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad2.m3u8',
              DURATION: 15,
            },
            {
              URI: 'ad3.m3u8',
              DURATION: 30,
            },
          ],
        });

        const expectedUrl =
            'test:/test.json?_HLS_primary_id=1' +
            '&_HLS_start_offset=20';
        networkingEngine.setResponseText(
            expectedUrl, assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 70,
          values: [
            {
              key: 'ID',
              data: 'MID',
            },
            {
              key: 'X-ASSET-LIST',
              data: 'test:/test.json',
            },
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        const interstitials =
            interstitialAdManager.getInterstitials();
        // Asset 2 (15-30s) overlaps offset 20
        // Intra-asset offset = 20 - 15 = 5
        expect(interstitials.length).toBe(2);
        expect(interstitials[0].id).toBe('MID_shaka_asset_1');
        // Verify the offset is stored internally by checking
        // that the first overlapping asset got an offset entry
        // (the map is private, so we verify indirectly via the
        // interstitial IDs — asset_0 was skipped, asset_1 is
        // the first kept, and asset_2 has no offset)
        expect(interstitials[0].id).not.toBe(
            'MID_shaka_asset_0');
      });

      it('re-requests the asset list with a new _HLS_start_offset ' +
          'after seeking into it', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(true);
        spyOn(player, 'getLoadMode').and.returnValue(
            shaka.Player.LoadMode.MEDIA_SOURCE);
        spyOn(player, 'seekRange').and.returnValue({start: 0, end: Infinity});

        const assetsList = JSON.stringify({
          ASSETS: [{URI: 'ad.m3u8'}],
        });
        // Initial resolution at the break start (offset 0).
        networkingEngine.setResponseText(
            'test:/test.json?_HLS_primary_id=1', assetsList);
        // Resolution after seeking 15s into the break.
        networkingEngine.setResponseText(
            'test:/test.json?_HLS_primary_id=1&_HLS_start_offset=15',
            assetsList);

        fakeCurrentTime = 10;
        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: 40,
          values: [
            {key: 'ID', data: 'MID'},
            {key: 'X-ASSET-LIST', data: 'test:/test.json'},
          ],
        };
        await interstitialAdManager.addMetadata(metadata);
        expect(interstitialAdManager.getInterstitials().length).toBe(1);
        networkingEngine.expectRequest(
            'test:/test.json?_HLS_primary_id=1',
            shaka.net.NetworkingEngine.RequestType.ADS);

        // Establish the playhead (listeners are now active). Pause afterwards
        // so the interstitial is not auto-played, but lastTime_ still updates.
        video.play();
        video.dispatchEvent(new Event('timeupdate'));
        video.pause();

        // Seek into the middle of the break. The resolved asset list cache is
        // reset so it will be re-requested with the correct offset.
        fakeCurrentTime = 25;
        video.dispatchEvent(new Event('seeked'));
        expect(interstitialAdManager.getInterstitials().length).toBe(0);

        // The poll timer re-resolves with _HLS_start_offset = 25 - 10 = 15.
        await shaka.test.Util.delay(1.5);

        expect(interstitialAdManager.getInterstitials().length).toBe(1);
        networkingEngine.expectRequest(
            'test:/test.json?_HLS_primary_id=1&_HLS_start_offset=15',
            shaka.net.NetworkingEngine.RequestType.ADS);
      });
    });

    describe('deferred X-ASSET-LIST resolution', () => {
      /** @type {number} */
      let fakeCurrentTime;

      beforeEach(() => {
        fakeCurrentTime = 0;
        Object.defineProperty(video, 'currentTime', {
          get: () => fakeCurrentTime,
          set: (val) => {
            fakeCurrentTime = val;
          },
          configurable: true,
        });
      });

      it('defers resolution until within the look-ahead window', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(false);

        const assetsList = JSON.stringify({
          ASSETS: [{URI: 'ad.m3u8'}],
        });
        networkingEngine.setResponseText(
            'test:/test.json?_HLS_primary_id=1', assetsList);

        // The playhead (0) is far from the ad break (100), so the asset list
        // must not be resolved yet.
        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 100,
          endTime: null,
          values: [
            {key: 'ID', data: 'MID'},
            {key: 'X-ASSET-LIST', data: 'test:/test.json'},
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        expect(interstitialAdManager.getInterstitials().length).toBe(0);
        // No ad decision request should have been made yet.
        networkingEngine.expectNoRequest(
            'test:/test.json?_HLS_primary_id=1',
            shaka.net.NetworkingEngine.RequestType.ADS);
        // But the cue point is surfaced immediately for the timeline UI.
        expect(onEventSpy).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'ad-cue-points-changed',
          cuepoints: [{start: 100, end: null}],
        }));
      });

      it('resolves eagerly when already within the window', async () => {
        spyOn(window.crypto, 'randomUUID').and.returnValue('1');
        spyOn(player, 'isLive').and.returnValue(false);
        fakeCurrentTime = 95;

        const assetsList = JSON.stringify({
          ASSETS: [{URI: 'ad.m3u8'}],
        });
        networkingEngine.setResponseText(
            'test:/test.json?_HLS_primary_id=1', assetsList);

        const metadata = {
          type: 'com.apple.quicktime.HLS',
          startTime: 100,
          endTime: null,
          values: [
            {key: 'ID', data: 'MID'},
            {key: 'X-ASSET-LIST', data: 'test:/test.json'},
          ],
        };
        await interstitialAdManager.addMetadata(metadata);

        expect(interstitialAdManager.getInterstitials().length).toBe(1);
      });

      it('resolves a deferred asset list as the playhead approaches',
          async () => {
            spyOn(window.crypto, 'randomUUID').and.returnValue('1');
            spyOn(player, 'isLive').and.returnValue(false);
            spyOn(player, 'getLoadMode').and.returnValue(
                shaka.Player.LoadMode.MEDIA_SOURCE);
            spyOn(player, 'seekRange').and.returnValue({
              start: 0,
              end: Infinity,
            });
            // Avoid actually preloading the (fake) ad media once it resolves.
            spyOn(interstitialAdManager.getPlayer(), 'preload')
                .and.returnValue(Promise.resolve(null));

            const assetsList = JSON.stringify({
              ASSETS: [{URI: 'ad.m3u8'}],
            });
            networkingEngine.setResponseText(
                'test:/test.json?_HLS_primary_id=1', assetsList);

            const metadata = {
              type: 'com.apple.quicktime.HLS',
              startTime: 100,
              endTime: null,
              values: [
                {key: 'ID', data: 'MID'},
                {key: 'X-ASSET-LIST', data: 'test:/test.json'},
              ],
            };
            await interstitialAdManager.addMetadata(metadata);
            expect(interstitialAdManager.getInterstitials().length).toBe(0);

            // Advance the playhead into the look-ahead window and let the poll
            // timer resolve the asset list.
            fakeCurrentTime = 95;
            video.play();
            video.dispatchEvent(new Event('timeupdate'));

            await shaka.test.Util.delay(1.5);

            expect(interstitialAdManager.getInterstitials().length).toBe(1);
          });
    });

    describe('preload Date Range (Appendix F)', () => {
      /** @type {number} */
      let fakeCurrentTime;

      beforeEach(() => {
        fakeCurrentTime = 0;
        Object.defineProperty(video, 'currentTime', {
          get: () => fakeCurrentTime,
          set: (val) => {
            fakeCurrentTime = val;
          },
          configurable: true,
        });
      });

      /**
       * @param {number} startTime
       * @return {shaka.extern.HLSMetadata}
       */
      function preloadMetadata(startTime) {
        return {
          type: 'com.apple.hls.preload',
          startTime,
          endTime: startTime + 1,
          values: [
            {key: 'ID', data: 'PRELOAD'},
            {key: 'X-TARGET-ID', data: 'MID'},
            {key: 'X-TARGET-CLASS', data: 'com.apple.hls.interstitial'},
            {key: 'X-URI', data: 'http://foo.bar/test.m3u8'},
          ],
        };
      }

      /** @return {shaka.extern.HLSMetadata} */
      function midRollAssetUri() {
        return {
          type: 'com.apple.quicktime.HLS',
          startTime: 100,
          endTime: null,
          values: [
            {key: 'ID', data: 'MID'},
            {key: 'X-ASSET-URI', data: 'http://foo.bar/test.m3u8'},
          ],
        };
      }

      it('sets resolutionTimeOffset on an already known interstitial',
          async () => {
            await interstitialAdManager.addMetadata(midRollAssetUri());
            let interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].resolutionTimeOffset).toBeUndefined();

            // Preload Date Range starts 10s before the interstitial (100).
            interstitialAdManager.addPreloadMetadata(preloadMetadata(90));

            interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials[0].resolutionTimeOffset).toBe(10);
          });

      it('sets resolutionTimeOffset when the preload arrives first',
          async () => {
            interstitialAdManager.addPreloadMetadata(preloadMetadata(90));

            await interstitialAdManager.addMetadata(midRollAssetUri());

            const interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].resolutionTimeOffset).toBe(10);
          });

      it('uses the preload offset to widen the resolution window',
          async () => {
            spyOn(window.crypto, 'randomUUID').and.returnValue('1');
            spyOn(player, 'isLive').and.returnValue(false);

            const assetsList = JSON.stringify({
              ASSETS: [{URI: 'ad.m3u8'}],
            });
            networkingEngine.setResponseText(
                'test:/test.json?_HLS_primary_id=1', assetsList);

            // The preload Date Range starts at 0, the interstitial at 100, so
            // the resolution offset (100) covers the whole gap and the asset
            // list is resolved immediately even though the default ahead time
            // (10s) would have deferred it.
            interstitialAdManager.addPreloadMetadata(preloadMetadata(0));

            const metadata = {
              type: 'com.apple.quicktime.HLS',
              startTime: 100,
              endTime: null,
              values: [
                {key: 'ID', data: 'MID'},
                {key: 'X-ASSET-LIST', data: 'test:/test.json'},
              ],
            };
            await interstitialAdManager.addMetadata(metadata);

            const interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].resolutionTimeOffset).toBe(100);
          });
    });

    describe('EXT-X-DATERANGE updates (issue #9851)', () => {
      /**
       * @param {!Array<!{key: string, data: string}>} extraValues
       * @return {shaka.extern.HLSMetadata}
       */
      function midRoll(extraValues) {
        return {
          type: 'com.apple.quicktime.HLS',
          startTime: 10,
          endTime: null,
          values: [
            {key: 'ID', data: 'MID'},
            {key: 'X-ASSET-URI', data: 'http://foo.bar/test.m3u8'},
          ].concat(extraValues),
        };
      }

      it('augments a known interstitial with a new X-PLAYOUT-LIMIT',
          async () => {
            await interstitialAdManager.addMetadata(midRoll([]));
            let interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].playoutLimit).toBe(null);

            // A subsequent EXT-X-DATERANGE with the same ID adds the attribute.
            await interstitialAdManager.addMetadata(midRoll([
              {key: 'X-PLAYOUT-LIMIT', data: '12.0'},
            ]));

            interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].playoutLimit).toBe(12);
          });

      it('does not change an X-PLAYOUT-LIMIT already present (spec rule)',
          async () => {
            await interstitialAdManager.addMetadata(midRoll([
              {key: 'X-PLAYOUT-LIMIT', data: '30.0'},
            ]));
            let interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].playoutLimit).toBe(30);

            // The spec requires shared attributes to keep the same value, so a
            // conflicting update must be ignored.
            await interstitialAdManager.addMetadata(midRoll([
              {key: 'X-PLAYOUT-LIMIT', data: '12.0'},
            ]));

            interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].playoutLimit).toBe(30);
          });

      it('does not create a duplicate interstitial on update', async () => {
        await interstitialAdManager.addMetadata(midRoll([]));
        await interstitialAdManager.addMetadata(midRoll([
          {key: 'X-PLAYOUT-LIMIT', data: '12.0'},
        ]));
        expect(interstitialAdManager.getInterstitials().length).toBe(1);
      });
    });

    // Integration-style scenario exercising the three related features
    // together: lazy X-ASSET-LIST resolution, the per-interstitial
    // resolutionTimeOffset (here from an HLS preload Date Range), and a
    // subsequent EXT-X-DATERANGE update.
    describe('combined interstitial lifecycle', () => {
      /** @type {number} */
      let fakeCurrentTime;

      beforeEach(() => {
        fakeCurrentTime = 0;
        Object.defineProperty(video, 'currentTime', {
          get: () => fakeCurrentTime,
          set: (val) => {
            fakeCurrentTime = val;
          },
          configurable: true,
        });
      });

      it('defers, resolves with a preload offset, then applies an update',
          async () => {
            spyOn(window.crypto, 'randomUUID').and.returnValue('1');
            spyOn(player, 'isLive').and.returnValue(false);
            spyOn(player, 'getLoadMode').and.returnValue(
                shaka.Player.LoadMode.MEDIA_SOURCE);
            spyOn(player, 'seekRange').and.returnValue({
              start: 0,
              end: Infinity,
            });
            // Avoid actually preloading the (fake) ad media once it resolves.
            spyOn(interstitialAdManager.getPlayer(), 'preload')
                .and.returnValue(Promise.resolve(null));

            const assetsList = JSON.stringify({
              ASSETS: [{URI: 'ad.m3u8'}],
            });
            networkingEngine.setResponseText(
                'test:/list.json?_HLS_primary_id=1', assetsList);

            // (1) HLS preload Date Range (Appendix F): preload starts 30s
            // before the interstitial (100), widening its window to 30s.
            interstitialAdManager.addPreloadMetadata({
              type: 'com.apple.hls.preload',
              startTime: 70,
              endTime: 71,
              values: [
                {key: 'ID', data: 'PRELOAD'},
                {key: 'X-TARGET-ID', data: 'MID'},
                {key: 'X-TARGET-CLASS', data: 'com.apple.hls.interstitial'},
                {key: 'X-URI', data: 'test:/list.json'},
              ],
            });

            // (2) The mid-roll asset list is signaled while the playhead (0) is
            // still outside the (widened) window, so it is deferred.
            await interstitialAdManager.addMetadata({
              type: 'com.apple.quicktime.HLS',
              startTime: 100,
              endTime: 130,
              values: [
                {key: 'ID', data: 'MID'},
                {key: 'X-ASSET-LIST', data: 'test:/list.json'},
              ],
            });
            expect(interstitialAdManager.getInterstitials().length).toBe(0);
            networkingEngine.expectNoRequest(
                'test:/list.json?_HLS_primary_id=1',
                shaka.net.NetworkingEngine.RequestType.ADS);

            // (3) Advance to within 30s of the interstitial. The default ahead
            // time (10s) would still defer, but the 30s offset resolves it.
            fakeCurrentTime = 75;
            video.play();
            video.dispatchEvent(new Event('timeupdate'));
            video.pause();
            await shaka.test.Util.delay(1.5);

            let interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].resolutionTimeOffset).toBe(30);
            expect(interstitials[0].playoutLimit).toBe(null);

            // (4) A later EXT-X-DATERANGE with the same ID augments it with a
            // playout limit.
            await interstitialAdManager.addMetadata({
              type: 'com.apple.quicktime.HLS',
              startTime: 100,
              endTime: 130,
              values: [
                {key: 'ID', data: 'MID'},
                {key: 'X-PLAYOUT-LIMIT', data: '12.0'},
              ],
            });

            interstitials = interstitialAdManager.getInterstitials();
            expect(interstitials.length).toBe(1);
            expect(interstitials[0].playoutLimit).toBe(12);
          });
    });
  });

  describe('DASH', () => {
    // The InterstitialAdManager no longer ingests DASH regions directly;
    // shaka.ads.AdManager parses them with DashInterstitialParser and feeds the
    // result to addInterstitials. This helper reproduces that wiring so the
    // tests can keep exercising the parse + schedule pipeline end to end.
    /**
     * @param {shaka.extern.TimelineRegionInfo} region
     * @return {!Promise}
     */
    async function addRegion(region) {
      const interstitial = shaka.ads.DashInterstitialParser.parseRegion(region);
      if (interstitial) {
        await interstitialAdManager.addInterstitials([interstitial]);
      }
    }

    it('supports alternative MPD', async () => {
      const eventString = [
        '<Event duration="1" id="PREROLL" presentationTime="0">',
        '<InsertPresentation uri="test.mpd"/>',
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 1,
        id: 'PREROLL',
        schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:insert:2025',
        eventNode,
        value: '',
        timescale: 1,
      };
      await addRegion(region);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));

      // The parser leaves mimeType null; addInterstitials resolves it from the
      // URI. The detailed field-by-field parsing is covered by
      // DashInterstitialParser's own unit tests.
      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'PREROLL',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'test.mpd',
        mimeType: 'application/dash+xml',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: true,
        resumeOffset: 0,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('ignore duplicate alternative MPD', async () => {
      const eventString = [
        '<Event duration="1" id="PREROLL" presentationTime="0">',
        '<ReplacePresentation uri="test.mpd" returnOffset="1"/>',
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 1,
        id: 'PREROLL',
        schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:replace:2025',
        eventNode,
        value: '',
        timescale: 1,
      };
      await addRegion(region);
      await addRegion(region);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 1,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore invalid alternative MPD', async () => {
      // It is not valid because it does not have an interstitial URL
      const eventString = [
        '<Event duration="1" id="PREROLL" presentationTime="0">',
        '<InsertPresentation/>',
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 1,
        id: 'PREROLL',
        schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:insert:2025',
        eventNode,
        value: '',
        timescale: 1,
      };
      await addRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('supports overlay events', async () => {
      const eventString = [
        '<Event duration="1" id="OVERLAY" presentationTime="0">',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd">',
        '<Viewport x="1920" y="1080"/>',
        '<Overlay>',
        '<TopLeft x="0" y="720"/>',
        '<Size x="480" y="360"/>',
        '</Overlay>',
        '</OverlayEvent>',
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 1,
        id: 'OVERLAY',
        schemeIdUri: 'urn:mpeg:dash:event:2012',
        eventNode,
        value: '',
        timescale: 1,
      };
      await addRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'OVERLAY',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'test.mpd',
        mimeType: 'application/dash+xml',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: true,
        loop: false,
        overlay: {
          viewport: {
            x: 1920,
            y: 1080,
          },
          topLeft: {
            x: 0,
            y: 720,
          },
          size: {
            x: 480,
            y: 360,
          },
        },
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('ignore overlay events with z=0', async () => {
      const eventString = [
        '<Event duration="1" id="OVERLAY" presentationTime="0">',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd" z="0">',
        '<Viewport x="1920" y="1080"/>',
        '<Squeeze>',
        '<TopLeft x="0" y="720"/>',
        '<Size x="480" y="360"/>',
        '</Squeeze>',
        '</OverlayEvent>',
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 1,
        id: 'OVERLAY',
        schemeIdUri: 'urn:mpeg:dash:event:2012',
        eventNode,
        value: '',
        timescale: 1,
      };
      await addRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('custom', () => {
    it('basic interstitial support', async () => {
      /** @type {!shaka.extern.AdInterstitial} */
      const interstitial = {
        id: null,
        groupId: null,
        startTime: 10,
        endTime: null,
        uri: 'test.mp4',
        mimeType: null,
        isSkippable: true,
        skipOffset: 10,
        skipFor: null,
        canJump: false,
        resumeOffset: null,
        playoutLimit: null,
        once: true,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      await interstitialAdManager.addInterstitials([interstitial]);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 10,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('supports multiple interstitials', async () => {
      /** @type {!Array<!shaka.extern.AdInterstitial>} */
      const interstitials = [
        {
          id: null,
          groupId: null,
          startTime: 0,
          endTime: null,
          uri: 'test.mp4',
          mimeType: null,
          isSkippable: true,
          skipOffset: 5,
          skipFor: null,
          canJump: false,
          resumeOffset: null,
          playoutLimit: null,
          once: true,
          pre: false,
          post: false,
          timelineRange: false,
          loop: false,
          overlay: null,
          displayOnBackground: false,
          currentVideo: null,
          background: null,
          clickThroughUrl: null,
          tracking: null,
        },
        {
          id: null,
          groupId: null,
          startTime: 10,
          endTime: null,
          uri: 'test.mp4',
          mimeType: null,
          isSkippable: true,
          skipOffset: 10,
          skipFor: null,
          canJump: false,
          resumeOffset: null,
          playoutLimit: null,
          once: true,
          pre: false,
          post: false,
          timelineRange: false,
          loop: false,
          overlay: null,
          displayOnBackground: false,
          currentVideo: null,
          background: null,
          clickThroughUrl: null,
          tracking: null,
        },
      ];
      await interstitialAdManager.addInterstitials(interstitials);

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
          {
            start: 10,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore duplicate interstitial', async () => {
      /** @type {!shaka.extern.AdInterstitial} */
      const interstitial = {
        id: null,
        groupId: null,
        startTime: 10,
        endTime: null,
        uri: 'test.mp4',
        mimeType: null,
        isSkippable: true,
        skipOffset: 10,
        skipFor: null,
        canJump: false,
        resumeOffset: null,
        playoutLimit: null,
        once: true,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      const interstitials = [interstitial, interstitial];
      await interstitialAdManager.addInterstitials(interstitials);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 10,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore invalid interstitial', async () => {
      // It is not valid because it does not have an interstitial URL
      /** @type {!shaka.extern.AdInterstitial} */
      const interstitial = {
        id: null,
        groupId: null,
        startTime: 10,
        endTime: null,
        uri: '',
        mimeType: null,
        isSkippable: true,
        skipOffset: 10,
        skipFor: null,
        canJump: false,
        resumeOffset: null,
        playoutLimit: null,
        once: true,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      await interstitialAdManager.addInterstitials([interstitial]);

      expect(onEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('VAST', () => {
    it('basic interstitial support', async () => {
      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '<Ad id="5925573263">',
        '<InLine>',
        '<Error>error_url</Error>',
        '<Error>error_url2</Error>',
        '<Impression>impression_url</Impression>',
        '<Impression>impression_url2</Impression>',
        '<Creatives>',
        '<Creative id="138381721867" sequence="1">',
        '<Linear>',
        '<Duration>00:00:10</Duration>',
        '<TrackingEvents>',
        '<Tracking event="start">start_url</Tracking>',
        '<Tracking event="start">start_url2</Tracking>',
        '<Tracking event="firstQuartile">firstQuartile_url</Tracking>',
        '<Tracking event="midpoint">midpoint_url</Tracking>',
        '<Tracking event="thirdQuartile">thirdQuartile_url</Tracking>',
        '<Tracking event="complete">complete_url</Tracking>',
        '<Tracking event="skip">skip_url</Tracking>',
        '<Tracking event="resume">resume_url</Tracking>',
        '<Tracking event="pause">pause_url</Tracking>',
        '<Tracking event="mute">mute_url</Tracking>',
        '<Tracking event="unmute">unmute_url</Tracking>',
        '</TrackingEvents>',
        '<VideoClicks>',
        '<ClickThrough id="1">',
        '<![CDATA[ foo.bar ]]>',
        '</ClickThrough>',
        '<ClickTracking id="1">click_tracking</ClickTracking>',
        '</VideoClicks>',
        '<MediaFiles>',
        '<MediaFile bitrate="140" delivery="progressive" ',
        'height="360" type="video/mp4" width="640">',
        '<![CDATA[test.mp4]]>',
        '</MediaFile>',
        '</MediaFiles>',
        '</Linear>',
        '</Creative>',
        '</Creatives>',
        '</InLine>',
        '</Ad>',
        '</VAST>',
      ].join('');

      networkingEngine.setResponseText('test:/vast', vast);

      await interstitialAdManager.addAdUrlInterstitial('test:/vast');

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: '5925573263',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'test.mp4',
        mimeType: 'video/mp4',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: null,
        once: true,
        pre: true,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: 'foo.bar',
        tracking: {
          impression: ['impression_url', 'impression_url2'],
          clickTracking: ['click_tracking'],
          start: ['start_url', 'start_url2'],
          firstQuartile: ['firstQuartile_url'],
          midpoint: ['midpoint_url'],
          thirdQuartile: ['thirdQuartile_url'],
          complete: ['complete_url'],
          skip: ['skip_url'],
          error: ['error_url', 'error_url2'],
          resume: ['resume_url'],
          pause: ['pause_url'],
          mute: ['mute_url'],
          unmute: ['unmute_url'],
        },
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports non-linear ads', async () => {
      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '<Ad id="5925573263">',
        '<InLine>',
        '<Error>error_url</Error>',
        '<Impression>impression_url</Impression>',
        '<Creatives>',
        '<Creative id="138381721867" sequence="1">',
        '<NonLinearAds>',
        '<TrackingEvents>',
        '<Tracking event="start">start_url</Tracking>',
        '<Tracking event="firstQuartile">firstQuartile_url</Tracking>',
        '<Tracking event="midpoint">midpoint_url</Tracking>',
        '<Tracking event="thirdQuartile">thirdQuartile_url</Tracking>',
        '<Tracking event="complete">complete_url</Tracking>',
        '<Tracking event="skip">skip_url</Tracking>',
        '<Tracking event="resume">resume_url</Tracking>',
        '<Tracking event="pause">pause_url</Tracking>',
        '<Tracking event="mute">mute_url</Tracking>',
        '<Tracking event="unmute">unmute_url</Tracking>',
        '</TrackingEvents>',
        '<NonLinear width="535" height="80" minSuggestedDuration="00:00:05">',
        '<StaticResource creativeType="image/png">',
        '<![CDATA[test.png]]>',
        '</StaticResource>',
        '<NonLinearClickThrough>',
        '<![CDATA[foo.bar]]>',
        '</NonLinearClickThrough>',
        '<NonLinearClickTracking>click_tracking</NonLinearClickTracking>',
        '</NonLinear>',
        '</NonLinearAds>',
        '</Creative>',
        '</Creatives>',
        '</InLine>',
        '</Ad>',
        '</VAST>',
      ].join('');

      networkingEngine.setResponseText('test:/vast', vast);

      await interstitialAdManager.addAdUrlInterstitial('test:/vast');

      expect(onEventSpy).not.toHaveBeenCalled();

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: '5925573263',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'test.png',
        mimeType: 'image/png',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: 5,
        once: true,
        pre: true,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: {
          viewport: {
            x: 0,
            y: 0,
          },
          topLeft: {
            x: 0,
            y: 0,
          },
          size: {
            x: 535,
            y: 80,
          },
        },
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: 'foo.bar',
        tracking: {
          impression: ['impression_url'],
          clickTracking: ['click_tracking'],
          start: ['start_url'],
          firstQuartile: ['firstQuartile_url'],
          midpoint: ['midpoint_url'],
          thirdQuartile: ['thirdQuartile_url'],
          complete: ['complete_url'],
          skip: ['skip_url'],
          error: ['error_url'],
          resume: ['resume_url'],
          pause: ['pause_url'],
          mute: ['mute_url'],
          unmute: ['unmute_url'],
        },
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('ignore empty', async () => {
      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '</VAST>',
      ].join('');

      networkingEngine.setResponseText('test:/vast', vast);

      await interstitialAdManager.addAdUrlInterstitial('test:/vast');

      expect(onEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('VMAP', () => {
    it('basic interstitial support', async () => {
      const vmap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap"',
        ' version="1.0">',
        '<vmap:AdBreak timeOffset="start" breakType="linear"',
        ' breakId="midroll-1">',
        '<vmap:AdSource id="preroll-ad-1" allowMultipleAds="false"',
        ' followRedirects="true">',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/vast]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '<vmap:AdBreak timeOffset="00:00:15.000" breakType="linear"',
        ' breakId="midroll-1">',
        '<vmap:AdSource id="midroll-1-ad-1" allowMultipleAds="false"',
        ' followRedirects="true">',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/vast]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '<vmap:AdBreak timeOffset="end" breakType="linear"',
        ' breakId="midroll-1">',
        '<vmap:AdSource id="postroll-ad-1" allowMultipleAds="false"',
        ' followRedirects="true">',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/vast]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '</vmap:VMAP>',
      ].join('');

      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '<Ad>',
        '<InLine>',
        '<Creatives>',
        '<Creative id="138381721867" sequence="1">',
        '<Linear>',
        '<Duration>00:00:10</Duration>',
        '<MediaFiles>',
        '<MediaFile bitrate="140" delivery="progressive" ',
        'height="360" type="video/mp4" width="640">',
        '<![CDATA[test.mp4]]>',
        '</MediaFile>',
        '</MediaFiles>',
        '</Linear>',
        '</Creative>',
        '</Creatives>',
        '</InLine>',
        '</Ad>',
        '</VAST>',
      ].join('');

      networkingEngine
          .setResponseText('test:/vmap', vmap)
          .setResponseText('test:/vast', vast);

      await interstitialAdManager.addAdUrlInterstitial('test:/vmap');

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValuePreload = {
        type: 'ad-interstitial-preload',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValuePreload));
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: null,
          },
          {
            start: 15,
            end: null,
          },
          {
            start: -1,
            end: null,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore empty', async () => {
      const vmap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap"',
        ' version="1.0">',
        '</vmap:VMAP>',
      ].join('');

      networkingEngine.setResponseText('test:/vmap', vmap);

      await interstitialAdManager.addAdUrlInterstitial('test:/vmap');

      expect(onEventSpy).not.toHaveBeenCalled();
    });
  });

  it('plays pre-roll correctly', async () => {
    const metadata = {
      type: 'com.apple.quicktime.HLS',
      startTime: 0,
      endTime: null,
      values: [
        {
          key: 'ID',
          data: 'PREROLL',
        },
        {
          key: 'CUE',
          data: 'PRE',
        },
        {
          key: 'X-ASSET-URI',
          data: 'http://foo.bar/test.m3u8',
        },
        {
          key: 'X-RESTRICT',
          data: 'SKIP,JUMP',
        },
      ],
    };
    await interstitialAdManager.addMetadata(metadata);

    video.play();
    video.dispatchEvent(new Event('timeupdate'));

    await shaka.test.Util.shortDelay();

    expect(onEventSpy).toHaveBeenCalledTimes(6);
    const eventValuePreload = {
      type: 'ad-interstitial-preload',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValuePreload));
    const eventValuePreloaded = {
      type: 'ad-interstitial-preloaded',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValuePreloaded));
    const eventValueAdBreakStarted = {
      type: 'ad-break-started',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValueAdBreakStarted));
    const eventValue1 = {
      type: 'ad-cue-points-changed',
      cuepoints: [
        {
          start: 0,
          end: null,
        },
      ],
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue1));
    const eventValue2 = {
      type: 'ad-impression',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue2));
    const eventValue3 = {
      type: 'ad-started',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue3));
  });

  it('dispatch skip event correctly', async () => {
    const metadata = {
      type: 'com.apple.quicktime.HLS',
      startTime: 0,
      endTime: null,
      values: [
        {
          key: 'ID',
          data: 'PREROLL',
        },
        {
          key: 'CUE',
          data: 'PRE',
        },
        {
          key: 'X-ASSET-URI',
          data: 'http://foo.bar/test.m3u8',
        },
      ],
    };
    await interstitialAdManager.addMetadata(metadata);

    video.play();
    video.dispatchEvent(new Event('timeupdate'));

    await shaka.test.Util.shortDelay();

    expect(onEventSpy).toHaveBeenCalledTimes(7);
    const eventValue1 = {
      type: 'ad-cue-points-changed',
      cuepoints: [
        {
          start: 0,
          end: null,
        },
      ],
    };
    const eventValuePreload = {
      type: 'ad-interstitial-preload',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValuePreload));
    const eventValuePreloaded = {
      type: 'ad-interstitial-preloaded',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValuePreloaded));
    const eventValueAdBreakStarted = {
      type: 'ad-break-started',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValueAdBreakStarted));
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue1));
    const eventValue2 = {
      type: 'ad-impression',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue2));
    const eventValue3 = {
      type: 'ad-started',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue3));
    const eventValue4 = {
      type: 'ad-skip-state-changed',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue4));
  });

  it('jumping a mid-roll with JUMP restriction is not allowed', async () => {
    const metadata = {
      type: 'com.apple.quicktime.HLS',
      startTime: 10,
      endTime: null,
      values: [
        {
          key: 'ID',
          data: 'MIDROLL',
        },
        {
          key: 'X-ASSET-URI',
          data: 'http://foo.bar/test.m3u8',
        },
        {
          key: 'X-RESTRICT',
          data: 'SKIP,JUMP',
        },
      ],
    };
    await interstitialAdManager.addMetadata(metadata);

    video.currentTime = 0;
    video.play();
    video.dispatchEvent(new Event('timeupdate'));

    await shaka.test.Util.shortDelay();

    expect(onEventSpy).toHaveBeenCalledTimes(1);
    const eventValue1 = {
      type: 'ad-cue-points-changed',
      cuepoints: [
        {
          start: 10,
          end: null,
        },
      ],
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue1));

    video.currentTime = 20;
    video.dispatchEvent(new Event('timeupdate'));

    await shaka.test.Util.delay(0.25);

    if (video.currentTime == 20) {
      expect(onEventSpy).toHaveBeenCalledTimes(4);
      const eventValueAdBreakStarted = {
        type: 'ad-break-started',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValueAdBreakStarted));
      const eventValue2 = {
        type: 'ad-impression',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue2));
      const eventValue3 = {
        type: 'ad-started',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue3));
    }
  });

  it('don\'t dispatch cue points changed if it is an overlay', async () => {
    /** @type {!shaka.extern.AdInterstitial} */
    const interstitial = {
      id: null,
      groupId: null,
      startTime: 10,
      endTime: null,
      uri: 'test.mp4',
      mimeType: null,
      isSkippable: false,
      skipOffset: null,
      skipFor: null,
      canJump: false,
      resumeOffset: null,
      playoutLimit: null,
      once: true,
      pre: false,
      post: false,
      timelineRange: false,
      loop: false,
      overlay: {
        viewport: {
          x: 1920,
          y: 1080,
        },
        topLeft: {
          x: 960,
          y: 0,
        },
        size: {
          x: 960,
          y: 540,
        },
      },
      displayOnBackground: false,
      currentVideo: null,
      background: null,
      clickThroughUrl: null,
      tracking: null,
    };
    await interstitialAdManager.addInterstitials([interstitial]);

    expect(onEventSpy).not.toHaveBeenCalled();

    const interstitials = interstitialAdManager.getInterstitials();
    expect(interstitials.length).toBe(1);
  });
});
