/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @typedef {{start: number, end: number}}
 *
 * @property {number} start
 *   The start time of the range, in seconds.
 * @property {number} end
 *   The end time of the range, in seconds.
 */
let TimeRange;


/**
 * @typedef {{
 *   buffered: !Array.<TimeRange>,
 *   start: number,
 *   waitingAt: number,
 *   expectedEndTime: number,
 *   expectEvent: boolean,
 * }}
 *
 * @description
 * Parameters for a test where we start playing inside a buffered range and play
 * until the end of the buffer.  Then, if we expect it, Playhead should jump
 * to the expected time. We should get a 'stalldetected' event when the Playhead
 * detects a stall through the StallDetector, and a 'gapjumped' event when the
 * Playhead jumps over a gap in the buffered range(s).
 *
 * @property {!Array.<TimeRange>} buffered
 *   The buffered ranges for the test.
 * @property {number} start
 *   The time to start playing at.
 * @property {number} waitingAt
 *   The time to pause at and fire a 'waiting' event.
 * @property {number} expectedEndTime
 *   The expected time at the end of the test.
 * @property {boolean} expectEvent
 *   If true, expect either the 'stalldetected' or 'gapjumped' event to be
 *   fired.
 */
let PlayingTestInfo;


/**
 * @typedef {{
 *   buffered: !Array.<TimeRange>,
 *   newBuffered: (!Array.<TimeRange>|undefined),
 *   start: number,
 *   seekTo: number,
 *   expectedEndTime: number,
 *   expectEvent: boolean,
 * }}
 *
 * @description
 * Parameters for a test where we start playing inside a buffered range and seek
 * to a given time, which may have different buffered ranges.  If we are in a
 * gap, Playhead should jump the gap to the expected time.
 *
 * @property {!Array.<TimeRange>} buffered
 *   The buffered ranges for the test.
 * @property {(!Array.<TimeRange>|undefined)} newBuffered
 *   Used in the unbuffered seek tests.  Represents the buffered ranges to
 *   use after the seek.
 * @property {number} start
 *   The time to start playing at.
 * @property {number} seekTo
 *   The time to seek to.
 * @property {number} expectedEndTime
 *   The expected time at the end of the test.
 * @property {boolean} expectEvent
 *   If true, expect either the 'stalldetected' or 'gapjumped' event to be
 *   fired.
 */
let SeekTestInfo;


describe('Playhead', () => {
  const Util = shaka.test.Util;

  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.test.FakePresentationTimeline} */
  let timeline;
  /** @type {shaka.extern.Manifest} */
  let manifest;
  /** @type {!shaka.media.Playhead} */
  let playhead;
  /** @type {shaka.extern.StreamingConfiguration} */
  let config;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  /** @type {!jasmine.Spy} */
  let onSeek;

  // Callback to us from Playhead when an event should be sent to the app.
  /** @type {!jasmine.Spy} */
  let onEvent;

  beforeAll(() => {
    jasmine.clock().install();
  });

  afterAll(() => {
    jasmine.clock().uninstall();
  });

  beforeEach(() => {
    video = new shaka.test.FakeVideo();
    timeline = new shaka.test.FakePresentationTimeline();

    onSeek = jasmine.createSpy('onSeek');
    onEvent = jasmine.createSpy('onEvent');

    timeline.isLive.and.returnValue(false);
    timeline.getSeekRangeStart.and.returnValue(5);
    timeline.getSeekRangeEnd.and.returnValue(60);
    timeline.getDuration.and.returnValue(60);

    // These tests should not cause these methods to be invoked.
    timeline.getSegmentAvailabilityStart.and.throwError(new Error());
    timeline.getSegmentAvailabilityEnd.and.throwError(new Error());
    timeline.setDuration.and.throwError(new Error());

    manifest = {
      variants: [],
      textStreams: [],
      imageStreams: [],
      presentationTimeline: timeline,
      minBufferTime: 10,
      offlineSessionIds: [],
      sequenceMode: false,
      ignoreManifestTimestampsInSegmentsMode: false,
      type: 'UNKNOWN',
      serviceDescription: null,
    };

    config = shaka.util.PlayerConfiguration.createDefault().streaming;
  });

  afterEach(() => {
    playhead.release();
  });

  function setMockDate(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    const mockDate = new Date(2013, 9, 23, 7, minutes, seconds);
    jasmine.clock().mockDate(mockDate);
  }

  describe('getTime', () => {
    it('returns current time when the video is paused', () => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      video.paused = true;
      timeline.getSeekRangeStart.and.returnValue(10);
      timeline.getSeekRangeEnd.and.returnValue(70);

      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);
    });

    it('returns the correct time when readyState starts at 0', () => {
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', jasmine.any(Function), jasmine.anything());
      expect(video.addEventListener).not.toHaveBeenCalledWith(
          'seeking', jasmine.any(Function), jasmine.anything());

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.on['loadedmetadata']();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', jasmine.any(Function), jasmine.anything());
      video.on['seeking']();

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);

      // getTime() should always clamp the time even if the video element
      // doesn't dispatch 'seeking' events.
      video.currentTime = 120;
      expect(playhead.getTime()).toBe(60);

      video.currentTime = 0;
      expect(playhead.getTime()).toBe(5);
    });

    it('returns the correct time when readyState starts at 1', () => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      video.on['seeking']();
      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });

    it('allows using startTime of 0', () => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 0,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(playhead.getTime()).toBe(0);
    });

    it('bumps startTime back from duration', () => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(false);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getDuration.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 60,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      expect(playhead.getTime()).toBe(59);  // duration - durationBackoff
      expect(video.currentTime).toBe(59);  // duration - durationBackoff
    });

    it('playback from a certain offset from live edge for live', () => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ -15,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(playhead.getTime()).toBe(45);
    });

    it('playback from segment seek range start time', () => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(30);
      timeline.getSeekRangeEnd.and.returnValue(60);
      // If the live stream's playback offset time is not available, start
      // playing from the seek range start time.
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ -40,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      expect(playhead.getTime()).toBe(30);
    });

    it('does not change currentTime if it\'s not 0', () => {
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', jasmine.any(Function), jasmine.anything());

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.currentTime = 8;
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.on['loadedmetadata']();

      // Delay to let Playhead batch up changes to currentTime and observe.
      jasmine.clock().tick(1000);
      expect(video.currentTime).toBe(8);
    });

    // This is important for recovering from drift.
    // See: https://github.com/shaka-project/shaka-player/issues/1105
    // TODO: Re-evaluate after https://github.com/shaka-project/shaka-player/issues/999
    it('does not change once the initial position is set', () => {
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ null,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', jasmine.any(Function), jasmine.anything());

      expect(playhead.getTime()).toBe(60);
      expect(video.currentTime).toBe(0);

      // Simulate time passing and the live edge changing.
      timeline.getSeekRangeStart.and.returnValue(10);
      timeline.getSeekRangeEnd.and.returnValue(70);
      timeline.getSeekRangeEnd.and.returnValue(70);

      expect(playhead.getTime()).toBe(60);
    });
  });  // getTime

  it('clamps playhead after seeking for live', () => {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(true);
    timeline.getDuration.and.returnValue(Infinity);
    timeline.getSeekRangeStart.and.returnValue(5);
    timeline.getSeekRangeEnd.and.returnValue(60);

    playhead = new shaka.media.MediaSourcePlayhead(
        video,
        manifest,
        config,
        /* startTime= */ 5,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

    playhead.ready();

    // This has to periodically increment the mock date to allow the onSeeking_
    // handler to seek, if appropriate.

    // Calling on['seeking']() is like dispatching a 'seeking' event. So, each
    // time we change the video's current time or Playhead changes the video's
    // current time we must call on['seeking'](),

    setMockDate(0);
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // safe = start + rebufferingGoal = 5 + 10 = 15
    // safeSeek = safeSeek + 5 = 15 + 5 = 20

    // Seek in safe region & in buffered region.
    setMockDate(10);
    video.currentTime = 26;
    video.on['seeking']();
    expect(video.currentTime).toBe(26);
    expect(playhead.getTime()).toBe(26);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in safe region & in unbuffered region.
    setMockDate(20);
    video.currentTime = 24;
    video.on['seeking']();
    expect(video.currentTime).toBe(24);
    expect(playhead.getTime()).toBe(24);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start, start is unbuffered.
    setMockDate(30);
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(20);
    expect(playhead.getTime()).toBe(20);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(40);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    video.buffered = createFakeBuffered([{start: 10, end: 40}]);

    // Seek outside safe region & in buffered region.
    setMockDate(50);
    video.currentTime = 11;
    video.on['seeking']();
    expect(video.currentTime).toBe(11);
    expect(playhead.getTime()).toBe(11);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek outside safe region & in unbuffered region.
    setMockDate(60);
    video.currentTime = 9;
    video.on['seeking']();
    expect(video.currentTime).toBe(20);
    expect(playhead.getTime()).toBe(20);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(70);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    setMockDate(80);
    video.currentTime = 120;
    video.on['seeking']();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(90);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start, start is buffered.
    setMockDate(100);
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(10);
    expect(playhead.getTime()).toBe(10);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(110);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek with safe == end
    timeline.getSeekRangeEnd.and.returnValue(12);
    timeline.getSafeSeekRangeStart.and.returnValue(12);

    // Seek before start
    setMockDate(120);
    video.currentTime = 4;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(130);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in window.
    setMockDate(140);
    video.currentTime = 8;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(150);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    setMockDate(160);
    video.currentTime = 13;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(170);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();
  });  // clamps playhead after seeking for live

  it('clamps playhead after seeking for VOD', () => {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(false);
    timeline.getSeekRangeStart.and.returnValue(5);
    timeline.getSafeSeekRangeStart.and.returnValue(5);
    timeline.getSeekRangeEnd.and.returnValue(60);
    timeline.getDuration.and.returnValue(60);

    playhead = new shaka.media.MediaSourcePlayhead(
        video,
        manifest,
        config,
        /* startTime= */ 5,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

    setMockDate(0);
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // Seek past end.
    setMockDate(10);
    video.currentTime = 120;
    video.on['seeking']();
    expect(video.currentTime).toBe(59);  // duration - durationBackoff
    expect(playhead.getTime()).toBe(59);  // duration - durationBackoff
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(20);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start.
    setMockDate(30);
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalled();
    setMockDate(40);
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();
  });  // clamps playhead after seeking for VOD

  it('doesn\'t repeatedly re-seek', () => {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(false);
    timeline.getSeekRangeStart.and.returnValue(5);
    timeline.getSafeSeekRangeStart.and.returnValue(5);
    timeline.getSeekRangeEnd.and.returnValue(60);
    timeline.getDuration.and.returnValue(60);

    playhead = new shaka.media.MediaSourcePlayhead(
        video,
        manifest,
        config,
        /* startTime= */ 5,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

    // First, seek to start time.
    video.currentTime = 0;
    video.on['seeking']();

    // The first time, it should re-seek without issue.
    setMockDate(0);
    video.currentTime = 0;
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalled();

    onSeek.calls.reset();

    // No time passes, so it shouldn't be willing to re-seek.
    video.currentTime = 0;
    video.on['seeking']();
    expect(video.currentTime).toBe(0);
    // The playhead wanted to seek ahead to 5, but was unable to.
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Wait 10 seconds, so it should be willing to re-seek.
    setMockDate(10);
    video.currentTime = 0;
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalled();
  });  // doesn't repeatedly re-seek

  it('handles live manifests with no seek range', () => {
    video.buffered = createFakeBuffered([{start: 1000, end: 1030}]);
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    timeline.isLive.and.returnValue(true);
    timeline.getDuration.and.returnValue(Infinity);
    timeline.getSeekRangeStart.and.returnValue(1000);
    timeline.getSeekRangeEnd.and.returnValue(1000);

    let currentTime = 0;
    let seekCount = 0;
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: (val) => {
        currentTime = val;
        seekCount++;
        setTimeout(video.on['seeking'], 5);
      },
    });

    playhead = new shaka.media.MediaSourcePlayhead(
        video,
        manifest,
        config,
        /* startTime= */ 5,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));
    expect(currentTime).toBe(1000);
    seekCount = 0;

    playhead.ready();

    // The availability window slips ahead.
    timeline.getSeekRangeStart.and.returnValue(1030);
    timeline.getSeekRangeEnd.and.returnValue(1030);
    video.on['waiting']();
    jasmine.clock().tick(500);
    expect(currentTime).toBe(1030);
    expect(seekCount).toBe(1);

    // It should allow a small buffer around the seek range.
    seekCount = 0;
    currentTime = 1030.062441;
    jasmine.clock().tick(500);
    currentTime = 1027.9233;
    jasmine.clock().tick(500);
    expect(seekCount).toBe(0);

    // Got too far away.
    currentTime = 1026;
    jasmine.clock().tick(500);
    expect(currentTime).toBe(1030);
    expect(seekCount).toBe(1);
  });  // handles live manifests with no seek range

  describe('clamps playhead after resuming', () => {
    beforeEach(() => {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = createFakeBuffered([{start: 5, end: 35}]);
    });

    it('(live case)', () => {
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(5);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getSeekRangeStart.and.returnValue(10);
      timeline.getSeekRangeEnd.and.returnValue(70);

      // Because this is buffered, the playhead should move to (start + 5),
      // which will cause a 'seeking' event.
      jasmine.clock().tick(500);
      expect(video.currentTime).toBe(15);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(15);
      expect(onSeek).toHaveBeenCalled();
    });

    it('(VOD case)', () => {
      timeline.isLive.and.returnValue(false);
      timeline.getSeekRangeStart.and.returnValue(5);
      timeline.getSafeSeekRangeStart.and.returnValue(5);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getDuration.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getSeekRangeStart.and.returnValue(10);
      timeline.getSafeSeekRangeStart.and.returnValue(10);
      timeline.getSeekRangeEnd.and.returnValue(70);

      jasmine.clock().tick(500);
      expect(video.currentTime).toBe(10);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(10);
      expect(onSeek).toHaveBeenCalled();
    });
  });  // clamps playhead after resuming

  it('clamps playhead even before seeking completes', () => {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(true);
    timeline.getDuration.and.returnValue(Infinity);
    timeline.getSeekRangeStart.and.returnValue(5);
    timeline.getSeekRangeEnd.and.returnValue(60);

    playhead = new shaka.media.MediaSourcePlayhead(
        video,
        manifest,
        config,
        /* startTime= */ 30,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

    video.currentTime = 0;
    video.seeking = true;

    playhead.ready();

    // "video.seeking" stays true until the buffered range intersects with
    // "video.currentTime".  Playhead should correct anyway.
    video.on['seeking']();

    // Let the Playhead poll the seek range and push us back inside it.
    jasmine.clock().tick(1000);

    // There is some "safety zone" at the front of the range, so we may seek to
    // anything >= the seek range start (5).
    expect(video.currentTime).not.toBeLessThan(5);
    expect(playhead.getTime()).not.toBeLessThan(5);
  });  // clamps playhead even before seeking completes

  // Regression test for:
  //  - https://github.com/shaka-project/shaka-player/pull/2849
  //  - https://github.com/shaka-project/shaka-player/issues/2748
  //  - https://github.com/shaka-project/shaka-player/issues/2848
  it('does not apply seek range before initial seek has completed', () => {
    // These attributes allow the seek range callback to do its thing.
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    video.paused = false;

    // Simulate a smart TV in which seeking is not immediately reflected.
    // In these scenarios, currentTime remains 0 long enough for the seek range
    // polling to kick in.
    const currentTimeSetterSpy = jasmine.createSpy('currentTimeSetter');
    Object.defineProperty(video, 'currentTime', {
      get: () => 0,
      set: Util.spyFunc(currentTimeSetterSpy),
    });

    timeline.isLive.and.returnValue(true);
    timeline.getDuration.and.returnValue(Infinity);
    timeline.getSeekRangeStart.and.returnValue(5);
    timeline.getSeekRangeEnd.and.returnValue(60);

    playhead = new shaka.media.MediaSourcePlayhead(
        video,
        manifest,
        config,
        /* startTime= */ 30,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

    playhead.ready();

    /**
     * Prevent retries on the initial start time seek.  This will ensure that
     * only one call is made for the initial seek, and that any additional calls
     * can be rightly attributed to the application of the seek range.
     * @suppress {accessControls}
     */
    function stopRetries() {
      const mediaSourcePlayhead =
      /** @type {shaka.media.MediaSourcePlayhead} */(playhead);
      mediaSourcePlayhead.videoWrapper_.mover_.timer_.stop();
      mediaSourcePlayhead.videoWrapper_.mover_.maxAttempts_ = 1;
      mediaSourcePlayhead.videoWrapper_.mover_.remainingAttempts_ = 1;
    }
    stopRetries();

    // Let the Playhead poll the seek range.  It should NOT push us back inside
    // it, since the start time should be used instead of the current time.
    jasmine.clock().tick(1000);
    // The one and only call was for the initial seek to the start time.
    expect(currentTimeSetterSpy).toHaveBeenCalledTimes(1);
  });  // does not apply seek range before initial seek has completed

  describe('gap jumping', () => {
    beforeEach(() => {
      timeline.isLive.and.returnValue(false);
      timeline.getSafeSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getDuration.and.returnValue(60);
    });

    describe('when playing', () => {
      describe('with small gaps', () => {
        playingTest('won\'t jump at end of single region', {
          buffered: [{start: 0, end: 10}],
          start: 3,
          waitingAt: 10,
          expectEvent: false,
          expectedEndTime: 10,
        });

        playingTest('won\'t jump at end of multiple regions', {
          buffered: [{start: 0, end: 10}, {start: 20, end: 30}],
          start: 24,
          waitingAt: 30,
          expectEvent: false,
          expectedEndTime: 30,
        });

        playingTest('will jump small gap', {
          buffered: [{start: 0, end: 10}, {start: 11, end: 20}],
          start: 5,
          waitingAt: 10,
          expectEvent: true,
          expectedEndTime: 11,
        });

        playingTest('won\'t skip a buffered range', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 5,
          waitingAt: 10,
          expectEvent: true,
          expectedEndTime: 11,
        });

        playingTest('will jump gap into last buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 15,
          waitingAt: 20,
          expectEvent: true,
          expectedEndTime: 21,
        });
      });  // with small gaps

      describe('with large gaps', () => {
        playingTest('will jump large gaps if set', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          expectEvent: true,
          expectedEndTime: 30,
        });

        playingTest('will only jump one buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 30, end: 40}, {start: 50, end: 60}],
          start: 5,
          waitingAt: 10,
          expectEvent: true,
          expectedEndTime: 30,
        });

        playingTest('will jump into last buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 20, end: 30}, {start: 50, end: 60}],
          start: 24,
          waitingAt: 30,
          expectEvent: true,
          expectedEndTime: 50,
        });
      });  // with large gaps

      /**
       * @param {string} name
       * @param {PlayingTestInfo} data
       */
      function playingTest(name, data) {
        it(name, () => {
          video.buffered = createFakeBuffered(data.buffered);
          video.currentTime = data.start;
          video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;

          onEvent.and.callFake((event) => {});

          playhead = new shaka.media.MediaSourcePlayhead(
              video,
              manifest,
              config,
              /* startTime= */ data.start,
              Util.spyFunc(onSeek),
              Util.spyFunc(onEvent));

          playhead.ready();

          jasmine.clock().tick(500);
          for (let time = data.start; time < data.waitingAt; time++) {
            // We don't want to run tick() for 1 second because it will trigger
            // the stall-detection, which will move the playhead; on the other
            // hand, we don't want to be 0.5 seconds from the gap because on
            // Edge/Tizen, gap jumping will treat that as in the gap.
            // See shaka.media.TimeRangesUtils.getGapIndex.

            video.currentTime = time;
            jasmine.clock().tick(400);
            // Make sure Playhead didn't adjust the time yet.
            expect(video.currentTime).toBe(time);

            video.currentTime = time + 0.4;
            jasmine.clock().tick(600);
            // Make sure Playhead didn't adjust the time yet.
            expect(video.currentTime).toBe(time + 0.4);
          }

          expect(onEvent).not.toHaveBeenCalled();

          video.currentTime = data.waitingAt;
          video.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
          video.on['waiting']();
          jasmine.clock().tick(500);

          expect(onEvent).toHaveBeenCalledTimes(data.expectEvent ? 1 : 0);
          expect(video.currentTime).toBe(data.expectedEndTime);
        });
      }
    });  // when playing

    describe('with buffered seeks', () => {
      describe('with small gaps', () => {
        seekTest('won\'t seek when past the end', {
          buffered: [{start: 0, end: 10}],
          start: 4,
          seekTo: 14,
          expectEvent: false,
          expectedEndTime: 14,
        });

        seekTest('will jump when seeking into gap', {
          buffered: [{start: 0, end: 10}, {start: 11, end: 20}],
          start: 3,
          seekTo: 10.4,
          expectEvent: true,
          expectedEndTime: 11,
        });

        seekTest('won\'t jump multiple buffers', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 3,
          seekTo: 10.4,
          expectEvent: true,
          expectedEndTime: 11,
        });

        seekTest('will jump into last range with seeking', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 3,
          seekTo: 20.5,
          expectEvent: true,
          expectedEndTime: 21,
        });

        seekTest('treats large gaps as small if playhead near end', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 3,
          seekTo: 29.2,
          expectEvent: true,
          expectedEndTime: 30,
        });
      });  // with small gaps

      describe('with large gaps', () => {
        seekTest('will jump large gaps', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          expectEvent: true,
          expectedEndTime: 30,
        });
      });  // with large gaps
    });  // with buffered seeks

    describe('with unbuffered seeks', () => {
      describe('with small gaps', () => {
        seekTest('won\'t jump when seeking into buffered range', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 22,
          expectEvent: false,
          expectedEndTime: 22,
        });

        // Seeking to the beginning is considered an unbuffered seek even if
        // there is a gap.
        seekTest('will jump a small gap at the beginning', {
          buffered: [{start: 0.2, end: 10}],
          newBuffered: [{start: 0.2, end: 10}],
          start: 4,
          seekTo: 0,
          expectEvent: true,
          expectedEndTime: 0.2,
        });

        seekTest('will jump when seeking into gap', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 30.2,
          expectEvent: true,
          expectedEndTime: 31,
        });

        seekTest('will jump when seeking to the end of a range', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 30,
          expectEvent: true,
          expectedEndTime: 31,
        });

        seekTest('won\'t jump when past end', {
          // [0-10], [20-30]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}],
          start: 3,
          seekTo: 34,
          expectEvent: false,
          expectedEndTime: 34,
        });

        seekTest('won\'t jump when seeking backwards into buffered range', {
          // [0-10], [20-30]
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 0, end: 10}],
          start: 24,
          seekTo: 4,
          expectEvent: false,
          expectedEndTime: 4,
        });

        seekTest('will wait to jump when seeking backwards', {
          // [20-30]
          buffered: [{start: 20, end: 30}],
          // The lack of newBuffered means we won't append any segments, so we
          // should still be waiting.
          start: 24,
          seekTo: 4,
          expectEvent: false,
          expectedEndTime: 4,
        });

        seekTest('will jump when seeking backwards into gap', {
          // [2-10], [20-30]
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 2, end: 10}],
          start: 24,
          seekTo: 1.6,
          expectEvent: true,
          expectedEndTime: 2,
        });
      });  // with small gaps

      describe('with large gaps', () => {
        seekTest('will jump large gap at beginning', {
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 20, end: 30}],
          start: 25,
          seekTo: 0,
          expectEvent: true,
          expectedEndTime: 20,
        });

        seekTest('will jump large gaps', {
          // [0-10], [20-30], [40-50]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 40, end: 50}],
          start: 3,
          seekTo: 32,
          expectEvent: true,
          expectedEndTime: 40,
        });
      });  // with large gaps
    });  // with unbuffered seeks

    it('doesn\'t gap jump if the seeking event is late', () => {
      const buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.currentTime = 12;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 12,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      jasmine.clock().tick(500);
      expect(onEvent).not.toHaveBeenCalled();

      // Append a segment before seeking.
      playhead.notifyOfBufferingChange();

      // Seek backwards but wait briefly to fire the seeking event.
      video.currentTime = 3;
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.seeking = true;
      jasmine.clock().tick(500);
      video.on['seeking']();

      // There should NOT have been a gap jump.
      expect(video.currentTime).toBe(3);
    });

    it('works with rounding errors when seeking', () => {
      // If the browser sets the time to slightly before where we seek to, we
      // shouldn't get stuck in an infinite loop trying to jump the tiny gap.
      // https://github.com/shaka-project/shaka-player/issues/1309
      const buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      // Track the number of times we seeked.
      let seekCount = 0;
      let currentTime = 0;
      Object.defineProperty(video, 'currentTime', {
        get: () => currentTime - 0.00001,
        set: (time) => {
          seekCount++;
          currentTime = time;
          setTimeout(() => {
            video.on['seeking']();
            playhead.notifyOfBufferingChange();
          }, 5);
        },
      });

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 0,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      playhead.notifyOfBufferingChange();
      jasmine.clock().tick(500);

      expect(seekCount).toBe(1);
      expect(currentTime).toBe(10);
    });

    it('doesn\'t gap jump if paused', () => {
      const buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.currentTime = 5;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
      video.paused = true;

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      playhead.notifyOfBufferingChange();
      jasmine.clock().tick(500);

      // There should NOT have been a gap jump.
      expect(video.currentTime).toBe(5);
    });

    // Regression test for https://github.com/shaka-project/shaka-player/issues/2987
    it('does gap jump if paused at 0 and has autoplay', () => {
      const buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.currentTime = 0;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
      video.paused = true;
      video.autoplay = true;

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 0,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      playhead.notifyOfBufferingChange();
      jasmine.clock().tick(500);

      // There SHOULD have been a gap jump.
      expect(video.currentTime).toBe(10);
    });

    // Regression test for https://github.com/shaka-project/shaka-player/issues/3451
    it('doesn\'t gap jump if paused at 0 and hasn\'t autoplay', () => {
      const buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.currentTime = 0;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
      video.paused = true;
      video.autoplay = false;

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 0,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.ready();

      playhead.notifyOfBufferingChange();
      jasmine.clock().tick(500);

      // There should NOT have been a gap jump.
      expect(video.currentTime).toBe(0);
    });

    /**
     * @param {string} name
     * @param {SeekTestInfo} data
     */
    function seekTest(name, data) {
      it(name, () => {
        video.buffered = createFakeBuffered(data.buffered);
        video.currentTime = data.start;
        video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;

        onEvent.and.callFake((event) => {});

        playhead = new shaka.media.MediaSourcePlayhead(
            video,
            manifest,
            config,
            /* startTime= */ data.start,
            Util.spyFunc(onSeek),
            Util.spyFunc(onEvent));

        playhead.ready();

        jasmine.clock().tick(500);
        expect(onEvent).not.toHaveBeenCalled();

        // Seek to the given position and update ready state.
        video.currentTime = data.seekTo;
        video.readyState = calculateReadyState(data.buffered, data.seekTo);
        video.seeking = true;
        video.on['seeking']();
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
          video.on['waiting']();
        } else {
          video.seeking = false;
        }
        jasmine.clock().tick(500);

        if (data.newBuffered) {
          // If we have a new buffer, first clear the buffer.
          video.buffered = createFakeBuffered([]);
          video.readyState = HTMLMediaElement.HAVE_METADATA;
          jasmine.clock().tick(250);

          // Now StreamingEngine will buffer the new content and tell playhead
          // about it.
          expect(video.currentTime).toBe(data.seekTo);
          video.buffered = createFakeBuffered(data.newBuffered);
          video.readyState = calculateReadyState(data.newBuffered, data.seekTo);
          if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            video.seeking = false;
          }
          playhead.notifyOfBufferingChange();
          jasmine.clock().tick(250);
        }

        expect(onEvent).toHaveBeenCalledTimes(data.expectEvent ? 1 : 0);
        expect(video.currentTime).toBe(data.expectedEndTime);
      });
    }

    /**
     * @param {!Array.<{start: number, end: number}>} buffers
     * @param {number} time
     * @return {number}
     */
    function calculateReadyState(buffers, time) {
      // See: https://bit.ly/2JYh8WX
      for (const buffer of buffers) {
        if (time >= buffer.start) {
          if (time == buffer.end) {
            // The video has the current frame, but no data in the future.
            return HTMLMediaElement.HAVE_CURRENT_DATA;
          } else if (time < buffer.end) {
            // The video has enough data to play forward.
            return HTMLMediaElement.HAVE_ENOUGH_DATA;
          }
        }
      }
      // The video doesn't have any video data.
      return HTMLMediaElement.HAVE_METADATA;
    }
  });  // gap jumping
});
