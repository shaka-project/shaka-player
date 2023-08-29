/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Transmuxer Player', () => {
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

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player(video);

    player.configure('mediaSource.forceTransmux', true);
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

  it('raw AAC', async () => {
    await player.load('/base/test/test/assets/hls-raw-aac/manifest.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('raw MP3', async () => {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="mp3"')) {
      return;
    }
    await player.load('/base/test/test/assets/hls-raw-mp3/playlist.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('raw AC3', async () => {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="ac-3"')) {
      return;
    }
    // This tests is flaky in some Tizen devices, so we need omit it for now.
    if (shaka.util.Platform.isTizen()) {
      return;
    }
    // It seems that AC3 on Edge Windows from github actions is not working
    // (in the lab AC3 is working). The AC3 detection is currently hard-coded
    // to true, which leads to a failure in GitHub's environment.
    // We must enable this, once it is resolved:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1450313
    const chromeVersion = shaka.util.Platform.chromeVersion();
    if (shaka.util.Platform.isEdge() &&
        chromeVersion && chromeVersion <= 116) {
      return;
    }

    await player.load('/base/test/test/assets/hls-raw-ac3/prog_index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('raw EC3', async () => {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')) {
      return;
    }
    // It seems that AC3 on Edge Windows from github actions is not working
    // (in the lab AC3 is working). The AC3 detection is currently hard-coded
    // to true, which leads to a failure in GitHub's environment.
    // We must enable this, once it is resolved:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1450313
    const chromeVersion = shaka.util.Platform.chromeVersion();
    if (shaka.util.Platform.isEdge() &&
        chromeVersion && chromeVersion <= 116) {
      return;
    }

    await player.load('/base/test/test/assets/hls-raw-ac3/prog_index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('muxed H.264+AAC in TS', async () => {
    // eslint-disable-next-line max-len
    await player.load('/base/test/test/assets/hls-ts-muxed-aac-h264/playlist.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('AAC in TS', async () => {
    await player.load('/base/test/test/assets/hls-ts-aac/playlist.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('H.264 in TS', async () => {
    await player.load('/base/test/test/assets/hls-ts-h264/prog_index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });

  it('MP3 in TS', async () => {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="mp3"') &&
        !MediaSource.isTypeSupported('audio/mpeg')) {
      return;
    }
    await player.load('/base/test/test/assets/hls-ts-mp3/manifest.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 15 seconds, but stop early if the video ends.  If it takes
    // longer than 45 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

    await player.unload();
  });
});
