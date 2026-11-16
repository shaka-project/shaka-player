/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mixed variant types', () => {
  const Util = shaka.test.Util;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

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

  /**
   * For each held content type, the number of media segments of that type
   * let through before holding the rest.
   * @type {!Map<string, number>}
   */
  let held;
  /** @type {!Map<string, number>} */
  let segmentCounts;
  /** @type {!Map<string, !Array<function()>>} */
  let releaseHeld;

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

    player.configure({
      abr: {enabled: false},
      streaming: {
        // Disable stall detection, which can interfere with playback tests.
        stallEnabled: false,
        bufferingGoal: 12,
        mixedVariantTypes:
            compiledShaka.config.MixedVariantTypes.MANUAL_SELECTION,
      },
    });

    held = new Map();
    segmentCounts = new Map();
    releaseHeld = new Map();
    player.getNetworkingEngine().registerResponseFilter(
        async (type, response, context) => {
          if (type != compiledShaka.net.NetworkingEngine.RequestType.SEGMENT ||
              !context || !context.stream || !context.segment) {
            return;
          }
          const contentType = context.stream.type;
          const count = segmentCounts.get(contentType) || 0;
          segmentCounts.set(contentType, count + 1);
          while (held.has(contentType) && count >= held.get(contentType)) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
              releaseHeld.getOrInsert(contentType, []).push(resolve);
            });
          }
        });

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    releaseAll();
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  it('switches between muxed TS and audio-only variants', async () => {
    // The audio moves from the muxed SourceBuffer to its own one, which
    // always requires a MediaSource reset.
    await testSwitches(
        '/base/test/test/assets/hls-audio-only-variant/muxed.m3u8',
        ContentType.VIDEO, /* alwaysReset= */ true);
  });

  it('switches between separate fMP4 and audio-only variants', async () => {
    await testSwitches(
        '/base/test/test/assets/hls-audio-only-variant/separate.m3u8',
        ContentType.VIDEO, /* alwaysReset= */ false);
  });

  it('switches between separate fMP4 and video-only variants', async () => {
    await testSwitches(
        '/base/test/test/assets/hls-audio-only-variant/video-only.m3u8',
        ContentType.AUDIO, /* alwaysReset= */ false);
  });

  it('keeps video-only variants for manual selection', async () => {
    await player.load(
        '/base/test/test/assets/hls-audio-only-variant/video-only.m3u8');
    const tracks = player.getVariantTracks();
    expect(tracks.length).toBe(2);
    expect(tracks.find((t) => t.active).audioId).not.toBe(null);
  });

  it('filters out audio-only variants if not allowed', async () => {
    player.configure('streaming.mixedVariantTypes',
        compiledShaka.config.MixedVariantTypes.AV_ONLY);
    await player.load(
        '/base/test/test/assets/hls-audio-only-variant/muxed.m3u8');
    const tracks = player.getVariantTracks();
    expect(tracks.length).toBe(2);
    expect(tracks.every((t) => t.videoId != null)).toBe(true);
  });

  describe('video-only variants', () => {
    const VIDEO_ONLY_URI =
        '/base/test/test/assets/hls-audio-only-variant/video-only.m3u8';

    it('are filtered out for audio-video variants only', async () => {
      player.configure('streaming.mixedVariantTypes',
          compiledShaka.config.MixedVariantTypes.AV_ONLY);
      await player.load(VIDEO_ONLY_URI);
      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].audioId).not.toBe(null);
    });

    it('are never chosen by adaptation', async () => {
      player.configure('streaming.mixedVariantTypes',
          compiledShaka.config.MixedVariantTypes.ALL);
      // Even if the bandwidth can't sustain the audio-video variant, which
      // needs more than the video-only one.
      player.configure({
        abr: {
          enabled: true,
          switchInterval: 1,
          defaultBandwidthEstimate: 1e4,
        },
      });
      await player.load(VIDEO_ONLY_URI);
      const videoOnly = getVideoOnlyTrack();
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 6, 20);

      const tracks = player.getVariantTracks();
      expect(tracks.find((t) => t.active).id).not.toBe(videoOnly.id);
      expect(player.getStats().switchHistory.some(
          (entry) => entry.id == videoOnly.id)).toBe(false);
      expect(player.isPlayingVideoOnly()).toBe(false);
      expect(getBuffered(ContentType.AUDIO).length).toBeGreaterThan(0);
    });

    it('report playing only the video', async () => {
      await player.load(VIDEO_ONLY_URI);
      const audioVideo = player.getVariantTracks().find((t) => t.active);
      goog.asserts.assert(audioVideo, 'Must have an active variant');
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);
      expect(player.isPlayingVideoOnly()).toBe(false);

      player.selectVariantTrack(getVideoOnlyTrack());
      await waitFor(() => !getBuffered(ContentType.AUDIO).length, 20,
          'the audio to be removed');
      expect(player.isPlayingVideoOnly()).toBe(true);
      expect(player.isPlayingAudioOnly()).toBe(false);
      // The content still has audio.
      expect(player.isVideoOnly()).toBe(false);
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(
          video, video.currentTime + 1, 10);

      player.selectVariantTrack(audioVideo);
      await waitFor(() => getBuffered(ContentType.AUDIO).length > 0, 20,
          'the audio to be buffered again');
      expect(player.isPlayingVideoOnly()).toBe(false);
    });

    it('are left when adaptation is enabled again', async () => {
      player.configure('abr.switchInterval', 1);
      await player.load(VIDEO_ONLY_URI);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      const videoOnly = getVideoOnlyTrack();
      player.selectVariantTrack(videoOnly);
      await waitFor(() => !getBuffered(ContentType.AUDIO).length, 20,
          'the audio to be removed');

      const timeBefore = video.currentTime;
      player.configure('abr.enabled', true);
      await waitFor(() => getBuffered(ContentType.AUDIO).length > 0, 20,
          'the audio to be buffered again');
      expect(player.getVariantTracks().find((t) => t.active).id)
          .not.toBe(videoOnly.id);
      expect(player.isPlayingVideoOnly()).toBe(false);
      await expectResumedAfterReset(timeBefore);
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(
          video, video.currentTime + 1, 10);
    });

    /** @return {shaka.extern.Track} */
    function getVideoOnlyTrack() {
      const track =
          player.getVariantTracks().find((t) => t.audioId == null);
      goog.asserts.assert(track, 'Must have a video-only variant');
      return track;
    }
  });

  /**
   * Switches to the variant without |removedType| and back.
   *
   * Where SourceBuffers can be removed, nothing is appended from the removal
   * until the playhead has moved on, so that the remaining SourceBuffer is
   * proven to play on its own.  Appending wakes up some platforms that stall
   * otherwise (e.g. WebKit), which would hide the problem.
   *
   * @param {string} uri
   * @param {string} removedType
   * @param {boolean} alwaysReset
   */
  async function testSwitches(uri, removedType, alwaysReset) {
    const keptType = removedType == ContentType.VIDEO ?
        ContentType.AUDIO : ContentType.VIDEO;
    const removes = !alwaysReset &&
        shaka.device.DeviceFactory.getDevice().supportsSourceBufferRemoval();

    // Buffer a single segment of the type to remove, so that the other one
    // is buffered much further when it is removed.
    if (!alwaysReset) {
      held.set(removedType, 1);
    }
    await player.load(uri);
    const tracks = player.getVariantTracks();
    const without = tracks.find((t) => removedType == ContentType.VIDEO ?
        t.videoId == null : t.audioId == null);
    const audioVideo = tracks.find((t) => t.active);
    goog.asserts.assert(without, 'Must have a variant without ' + removedType);
    goog.asserts.assert(audioVideo, 'Must have an active variant');
    // Adaptation starts with an audio-video variant.
    expect(audioVideo.id).not.toBe(without.id);

    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, 10);
    if (!alwaysReset) {
      // Playback stops at the end of the held type, and the other one is
      // buffered as far ahead of it as StreamingEngine lets it.
      await waitFor(() => bufferedEnd(keptType) >= bufferedEnd(removedType) + 7,
          20, 'the ' + keptType + ' to be buffered further');
    }

    const src = video.currentSrc;
    const timeAtRemoval = video.currentTime;
    if (removes) {
      held.set(keptType, segmentCounts.get(keptType) || 0);
    }
    // Let the segment being fetched through, as the network would.  It is
    // appended before the removal.
    release(removedType);
    player.selectVariantTrack(without);
    await waitFor(() => !getBuffered(removedType).length, 20,
        'the ' + removedType + ' to be removed');
    expect(player.getVariantTracks().find((t) => t.active).id)
        .toBe(without.id);
    if (removes) {
      // Removed from the same MediaSource, not by resetting it.
      expect(video.currentSrc).toBe(src);
      await waitFor(() => isBuffered(video.currentTime), 2,
          'the playhead to be buffered after the removal');
    } else {
      expect(video.currentSrc).not.toBe(src);
      await expectResumedAfterReset(timeAtRemoval);
    }
    const appendedBefore = countSegments();
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(
        video, video.currentTime + 2, 10);
    if (removes) {
      // Played without any help from new appends.
      expect(countSegments()).toBe(appendedBefore);
    }
    releaseAll();

    // MediaSource is reset to add the stream back.
    const srcWithout = video.currentSrc;
    const timeAtReset = video.currentTime;
    player.selectVariantTrack(audioVideo);
    await waitFor(() => getBuffered(removedType).length > 0, 20,
        'the ' + removedType + ' to be buffered again');
    expect(video.currentSrc).not.toBe(srcWithout);
    await expectResumedAfterReset(timeAtReset);
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(
        video, video.currentTime + 1, 10);
    expect(player.getVariantTracks().find((t) => t.active).id)
        .toBe(audioVideo.id);
  }

  /**
   * Checks that playback goes on from where it was before a MediaSource
   * reset, instead of from the start.
   *
   * @param {number} time The playhead position before the reset.
   */
  async function expectResumedAfterReset(time) {
    await waitFor(
        () => video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
            !video.seeking, 10,
        'the element to be ready to play after the reset');
    expect(video.currentTime).toBeGreaterThan(time - 0.5);
    expect(video.duration).toBe(player.seekRange().end);
  }

  /** @param {string} type */
  function release(type) {
    held.delete(type);
    for (const resolve of releaseHeld.get(type) || []) {
      resolve();
    }
    releaseHeld.delete(type);
  }

  function releaseAll() {
    for (const type of Array.from(releaseHeld.keys())) {
      release(type);
    }
    held.clear();
  }

  /** @return {number} */
  function countSegments() {
    let count = 0;
    for (const value of segmentCounts.values()) {
      count += value;
    }
    for (const waiting of releaseHeld.values()) {
      count -= waiting.length;
    }
    return count;
  }

  /**
   * @param {string} type
   * @return {!Array<shaka.extern.BufferedRange>}
   */
  function getBuffered(type) {
    const info = player.getBufferedInfo();
    return type == ContentType.AUDIO ? info.audio : info.video;
  }

  /**
   * @param {string} type
   * @return {number}
   */
  function bufferedEnd(type) {
    const ranges = getBuffered(type);
    return ranges.length ? ranges[ranges.length - 1].end : 0;
  }

  /**
   * @param {number} time
   * @return {boolean}
   */
  function isBuffered(time) {
    const ranges = video.buffered;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= time && time < ranges.end(i)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {function():boolean} condition
   * @param {number} timeout In seconds.
   * @param {string} what
   * @return {!Promise}
   */
  async function waitFor(condition, timeout, what) {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeout * 1000) {
        fail('Timed out waiting for ' + what + ' at ' + video.currentTime +
            ' (readyState ' + video.readyState + ', buffered ' +
            JSON.stringify(player.getBufferedInfo()) + ')');
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await Util.delay(0.1);
    }
  }
});
