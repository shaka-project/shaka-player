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
    player = new compiledShaka.Player();
    await player.attach(video);

    player.configure('mediaSource.forceTransmux', true);

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

      // Play for 12 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 12, 45);

      await player.unload();
    });

    it('raw MP3', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="mp3"') &&
        !await Util.isTypeSupported('audio/mpeg')) {
        pending('Codec MP3 is not supported by the platform.');
      }
      // This tests is flaky in some Tizen devices, so we need omit it for now.
      if (shaka.util.Platform.isTizen()) {
        pending('Disabled on Tizen.');
      }
      await player.load('/base/test/test/assets/hls-raw-mp3/playlist.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 12 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 12, 45);

      await player.unload();
    });

    it('raw AC3', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="ac-3"')) {
        pending('Codec AC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-raw-ac3/prog_index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('raw EC3', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="ec-3"')) {
        pending('Codec EC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-raw-ec3/prog_index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('raw AAC with ts extension', async () => {
      await player.load('/base/test/test/assets/hls-ts-raw-aac/index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 12 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 12, 45);

      await player.unload();
    });

    it('AAC in TS', async () => {
      await player.load('/base/test/test/assets/hls-ts-aac/playlist.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 6 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 6, 45);

      await player.unload();
    });

    it('MP3 in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="mp3"') &&
        !await Util.isTypeSupported('audio/mpeg')) {
        pending('Codec MP3 is not supported by the platform.');
      }
      // This tests is flaky in some Tizen devices, so we need omit it for now.
      if (shaka.util.Platform.isTizen()) {
        pending('Disabled on Tizen.');
      }
      await player.load('/base/test/test/assets/hls-ts-mp3/manifest.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 12 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 12, 45);

      await player.unload();
    });

    it('AC3 in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="ac-3"')) {
        pending('Codec AC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-ts-ac3/prog_index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('EC3 in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="ec-3"')) {
        pending('Codec EC-3 is not supported by the platform.');
      }

      await player.load('/base/test/test/assets/hls-ts-ec3/prog_index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

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

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('H.265 in TS', async () => {
      if (!await Util.isTypeSupported('video/mp4; codecs="hvc1.2.4.L123.B0"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec H.265 is not supported by the platform.');
      }
      await player.load('/base/test/test/assets/hls-ts-h265/hevc.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 14 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 14, 45);

      await player.unload();
    });
  });

  describe('for muxed content', () => {
    it('H.264+AAC in TS', async () => {
      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-aac-h264/playlist.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('H.264+AAC in TS with rollover', async () => {
      await player.load('/base/test/test/assets/hls-ts-rollover/playlist.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // The rollover occurs around the 9th second, without the rollover, the
      // media source times are wrong and the stream freezes. The purpose is to
      // play at least 15 seconds to see that the rollover passes and the
      // stream continues without problems.

      // Play for 15 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 15, 45);

      await player.unload();
    });

    it('H.264+AAC with AAC sample with overflow aac samples', async () => {
      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-aac-h264-with-overflow-samples/media.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for e seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 3, 45);

      await player.unload();
    });

    it('H.264+AAC with AAC sample with overflow nalus', async () => {
      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-aac-h264-with-overflow-nalus/media.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for e seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 3, 45);

      await player.unload();
    });

    it('H.265+AAC in TS', async () => {
      if (!await Util.isTypeSupported('video/mp4; codecs="hvc1.2.4.L123.B0"',
          /* width= */ 720, /* height= */ 1280)) {
        pending('Codec H.265 is not supported by the platform.');
      }

      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-aac-h265/media.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 7 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 7, 45);

      await player.unload();
    });

    it('H.264+MP3 in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="mp3"') &&
        !await Util.isTypeSupported('audio/mpeg')) {
        pending('Codec MP3 is not supported by the platform.');
      }
      // This tests is flaky in some Tizen devices, so we need omit it for now.
      if (shaka.util.Platform.isTizen()) {
        pending('Disabled on Tizen.');
      }

      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-mp3-h264/index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('H.264+AC3 in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="ac-3"')) {
        pending('Codec AC-3 is not supported by the platform.');
      }
      // This tests is flaky in some Tizen devices, so we need omit it for now.
      if (shaka.util.Platform.isTizen()) {
        pending('Disabled on Tizen.');
      }

      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-ac3-h264/media.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 6 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 6, 45);

      await player.unload();
    });

    it('H.264+EC3 in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="ec-3"')) {
        pending('Codec EC-3 is not supported by the platform.');
      }

      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-ec3-h264/prog_index.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 8 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 45);

      await player.unload();
    });

    it('H.264+Opus in TS', async () => {
      if (!await Util.isTypeSupported('audio/mp4; codecs="opus"')) {
        pending('Codec opus is not supported by the platform.');
      }

      // eslint-disable-next-line @stylistic/max-len
      await player.load('/base/test/test/assets/hls-ts-muxed-opus-h264/playlist.m3u8');
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 12 seconds, but stop early if the video ends.  If it takes
      // longer than 45 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 12, 45);

      await player.unload();
    });
  });
});
