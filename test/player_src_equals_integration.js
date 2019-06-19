/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// These tests are for testing Shaka Player's integration with
// |HTMLMediaElement.src=|. These tests are to verify that all |shaka.Player|
// public methods behaviour correctly when playing content video |src=|.
describe('Player Src Equals', () => {
  const Util = shaka.test.Util;
  const waitForMovementOrFailOnTimeout = Util.waitForMovementOrFailOnTimeout;

  const SMALL_MP4_CONTENT_URI = '/base/test/test/assets/small.mp4';

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {shaka.util.EventManager} */
  let eventManager;

  beforeAll(() => {
    video = shaka.util.Dom.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(() => {
    player = new shaka.Player();
    player.addEventListener('error', fail);
    eventManager = new shaka.util.EventManager;
  });

  afterEach(async () => {
    await player.destroy();

    eventManager.release();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  // This test verifies that we can successfully load content that requires us
  // to use |src=|.
  it('loads content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
  });

  // This test verifys that we can successfully unload content that required
  // |src=| to load.
  it('unloads content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    await player.unload(/* initMediaSource= */ false);
  });

  it('can get asset uri after loading', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(player.getAssetUri()).toBe(SMALL_MP4_CONTENT_URI);
  });

  // TODO: test an HLS live stream on platforms supporting native HLS
  it('considers simple mp4 content to be VOD"', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(player.isLive()).toBeFalsy();
    expect(player.isInProgress()).toBeFalsy();
  });

  // TODO: test an audio-only mp4
  // TODO: test audio-only HLS on platforms with native HLS
  it('considers audio-video mp4 content to be audio-video', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(player.isAudioOnly()).toBeFalsy();
  });

  // Since we don't have any manifest data, we must assume that we can seek
  // anywhere in the presentation; end-time will come from the media element.
  it('allows seeking throughout the presentation', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

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
    video.play();
    await waitForMovementOrFailOnTimeout(eventManager, video, /* timeout= */10);

    // Make sure the playhead is roughly where we expect it to be before
    // seeking.
    expect(video.currentTime).toBeGreaterThan(0);
    expect(video.currentTime).toBeLessThan(2.0);

    // Trigger a seek and then wait for the seek to take effect.
    // This seek target is very close to the duration of the video.
    video.currentTime = 10;
    await waitForMovementOrFailOnTimeout(eventManager, video, /* timeout= */10);

    // Make sure the playhead is roughly where we expect it to be after
    // seeking.
    expect(video.currentTime).toBeGreaterThan(9.5);
    expect(video.currentTime).toBeLessThan(10.5);
  });

  // TODO: test src= with DRM
  // TODO: test HLS without DRM on platforms with native HLS
  // TODO: test HLS with DRM on platforms with native HLS
  it('considers simple content to be clear ', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    expect(player.keySystem()).toBe('');
    expect(player.drmInfo()).toBe(null);
    expect(player.getExpiration()).toBe(Infinity);
  });

  // Compared to media source, when loading content with src=, we will have less
  // accurate information. However we can still report what the media element
  // surfaces.
  it('reports buffering information', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    // For playback to begin so that we have some content buffered.
    video.play();
    await waitForMovementOrFailOnTimeout(eventManager, video, /* timeout= */10);

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
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    // Let playback run for a little.
    video.play();
    await waitForMovementOrFailOnTimeout(eventManager, video, /* timeout= */10);

    // Enabling trick play should change our playback rate to the same rate.
    player.trickPlay(2);
    expect(video.playbackRate).toBe(2);

    // Let playback continue playing for a bit longer.
    await shaka.test.Util.delay(2);

    // Cancelling trick play should return our playback rate to normal.
    player.cancelTrickPlay();
    expect(video.playbackRate).toBe(1);
  });

  // TODO: test audio-video mp4 content on platforms with audioTracks API
  it('reports variant tracks for video-only mp4 content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    // On platforms with audioTracks, such as Safari, we get one track here.
    if (video.audioTracks) {
      expect(player.getVariantTracks().length).toBe(1);
    } else {
      expect(player.getVariantTracks().length).toBe(0);
    }
  });

  // TODO: test HLS on platforms with native HLS
  it('allows selecting variant tracks', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

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
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(player.getTextTracks()).toEqual([]);
  });

  // TODO: test HLS on platforms with native HLS
  it('allows selecting text tracks', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    // We can only get a text track here on certain browsers.
    const tracks = player.getTextTracks();

    // If we have tracks, we should be able to select them.
    if (tracks.length) {
      // The test fails if this throws.
      player.selectTextTrack(tracks[0]);
    }
  });

  // TODO: test HLS on platforms with native HLS
  it('returns no languages or roles for simple mp4 content', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    // On platforms with audioTracks, such as Safari, we get one track, with
    // language set to whatever is in the mp4.
    if (video.audioTracks) {
      expect(player.getAudioLanguages()).toEqual(['en']);
      // Note that some browsers, such as Safari, say this is the 'main'
      // role, while others, such as Edge, do not.  For the purposes of this
      // test, it doesn't matter what the role is.
      expect(player.getAudioLanguagesAndRoles()).toEqual(
          [{language: 'en', role: jasmine.any(String)}]);
    } else {
      expect(player.getAudioLanguages()).toEqual([]);
      expect(player.getAudioLanguagesAndRoles()).toEqual([]);
    }

    expect(player.getTextLanguages()).toEqual([]);
    expect(player.getTextLanguagesAndRoles()).toEqual([]);
  });

  // TODO: test language selection w/ HLS on platforms with native HLS
  // This test is disabled until then.
  xit('cannot select language or role', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    const language = 'en';
    const role = 'main';

    player.selectAudioLanguage(language);
    expect(player.getAudioLanguages()).toEqual([]);
    expect(player.getAudioLanguagesAndRoles()).toEqual([]);

    player.selectAudioLanguage(language, role);
    expect(player.getAudioLanguages()).toEqual([]);
    expect(player.getAudioLanguagesAndRoles()).toEqual([]);

    player.selectTextLanguage(language);
    expect(player.getTextLanguages()).toEqual([]);
    expect(player.getTextLanguagesAndRoles()).toEqual([]);

    player.selectTextLanguage(language, role);
    expect(player.getTextLanguages()).toEqual([]);
    expect(player.getTextLanguagesAndRoles()).toEqual([]);
  });

  // TODO: test text visibility w/ HLS on platforms with native HLS
  // This test is disabled until then.
  xit('persists the text visibility setting', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    expect(player.isTextTrackVisible()).toBe(false);

    await player.setTextTrackVisibility(true);
    expect(player.isTextTrackVisible()).toBe(true);

    await player.setTextTrackVisibility(false);
    expect(player.isTextTrackVisible()).toBe(false);
  });

  // Even though we loaded content using |src=| we should still be able to get
  // the playhead position as normal.
  it('can get the playhead position', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(video.readyState).toBeGreaterThan(0);

    expect(video.currentTime).toBeCloseTo(0);

    // Start playback and wait. We should see the playhead move.
    video.play();
    await waitForMovementOrFailOnTimeout(eventManager, video, /* timeout= */10);
    await shaka.test.Util.delay(1.5);

    // When checking if the playhead moved, check for less progress than time we
    // delayed. This will allow for some latency between |play| and playback
    // starting.
    expect(video.currentTime).toBeGreaterThan(1);
  });

  // Even though we are not using all the internals, we should still get some
  // meaningful statistics.
  it('can get stats', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    // Wait some time for playback to start so that we will have a load latency
    // value.
    video.play();
    await waitForMovementOrFailOnTimeout(eventManager, video, /* timeout= */10);

    // Get the stats and check that some stats have been filled in.
    const stats = player.getStats();
    expect(stats).toBeTruthy();
    expect(stats.loadLatency).toBeGreaterThan(0);
  });

  // Because we have no manifest, we can't add text tracks.
  it('cannot add text tracks', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);

    const pendingAdd = player.addTextTrack(
        'test:need-a-uri-for-text',
        'en-US',
        'main',
        'text/mp4');

    try {
      await pendingAdd;
      fail();
    } catch (e) {}
  });

  // Since we are not in-charge of streaming, calling |retryStreaming| should
  // have no effect.
  it('requesting streaming retry does nothing', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(player.retryStreaming()).toBeFalsy();
  });

  // Since we are not loading a manifest, we can't return a manifest.
  // |getManifest| should return |null|.
  it('has no manifest to return', async () => {
    await loadWithSrcEquals(SMALL_MP4_CONTENT_URI);
    expect(player.getManifest()).toBeFalsy();
  });

  /**
   * @param {string} contentUri
   * @return {!Promise}
   */
  async function loadWithSrcEquals(contentUri) {
    const ready = new Promise((resolve) => {
      eventManager.listenOnce(video, 'loadedmetadata', resolve);
    });

    await player.attach(video, /* initMediaSource= */ false);
    await player.load(contentUri);

    // Wait until the media element is ready with content. Waiting until this
    // point ensures it is safe to interact with the media element.
    await ready;
  }
});
