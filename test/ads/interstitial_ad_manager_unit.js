/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Interstitial Ad manager', () => {
  const TXml = shaka.util.TXml;

  /** @type {!HTMLElement} */
  let adContainer;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {!shaka.ads.InterstitialAdManager} */
  let interstitialAdManager;

  beforeEach(() => {
    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    player = new shaka.Player();
    mockVideo = new shaka.test.FakeVideo();
    onEventSpy = jasmine.createSpy('onEvent');
    interstitialAdManager = new shaka.ads.InterstitialAdManager(
        adContainer, player, mockVideo, shaka.test.Util.spyFunc(onEventSpy));
  });

  afterEach(async () => {
    interstitialAdManager.release();
    await player.destroy();
  });

  it('supports HLS interstitial', async () => {
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

  it('supports multiple HLS interstitials', async () => {
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

  it('ignore duplicate HLS interstitials', async () => {
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

  it('ignore invalid HLS interstitial', async () => {
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

  it('supports alternative MPD', async () => {
    const eventString = [
      '<Event duration="1" id="PREROLL" presentationTime="0">',
      '<AlternativeMPD mode="insert" uri="test.mpd"/>',
      '</Event>',
    ].join('');
    const eventNode = TXml.parseXmlString(eventString);
    goog.asserts.assert(eventNode, 'Should have a event node!');
    const region = {
      startTime: 0,
      endTime: 1,
      id: 'PREROLL',
      schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:2022',
      eventNode,
      eventElement: TXml.txmlNodeToDomElement(eventNode),
      value: '',
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
      '<AlternativeMPD mode="insert" uri="test.mpd"/>',
      '</Event>',
    ].join('');
    const eventNode = TXml.parseXmlString(eventString);
    goog.asserts.assert(eventNode, 'Should have a event node!');
    const region = {
      startTime: 0,
      endTime: 1,
      id: 'PREROLL',
      schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:2022',
      eventNode,
      eventElement: TXml.txmlNodeToDomElement(eventNode),
      value: '',
    };
    await interstitialAdManager.addRegion(region);
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

  it('ignore invalid alternative MPD', async () => {
    const eventString = [
      '<Event duration="1" id="PREROLL" presentationTime="0">',
      '<AlternativeMPD mode="insert"/>',
      '</Event>',
    ].join('');
    const eventNode = TXml.parseXmlString(eventString);
    goog.asserts.assert(eventNode, 'Should have a event node!');
    const region = {
      startTime: 0,
      endTime: 1,
      id: 'PREROLL',
      schemeIdUri: 'urn:mpeg:dash:event:alternativeMPD:2022',
      eventNode,
      eventElement: TXml.txmlNodeToDomElement(eventNode),
      value: '',
    };
    await interstitialAdManager.addRegion(region);

    expect(onEventSpy).not.toHaveBeenCalled();
  });

  it('supports custom interstitial', async () => {
    const interstitial = {
      id: null,
      startTime: 10,
      endTime: null,
      uri: 'test.mp4',
      mimeType: null,
      isSkippable: true,
      skipOffset: 10,
      canJump: false,
      resumeOffset: null,
      playoutLimit: null,
      once: true,
      pre: false,
      post: false,
      timelineRange: false,
      loop: false,
      overlay: null,
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

  it('supports multiple custom interstitials', async () => {
    const interstitials = [
      {
        id: null,
        startTime: 0,
        endTime: null,
        uri: 'test.mp4',
        mimeType: null,
        isSkippable: true,
        skipOffset: 5,
        canJump: false,
        resumeOffset: null,
        playoutLimit: null,
        once: true,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
      },
      {
        id: null,
        startTime: 10,
        endTime: null,
        uri: 'test.mp4',
        mimeType: null,
        isSkippable: true,
        skipOffset: 10,
        canJump: false,
        resumeOffset: null,
        playoutLimit: null,
        once: true,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
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

  it('ignore duplicate custom interstitial', async () => {
    const interstitial = {
      id: null,
      startTime: 10,
      endTime: null,
      uri: 'test.mp4',
      mimeType: null,
      isSkippable: true,
      skipOffset: 10,
      canJump: false,
      resumeOffset: null,
      playoutLimit: null,
      once: true,
      pre: false,
      post: false,
      timelineRange: false,
      loop: false,
      overlay: null,
    };
    await interstitialAdManager.addInterstitials([interstitial, interstitial]);

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
});
