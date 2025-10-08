/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player Src Equals', () => {
  // This asset needs to be (1) long and (2) high bitrate so that we can
  // invoke unbuffered seeks.
  const LARGE_MP4_CONTENT_URI = 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/v-2160p-17000k-libx264.mp4';

  // This asset needs to have VTT subtitles.
  const HLS_CONTENT_URI = 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8';

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(() => {
    player = new shaka.Player();
    player.addEventListener('error', fail);
  });

  afterEach(async () => {
    await player.destroy();
    player.releaseAllMutexes();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  // Buffering is tracked using the media element, so the buffering state should
  // be the same as if we were using |MediaSource|.
  it('reports buffering state', async () => {
    /** @type {function():number} */
    const getBufferEnd = () => {
      const buffered = player.getBufferedInfo().total;
      return buffered.length ? buffered[buffered.length - 1].end : 0;
    };

    await loadWithSrcEquals(LARGE_MP4_CONTENT_URI);

    // Wait until we have more than enough data buffered.
    while (getBufferEnd() < 2) {
      // eslint does not like await-in-loop because it could mean that you are
      // not using parallelism to its fullest. However we are not after
      // parallelism here, therefore we disable it.
      //
      // eslint-disable-next-line no-await-in-loop
      await shaka.test.Util.delay(0.25);
    }

    // Wait to make sure we are done buffering. This avoid the race condition
    // between buffering enough and the event being fired.
    if (player.isBuffering()) {
      await new Promise((resolve) => {
        player.addEventListener('buffering', resolve);
      });
    }

    expect(player.isBuffering()).toBeFalsy();

    // Wrap the event listener so that once we do the seek, we'll be notified of
    // the buffering event.
    const bufferingEvent = new Promise((resolve) => {
      player.addEventListener('buffering', resolve);
    });

    // Perform an unbuffered seek. We assume the content is so large that we
    // won't be able to buffer quick enough.
    video.currentTime = video.duration - 10;

    // After we see the buffering event, we should see the player report that we
    // are in a buffering state.
    await bufferingEvent;
    expect(player.isBuffering()).toBeTruthy();
  });

  // A regression test for https://github.com/shaka-project/shaka-player/issues/2523
  it('detects subtitles in native HLS', async () => {
    const supportsNativeHls =
        video.canPlayType('application/vnd.apple.mpegurl') != '';
    if (!supportsNativeHls) {
      // Skip this test.
      pending('No native HLS support!');
    }

    await loadWithSrcEquals(HLS_CONTENT_URI);

    expect(player.getTextTracks()).not.toEqual([]);
  });

  // A regression test for
  // https://github.com/shaka-project/shaka-player/issues/2483#issuecomment-633412527
  // and https://github.com/shaka-project/shaka-player/issues/2593
  it('honors preferred audio and text languages', async () => {
    const supportsNativeHls =
        video.canPlayType('application/vnd.apple.mpegurl') != '';
    if (!supportsNativeHls) {
      // Skip this test.
      pending('No native HLS support!');
    }

    player.configure('preferredAudioLanguage', 'de');
    player.configure('preferredTextLanguage', 'el');
    player.configure('autoShowText', shaka.config.AutoShowText.ALWAYS);

    await loadWithSrcEquals(HLS_CONTENT_URI);

    // The track change is not reflected instantly in Safari.  We can't control
    // the timing of it, but we can wait for an event from the player indicating
    // that it has changed tracks for us.
    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager)
        .timeoutAfter(5).failOnTimeout(false);
    await waiter.waitForEvent(player, 'textchanged');
    eventManager.release();

    const activeVariant = player.getVariantTracks().find((t) => t.active);
    const activeText = player.getTextTracks().find((t) => t.active);

    expect(activeVariant).toEqual(jasmine.objectContaining({language: 'de'}));
    expect(activeText).toEqual(jasmine.objectContaining({language: 'el'}));
  });

  /**
   * @param {string} contentUri
   * @return {!Promise}
   */
  async function loadWithSrcEquals(contentUri) {
    /** @type {!shaka.util.EventManager} */
    const eventManager = new shaka.util.EventManager();

    const ready = new Promise((resolve) => {
      eventManager.listenOnce(video, 'loadeddata', resolve);
    });

    await player.attach(video, /* initMediaSource= */ false);
    await player.load(contentUri);

    // Wait until the media element is ready with content. Waiting until this
    // point ensures it is safe to interact with the media element.
    await ready;

    eventManager.release();
  }
});
