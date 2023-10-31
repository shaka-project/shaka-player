/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * For unknown reasons, these tests fail in the test labs for Edge on Windows,
 * in ways that do not seem to be unrelated to transmuxers.
 * Practical testing has not found any sign that playback is actually broken in
 * Edge, so these tests are disabled on Edge for the time being.
 * TODO(#5834): Remove this filter once the tests are fixed.
 * @return {boolean}
 */
function checkNoBrokenEdge() {
  const chromeVersion = shaka.util.Platform.chromeVersion();
  if (shaka.util.Platform.isWindows() && shaka.util.Platform.isEdge() &&
      chromeVersion && chromeVersion <= 118) {
    // When the tests fail, it's due to the manifest parser failing to find a
    // factory. Attempt to find a factory first, to avoid filtering the tests
    // when running in a non-broken Edge environment.
    const uri = 'fakeuri.m3u8';
    const mimeType = 'application/x-mpegurl';
    /* eslint-disable no-restricted-syntax */
    try {
      shaka.media.ManifestParser.getFactory(uri, mimeType);
      return true;
    } catch (error) {
      return false;
    }
    /* eslint-enable no-restricted-syntax */
  }
  return true;
}

filterDescribe('Transmuxer Player', checkNoBrokenEdge, () => {
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

  function isAc3Supported() {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="ac-3"')) {
      return false;
    }
    // AC3 is flaky in some Tizen devices, so we need omit it for now.
    if (shaka.util.Platform.isTizen()) {
      return false;
    }
    // It seems that AC3 on Edge Windows from github actions is not working
    // (in the lab AC3 is working). The AC3 detection is currently hard-coded
    // to true, which leads to a failure in GitHub's environment.
    // We must enable this, once it is resolved:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1450313
    const chromeVersion = shaka.util.Platform.chromeVersion();
    if (shaka.util.Platform.isWindows() && shaka.util.Platform.isEdge() &&
        chromeVersion && chromeVersion <= 118) {
      return false;
    }
    return true;
  }

  function isEc3Supported() {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')) {
      return false;
    }
    // EC3 is flaky in some Tizen devices, so we need omit it for now.
    if (shaka.util.Platform.isTizen()) {
      return false;
    }
    // It seems that EC3 on Edge Windows from github actions is not working
    // (in the lab EC3 is working). The EC3 detection is currently hard-coded
    // to true, which leads to a failure in GitHub's environment.
    // We must enable this, once it is resolved:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1450313
    const chromeVersion = shaka.util.Platform.chromeVersion();
    if (shaka.util.Platform.isWindows() && shaka.util.Platform.isEdge() &&
        chromeVersion && chromeVersion <= 118) {
      return false;
    }
    return true;
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

  describe('for audio', () => {
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
        pending('Codec MP3 in MP4 is not supported by the platform.');
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
      if (!isAc3Supported()) {
        pending('Codec AC-3 is not supported by the platform.');
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
      if (!isEc3Supported()) {
        pending('Codec EC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-raw-ec3/prog_index.m3u8');
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

    it('MP3 in TS', async () => {
      if (!MediaSource.isTypeSupported('audio/mp4; codecs="mp3"') &&
        !MediaSource.isTypeSupported('audio/mpeg')) {
        pending('Codec MP3 is not supported by the platform.');
      }
      // This tests is flaky in some Tizen devices, so we need omit it for now.
      if (shaka.util.Platform.isTizen()) {
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

    it('AC3 in TS', async () => {
      if (!isAc3Supported()) {
        pending('Codec AC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-ts-ac3/prog_index.m3u8');
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

    it('EC3 in TS', async () => {
      if (!isEc3Supported()) {
        pending('Codec EC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-ts-ec3/prog_index.m3u8');
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

  describe('for video', () => {
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

    it('H.265 in TS', async () => {
      const chromeVersion = shaka.util.Platform.chromeVersion();
      if (shaka.util.Platform.isWindows() &&
          chromeVersion && chromeVersion === 117) {
        // It appears that Chrome 117 beta in Windows is incorrectly reporting
        // H.265 in MediaCapabilities
        pending('Codec H.265 is not supported by the platform.');
      }
      const mimeType = 'video/mp4; codecs="hvc1.2.4.L123.B0"';
      if (!MediaSource.isTypeSupported(mimeType)) {
        pending('Codec H.265 is not supported by the platform.');
      }
      await player.load('/base/test/test/assets/hls-ts-h265/hevc.m3u8');
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

  describe('for muxed content', () => {
    it('H.264+AAC in TS', async () => {
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

    it('H.265+AAC in TS', async () => {
      const chromeVersion = shaka.util.Platform.chromeVersion();
      if (shaka.util.Platform.isWindows() &&
          chromeVersion && chromeVersion === 117) {
        // It appears that Chrome 117 beta in Windows is incorrectly reporting
        // H.265 in MediaCapabilities
        pending('Codec H.265 is not supported by the platform.');
      }
      if (!MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.90"')) {
        pending('Codec H.265 is not supported by the platform.');
      }
      // eslint-disable-next-line max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-aac-h265/media.m3u8');
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

    it('H.264+MP3 in TS', async () => {
      if (!MediaSource.isTypeSupported('audio/mp4; codecs="mp3"')) {
        pending('Codec MP3 in MP4 is not supported by the platform.');
      }

      // eslint-disable-next-line max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-mp3-h264/index.m3u8');
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

    it('H.264+AC3 in TS', async () => {
      if (!isAc3Supported()) {
        pending('Codec AC-3 is not supported by the platform.');
      }

      // eslint-disable-next-line max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-ac3-h264/media.m3u8');
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

    it('H.264+EC3 in TS', async () => {
      if (!isEc3Supported()) {
        pending('Codec EC-3 is not supported by the platform.');
      }

      // eslint-disable-next-line max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-ec3-h264/prog_index.m3u8');
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
});
