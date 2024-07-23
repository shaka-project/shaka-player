/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player Dolby Vision', () => {
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

  /**
   * @param {string} uri
   * @return {!Promise}
   */
  async function testPlayback(uri) {
    await player.load(uri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  }

  describe('P8 with fallback to HEVC', () => {
    it('with DASH', async () => {
      if (!await Util.isTypeSupported('video/mp4; codecs="hvc1.2.4.L90.90"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec HEVC is not supported by the platform.');
      }
      await testPlayback('/base/test/test/assets/dv-p8-hevc/manifest.mpd');
    });

    it('with master playlist (HLS)', async () => {
      if (!await Util.isTypeSupported('video/mp4; codecs="hvc1.2.4.L90.90"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec HEVC is not supported by the platform.');
      }
      await testPlayback('/base/test/test/assets/dv-p8-hevc/master.m3u8');
    });

    it('with media playlist (HLS)', async () => {
      if (!await Util.isTypeSupported('video/mp4; codecs="hvc1.2.4.L90.90"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec HEVC is not supported by the platform.');
      }
      await testPlayback('/base/test/test/assets/dv-p8-hevc/media.m3u8');
    });
  });

  describe('P10 with fallback to AV1', () => {
    it('with DASH', async () => {
      if (!await Util.isTypeSupported(
          'video/mp4; codecs="av01.0.04M.10.0.111.09.16.09.0"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec AV1 is not supported by the platform.');
      }
      await testPlayback('/base/test/test/assets/dv-p10-av1/manifest.mpd');
    });

    it('with master playlist (HLS)', async () => {
      if (!await Util.isTypeSupported(
          'video/mp4; codecs="av01.0.04M.10.0.111.09.16.09.0"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec AV1 is not supported by the platform.');
      }
      await testPlayback('/base/test/test/assets/dv-p10-av1/master.m3u8');
    });

    it('with media playlist (HLS)', async () => {
      if (!await Util.isTypeSupported(
          'video/mp4; codecs="av01.0.04M.10.0.111.09.16.09.0"',
          /* width= */ 640, /* height= */ 360)) {
        pending('Codec AV1 is not supported by the platform.');
      }
      await testPlayback('/base/test/test/assets/dv-p10-av1/media.m3u8');
    });
  });
});
