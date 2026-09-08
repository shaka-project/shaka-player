/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SVTA Ad manager', () => {
  const TXml = shaka.util.TXml;

  /** @type {!shaka.Player} */
  let player;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {!shaka.ads.SvtaAdManager} */
  let svtaAdManager;

  const creativeSignalingSimple = {
    payload: [
      {
        start: 0,
        duration: 5,
        tracking: [
          {
            type: 'impression',
            urls: [
              'impression',
            ],
          },
        ],
      },
    ],
  };

  const creativeSignalingMultiple = {
    payload: [
      {
        start: 0,
        duration: 5,
        tracking: [
          {
            type: 'impression',
            urls: [
              'impression',
            ],
          },
        ],
      },
      {
        start: 5,
        duration: 10,
        tracking: [
          {
            type: 'impression',
            urls: [
              'impression',
            ],
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    player = new shaka.Player();
    spyOn(player, 'isFullyLoaded').and.returnValue(true);
    video = shaka.test.UiUtils.createVideoElement();
    await player.attach(video);
    onEventSpy = jasmine.createSpy('onEvent');
    svtaAdManager = new shaka.ads.SvtaAdManager(
        player, shaka.test.Util.spyFunc(onEventSpy));
    const config = shaka.util.PlayerConfiguration.createDefault().ads;
    svtaAdManager.configure(config);

    player.dispatchEvent(new shaka.util.FakeEvent(
        shaka.util.FakeEvent.EventName.Loading));
  });

  afterEach(async () => {
    svtaAdManager.release();
    await player.destroy();
  });

  describe('HLS', () => {
    const signalingSimple =
        window.btoa(JSON.stringify(creativeSignalingSimple));
    const signalingMultiple =
        window.btoa(JSON.stringify(creativeSignalingMultiple));
    it('basic support', async () => {
      const metadata = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 0,
        endTime: 5,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingSimple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('basic support with alt type', async () => {
      const metadata = {
        type: 'urn:svta:advertising-wg:ad-id-signaling',
        startTime: 0,
        endTime: 5,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingSimple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('supports multiple', async () => {
      const metadata = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 0,
        endTime: 10,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingMultiple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      const metadata2 = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 10,
        endTime: 15,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingSimple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata2);

      expect(onEventSpy).toHaveBeenCalledTimes(2);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
          {
            start: 5,
            end: 10,
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
            end: 5,
          },
          {
            start: 5,
            end: 10,
          },
          {
            start: 10,
            end: 15,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue2));
    });

    it('ignore duplicate', async () => {
      const metadata = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 0,
        endTime: 10,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingSimple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);
      await svtaAdManager.addMetadata(metadata);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore invalid data', async () => {
      const metadata = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 0,
        endTime: 5,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: '',
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('ignore invalid type', async () => {
      const metadata = {
        type: 'urn:svta',
        startTime: 0,
        endTime: 5,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingSimple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('ignore if not asset loaded', async () => {
      player.dispatchEvent(new shaka.util.FakeEvent(
          shaka.util.FakeEvent.EventName.Unloading));

      const metadata = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 0,
        endTime: 5,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: signalingSimple,
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      expect(onEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('DASH', () => {
    const signalingSimple = JSON.stringify(creativeSignalingSimple);
    const signalingMultiple = JSON.stringify(creativeSignalingMultiple);

    it('basic support', async () => {
      const eventString = [
        '<Event duration="5" id="TEST" presentationTime="0">',
        signalingSimple,
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 5,
        id: 'TEST',
        schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('basic support with alt schemeIdUri', async () => {
      const eventString = [
        '<Event duration="5" id="TEST" presentationTime="0">',
        signalingSimple,
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 5,
        id: 'TEST',
        schemeIdUri: 'urn:svta:advertising-wg:ad-id-signaling',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('supports multiple', async () => {
      const eventString = [
        '<Event duration="10" id="TEST" presentationTime="0">',
        signalingMultiple,
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 10,
        id: 'TEST',
        schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
          {
            start: 5,
            end: 10,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore duplicates', async () => {
      const eventString = [
        '<Event duration="5" id="TEST" presentationTime="0">',
        signalingSimple,
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 5,
        id: 'TEST',
        schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).toHaveBeenCalledTimes(1);
      const eventValue1 = {
        type: 'ad-cue-points-changed',
        cuepoints: [
          {
            start: 0,
            end: 5,
          },
        ],
      };
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining(eventValue1));
    });

    it('ignore invalid schemeIdUri', async () => {
      const eventString = [
        '<Event duration="5" id="TEST" presentationTime="0">',
        signalingSimple,
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 5,
        id: 'TEST',
        schemeIdUri: 'urn:svta',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('ignore invalid data', async () => {
      const eventString = [
        '<Event duration="5" id="TEST" presentationTime="0">',
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 5,
        id: 'TEST',
        schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();
    });

    it('ignore if not asset loaded', async () => {
      player.dispatchEvent(new shaka.util.FakeEvent(
          shaka.util.FakeEvent.EventName.Unloading));

      const eventString = [
        '<Event duration="5" id="TEST" presentationTime="0">',
        signalingSimple,
        '</Event>',
      ].join('');
      const eventNode = TXml.parseXmlString(eventString);
      goog.asserts.assert(eventNode, 'Should have a event node!');
      /** @type {shaka.extern.TimelineRegionInfo} */
      const region = {
        startTime: 0,
        endTime: 5,
        id: 'TEST',
        schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
        eventNode,
        value: '',
        timescale: 1,
      };
      await svtaAdManager.addRegion(region);

      expect(onEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('tracking', () => {
    /**
     * @param {string} name
     * @param {number} value
     */
    function overrideVideoProperty(name, value) {
      Object.defineProperty(video, name, {
        value,
        configurable: true,
      });
    }

    beforeEach(() => {
      spyOn(player, 'isLive').and.returnValue(false);
      spyOn(player, 'isEnded').and.returnValue(false);
      spyOn(player, 'seekRange').and.returnValue({start: 0, end: 20});
      overrideVideoProperty('duration', 20);
      overrideVideoProperty('currentTime', 1);
    });

    // 'timeupdate' stops before the very end of the media, so a tracking
    // window that ends with the presentation would never reach 100% and would
    // be torn down as a skip instead of a completion.
    // https://github.com/shaka-project/shaka-player/issues/10545
    it('completes when the media ends', async () => {
      const metadata = {
        type: 'urn:svta:advertising-wg:ad-creative-signaling',
        startTime: 0,
        endTime: 5,
        values: [
          {
            key: 'X-AD-CREATIVE-SIGNALING',
            data: window.btoa(JSON.stringify(creativeSignalingSimple)),
          },
        ],
      };
      await svtaAdManager.addMetadata(metadata);

      const eventTypes = () => onEventSpy.calls.allArgs().map((args) => {
        return args[0].type;
      });

      expect(eventTypes()).not.toContain(shaka.ads.Utils.AD_COMPLETE);

      video.dispatchEvent(new Event('ended'));

      expect(eventTypes()).toContain(shaka.ads.Utils.AD_COMPLETE);
      expect(eventTypes()).not.toContain(shaka.ads.Utils.AD_SKIPPED);
    });
  });
});
