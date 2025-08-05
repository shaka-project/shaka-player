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

  beforeEach(() => {
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
    onEventSpy = jasmine.createSpy('onEvent');
    interstitialAdManager = new shaka.ads.InterstitialAdManager(
        adContainer, player, video, shaka.test.Util.spyFunc(onEventSpy));
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
            data: 'test.m3u8',
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
    });

    it('supports multiple interstitials', async () => {
      const metadata = {
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
            data: 'test.m3u8',
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
            data: 'test.m3u8',
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

      expect(onEventSpy).toHaveBeenCalledTimes(2);
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
            data: 'test.m3u8',
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
    });

    it('ignore invalid interstitial', async () => {
      // It is not valid because it does not have an interstitial URL
      const metadata = {
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
      const assetsList = JSON.stringify({
        ASSETS: [
          {
            URI: 'ad.m3u8',
          },
        ],
      });

      networkingEngine.setResponseText('test:/test.json', assetsList);

      const metadata = {
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
    });

    it('supports X-RESTRICT', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-ENABLE-SKIP-AFTER and X-ENABLE-SKIP-FOR', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
          },
          {
            key: 'X-ENABLE-SKIP-AFTER',
            data: 5,
          },
          {
            key: 'X-ENABLE-SKIP-FOR',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-RESUME-OFFSET', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-PLAYOUT-LIMIT', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports CUE-ONCE', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports CUE-PRE', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports CUE-POST', async () => {
      const metadata = {
        startTime: 0,
        endTime: null,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports X-TIMELINE-OCCUPIES', async () => {
      const metadata = {
        startTime: 100,
        endTime: 130,
        values: [
          {
            key: 'ID',
            data: 'TEST',
          },
          {
            key: 'X-ASSET-URI',
            data: 'test.m3u8',
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
        uri: 'test.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports ENABLE-SKIP-AFTER and ENABLE-SKIP-FOR', async () => {
      const assetsList = JSON.stringify({
        'ASSETS': [
          {
            URI: 'ad.m3u8',
          },
        ],
        'SKIP-CONTROL': {
          'ENABLE-SKIP-AFTER': 5,
          'ENABLE-SKIP-FOR': 10,
        },
      });

      networkingEngine.setResponseText('test:/test.json', assetsList);

      const metadata = {
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
        uri: 'ad.m3u8',
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });
  });

  describe('DASH', () => {
    it('supports alternative MPD', async () => {
      const eventString = [
        '<Event duration="1" id="PREROLL" presentationTime="0">',
        '<InsertPresentation url="test.mpd"/>',
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
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addRegion(region);

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
    });

    it('ignore duplicate alternative MPD', async () => {
      const eventString = [
        '<Event duration="1" id="PREROLL" presentationTime="0">',
        '<ReplacePresentation url="test.mpd" returnOffset="1"/>',
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
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addRegion(region);
      await interstitialAdManager.addRegion(region);

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
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addRegion(region);

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
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addOverlayRegion(region);

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
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addOverlayRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('supports overlay events with L-Shape format', async () => {
      const eventString = [
        '<Event duration="1" id="OVERLAY" presentationTime="0">',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd" z="-1">',
        '<Viewport x="1920" y="1080"/>',
        '<Squeeze>',
        '<TopLeft x="0" y="0"/>',
        '<Size x="960" y="540"/>',
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
        schemeIdUri: 'urn:scte:dash:scte214-events',
        eventNode,
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addOverlayRegion(region);

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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports overlay events with double box format', async () => {
      const eventString = [
        '<Event duration="1" id="OVERLAY" presentationTime="0">',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd" z="-1">',
        '<Background>red</Background>',
        '<Viewport x="1920" y="1080"/>',
        '<Overlay>',
        '<TopLeft x="0" y="720"/>',
        '<Size x="480" y="360"/>',
        '</Overlay>',
        '<Squeeze>',
        '<TopLeft x="0" y="0"/>',
        '<Size x="960" y="540"/>',
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
        schemeIdUri: 'urn:scte:dash:scte214-events',
        eventNode,
        eventElement: TXml.txmlNodeToDomElement(eventNode),
        value: '',
        timescale: 1,
      };
      await interstitialAdManager.addOverlayRegion(region);

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
        background: 'red',
        clickThroughUrl: null,
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
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
        },
      ];
      await interstitialAdManager.addInterstitials(interstitials);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
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
        '<Creatives>',
        '<Creative id="138381721867" sequence="1">',
        '<Linear>',
        '<Duration>00:00:10</Duration>',
        '<VideoClicks>',
        '<ClickThrough id="1">',
        '<![CDATA[ foo.bar ]]>',
        '</ClickThrough>',
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

      const interstitials = interstitialAdManager.getInterstitials();
      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: null,
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
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('supports non-linear ads', async () => {
      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '<Ad id="5925573263">',
        '<InLine>',
        '<Creatives>',
        '<Creative id="138381721867" sequence="1">',
        '<NonLinearAds>',
        '<NonLinear width="535" height="80" minSuggestedDuration="00:00:05">',
        '<StaticResource creativeType="image/png">',
        '<![CDATA[test.png]]>',
        '</StaticResource>',
        '<NonLinearClickThrough>',
        '<![CDATA[foo.bar]]>',
        '</NonLinearClickThrough>',
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
        id: null,
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
        '<Ad id="5925573263">',
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

      expect(onEventSpy).toHaveBeenCalledTimes(1);
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
          data: 'test.m3u8',
        },
        {
          key: 'X-RESTRICT',
          data: 'SKIP,JUMP',
        },
      ],
    };
    await interstitialAdManager.addMetadata(metadata);

    video.dispatchEvent(new Event('timeupdate'));

    await shaka.test.Util.shortDelay();

    expect(onEventSpy).toHaveBeenCalledTimes(2);
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
      type: 'ad-started',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue2));
  });

  it('dispatch skip event correctly', async () => {
    const metadata = {
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
          data: 'test.m3u8',
        },
      ],
    };
    await interstitialAdManager.addMetadata(metadata);

    video.dispatchEvent(new Event('timeupdate'));

    await shaka.test.Util.shortDelay();

    expect(onEventSpy).toHaveBeenCalledTimes(3);
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
      type: 'ad-started',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue2));
    const eventValue3 = {
      type: 'ad-skip-state-changed',
    };
    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(eventValue3));
  });

  it('jumping a mid-roll with JUMP restriction is not allowed', async () => {
    const metadata = {
      startTime: 10,
      endTime: null,
      values: [
        {
          key: 'ID',
          data: 'MIDROLL',
        },
        {
          key: 'X-ASSET-URI',
          data: 'test.m3u8',
        },
        {
          key: 'X-RESTRICT',
          data: 'SKIP,JUMP',
        },
      ],
    };
    await interstitialAdManager.addMetadata(metadata);

    video.currentTime = 0;
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
      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValue2 = {
        type: 'ad-started',
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue2));
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
    };
    await interstitialAdManager.addInterstitials([interstitial]);

    expect(onEventSpy).not.toHaveBeenCalled();

    const interstitials = interstitialAdManager.getInterstitials();
    expect(interstitials.length).toBe(1);
  });
});
