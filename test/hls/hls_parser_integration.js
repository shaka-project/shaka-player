/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('HlsParser', () => {
  const Util = shaka.test.Util;

  /** @type {!Object.<string, ?shaka.extern.DrmSupportType>} */
  let support = {};

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
    const clearKeySupport = support['org.w3.clearkey'];
    if (!clearKeySupport) {
      return false;
    }
    return clearKeySupport.encryptionSchemes.includes('cbcs');
  }

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
    support = await shaka.media.DrmEngine.probeSupport();
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();
    await player.attach(video);

    player.configure('streaming.useNativeHlsOnSafari', false);

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
    await player.load('/base/test/test/assets/hls-aes-256/index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 10 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

    await player.unload();

    // The stream has 6 #EXT-X-KEY but only 5 different keys.
    expect(keyRequests).toBe(5);
  });

  it('supports SAMPLE-AES identity streaming', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }

    await player.load('/base/test/test/assets/hls-sample-aes/index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 10 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

    await player.unload();
  });

  it('supports text discontinuity', async () => {
    if (!shaka.util.Platform.supportsSequenceMode()) {
      pending('Sequence mode is not supported by the platform.');
    }

    player.configure('manifest.hls.ignoreManifestProgramDateTime', true);
    player.setTextTrackVisibility(true);

    await player.load('/base/test/test/assets/hls-text-offset/index.m3u8');
    await video.play();

    // Wait for last cue
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 7, 30);

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
});
