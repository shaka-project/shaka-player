/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('LCEVC Integration', () => {
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLCanvasElement} */
  let canvas;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  const seiManifests = {
    FMP4_DASH: '/base/test/test/assets/lcevc-sei/lcevc-sei.mpd',
  };

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    canvas = shaka.test.UiUtils.createCanvasElement();

    document.body.appendChild(video);
    document.body.appendChild(canvas);

    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();

    player.attachCanvas(canvas);
    await player.attach(video);

    // Enable the LCEVC enhancement.
    player.configure('lcevc.enabled', true);
    player.configure('lcevc.drawLogo', true);
    player.configure('lcevc.dynamicPerformanceScaling', false);

    // Enable transmuxing
    player.configure('streaming.preferNativeHls', false);
    player.configure('mediaSource.forceTransmux', true);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
    document.body.removeChild(canvas);
  });

  describe('SEI Integration', () => {
    it('Should decode LCEVC in FMP4 DASH manifest', async () => {
      await player.load(seiManifests.FMP4_DASH);
      await video.play();

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 6 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 6, 45);

      // Expect LCEVCdec to be enabled and have detected LCEVC data in SEI
      expect(LCEVCdec.instance).toBeDefined();
      expect(LCEVCdec.instance.isLcevcEnabled).toBe(true);
      expect(LCEVCdec.instance.firstLcevcSegmentLoaded).toBe(true);
      expect(LCEVCdec.instance.lcevcDataDetected).toBe(true);

      await player.unload();
    });
  });
});
