/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// These tests are for testing Shaka Player's integration with
// |HTMLMediaElement.src=|. These tests are to verify that all |shaka.Player|
// public methods behaviour correctly when playing content video |src=|.
describe('Player Src Equals', () => {
  const SMALL_MP4_CONTENT_URI = '/base/test/test/assets/small.mp4';

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {shaka.test.Waiter} */
  let waiter;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(() => {
    player = new shaka.Player();
    player.addEventListener('error', fail);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
  });

  afterEach(async () => {
    await player.destroy();
    player.releaseAllMutexes();

    eventManager.release();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  // This test verifies that we can successfully load content that requires us
  // to use |src=|.
  it('loads content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
  });

  // This test verifys that we can successfully unload content that required
  // |src=| to load.
  it('unloads content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    await player.unload(/* initMediaSource= */ false);
  });

  it('can get asset uri after loading', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.getAssetUri()).toBe(SMALL_MP4_CONTENT_URI);
  });

  // TODO: test an HLS live stream on platforms supporting native HLS
  it('considers simple mp4 content to be VOD"', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.isLive()).toBeFalsy();
    expect(player.isInProgress()).toBeFalsy();
  });

  // TODO: test an audio-only mp4
  // TODO: test audio-only HLS on platforms with native HLS
  it('considers audio-video mp4 content to be audio-video', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.isAudioOnly()).toBeFalsy();
  });

  it('allow load with startTime', async () => {
    const startTime = 5;
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, startTime);

    // For some reason, the delta on Edge can be 0.1 for this content and
    // this start time.  It may be rounded to a key frame or something.
    const delta = Math.abs(video.currentTime - startTime);
    expect(delta).toBeLessThan(0.2);
  });

  // Since we don't have any manifest data, we must assume that we can seek
  // anywhere in the presentation; end-time will come from the media element.
  it('allows seeking throughout the presentation', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // For src=, the seekRange is based on video.seekable, so wait for this
    // event before proceeding to check seekRange.
    await new Promise((resolve) => {
      eventManager.listenOnce(video, 'canplay', resolve);
    });

    // The seek range should match the duration of the content.
    const seekRange = player.seekRange();
    expect(seekRange.start).toBeCloseTo(0);
    expect(seekRange.end).toBeCloseTo(video.duration);
    expect(video.duration).not.toBeCloseTo(0);

    // Start playback and wait for the playhead to move.
    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */10);

    // Make sure the playhead is roughly where we expect it to be before
    // seeking.
    expect(video.currentTime).toBeGreaterThan(0);
    expect(video.currentTime).toBeLessThan(2.0);

    // Trigger a seek and then wait for the seek to take effect.
    // This seek target is very close to the duration of the video.
    video.currentTime = 10;
    await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */10);

    // Make sure the playhead is roughly where we expect it to be after
    // seeking.
    expect(video.currentTime).toBeGreaterThan(9.5);
    expect(video.currentTime).toBeLessThan(10.5);
  });

  // TODO: test src= with DRM
  // TODO: test HLS without DRM on platforms with native HLS
  // TODO: test HLS with DRM on platforms with native HLS
  it('considers simple content to be clear ', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    expect(player.keySystem()).toBe('');
    expect(player.drmInfo()).toBe(null);
    expect(player.getExpiration()).toBe(Infinity);
  });

  // Compared to media source, when loading content with src=, we will have less
  // accurate information. However we can still report what the media element
  // surfaces.
  it('reports buffering information', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // For playback to begin so that we have some content buffered.
    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */10);

    const buffered = player.getBufferedInfo();

    // We don't have per-stream insights.
    expect(buffered.audio).toEqual([]);
    expect(buffered.video).toEqual([]);
    expect(buffered.text).toEqual([]);

    // We should have an overall view of buffering. We waited for playback,
    // so we should have some content buffered.
    expect(buffered.total).toBeTruthy();
    expect(buffered.total.length).toBe(1);
    expect(buffered.total[0].start).toBeCloseTo(0);
    expect(buffered.total[0].end).toBeGreaterThan(0);
  });

  // When we load content via src=, can we use the trick play controls to
  // control the playback rate.
  it('can control trick play rate', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    let videoRateChange = false;
    let playerRateChange = false;
    eventManager.listen(video, 'ratechange', () => {
      videoRateChange = true;
    });
    eventManager.listen(player, 'ratechange', () => {
      playerRateChange = true;
    });

    // Let playback run for a little.
    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */10);

    // Enabling trick play should change our playback rate to the same rate.
    player.trickPlay(2);
    expect(video.playbackRate).toBe(2);

    // It should also have fired a 'ratechange' event on both video and player.
    // We may have to delay a short time to see the events, though.
    await shaka.test.Util.shortDelay();
    expect(videoRateChange).toBe(true);
    expect(playerRateChange).toBe(true);

    // Let playback continue playing for a bit longer.
    await shaka.test.Util.delay(2);

    // Cancelling trick play should return our playback rate to normal.
    player.cancelTrickPlay();
    expect(video.playbackRate).toBe(1);
  });

  // TODO: test audio-video mp4 content on platforms with audioTracks API
  it('reports variant tracks for video-only mp4 content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // On platforms with audioTracks, such as Safari, we get one track here.
    if (video.audioTracks) {
      expect(player.getVariantTracks().length).toBe(1);
    } else {
      expect(player.getVariantTracks().length).toBe(0);
    }
  });

  // TODO: test HLS on platforms with native HLS
  it('allows selecting variant tracks', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // We can only get a variant track here on certain browsers.
    const tracks = player.getVariantTracks();

    // If we have tracks, we should be able to select them.
    if (tracks.length) {
      // The test fails if this throws.
      player.selectVariantTrack(tracks[0]);
    }
  });

  // TODO: test HLS with text tracks on platforms with native HLS
  it('reports no text tracks for simple mp4 content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.getTextTracks()).toEqual([]);
  });

  // TODO: test HLS on platforms with native HLS
  it('allows selecting text tracks', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // We can only get a text track here on certain browsers.
    const tracks = player.getTextTracks();

    // If we have tracks, we should be able to select them.
    if (tracks.length) {
      // The test fails if this throws.
      player.selectTextTrack(tracks[0]);
    }
  });

  it('ignores extra text track on the video element', async () => {
    // The extra text track with label "Shaka Player TextTrack" should not be
    // listed.
    video.addTextTrack('subtitles', /* label= */ shaka.Player.TextTrackLabel);

    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.getTextTracks()).toEqual([]);
  });


  // TODO: test HLS on platforms with native HLS
  it('returns no languages or roles for simple mp4 content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // On platforms with audioTracks, such as Safari, we get one track, with
    // language set to whatever is in the mp4.
    if (video.audioTracks) {
      expect(player.getAudioLanguages()).toEqual(['en']);
      // Note that some browsers, such as Safari, say this is the 'main'
      // role, while others, such as Edge, do not.  For the purposes of this
      // test, it doesn't matter what the role is.
      expect(player.getAudioLanguagesAndRoles()).toEqual(
          [{language: 'en', role: jasmine.any(String), label: null}]);
    } else {
      expect(player.getAudioLanguages()).toEqual([]);
      expect(player.getAudioLanguagesAndRoles()).toEqual([]);
    }

    expect(player.getTextLanguages()).toEqual([]);
    expect(player.getTextLanguagesAndRoles()).toEqual([]);
  });

  // Even though we loaded content using |src=| we should still be able to get
  // the playhead position as normal.
  it('can get the playhead position', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(video.readyState).toBeGreaterThan(0);

    expect(video.currentTime).toBeCloseTo(0);

    // Start playback and wait. We should see the playhead move.
    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */10);
    await shaka.test.Util.delay(1.5);

    // When checking if the playhead moved, check for less progress than time we
    // delayed. This will allow for some latency between |play| and playback
    // starting.
    expect(video.currentTime).toBeGreaterThan(1);
  });

  // Even though we are not using all the internals, we should still get some
  // meaningful statistics.
  it('can get stats', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    // Wait some time for playback to start so that we will have a load latency
    // value.
    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */10);

    // Get the stats and check that some stats have been filled in.
    const stats = player.getStats();
    expect(stats).toBeTruthy();
    expect(stats.loadLatency).toBeGreaterThan(0);
    expect(stats.manifestTimeSeconds).toBeNaN(); // There's no manifest.
    expect(stats.drmTimeSeconds).toBeNaN(); // There's no DRM.
    expect(stats.height).toBe(110);
    expect(stats.width).toBe(256);
  });

  it('plays with external text tracks', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

    const locationUri = new goog.Uri(location.href);
    const partialUri = new goog.Uri('/base/test/test/assets/text-clip.vtt');
    const absoluteUri = locationUri.resolve(partialUri);
    const newTrack = await player.addTextTrackAsync(
        absoluteUri.toString(), 'en', 'subtitles', 'text/vtt');

    expect(newTrack).toBeTruthy();
  });

  describe('addChaptersTrack', () => {
    it('adds external chapters in vtt format', async () => {
      await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

      const locationUri = new goog.Uri(location.href);
      const partialUri1 = new goog.Uri('/base/test/test/assets/chapters.vtt');
      const absoluteUri1 = locationUri.resolve(partialUri1);
      await player.addChaptersTrack(absoluteUri1.toString(), 'en');

      // Data should be available as soon as addChaptersTrack resolves.
      // See https://github.com/shaka-project/shaka-player/issues/4186
      const chapters = player.getChapters('en');
      expect(chapters.length).toBe(3);
      const chapter1 = chapters[0];
      expect(chapter1.title).toBe('Chapter 1');
      expect(chapter1.startTime).toBe(0);
      expect(chapter1.endTime).toBe(5);
      const chapter2 = chapters[1];
      expect(chapter2.title).toBe('Chapter 2');
      expect(chapter2.startTime).toBe(5);
      expect(chapter2.endTime).toBe(10);
      const chapter3 = chapters[2];
      expect(chapter3.title).toBe('Chapter 3');
      expect(chapter3.startTime).toBe(10);
      expect(chapter3.endTime).toBe(20);

      const partialUri2 = new goog.Uri('/base/test/test/assets/chapters2.vtt');
      const absoluteUri2 = locationUri.resolve(partialUri2);
      await player.addChaptersTrack(absoluteUri2.toString(), 'en');

      const chaptersUpdated = player.getChapters('en');
      expect(chaptersUpdated.length).toBe(6);
      const chapterUpdated1 = chaptersUpdated[0];
      expect(chapterUpdated1.title).toBe('Chapter 1');
      expect(chapterUpdated1.startTime).toBe(0);
      expect(chapterUpdated1.endTime).toBe(5);
      const chapterUpdated2 = chaptersUpdated[1];
      expect(chapterUpdated2.title).toBe('Chapter 2');
      expect(chapterUpdated2.startTime).toBe(5);
      expect(chapterUpdated2.endTime).toBe(10);
      const chapterUpdated3 = chaptersUpdated[2];
      expect(chapterUpdated3.title).toBe('Chapter 3');
      expect(chapterUpdated3.startTime).toBe(10);
      expect(chapterUpdated3.endTime).toBe(20);
      const chapterUpdated4 = chaptersUpdated[3];
      expect(chapterUpdated4.title).toBe('Chapter 4');
      expect(chapterUpdated4.startTime).toBe(20);
      expect(chapterUpdated4.endTime).toBe(30);
      const chapterUpdated5 = chaptersUpdated[4];
      expect(chapterUpdated5.title).toBe('Chapter 5');
      expect(chapterUpdated5.startTime).toBe(30);
      expect(chapterUpdated5.endTime).toBe(40);
      const chapterUpdated6 = chaptersUpdated[5];
      expect(chapterUpdated6.title).toBe('Chapter 6');
      expect(chapterUpdated6.startTime).toBe(40);
      expect(chapterUpdated6.endTime).toBe(61.349);
    });

    it('add external chapters in srt format', async () => {
      await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);

      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri('/base/test/test/assets/chapters.srt');
      const absoluteUri = locationUri.resolve(partialUri);
      await player.addChaptersTrack(absoluteUri.toString(), 'es');

      const chapters = player.getChapters('es');
      expect(chapters.length).toBe(3);
      const chapter1 = chapters[0];
      expect(chapter1.title).toBe('Chapter 1');
      expect(chapter1.startTime).toBe(0);
      expect(chapter1.endTime).toBe(5);
      const chapter2 = chapters[1];
      expect(chapter2.title).toBe('Chapter 2');
      expect(chapter2.startTime).toBe(5);
      expect(chapter2.endTime).toBe(30);
      const chapter3 = chapters[2];
      expect(chapter3.title).toBe('Chapter 3');
      expect(chapter3.startTime).toBe(30);
      expect(chapter3.endTime).toBe(61.349);
    });
  }); // describe('addChaptersTrack')

  // Since we are not in-charge of streaming, calling |retryStreaming| should
  // have no effect.
  it('requesting streaming retry does nothing', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.retryStreaming()).toBeFalsy();
  });

  // Since we are not loading a manifest, we can't return a manifest.
  // |getManifest| should return |null|.
  it('has no manifest to return', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
    expect(player.getManifest()).toBeFalsy();
  });

  describe('addThumbnailsTrack', () => {
    it('appends thumbnails for external thumbnails with sprites',
        async () => {
          await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
          const locationUri = new goog.Uri(location.href);
          const partialUri =
              new goog.Uri('/base/test/test/assets/thumbnails-sprites.vtt');
          const absoluteUri = locationUri.resolve(partialUri);
          const newTrack =
              await player.addThumbnailsTrack(absoluteUri.toString());

          expect(player.getImageTracks()).toEqual([newTrack]);

          const thumbnail1 = await player.getThumbnails(newTrack.id, 0);
          expect(thumbnail1.startTime).toBe(0);
          expect(thumbnail1.duration).toBe(5);
          expect(thumbnail1.height).toBe(90);
          expect(thumbnail1.positionX).toBe(0);
          expect(thumbnail1.positionY).toBe(0);
          expect(thumbnail1.width).toBe(160);
          const thumbnail2 = await player.getThumbnails(newTrack.id, 10);
          expect(thumbnail2.startTime).toBe(5);
          expect(thumbnail2.duration).toBe(25);
          expect(thumbnail2.height).toBe(90);
          expect(thumbnail2.positionX).toBe(160);
          expect(thumbnail2.positionY).toBe(0);
          expect(thumbnail2.width).toBe(160);
          const thumbnail3 = await player.getThumbnails(newTrack.id, 40);
          expect(thumbnail3.startTime).toBe(30);
          expect(thumbnail3.duration).toBe(30);
          expect(thumbnail3.height).toBe(90);
          expect(thumbnail3.positionX).toBe(160);
          expect(thumbnail3.positionY).toBe(90);
          expect(thumbnail3.width).toBe(160);

          const thumbnails = await player.getAllThumbnails(newTrack.id);
          expect(thumbnails.length).toBe(3);
        });

    it('appends thumbnails for external thumbnails without sprites',
        async () => {
          await loadWithSrcEquals(SMALL_MP4_CONTENT_URI, /* startTime= */ null);
          const locationUri = new goog.Uri(location.href);
          const partialUri =
              new goog.Uri('/base/test/test/assets/thumbnails.vtt');
          const absoluteUri = locationUri.resolve(partialUri);
          const newTrack =
              await player.addThumbnailsTrack(absoluteUri.toString());

          expect(player.getImageTracks()).toEqual([newTrack]);

          const thumbnail1 = await player.getThumbnails(newTrack.id, 0);
          expect(thumbnail1.startTime).toBe(0);
          expect(thumbnail1.duration).toBe(5);
          const thumbnail2 = await player.getThumbnails(newTrack.id, 10);
          expect(thumbnail2.startTime).toBe(5);
          expect(thumbnail2.duration).toBe(25);
          const thumbnail3 = await player.getThumbnails(newTrack.id, 40);
          expect(thumbnail3.startTime).toBe(30);
          expect(thumbnail3.duration).toBe(30);

          const thumbnails = await player.getAllThumbnails(newTrack.id);
          expect(thumbnails.length).toBe(3);
        });
  }); // describe('addThumbnailsTrack')

  /**
   * @param {string} contentUri
   * @param {?number} startTime
   * @return {!Promise}
   */
  async function loadWithSrcEquals(contentUri, startTime) {
    /** @type {!shaka.util.EventManager} */
    const eventManager = new shaka.util.EventManager();

    const ready = new Promise((resolve) => {
      eventManager.listenOnce(video, 'loadeddata', resolve);
    });

    await player.attach(video, /* initMediaSource= */ false);
    await player.load(contentUri, startTime);

    // Wait until the media element is ready with content. Waiting until this
    // point ensures it is safe to interact with the media element.
    await ready;

    // The initial seek is triggered about the same time this ready promise
    // resolves.  Wait (with timeout) for movement, so that the initial-seek
    // promise chain has time to resolve before we test our expectations.
    if (startTime != null) {
      const waiter = new shaka.test.Waiter(eventManager);
      if (video.currentTime == 0) {
        // A one-second timeout is too short for Chromecast, but a longer
        // timeout doesn't hurt anyone.  This will always resolve as fast as
        // playback can actually start.
        await waiter.waitForMovementOrFailOnTimeout(video, 5);
      }
    }

    eventManager.release();
  }
});
