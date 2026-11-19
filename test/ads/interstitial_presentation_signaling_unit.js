/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Interstitial presentation signaling', () => {
  const TXml = shaka.util.TXml;
  const Utils = shaka.ads.Utils;

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
  /** @type {!shaka.ads.SvtaInterstitialTracker} */
  let tracker;
  /** @type {!shaka.ads.InterstitialAdManager} */
  let manager;
  /** @type {!jasmine.Spy} */
  let preloadSpy;
  /** @type {!jasmine.Spy} */
  let loadSpy;
  /** @type {!Promise} */
  let loadCalled;
  /** @type {number} */
  let baseTime;
  /** @type {!Array<shaka.extern.TimelineRegionInfo>} */
  let regions;
  /** @type {number} */
  let duration;

  beforeEach(async () => {
    // Allows us to use a timer instead of requestVideoFrameCallback.
    spyOn(deviceDetected, 'getDeviceType')
        .and.returnValue(shaka.device.IDevice.DeviceType.TV);
    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    player = new shaka.Player(null, null, (instance) => {
      networkingEngine = new shaka.test.FakeNetworkingEngine();
      networkingEngine.setDefaultValue(new ArrayBuffer(0));
      instance.createNetworkingEngine = () => networkingEngine;
    });
    video = shaka.test.UiUtils.createVideoElement();
    await player.attach(video);
    baseTime = 1;
    Object.defineProperty(video, 'currentTime', {
      get: () => baseTime,
      set: (value) => {
        baseTime = value;
      },
      configurable: true,
    });
    Object.defineProperty(video, 'paused', {
      get: () => false,
      configurable: true,
    });
    onEventSpy = jasmine.createSpy('onEvent');
    tracker = new shaka.ads.SvtaInterstitialTracker();
    manager = new shaka.ads.InterstitialAdManager(
        adContainer, player, shaka.test.Util.spyFunc(onEventSpy),
        undefined, (...args) => tracker.create(...args), {
          accepts: (interstitial) => !interstitial.adCreativeSignaling,
          parse: (interstitial, presentationRegions) =>
            shaka.ads.AdManager.parsePresentationSignaling(
                interstitial, presentationRegions),
        });
    const config = shaka.util.PlayerConfiguration.createDefault().ads;
    config.supportsMultipleMediaElements = true;
    manager.configure(config);

    regions = [];
    duration = 10;
    const preloadManager = /** @type {?} */ ({
      waitForManifest: () => Promise.resolve(),
      getRegions: () => regions,
      getManifest: () => ({
        presentationTimeline: {getDuration: () => duration},
      }),
      destroy: () => Promise.resolve(),
    });
    const adPlayer = manager.getPlayer();
    preloadSpy = spyOn(adPlayer, 'preload')
        .and.returnValue(Promise.resolve(preloadManager));
    const loaded = Promise.withResolvers();
    loadCalled = loaded.promise;
    loadSpy = spyOn(adPlayer, 'load').and.callFake(() => {
      loaded.resolve();
      return Promise.resolve();
    });
  });

  afterEach(async () => {
    manager.release();
    tracker.release();
    await player.destroy();
  });

  /**
   * @param {string} id
   * @param {number} start
   * @param {number} slotDuration
   * @param {string} beacon
   * @return {!Object}
   */
  function slotEnvelope(id, start, slotDuration, beacon) {
    return {
      version: 2,
      type: 'slot',
      payload: [{
        type: 'linear',
        start,
        duration: slotDuration,
        identifiers: [{scheme: 'urn:test', value: id}],
        tracking: [{type: 'impression', urls: [beacon]}],
      }],
    };
  }

  /**
   * An SVTA2053 EventStream Event of a DASH Period, as in a list MPD.
   *
   * @param {string} id
   * @param {number} start
   * @param {number} slotDuration
   * @return {shaka.extern.TimelineRegionInfo}
   */
  function svtaRegion(id, start, slotDuration) {
    const json = JSON.stringify(
        slotEnvelope(id, 0, slotDuration, 'https://beacon/' + id));
    const eventNode = TXml.parseXmlString(
        `<Event id="${id}">${json}</Event>`);
    goog.asserts.assert(eventNode, 'Should have an event node!');
    return {
      schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
      value: '',
      startTime: start,
      endTime: start + slotDuration,
      id,
      timescale: 1000,
      eventNode,
    };
  }

  /**
   * Schedules a ReplacePresentation of a list MPD at 10 s and plays into it.
   *
   * @return {!Promise}
   */
  async function startBreak() {
    const eventNode = TXml.parseXmlString([
      '<Event duration="10" id="BREAK" presentationTime="10">',
      '<ReplacePresentation uri="https://ads/list.mpd" maxDuration="10"/>',
      '</Event>',
    ].join(''));
    goog.asserts.assert(eventNode, 'Should have an event node!');
    const interstitial = shaka.ads.DashInterstitialParser.parseRegion({
      startTime: 10,
      endTime: 20,
      id: 'BREAK',
      schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:replace:2025',
      eventNode,
      value: '',
      timescale: 1,
    });
    goog.asserts.assert(interstitial, 'Should have an interstitial!');
    await manager.addInterstitials([interstitial]);
    video.dispatchEvent(new Event('timeupdate'));
    baseTime = 10.2;
    video.dispatchEvent(new Event('timeupdate'));
    await Promise.race([loadCalled, shaka.test.Util.delay(5)]);
  }

  /** @return {!HTMLMediaElement} */
  function getAdVideo() {
    const adVideo = adContainer.querySelector('video');
    goog.asserts.assert(adVideo, 'Should have an ad video!');
    return /** @type {!HTMLMediaElement} */ (adVideo);
  }

  /**
   * Plays the ad video to the given position.
   *
   * @param {!HTMLMediaElement} adVideo
   * @param {number} position
   */
  function playAdTo(adVideo, position) {
    Object.defineProperty(adVideo, 'currentTime', {
      get: () => position,
      configurable: true,
    });
    adVideo.dispatchEvent(new Event('timeupdate'));
  }

  /**
   * @param {!HTMLMediaElement} adVideo
   */
  function fakeAdPlayback(adVideo) {
    Object.defineProperty(adVideo, 'readyState', {
      get: () => 4,
      configurable: true,
    });
    Object.defineProperty(adVideo, 'paused', {
      get: () => false,
      configurable: true,
    });
    Object.defineProperty(adVideo, 'duration', {
      get: () => duration,
      configurable: true,
    });
  }

  /**
   * @param {string} type
   * @return {!Array<!Object>}
   */
  function eventsOfType(type) {
    return onEventSpy.calls.allArgs().map((args) => args[0])
        .filter((event) => event.type == type);
  }

  /** @return {!Array<string>} */
  function adEventTypes() {
    const types = [Utils.AD_STARTED, Utils.AD_COMPLETE, Utils.AD_STOPPED];
    return onEventSpy.calls.allArgs().map((args) => args[0].type)
        .filter((type) => types.includes(type));
  }

  it('describes the interstitial with the slot of its list MPD', async () => {
    regions = [svtaRegion('creative', 0, 10)];
    await startBreak();

    expect(preloadSpy).toHaveBeenCalledTimes(1);
    expect(preloadSpy.calls.argsFor(0)[0]).toBe('https://ads/list.mpd');
    expect(loadSpy).toHaveBeenCalledTimes(1);
    const started = eventsOfType(Utils.AD_STARTED);
    expect(started.length).toBe(1);
    const ad = /** @type {!shaka.ads.InterstitialAd} */ (started[0]['ad']);
    expect(ad.getAdId()).toBe('creative');
    expect(ad.getSequenceLength()).toBe(1);
    expect(ad.isClientRendering()).toBe(true);
    // The event describes the ad with the signaling of its presentation.
    const startedInterstitial = started[0]['interstitial'];
    expect(startedInterstitial.id).toBe('BREAK');
    expect(startedInterstitial.adCreativeSignaling.identifiers[0].value)
        .toBe('creative');

    // The slot is measured by this manager once the ad plays.
    const adVideo = getAdVideo();
    fakeAdPlayback(adVideo);
    playAdTo(adVideo, 0.05);
    networkingEngine.expectRequest('https://beacon/creative',
        shaka.net.NetworkingEngine.RequestType.ADS);
  });

  it('reports the slot when the interstitial is preloaded', async () => {
    regions = [svtaRegion('creative', 0, 10)];
    const eventNode = TXml.parseXmlString([
      '<Event duration="10" id="PRE" presentationTime="0">',
      '<InsertPresentation uri="https://ads/list.mpd"/>',
      '</Event>',
    ].join(''));
    goog.asserts.assert(eventNode, 'Should have an event node!');
    const interstitial = shaka.ads.DashInterstitialParser.parseRegion({
      startTime: 0,
      endTime: 10,
      id: 'PRE',
      schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:insert:2025',
      eventNode,
      value: '',
      timescale: 1,
    });
    goog.asserts.assert(interstitial, 'Should have an interstitial!');
    interstitial.pre = true;
    await manager.addInterstitials([interstitial]);
    await shaka.test.Util.shortDelay();

    const preloaded = eventsOfType(Utils.AD_INTERSTITIAL_PRELOADED);
    expect(preloaded.length).toBe(1);
    const preloadedInterstitial = preloaded[0]['interstitial'];
    expect(preloadedInterstitial.adCreativeSignaling.identifiers[0].value)
        .toBe('creative');
    // The scheduled interstitial is not modified, so another execution may
    // be described by another ad decision.
    expect(interstitial.adCreativeSignaling).toBeUndefined();
  });

  it('reports each preloaded ad of a list MPD', async () => {
    regions = [svtaRegion('first', 0, 5), svtaRegion('second', 5, 5)];
    await startBreak();

    const preloaded = eventsOfType(Utils.AD_INTERSTITIAL_PRELOADED)
        .map((event) => event['interstitial']);
    expect(preloaded.map((ad) => ad.adCreativeSignaling.identifiers[0].value))
        .toEqual(['first', 'second']);
    // Like the assets of an HLS asset list, each ad has an id of its own and
    // is grouped under the interstitial.
    expect(preloaded.map((ad) => [ad.id, ad.groupId])).toEqual([
      ['BREAK_shaka_asset_0', 'BREAK'],
      ['BREAK_shaka_asset_1', 'BREAK'],
    ]);
  });

  it('presents each slot of a list MPD as an ad of its own', async () => {
    regions = [svtaRegion('first', 0, 5), svtaRegion('second', 5, 5)];
    await startBreak();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    let started = eventsOfType(Utils.AD_STARTED);
    expect(started.length).toBe(1);
    const first = /** @type {!shaka.ads.InterstitialAd} */ (started[0]['ad']);
    expect(first.getAdId()).toBe('first');
    expect(first.getSequenceLength()).toBe(2);
    expect(first.getPositionInSequence()).toBe(1);

    const adVideo = getAdVideo();
    fakeAdPlayback(adVideo);
    playAdTo(adVideo, 0.05);
    expect(first.getDuration()).toBe(5);
    networkingEngine.expectRequest('https://beacon/first',
        shaka.net.NetworkingEngine.RequestType.ADS);
    playAdTo(adVideo, 4.9);
    playAdTo(adVideo, 5.2);

    started = eventsOfType(Utils.AD_STARTED);
    expect(started.length).toBe(2);
    const second = /** @type {!shaka.ads.InterstitialAd} */ (started[1]['ad']);
    expect(second.getAdId()).toBe('second');
    expect(second.getPositionInSequence()).toBe(2);
    expect(started.map((event) =>
      event['interstitial'].adCreativeSignaling.identifiers[0].value))
        .toEqual(['first', 'second']);
    expect(started.map((event) => event['interstitial'].id))
        .toEqual(['BREAK_shaka_asset_0', 'BREAK_shaka_asset_1']);
    expect(second.getDuration()).toBe(5);
    expect(second.getRemainingTime()).toBeCloseTo(4.8, 5);
    expect(adEventTypes()).toEqual([
      Utils.AD_STARTED,
      Utils.AD_COMPLETE,
      Utils.AD_STOPPED,
      Utils.AD_STARTED,
    ]);
    // No ad is announced for the interstitial itself.
    for (const event of started) {
      expect(event['ad'].getAdId()).not.toBe('BREAK');
    }
    // Both ads are in the same media, which is loaded once.
    expect(loadSpy).toHaveBeenCalledTimes(1);
    playAdTo(adVideo, 5.3);
    networkingEngine.expectRequest('https://beacon/second',
        shaka.net.NetworkingEngine.RequestType.ADS);
  });

  it('presents the parts of the media without a slot as ads', async () => {
    regions = [svtaRegion('creative', 4, 6)];
    await startBreak();

    const started = eventsOfType(Utils.AD_STARTED);
    expect(started.length).toBe(1);
    const gap = /** @type {!shaka.ads.InterstitialAd} */ (started[0]['ad']);
    expect(gap.getAdId()).toBe('BREAK_shaka_asset_0');
    expect(gap.getSequenceLength()).toBe(2);
    expect(started[0]['interstitial'].groupId).toBe('BREAK');
  });

  it('presents the interstitial as such without slots', async () => {
    regions = [];
    await startBreak();

    const started = eventsOfType(Utils.AD_STARTED);
    expect(started.length).toBe(1);
    const ad = /** @type {!shaka.ads.InterstitialAd} */ (started[0]['ad']);
    expect(ad.getAdId()).toBe('BREAK');
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  describe('parsePresentationSignaling', () => {
    /** @type {!shaka.extern.AdInterstitial} */
    let interstitial;

    beforeEach(() => {
      interstitial = shaka.ads.Utils.createInterstitial({
        id: 'BREAK',
        startTime: 100,
        endTime: 110,
        uri: 'https://ads/asset.m3u8',
        isSkippable: true,
        skipOffset: 5,
      });
    });

    it('reads DASH EventStream carriage', () => {
      const ads = shaka.ads.AdManager.parsePresentationSignaling(
          interstitial, [svtaRegion('creative', 2, 8)]);

      expect(ads.length).toBe(1);
      expect(ads[0].start).toBe(2);
      expect(ads[0].end).toBe(10);
      expect(ads[0].interstitial).not.toBe(interstitial);
      expect(ads[0].interstitial.id).toBe('BREAK');
      expect(ads[0].interstitial.startTime).toBe(100);
      expect(ads[0].interstitial.adCreativeSignaling.identifiers[0].value)
          .toBe('creative');
      expect(interstitial.adCreativeSignaling).toBeUndefined();
    });

    it('reads HLS Date Range carriage', () => {
      const data = shaka.util.Uint8ArrayUtils.toBase64(
          shaka.util.StringUtils.toUTF8(JSON.stringify(
              slotEnvelope('creative', 0, 6, 'https://beacon'))));
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
        value: '',
        startTime: 3,
        endTime: 9,
        id: 'ad-1',
        timescale: 1,
        eventNode: null,
        values: [
          {key: 'ID', description: '', data: 'ad-1', mimeType: null,
            pictureType: null},
          {key: 'X-AD-CREATIVE-SIGNALING', description: '', data,
            mimeType: null, pictureType: null},
        ],
      };
      const ads = shaka.ads.AdManager.parsePresentationSignaling(
          interstitial, [region]);

      expect(ads.length).toBe(1);
      expect(ads[0].start).toBe(3);
      expect(ads[0].end).toBe(9);
      expect(ads[0].interstitial.adCreativeSignaling.identifiers[0].value)
          .toBe('creative');
    });

    it('ignores other timeline regions', () => {
      const eventNode = TXml.parseXmlString(
          '<Event id="1">https://beacon/impression</Event>');
      goog.asserts.assert(eventNode, 'Should have an event node!');
      const ads = shaka.ads.AdManager.parsePresentationSignaling(
          interstitial, [{
            schemeIdUri: 'urn:mpeg:dash:event:callback:2015',
            value: '1',
            startTime: 0,
            endTime: 0,
            id: '1',
            timescale: 1000,
            eventNode,
          }]);

      expect(ads).toEqual([]);
    });
  });
});
