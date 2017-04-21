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
var TimeRange;


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
var PlayingTestInfo;


/**
 * @typedef {{
 *   buffered: !Array.<TimeRange>,
 *   newBuffered: (!Array.<TimeRange>|undefined),
 *   start: number,
 *   seekTo: number,
 *   expectedEndTime: number,
 *   expectEvent: boolean
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
 */
var SeekTestInfo;


describe('Playhead', function() {
  var video;
  var timeline;
  var manifest;
  var playhead;
  var config;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  var onSeek;

  // Callback to us from Playhead when an event should be sent to the app.
  var onEvent;

  beforeEach(function() {
    video = new shaka.test.FakeVideo();
    timeline = new shaka.test.FakePresentationTimeline();

    onSeek = jasmine.createSpy('onSeek');
    onEvent = jasmine.createSpy('onEvent');

    timeline.isLive.and.returnValue(false);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);

    // These tests should not cause these methods to be invoked.
    timeline.getSegmentAvailabilityDuration.and.throwError(new Error());
    timeline.getDuration.and.throwError(new Error());
    timeline.setDuration.and.throwError(new Error());

    // shakaExtern.Manifest
    manifest = {
      periods: [],
      presentationTimeline: timeline,
      minBufferTime: 10,
      offlineSessionIds: []
    };

    // shakaExtern.StreamingConfiguration
    config = {
      rebufferingGoal: 10,
      bufferingGoal: 5,
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      bufferBehind: 15,
      ignoreTextStreamFailures: false,
      useRelativeCueTimestamps: false,
      startAtSegmentBoundary: false,
      smallGapLimit: 0.5,
      jumpLargeGaps: false
    };
  });

  afterEach(function(done) {
    playhead.destroy().then(done);
    playhead = null;
  });

  describe('getTime', function() {
    it('returns the correct time when readyState starts at 0', function() {
      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek,
          onEvent);

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', jasmine.any(Function), false);
      expect(video.addEventListener).not.toHaveBeenCalledWith(
          'seeking', jasmine.any(Function), jasmine.any(Boolean));

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.on['loadedmetadata']();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', jasmine.any(Function), false);

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

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek,
          onEvent);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });
  });

  it('clamps playhead after seeking for live', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(true);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    playhead = new shaka.media.Playhead(
        video,
        manifest,
        config,
        5 /* startTime */,
        onSeek,
        onEvent);

    // Calling on['seeking']() is like dispatching a 'seeking' event. So, each
    // time we change the video's current time or Playhead changes the video's
    // current time we must call on['seeking'](),

    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // safe = start + rebufferingGoal = 5 + 10 = 15
    // safeSeek = safeSeek + 5 = 15 + 5 = 20

    // Seek in safe region & in buffered region.
    video.currentTime = 26;
    video.on['seeking']();
    expect(video.currentTime).toBe(26);
    expect(playhead.getTime()).toBe(26);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in safe region & in unbuffered region.
    video.currentTime = 24;
    video.on['seeking']();
    expect(video.currentTime).toBe(24);
    expect(playhead.getTime()).toBe(24);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start, start is unbuffered.
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(20);
    expect(playhead.getTime()).toBe(20);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    video.buffered = createFakeBuffered([{start: 10, end: 40}]);

    // Seek outside safe region & in buffered region.
    video.currentTime = 11;
    video.on['seeking']();
    expect(video.currentTime).toBe(11);
    expect(playhead.getTime()).toBe(11);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek outside safe region & in unbuffered region.
    video.currentTime = 9;
    video.on['seeking']();
    expect(video.currentTime).toBe(20);
    expect(playhead.getTime()).toBe(20);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    video.currentTime = 120;
    video.on['seeking']();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start, start is buffered.
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(10);
    expect(playhead.getTime()).toBe(10);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek with safe == end
    timeline.getSegmentAvailabilityEnd.and.returnValue(12);
    timeline.getSafeAvailabilityStart.and.returnValue(12);

    // Seek before start
    video.currentTime = 4;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek in window.
    video.currentTime = 8;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek past end.
    video.currentTime = 13;
    video.on['seeking']();
    expect(video.currentTime).toBe(12);
    expect(playhead.getTime()).toBe(12);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();
  });

  it('clamps playhead after seeking for VOD', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(false);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSafeAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(null);

    playhead = new shaka.media.Playhead(
        video,
        manifest,
        config,
        5 /* startTime */,
        onSeek,
        onEvent);

    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // Seek past end.
    video.currentTime = 120;
    video.on['seeking']();
    expect(video.currentTime).toBe(60);
    expect(playhead.getTime()).toBe(60);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek before start.
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();
  });

  describe('clamps playhead after resuming', function() {
    beforeEach(function() {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = createFakeBuffered([{start: 5, end: 35}]);
    });

    it('(live case)', function() {
      timeline.isLive.and.returnValue(true);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek,
          onEvent);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      // Because this is buffered, the playhead should move to (start + 5),
      // which will cause a 'seeking' event.
      video.on['playing']();
      expect(video.currentTime).toBe(15);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(15);
      expect(onSeek).toHaveBeenCalled();
    });

    it('(VOD case)', function() {
      timeline.isLive.and.returnValue(false);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSafeAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          config,
          5 /* startTime */,
          onSeek,
          onEvent);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSafeAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      video.on['playing']();
      expect(video.currentTime).toBe(10);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(10);
      expect(onSeek).toHaveBeenCalled();
    });
  });

  describe('gap jumping', function() {
    beforeAll(function() {
      jasmine.clock().install();
    });

    afterAll(function() {
      jasmine.clock().uninstall();
    });

    beforeEach(function() {
      timeline.isLive.and.returnValue(false);
      timeline.getSafeAvailabilityStart.and.returnValue(0);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);

      config.smallGapLimit = 1;
    });

    describe('when playing', function() {
      describe('with small gaps', function() {
        playingTest('won\'t jump at end of single region', {
          buffered: [{start: 0, end: 10}],
          start: 3,
          waitingAt: 10,
          expectEvent: false,
          expectedEndTime: 10
        });

        playingTest('won\'t jump at end of multiple regions', {
          buffered: [{start: 0, end: 10}, {start: 20, end: 30}],
          start: 24,
          waitingAt: 30,
          expectEvent: false,
          expectedEndTime: 30
        });

        playingTest('will jump small gap', {
          buffered: [{start: 0, end: 10}, {start: 11, end: 20}],
          start: 5,
          waitingAt: 10,
          expectEvent: false,
          expectedEndTime: 11
        });

        playingTest('won\'t skip a buffered range', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 5,
          waitingAt: 10,
          expectEvent: false,
          expectedEndTime: 11
        });

        playingTest('will jump gap into last buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 15,
          waitingAt: 20,
          expectEvent: false,
          expectedEndTime: 21
        });
      });

      describe('with large gaps', function() {
        playingTest('will fire an event', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          expectEvent: true,
          expectedEndTime: 10
        });

        playingTest('will jump large gaps if set', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          jumpLargeGaps: true,
          expectEvent: true,
          expectedEndTime: 30
        });

        playingTest('will only jump one buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 30, end: 40}, {start: 50, end: 60}],
          start: 5,
          waitingAt: 10,
          jumpLargeGaps: true,
          expectEvent: true,
          expectedEndTime: 30
        });

        playingTest('will jump into last buffer', {
          buffered:
              [{start: 0, end: 10}, {start: 20, end: 30}, {start: 50, end: 60}],
          start: 24,
          waitingAt: 30,
          jumpLargeGaps: true,
          expectEvent: true,
          expectedEndTime: 50
        });

        playingTest('won\'t jump gaps when preventDefault() is called', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          waitingAt: 10,
          jumpLargeGaps: true,
          preventDefault: true,
          expectEvent: true,
          expectedEndTime: 10
        });
      });

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
            if (data.preventDefault)
              event.preventDefault();
          });

          config.jumpLargeGaps = !!data.jumpLargeGaps;
          playhead = new shaka.media.Playhead(
              video,
              manifest,
              config,
              data.start /* startTime */,
              onSeek,
              onEvent);

          jasmine.clock().tick(1000);
          for (var time = data.start; time < data.waitingAt; time++) {
            video.currentTime = time;
            jasmine.clock().tick(1000);
            // Make sure Playhead didn't adjust the time yet.
            expect(video.currentTime).toBe(time);
          }

          expect(onEvent).not.toHaveBeenCalled();

          video.currentTime = data.waitingAt;
          video.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
          video.on['waiting']();
          jasmine.clock().tick(1000);

          expect(onEvent).toHaveBeenCalledTimes(data.expectEvent ? 1 : 0);
          expect(video.currentTime).toBe(data.expectedEndTime);
        });
      }
    });

    describe('with buffered seeks', function() {
      describe('with small gaps', function() {
        seekTest('won\'t seek when past the end', {
          buffered: [{start: 0, end: 10}],
          start: 4,
          seekTo: 14,
          expectedEndTime: 14,
          expectEvent: false
        });

        seekTest('will jump when seeking into gap', {
          buffered: [{start: 0, end: 10}, {start: 11, end: 20}],
          start: 3,
          seekTo: 10.4,
          expectedEndTime: 11,
          expectEvent: false
        });

        seekTest('won\'t jump multiple buffers', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 3,
          seekTo: 10.4,
          expectedEndTime: 11,
          expectEvent: false
        });

        seekTest('will jump into last range with seeking', {
          buffered:
              [{start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}],
          start: 3,
          seekTo: 20.5,
          expectedEndTime: 21,
          expectEvent: false
        });

        seekTest('treats large gaps as small if playhead near end', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 3,
          seekTo: 29.2,
          expectedEndTime: 30,
          expectEvent: false
        });
      });

      describe('with large gaps', function() {
        seekTest('will raise event', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          expectedEndTime: 12,
          expectEvent: true
        });

        seekTest('will jump large gaps', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          jumpLargeGaps: true,
          expectedEndTime: 30,
          expectEvent: true
        });

        seekTest('won\'t jump if preventDefault() is called', {
          buffered: [{start: 0, end: 10}, {start: 30, end: 40}],
          start: 5,
          seekTo: 12,
          jumpLargeGaps: true,
          preventDefault: true,
          expectedEndTime: 12,
          expectEvent: true
        });
      });
    });

    describe('unbuffered seek', function() {
      describe('w/ small gaps', function() {
        seekTest('won\'t jump when seeking into buffered range', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 22,
          expectedEndTime: 22,
          expectEvent: false
        });

        // Seeking to the beginning is considered an unbuffered seek even if
        // there is a gap.
        seekTest('will jump a small gap at the beginning', {
          buffered: [{start: 0.2, end: 10}],
          newBuffered: [{start: 0.2, end: 10}],
          start: 4,
          seekTo: 0,
          expectedEndTime: 0.2,
          expectEvent: false
        });

        seekTest('will jump when seeking into gap', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 30.2,
          expectedEndTime: 31,
          expectEvent: false
        });

        seekTest('will jump when seeking to the end of a range', {
          // [0-10], [20-30], [31-40]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 31, end: 40}],
          start: 3,
          seekTo: 30,
          expectedEndTime: 31,
          expectEvent: false
        });

        seekTest('won\'t jump when past end', {
          // [0-10], [20-30]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}],
          start: 3,
          seekTo: 34,
          expectedEndTime: 34,
          expectEvent: false
        });

        seekTest('won\'t jump when seeking backwards into buffered range', {
          // [0-10], [20-30]
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 0, end: 10}],
          start: 24,
          seekTo: 4,
          expectedEndTime: 4,
          expectEvent: false
        });

        seekTest('will jump when seeking backwards into gap', {
          // [2-10], [20-30]
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 2, end: 10}],
          start: 24,
          seekTo: 1.6,
          expectedEndTime: 2,
          expectEvent: false
        });
      });

      describe('w/ large gaps', function() {
        seekTest('will jump large gap at beginning', {
          buffered: [{start: 20, end: 30}],
          newBuffered: [{start: 20, end: 30}],
          start: 25,
          seekTo: 0,
          jumpLargeGaps: true,
          expectedEndTime: 20,
          expectEvent: true
        });

        seekTest('will raise event', {
          // [0-10], [20-30], [40-50]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 40, end: 50}],
          start: 3,
          seekTo: 32,
          expectedEndTime: 32,
          expectEvent: true
        });

        seekTest('will jump large gaps', {
          // [0-10], [20-30], [40-50]
          buffered: [{start: 0, end: 10}],
          newBuffered: [{start: 20, end: 30}, {start: 40, end: 50}],
          start: 3,
          seekTo: 32,
          expectedEndTime: 40,
          jumpLargeGaps: true,
          expectEvent: true
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
          expectEvent: true
        });
      });
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
          if (data.preventDefault)
            event.preventDefault();
        });

        config.jumpLargeGaps = !!data.jumpLargeGaps;
        playhead = new shaka.media.Playhead(
            video,
            manifest,
            config,
            data.start /* startTime */,
            onSeek,
            onEvent);

        jasmine.clock().tick(1000);
        expect(onEvent).not.toHaveBeenCalled();

        // Seek to the given position and update ready state.
        video.currentTime = data.seekTo;
        video.readyState = calculateReadyState(data.buffered, data.seekTo);
        video.on['seeking']();
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA)
          video.on['waiting']();
        jasmine.clock().tick(1000);

        if (data.newBuffered) {
          // If we have a new buffer, first clear the buffer.
          video.buffered = createFakeBuffered([]);
          video.readyState = HTMLMediaElement.HAVE_METADATA;
          jasmine.clock().tick(1000);

          // Now StreamingEngine will buffer the new content and tell playhead
          // about it.
          video.buffered = createFakeBuffered(data.newBuffered);
          video.readyState = calculateReadyState(data.newBuffered, data.seekTo);
          playhead.onSegmentAppended();
          jasmine.clock().tick(1000);
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
      // See: https://goo.gl/L8qxfD
      for (var i = 0; i < b.length; i++) {
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
  });
});
