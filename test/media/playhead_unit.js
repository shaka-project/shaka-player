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
 *   jumpLargeGaps: (boolean|undefined),
 *   preventDefault: (boolean|undefined)
 * }}
 *
 * @description
 * Parameters for a test where we start playing inside a buffered range and play
 * until the end of the buffer.  Then, if we expect it, Playhead should jump
 * to the expected time.  Also, if the gap is large, we should get a 'largegap'
 * event from the Playhead, which we may optionally suppress.
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
 *   If true, expect the 'largegap' event to be fired.
 * @property {(boolean|undefined)} jumpLargeGaps
 *   If given, set this field of the Playhead configuration.
 * @property {(boolean|undefined)} preventDefault
 *   If true, call preventDefault() on the 'largegap' event.
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
 *   jumpLargeGaps: (boolean|undefined)
 * }}
 *
 * @description
 * Parameters for a test where we start playing inside a buffered range and seek
 * to a given time, which may have different buffered ranges.  If we are in a
 * gap, Playhead should jump the gap to the expected time.  Also, if the gap is
 * large, we should get a 'largegap' event from the Playhead, which we may
 * optionally suppress.
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
 *   If true, expect the 'largegap' event to be fired.
 * @property {(boolean|undefined)} jumpLargeGaps
 *   If given, set this field of the Playhead configuration.
 */
let SeekTestInfo;


describe('Playhead', function() {
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

  beforeAll(function() {
    jasmine.clock().install();
  });

  afterAll(function() {
    jasmine.clock().uninstall();
  });

  beforeEach(function() {
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
      periods: [],
      presentationTimeline: timeline,
      minBufferTime: 10,
      offlineSessionIds: [],
    };

    config = shaka.util.PlayerConfiguration.createDefault().streaming;
  });

  afterEach(() => {
    playhead.release();
  });

  function setMockDate(seconds) {
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let mockDate = new Date(2013, 9, 23, 7, minutes, seconds);
    jasmine.clock().mockDate(mockDate);
  }

  describe('getTime', function() {
    it('returns current time when the video is paused', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      video.paused = true;
      timeline.getSeekRangeStart.and.returnValue(10);
      timeline.getSeekRangeEnd.and.returnValue(70);

      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);
    });

    it('returns the correct time when readyState starts at 0', function() {
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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

    it('returns the correct time when readyState starts at 1', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      video.on['seeking']();
      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });

    it('allows using startTime of 0', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video, manifest, config, 0 /* startTime */, Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(playhead.getTime()).toBe(0);
    });

    it('bumps startTime back from duration', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(false);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getDuration.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video, manifest, config, 60 /* startTime */, Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(playhead.getTime()).toBe(59);  // duration - durationBackoff
      expect(video.currentTime).toBe(59);  // duration - durationBackoff
    });

    it('playback from a certain offset from live edge for live', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video, manifest, config, -15 /* startTime */, Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(playhead.getTime()).toBe(45);
    });

    it('playback from segment seek range start time', function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(30);
      timeline.getSeekRangeEnd.and.returnValue(60);
      // If the live stream's playback offset time is not available, start
      // playing from the seek range start time.
      playhead = new shaka.media.MediaSourcePlayhead(
          video, manifest, config, -40 /* startTime */, Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      expect(playhead.getTime()).toBe(30);
    });

    it('does not change currentTime if it\'s not 0', function() {
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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
    // See: https://github.com/google/shaka-player/issues/1105
    // TODO: Re-evaluate after https://github.com/google/shaka-player/issues/999
    it('does not change once the initial position is set', function() {
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          null /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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

  it('clamps playhead after seeking for live', function() {
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
        5 /* startTime */,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

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

  it('clamps playhead after seeking for VOD', function() {
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
        5 /* startTime */,
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

  it('doesn\'t repeatedly re-seek', function() {
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
        5 /* startTime */,
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

  it('handles live manifests with no seek range', function() {
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
        5 /* startTime */,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));
    expect(currentTime).toBe(1000);
    seekCount = 0;

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

  describe('clamps playhead after resuming', function() {
    beforeEach(function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = createFakeBuffered([{start: 5, end: 35}]);
    });

    it('(live case)', function() {
      timeline.isLive.and.returnValue(true);
      timeline.getDuration.and.returnValue(Infinity);
      timeline.getSeekRangeStart.and.returnValue(5);
      timeline.getSeekRangeEnd.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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

    it('(VOD case)', function() {
      timeline.isLive.and.returnValue(false);
      timeline.getSeekRangeStart.and.returnValue(5);
      timeline.getSafeSeekRangeStart.and.returnValue(5);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getDuration.and.returnValue(60);

      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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

  it('clamps playhead even before seeking completes', function() {
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
        30 /* startTime, middle of the seek range */,
        Util.spyFunc(onSeek),
        Util.spyFunc(onEvent));

    video.currentTime = 0;
    video.seeking = true;
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
  //  - https://github.com/google/shaka-player/pull/2849
  //  - https://github.com/google/shaka-player/issues/2748
  //  - https://github.com/google/shaka-player/issues/2848
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

  describe('gap jumping', function() {
    beforeEach(function() {
      timeline.isLive.and.returnValue(false);
      timeline.getSafeSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeStart.and.returnValue(0);
      timeline.getSeekRangeEnd.and.returnValue(60);
      timeline.getDuration.and.returnValue(60);

      config.smallGapLimit = 1;
    });

    describe('when playing', function() {
      describe('with small gaps', function() {
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
          expectEvent: false,
          expectedEndTime: 11,
        });

        playingTest('won\'t skip a buffered range', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 5,
          waitingAt: 10,
          expectEvent: false,
          expectedEndTime: 11,
        });

        playingTest('will jump gap into last buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 15,
          waitingAt: 20,
          expectEvent: false,
          expectedEndTime: 21,
        });
      });  // with small gaps

      describe('with large gaps', function() {
        playingTest('will fire an event', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          expectEvent: true,
          expectedEndTime: 10,
        });

        playingTest('will jump large gaps if set', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          jumpLargeGaps: true,
          expectEvent: true,
          expectedEndTime: 30,
        });

        playingTest('will only jump one buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 30, end: 40}, {start: 50, end: 60}],
          start: 5,
          waitingAt: 10,
          jumpLargeGaps: true,
          expectEvent: true,
          expectedEndTime: 30,
        });

        playingTest('will jump into last buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 20, end: 30}, {start: 50, end: 60}],
          start: 24,
          waitingAt: 30,
          jumpLargeGaps: true,
          expectEvent: true,
          expectedEndTime: 50,
        });

        playingTest('won\'t jump gaps when preventDefault() is called', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          jumpLargeGaps: true,
          preventDefault: true,
          expectEvent: true,
          expectedEndTime: 10,
        });
      });  // with large gaps

      /**
       * @param {string} name
       * @param {PlayingTestInfo} data
       */
      function playingTest(name, data) {
        it(name, function() {
          video.buffered = createFakeBuffered(data.buffered);
          video.currentTime = data.start;
          video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;

          onEvent.and.callFake(function(event) {
            if (data.preventDefault) {
              event.preventDefault();
            }
          });

          config.jumpLargeGaps = !!data.jumpLargeGaps;
          playhead = new shaka.media.MediaSourcePlayhead(
              video,
              manifest,
              config,
              data.start /* startTime */,
              Util.spyFunc(onSeek),
              Util.spyFunc(onEvent));

          jasmine.clock().tick(500);
          for (let time = data.start; time < data.waitingAt; time++) {
            // We don't want to run tick() for 1 second because it will trigger
            // the stall-detection, which will move the playhead; on the other
            // hand, we don't want to be 0.5 seconds from the gap because on
            // IE/Edge/Tizen, gap jumping will treat that as in the gap.
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

    describe('with buffered seeks', function() {
      describe('with small gaps', function() {
        seekTest('won\'t seek when past the end', {
          buffered: [{start: 0, end: 10}],
          start: 4,
          seekTo: 14,
          expectedEndTime: 14,
          expectEvent: false,
        });

        seekTest('will jump when seeking into gap', {
          buffered: [{start: 0, end: 10}, {start: 11, end: 20}],
          start: 3,
          seekTo: 10.4,
          expectedEndTime: 11,
          expectEvent: false,
        });

        seekTest('won\'t jump multiple buffers', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 3,
          seekTo: 10.4,
          expectedEndTime: 11,
          expectEvent: false,
        });

        seekTest('will jump into last range with seeking', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 3,
          seekTo: 20.5,
          expectedEndTime: 21,
          expectEvent: false,
        });

        seekTest('treats large gaps as small if playhead near end', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 3,
          seekTo: 29.2,
          expectedEndTime: 30,
          expectEvent: false,
        });
      });  // with small gaps

      describe('with large gaps', function() {
        seekTest('will raise event', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          expectedEndTime: 12,
          expectEvent: true,
        });

        seekTest('will jump large gaps', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          jumpLargeGaps: true,
          expectedEndTime: 30,
          expectEvent: true,
        });

        seekTest('won\'t jump if preventDefault() is called', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          jumpLargeGaps: true,
          preventDefault: true,
          expectedEndTime: 12,
          expectEvent: true,
        });
      });  // with large gaps
    });  // with buffered seeks

    describe('with unbuffered seeks', function() {
      describe('with small gaps', function() {
        seekTest('won\'t jump when seeking into buffered range', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 22,
          expectedEndTime: 22,
          expectEvent: false,
        });

        // Seeking to the beginning is considered an unbuffered seek even if
        // there is a gap.
        seekTest('will jump a small gap at the beginning', {
          buffered: [{start: 0.2, end: 10}],
          newBuffered: [{start: 0.2, end: 10}],
          start: 4,
          seekTo: 0,
          expectedEndTime: 0.2,
          expectEvent: false,
        });

        seekTest('will jump when seeking into gap', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 30.2,
          expectedEndTime: 31,
          expectEvent: false,
        });

        seekTest('will jump when seeking to the end of a range', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 30,
          expectedEndTime: 31,
          expectEvent: false,
        });

        seekTest('won\'t jump when past end', {
          // [0-10], [20-30]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}],
          start: 3,
          seekTo: 34,
          expectedEndTime: 34,
          expectEvent: false,
        });

        seekTest('won\'t jump when seeking backwards into buffered range', {
          // [0-10], [20-30]
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 0, end: 10}],
          start: 24,
          seekTo: 4,
          expectedEndTime: 4,
          expectEvent: false,
        });

        seekTest('will wait to jump when seeking backwards', {
          // [20-30]
          buffered: [{start: 20, end: 30}],
          // The lack of newBuffered means we won't append any segments, so we
          // should still be waiting.
          start: 24,
          seekTo: 4,
          expectedEndTime: 4,
          expectEvent: false,
        });

        seekTest('will jump when seeking backwards into gap', {
          // [2-10], [20-30]
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 2, end: 10}],
          start: 24,
          seekTo: 1.6,
          expectedEndTime: 2,
          expectEvent: false,
        });
      });  // with small gaps

      describe('with large gaps', function() {
        seekTest('will jump large gap at beginning', {
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 20, end: 30}],
          start: 25,
          seekTo: 0,
          jumpLargeGaps: true,
          expectedEndTime: 20,
          expectEvent: true,
        });

        seekTest('will raise event', {
          // [0-10], [20-30], [40-50]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 40, end: 50}],
          start: 3,
          seekTo: 32,
          expectedEndTime: 32,
          expectEvent: true,
        });

        seekTest('will jump large gaps', {
          // [0-10], [20-30], [40-50]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 40, end: 50}],
          start: 3,
          seekTo: 32,
          expectedEndTime: 40,
          jumpLargeGaps: true,
          expectEvent: true,
        });

        seekTest('will jump large gaps', {
          // [0-10], [20-30], [40-50]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 40, end: 50}],
          start: 3,
          seekTo: 32,
          expectedEndTime: 32,
          jumpLargeGaps: true,
          preventDefault: true,
          expectEvent: true,
        });
      });  // with large gaps
    });  // with unbuffered seeks

    it('doesn\'t gap jump if the seeking event is late', function() {
      let buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.currentTime = 12;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;

      config.jumpLargeGaps = true;
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          12 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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

    it('works with rounding errors when seeking', function() {
      // If the browser sets the time to slightly before where we seek to, we
      // shouldn't get stuck in an infinite loop trying to jump the tiny gap.
      // https://github.com/google/shaka-player/issues/1309
      let buffered = [{start: 10, end: 20}];
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

      config.jumpLargeGaps = true;
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          0 /* startTime */,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

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

      config.jumpLargeGaps = true;
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 5,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.notifyOfBufferingChange();
      jasmine.clock().tick(500);

      // There should NOT have been a gap jump.
      expect(video.currentTime).toBe(5);
    });

    // Regression test for https://github.com/google/shaka-player/issues/2987
    it('does gap jump if paused at 0', () => {
      const buffered = [{start: 10, end: 20}];
      video.buffered = createFakeBuffered(buffered);
      video.currentTime = 0;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
      video.paused = true;

      config.jumpLargeGaps = true;
      playhead = new shaka.media.MediaSourcePlayhead(
          video,
          manifest,
          config,
          /* startTime= */ 0,
          Util.spyFunc(onSeek),
          Util.spyFunc(onEvent));

      playhead.notifyOfBufferingChange();
      jasmine.clock().tick(500);

      // There SHOULD have been a gap jump.
      expect(video.currentTime).toBe(10);
    });

    /**
     * @param {string} name
     * @param {SeekTestInfo} data
     */
    function seekTest(name, data) {
      it(name, function() {
        video.buffered = createFakeBuffered(data.buffered);
        video.currentTime = data.start;
        video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;

        onEvent.and.callFake(function(event) {
          if (data.preventDefault) {
            event.preventDefault();
          }
        });

        config.jumpLargeGaps = !!data.jumpLargeGaps;
        playhead = new shaka.media.MediaSourcePlayhead(
            video,
            manifest,
            config,
            data.start /* startTime */,
            Util.spyFunc(onSeek),
            Util.spyFunc(onEvent));

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
     * @param {!Array.<{start: number, end: number}>} b
     * @param {number} time
     * @return {number}
     */
    function calculateReadyState(b, time) {
      // See: https://bit.ly/2JYh8WX
      for (let i = 0; i < b.length; i++) {
        if (time >= b[i].start) {
          if (time == b[i].end) {
            // The video has the current frame, but no data in the future.
            return HTMLMediaElement.HAVE_CURRENT_DATA;
          } else if (time < b[i].end) {
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
