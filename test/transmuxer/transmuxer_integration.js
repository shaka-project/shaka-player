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

  beforeEach(() => {
    player = new compiledShaka.Player(video);

    // Make sure we are playing the lowest res available to avoid test flake
    // based on network issues.  Note that disabling ABR and setting a low
    // abr.defaultBandwidthEstimate would not be sufficient, because it
    // would only affect the choice of track on the first period.  When we
    // cross a period boundary, the default bandwidth estimate will no
    // longer be in effect, and AbrManager may choose higher res tracks for
    // the new period.  Using abr.restrictions.maxHeight will let us force
    // AbrManager to the lowest resolution, which is its fallback when these
    // soft restrictions cannot be met.
    player.configure('abr.restrictions.maxHeight', 1);
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
    // eslint-disable-next-line max-len
    const url = 'https://storage.googleapis.com/shaka-demo-assets/raw-hls-audio-only/manifest.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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

  it('raw MP3', async () => {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="mp3"')) {
      return;
    }
    // eslint-disable-next-line max-len
    const url = 'https://pl.streamingvideoprovider.com/mp3-playlist/playlist.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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

    // eslint-disable-next-line max-len
    const url = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/a2/prog_index.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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

    // eslint-disable-next-line max-len
    const url = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/a3/prog_index.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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
    const url = 'https://cf-sf-video.wmspanel.com/local/raw/BigBuckBunny_320x180.mp4/playlist.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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

  it('AAC in TS', async () => {
    // eslint-disable-next-line max-len
    const url = 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa_audio_1_stereo_128000.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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

  it('H.264 in TS', async () => {
    // eslint-disable-next-line max-len
    const url = 'https://storage.googleapis.com/shaka-demo-assets/apple-advanced-stream-ts/v2/prog_index.m3u8';

    await player.load(url, /* startTime= */ null,
        /* mimeType= */ undefined);
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
});
