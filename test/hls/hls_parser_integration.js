/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('HlsParser', () => {
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  function checkClearKeySupport() {
    const clearKeySupport = shakaSupport.drm['org.w3.clearkey'];
    if (!clearKeySupport) {
      return false;
    }
    return clearKeySupport.encryptionSchemes.includes('cenc');
  }

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();
    await player.attach(video);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

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
  });

  it('supports AES-256 streaming', async () => {
    let keyRequests = 0;
    const netEngine = player.getNetworkingEngine();
    netEngine.registerRequestFilter((type, request, context) => {
      if (type == shaka.net.NetworkingEngine.RequestType.KEY) {
        keyRequests++;
      }
    });
    await player.load('/base/test/test/assets/hls-aes-256/media.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 8 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 30);

    await player.unload();

    // The stream has 6 #EXT-X-KEY but only 5 different keys.
    expect(keyRequests).toBe(5);
  });

  drmIt('supports SAMPLE-AES identity streaming', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }

    await player.load('/base/test/test/assets/hls-sample-aes/index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 8 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 30);

    await player.unload();
  });

  it('supports text discontinuity', async () => {
    player.configure('autoShowText', shaka.config.AutoShowText.ALWAYS);

    await player.load('/base/test/test/assets/hls-text-offset/index.m3u8');
    await video.play();

    // Wait for last cue
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 30);

    const cues = video.textTracks[0].cues;
    expect(cues.length).toBe(3);
    expect(cues[0].startTime).toBeCloseTo(0, 0);
    expect(cues[0].endTime).toBeCloseTo(2, 0);
    expect(cues[1].startTime).toBeCloseTo(2, 0);
    expect(cues[1].endTime).toBeCloseTo(4, 0);
    expect(cues[2].startTime).toBeCloseTo(6, 0);
    expect(cues[2].endTime).toBeCloseTo(8, 0);

    await player.unload();
  });

  it('supports text without discontinuity', async () => {
    player.configure('autoShowText', shaka.config.AutoShowText.ALWAYS);

    // eslint-disable-next-line @stylistic/max-len
    await player.load('/base/test/test/assets/hls-text-no-discontinuity/index.m3u8');
    await video.play();

    // This test sometimes fails on Tizen with missing cues if we use too
    // small a delay here.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 3, 30);

    const cues = video.textTracks[0].cues;
    expect(cues.length).toBe(3);
    expect(cues[0].startTime).toBeCloseTo(0.6, 0);
    expect(cues[0].endTime).toBeCloseTo(2.88, 0);
    expect(cues[1].startTime).toBeCloseTo(2.88, 0);
    expect(cues[1].endTime).toBeCloseTo(6.36, 0);
    expect(cues[2].startTime).toBeCloseTo(6.36, 0);
    expect(cues[2].endTime).toBeCloseTo(10.68, 0);

    await player.unload();
  });

  it('allow switch between mp4 muxed and ts muxed', async () => {
    if (!await Util.isTypeSupported(
        'video/mp4; codecs="av01.0.31M.08"',
        /* width= */ 1920, /* height= */ 1080)) {
      pending('Codec AV1 is not supported by the platform.');
    }
    player.configure('abr.enabled', false);
    await player.load('/base/test/test/assets/hls-muxed-mp4-ts/master.m3u8');
    await video.play();

    expect(player.getVariantTracks().length).toBe(2);

    // We want to test TS --> MP4 and MP4 --> TS, that's why
    // selectVariantTrack is called twice

    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 30);

    let nonActiveVariant = player.getVariantTracks().find((v) => !v.active);
    goog.asserts.assert(nonActiveVariant, 'variant should be non-null!');
    player.selectVariantTrack(nonActiveVariant, /* clearBuffer= */ true);

    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 3, 30);

    nonActiveVariant = player.getVariantTracks().find((v) => !v.active);
    goog.asserts.assert(nonActiveVariant, 'variant should be non-null!');
    player.selectVariantTrack(nonActiveVariant, /* clearBuffer= */ true);

    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);

    await player.unload();
  });
});
