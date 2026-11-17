/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('SVTA interstitial playback', () => {
  const realSetTimeout = window.setTimeout;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let networking;
  /** @type {!shaka.ads.InterstitialAdManager} */
  let manager;
  /** @type {!jasmine.Spy} */
  let onEvent;
  /** @type {!shaka.ads.SvtaInterstitialTracker} */
  let tracker;

  beforeEach(() => {
    jasmine.clock().install();
    video = new shaka.test.FakeVideo();
    Object.assign(video, {style: document.createElement('video').style});
    video.readyState = 4;
    video.duration = Infinity;
    player = new shaka.Player(null, null, (instance) => {
      networking = new shaka.test.FakeNetworkingEngine();
      networking.setDefaultValue(new ArrayBuffer(0));
      instance.createNetworkingEngine = () => networking;
    });
    spyOn(player, 'getMediaElement').and.returnValue(video);
    spyOn(player, 'isRemotePlayback').and.returnValue(false);
    spyOn(deviceDetected, 'getDeviceType')
        .and.returnValue(shaka.device.IDevice.DeviceType.TV);
    onEvent = jasmine.createSpy('onEvent');
    tracker = new shaka.ads.SvtaInterstitialTracker();
    manager = new shaka.ads.InterstitialAdManager(null, player,
        shaka.test.Util.spyFunc(onEvent), undefined,
        (...args) => tracker.create(...args));
    const config = shaka.util.PlayerConfiguration.createDefault().ads;
    config.supportsMultipleMediaElements = false;
    config.allowStartInMiddleOfInterstitial = false;
    config.interstitialCooldown = 60;
    manager.configure(config);
  });

  afterEach(async () => {
    try {
      manager.release();
      tracker.release();
    } finally {
      jasmine.clock().uninstall();
    }
    await player.destroy();
  });

  /** @return {!shaka.extern.AdCreativeSignaling.Slot} */
  function slot() {
    return {type: 'linear', start: 0, duration: 10,
      identifiers: [{scheme: 'test', value: 'creative'}], tracking: [
        {type: 'impression', urls: ['impression']},
        {type: 'complete', urls: ['complete']},
        {type: 'progress', offset: 5, urls: ['five']},
      ]};
  }

  /**
   * @param {*} data
   * @return {!Array<shaka.extern.AdInterstitial>}
   */
  function parseSlots(data) {
    return shaka.ads.SvtaInterstitialParser.parseInterstitials(data, 100, 'id')
        .interstitials;
  }

  /** @param {number} position */
  function advance(position) {
    video.currentTime = position;
    jasmine.clock().tick(25);
  }

  it('measures embedded ads without loading or detaching media', async () => {
    const auxiliaryPlayer = spyOn(manager, 'getPlayer').and.callThrough();
    const load = spyOn(player, 'load');
    const preload = spyOn(player, 'preload');
    const detach = spyOn(player, 'detach').and.callThrough();
    const ads = parseSlots(
        {version: 2, type: 'slot', payload: [slot()]});
    await manager.addInterstitials(ads);
    advance(100);
    advance(105);
    const started = onEvent.calls.allArgs().map((args) => args[0])
        .find((event) => event.type == shaka.ads.Utils.AD_STARTED);
    expect(started.ad instanceof shaka.ads.InterstitialAd).toBe(true);
    expect(started.ad.getDuration()).toBe(10);
    expect(started.ad.getRemainingTime()).toBe(5);
    expect(started.ad.isClientRendering()).toBe(false);
    expect(auxiliaryPlayer).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
    expect(detach).not.toHaveBeenCalled();
    networking.expectRequest('five',
        shaka.net.NetworkingEngine.RequestType.ADS);
    advance(110);
    networking.expectRequest('complete',
        shaka.net.NetworkingEngine.RequestType.ADS);
    const starts = onEvent.calls.allArgs().filter((args) =>
      args[0].type == shaka.ads.Utils.AD_STARTED);
    expect(starts.length).toBe(1);
  });

  it('recognizes a late entry independently of insertion options', async () => {
    await manager.addInterstitials(
        parseSlots(
            {version: 2, type: 'slot', payload: [slot()]}));
    advance(106);
    expect(onEvent).toHaveBeenCalledWith(jasmine.objectContaining({
      type: shaka.ads.Utils.AD_STARTED,
    }));
    networking.expectNoRequest('five',
        shaka.net.NetworkingEngine.RequestType.ADS);
  });

  it('keeps slot completion and pod tracking in playback order', async () => {
    const first = slot();
    first.tracking = [
      {type: 'impression', urls: ['first-impression']},
      {type: 'complete', urls: ['first-complete']},
    ];
    const second = slot();
    second.start = 10;
    second.tracking = [
      {type: 'impression', urls: ['second-impression']},
      {type: 'complete', urls: ['second-complete']},
    ];
    const pod = {duration: 20, slots: [first, second], tracking: [
      {type: 'podStart', urls: ['pod-start']},
      {type: 'midpoint', urls: ['pod-midpoint']},
      {type: 'podEnd', urls: ['pod-end']},
    ]};
    await manager.addInterstitials(
        parseSlots(
            {version: 2, type: 'pod', payload: [pod]}));
    advance(100);
    advance(105);
    advance(110);
    advance(115);
    advance(120);
    expect(networking.request.calls.allArgs().map((args) => args[1].uris[0]))
        .toEqual(['pod-start', 'first-impression', 'pod-midpoint',
          'first-complete', 'second-impression', 'second-complete', 'pod-end']);
    const starts = onEvent.calls.allArgs().map((args) => args[0])
        .filter((event) => event.type == shaka.ads.Utils.AD_STARTED);
    expect(starts.map((event) => event.ad.getPositionInSequence()))
        .toEqual([1, 2]);
    expect(starts[1].ad.getSequenceLength()).toBe(2);
  });

  describe('with pods and slots carried separately', () => {
    /**
     * @param {string} name
     * @return {!shaka.extern.AdCreativeSignaling.Slot}
     */
    function namedSlot(name) {
      const creative = slot();
      creative.tracking = [
        {type: 'impression', urls: [name + '-impression']},
        {type: 'complete', urls: [name + '-complete']},
      ];
      return creative;
    }

    /**
     * @param {!Object=} podFields
     * @param {!Object=} envelopeFields
     * @return {!shaka.ads.SvtaInterstitialParser.Result}
     */
    function parsePod(podFields = {}, envelopeFields = {}) {
      const pod = Object.assign({start: 0, duration: 20, tracking: [
        {type: 'podStart', urls: ['pod-start']},
        {type: 'midpoint', urls: ['pod-midpoint']},
        {type: 'podEnd', urls: ['pod-end']},
      ]}, podFields);
      return shaka.ads.SvtaInterstitialParser.parseInterstitials(
          Object.assign({version: 2, type: 'pod', payload: [pod]},
              envelopeFields), 100, 'pod');
    }

    /**
     * @param {string} name
     * @param {number} anchor
     * @return {!shaka.ads.SvtaInterstitialParser.Result}
     */
    function parseSlot(name, anchor) {
      return shaka.ads.SvtaInterstitialParser.parseInterstitials(
          {version: 2, type: 'slot', payload: [namedSlot(name)]},
          anchor, name);
    }

    /** @param {!shaka.ads.SvtaInterstitialParser.Result} result */
    async function add(result) {
      tracker.linkPods(result.pods, result.interstitials);
      await manager.addInterstitials(result.interstitials);
    }

    function playPod() {
      for (let position = 100; position <= 120; position += 5) {
        advance(position);
      }
    }

    /** @return {!Array<string>} */
    function requested() {
      return networking.request.calls.allArgs().map((args) => args[1].uris[0]);
    }

    /** @return {!Array<!shaka.ads.InterstitialAd>} */
    function startedAds() {
      return onEvent.calls.allArgs().map((args) => args[0])
          .filter((event) => event.type == shaka.ads.Utils.AD_STARTED)
          .map((event) => event.ad);
    }

    const expected = ['pod-start', 'first-impression', 'pod-midpoint',
      'first-complete', 'second-impression', 'second-complete', 'pod-end'];

    it('links slots signaled after their pod', async () => {
      await add(parsePod());
      await add(parseSlot('first', 100));
      await add(parseSlot('second', 110));
      playPod();
      expect(requested()).toEqual(expected);
      const ads = startedAds();
      expect(ads.map((ad) => ad.getPositionInSequence())).toEqual([1, 2]);
      expect(ads.map((ad) => ad.getSequenceLength())).toEqual([2, 2]);
    });

    it('links slots signaled before their pod', async () => {
      await add(parseSlot('second', 110));
      await add(parseSlot('first', 100));
      await add(parsePod());
      playPod();
      expect(requested()).toEqual(expected);
      expect(startedAds().map((ad) => ad.getPositionInSequence()))
          .toEqual([1, 2]);
    });

    it('measures the pod once when signaling is repeated', async () => {
      for (let i = 0; i < 2; i++) {
        // eslint-disable-next-line no-await-in-loop
        await add(parsePod());
        // eslint-disable-next-line no-await-in-loop
        await add(parseSlot('first', 100));
        // eslint-disable-next-line no-await-in-loop
        await add(parseSlot('second', 110));
      }
      playPod();
      expect(requested()).toEqual(expected);
      expect(startedAds().map((ad) => ad.getSequenceLength()))
          .toEqual([2, 2]);
    });

    it('resolves remote pod tracking', async () => {
      networking.setResponseText('pod-remote', JSON.stringify({version: 2,
        type: 'trackingEvent', payload: [
          {type: 'podStart', urls: ['remote-pod-start']},
          {type: 'podEnd', urls: ['remote-pod-end']},
        ]}));
      await add(parsePod({$remote: {tracking: 'pod-remote'}},
          {features: {remoteFields: true}}));
      await add(parseSlot('first', 100));
      await add(parseSlot('second', 110));
      advance(100);
      await shaka.test.Util.shortDelay(realSetTimeout);
      for (let position = 105; position <= 120; position += 5) {
        advance(position);
      }
      await shaka.test.Util.shortDelay(realSetTimeout);
      const urls = requested();
      expect(urls).toContain('remote-pod-start');
      expect(urls).toContain('remote-pod-end');
      expect(urls).not.toContain('pod-start');
      expect(urls.indexOf('remote-pod-end'))
          .toBeGreaterThan(urls.indexOf('second-complete'));
    });

    it('does not link slots outside the pod', async () => {
      await add(parsePod());
      const outside = parseSlot('outside', 130);
      await add(outside);
      expect(outside.interstitials[0].pod).toBeNull();
      expect(outside.interstitials[0].podSize).toBe(1);
    });

    it('does not move slots nested in another pod', async () => {
      await add(parsePod());
      const nested = shaka.ads.SvtaInterstitialParser.parseInterstitials(
          {version: 2, type: 'pod', payload: [
            {duration: 10, slots: [namedSlot('nested')]},
          ]}, 100, 'nested');
      const nestedPod = nested.interstitials[0].pod;
      await add(nested);
      expect(nested.interstitials[0].pod).toBe(nestedPod);
    });
  });

  it('announces skip availability and seeks to the embedded slot end',
      async () => {
        const creative = slot();
        creative.skipOffset = 5;
        await manager.addInterstitials(
            parseSlots(
                {version: 2, type: 'slot', payload: [creative]}));
        advance(100);
        advance(105);
        expect(onEvent).toHaveBeenCalledWith(jasmine.objectContaining({
          type: shaka.ads.Utils.AD_SKIP_STATE_CHANGED,
        }));
        const started = onEvent.calls.allArgs().map((args) => args[0])
            .find((event) => event.type == shaka.ads.Utils.AD_STARTED);
        started.ad.skip();
        expect(video.currentTime).toBe(110);
        networking.expectNoRequest('complete',
            shaka.net.NetworkingEngine.RequestType.ADS);
      });

  it('does not report progress or complete on a seek out', async () => {
    await manager.addInterstitials(
        parseSlots(
            {version: 2, type: 'slot', payload: [slot()]}));
    advance(100);
    video.on['seeking']();
    video.currentTime = 120;
    video.on['seeked']();
    jasmine.clock().tick(25);
    networking.expectNoRequest('complete',
        shaka.net.NetworkingEngine.RequestType.ADS);
    networking.expectNoRequest('five',
        shaka.net.NetworkingEngine.RequestType.ADS);
    expect(onEvent).toHaveBeenCalledWith(jasmine.objectContaining({
      type: shaka.ads.Utils.AD_SKIPPED,
    }));
  });

  it('reports a skip when timeupdate precedes seeked', async () => {
    await manager.addInterstitials(
        parseSlots({version: 2, type: 'slot', payload: [slot()]}));
    advance(100);
    advance(102);
    // Browsers fire timeupdate, with seeking already false, before seeked,
    // so playback is observed at the new position before the seeked event.
    video.on['seeking']();
    video.currentTime = 120;
    jasmine.clock().tick(25);
    video.on['seeked']();
    expect(onEvent).toHaveBeenCalledWith(jasmine.objectContaining({
      type: shaka.ads.Utils.AD_SKIPPED,
    }));
    expect(onEvent).not.toHaveBeenCalledWith(jasmine.objectContaining({
      type: shaka.ads.Utils.AD_COMPLETE,
    }));
  });

  it('does not measure an embedded slot again when it is rewatched',
      async () => {
        await manager.addInterstitials(
            parseSlots({version: 2, type: 'slot', payload: [slot()]}));
        advance(100);
        advance(102);
        video.on['seeking']();
        video.currentTime = 90;
        video.on['seeked']();
        jasmine.clock().tick(25);
        advance(100);
        advance(102);
        const impressions = networking.request.calls.allArgs()
            .filter((args) => args[1].uris[0] == 'impression');
        expect(impressions.length).toBe(1);
        const starts = onEvent.calls.allArgs().filter((args) =>
          args[0].type == shaka.ads.Utils.AD_STARTED);
        expect(starts.length).toBe(2);
      });

  it('opens the click-through of an embedded slot from the ad container',
      async () => {
        const container = /** @type {!HTMLElement} */ (
          document.createElement('div'));
        manager.release();
        manager = new shaka.ads.InterstitialAdManager(container, player,
            shaka.test.Util.spyFunc(onEvent), undefined,
            (...args) => tracker.create(...args));
        manager.configure(shaka.util.PlayerConfiguration.createDefault().ads);
        const open = spyOn(window, 'open');
        const creative = slot();
        creative.clickThrough = 'https://example.com/?ad=[ADID]';
        creative.tracking.push({type: 'clickTracking', urls: ['click']});
        await manager.addInterstitials(
            parseSlots({version: 2, type: 'slot', payload: [creative]}));
        advance(100);
        // The UI only shows the ad container when it has content.
        expect(container.childNodes.length).toBe(1);
        const click = new MouseEvent('click', {bubbles: true});
        const containerClick = jasmine.createSpy('containerClick');
        container.addEventListener('click', shaka.test.Util.spyFunc(
            containerClick));
        container.firstChild.dispatchEvent(click);
        expect(onEvent).toHaveBeenCalledWith(jasmine.objectContaining({
          type: shaka.ads.Utils.AD_CLICKED,
        }));
        expect(open).toHaveBeenCalledWith(
            'https://example.com/?ad=creative', '_blank');
        expect(video.pause).toHaveBeenCalled();
        // The click must not also toggle playback in the UI.
        expect(containerClick).not.toHaveBeenCalled();
        networking.expectRequest('click',
            shaka.net.NetworkingEngine.RequestType.ADS);
        advance(110);
        expect(container.childNodes.length).toBe(0);
      });

  it('resolves remote tracking lazily and replaces inline data', async () => {
    const creative = slot();
    creative.$remote = {tracking: 'remote'};
    networking.setResponseText('remote', JSON.stringify({version: 2,
      type: 'trackingEvent', payload: [
        {type: 'impression', urls: ['remote-impression']},
        {type: 'progress', offset: 0, urls: ['remote-zero']},
      ]}));
    await manager.addInterstitials(
        parseSlots({version: 2,
          type: 'slot', features: {remoteFields: true}, payload: [creative]}));
    networking.expectNoRequest('remote',
        shaka.net.NetworkingEngine.RequestType.ADS);
    advance(100);
    await shaka.test.Util.shortDelay(realSetTimeout);
    networking.expectRequest('remote',
        shaka.net.NetworkingEngine.RequestType.ADS);
    networking.expectRequest('remote-impression',
        shaka.net.NetworkingEngine.RequestType.ADS);
    networking.expectRequest('remote-zero',
        shaka.net.NetworkingEngine.RequestType.ADS);
    networking.expectNoRequest('impression',
        shaka.net.NetworkingEngine.RequestType.ADS);
  });

  it('expands a remote pod into slots without loading new media', async () => {
    networking.setResponseText('slots', JSON.stringify({version: 2,
      type: 'slot', payload: [slot()]}));
    const result = shaka.ads.SvtaInterstitialParser.parseInterstitials({
      version: 2, type: 'pod', features: {remoteFields: true}, payload: [
        {duration: 10, $remote: {slots: 'slots'}},
      ]}, 100, 'id', networking);
    expect(result.interstitials).toEqual([]);
    expect(result.deferred.length).toBe(1);
    // The pod starts within the preload window, so it is resolved now.
    video.currentTime = 95;
    await manager.addDeferredInterstitial(result.deferred[0]);
    expect(networking.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.ADS,
        jasmine.objectContaining({uris: ['slots']}), undefined);
    expect(manager.getInterstitials().length).toBe(1);
    expect(manager.getInterstitials()[0].groupId).toBe('id_pod_0');
    advance(100);
    advance(101);
    expect(onEvent).toHaveBeenCalledWith(jasmine.objectContaining({
      type: shaka.ads.Utils.AD_STARTED,
    }));
    await shaka.test.Util.shortDelay(realSetTimeout);
    networking.expectRequest('impression',
        shaka.net.NetworkingEngine.RequestType.ADS);
  });

  it('aborts remote requests on unload and ignores their results', async () => {
    const creative = slot();
    creative.$remote = {tracking: 'remote'};
    networking.setResponseText('remote', JSON.stringify({version: 2,
      type: 'trackingEvent', payload: [{type: 'impression', urls: ['late']}]}));
    const delayed = networking.delayNextRequest();
    await manager.addInterstitials(
        parseSlots({version: 2,
          type: 'slot', features: {remoteFields: true}, payload: [creative]}));
    advance(100);
    manager.stop();
    tracker.reset();
    delayed.resolve();
    await shaka.test.Util.shortDelay(realSetTimeout);
    expect(manager.getInterstitials()).toEqual([]);
    networking.expectNoRequest('late',
        shaka.net.NetworkingEngine.RequestType.ADS);
  });
});
