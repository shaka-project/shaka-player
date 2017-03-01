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

describe('Playhead', function() {
  var video;
  var timeline;
  var manifest;
  var playhead;

  // Callback to us from Playhead when the buffering state changes.
  var onBuffering;

  // Callback to us from Playhead when a valid 'seeking' event occurs.
  var onSeek;

  // Callback to us from Playhead when a timeline event occurs.
  var onEvent;

  // Callback to us from Playhead when we change to a different Period.
  var onChangePeriod;

  beforeEach(function() {
    video = new shaka.test.FakeVideo();
    timeline = createMockPresentationTimeline();

    onBuffering = jasmine.createSpy('onBuffering');
    onSeek = jasmine.createSpy('onSeek');
    onEvent = jasmine.createSpy('onEvent');
    onChangePeriod = jasmine.createSpy('onChangePeriod');

    timeline.isLive.and.returnValue(false);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);

    // These tests should not cause these methods to be invoked.
    timeline.getSegmentAvailabilityDuration.and.throwError(new Error());
    timeline.getDuration.and.throwError(new Error());
    timeline.setDuration.and.throwError(new Error());

    manifest = /** @type {shakaExtern.Manifest} */ ({
      periods: [],
      presentationTimeline: timeline
    });
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
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      expect(video.addEventListener).toHaveBeenCalledWith(
          'loadedmetadata', jasmine.any(Function), false);
      expect(video.addEventListener.calls.count()).toBe(3);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(0);

      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.on['loadedmetadata']();

      expect(video.addEventListener).toHaveBeenCalledWith(
          'seeking', jasmine.any(Function), false);
      expect(video.addEventListener.calls.count()).toBe(4);

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
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      expect(playhead.getTime()).toBe(5);
      expect(video.currentTime).toBe(5);

      video.currentTime = 6;
      expect(playhead.getTime()).toBe(6);
    });
  });

  it('sets/unsets buffering state', function() {
    playhead = new shaka.media.Playhead(
        video,
        manifest,
        10 /* minBufferTime */,
        5 /* startTime */,
        onBuffering, onSeek, onEvent, onChangePeriod);

    // Set to 2 to ensure Playhead restores the correct rate.
    video.playbackRate = 2;
    video.on['ratechange']();

    playhead.setBuffering(false);
    expect(onBuffering).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(2);

    playhead.setBuffering(true);
    expect(onBuffering).toHaveBeenCalledWith(true);
    expect(video.playbackRate).toBe(0);

    onBuffering.calls.reset();

    playhead.setBuffering(true);
    expect(onBuffering).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(0);

    playhead.setBuffering(false);
    expect(onBuffering).toHaveBeenCalledWith(false);
    expect(video.playbackRate).toBe(2);
  });

  it('clamps playhead after seeking for live', function() {
    video.readyState = HTMLMediaElement.HAVE_METADATA;

    video.buffered = createFakeBuffered([{start: 25, end: 55}]);

    timeline.isLive.and.returnValue(true);
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(30);

    playhead = new shaka.media.Playhead(
        video,
        manifest,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek, onEvent, onChangePeriod);

    // Calling on['seeking']() is like dispatching a 'seeking' event. So, each
    // time we change the video's current time or Playhead changes the video's
    // current time we must call on['seeking'](),

    video.on['seeking']();
    expect(video.currentTime).toBe(5);
    expect(playhead.getTime()).toBe(5);

    // left = start + 1 = 5 + 1 = 6
    // safe = left + rebufferingGoal = 6 + 10 = 16

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

    // Seek before left (treated like seek before start even though in buffered
    // region).
    video.currentTime = 5.5;
    video.on['seeking']();
    expect(video.currentTime).toBe(17);
    expect(playhead.getTime()).toBe(17);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    video.buffered = createFakeBuffered([{start: 10, end: 40}]);

    // Seek outside safe region & in buffered region.
    video.currentTime = 15;
    video.on['seeking']();
    expect(video.currentTime).toBe(15);
    expect(playhead.getTime()).toBe(15);
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek outside safe region & in unbuffered region.
    video.currentTime = 9;
    video.on['seeking']();
    expect(video.currentTime).toBe(17);
    expect(playhead.getTime()).toBe(17);
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

    // Seek before start.
    video.currentTime = 1;
    video.on['seeking']();
    expect(video.currentTime).toBe(17);
    expect(playhead.getTime()).toBe(17);
    expect(onSeek).not.toHaveBeenCalled();
    video.on['seeking']();
    expect(onSeek).toHaveBeenCalled();

    onSeek.calls.reset();

    // Seek with end < safe (note: safe == 16).
    timeline.getSegmentAvailabilityEnd.and.returnValue(12);

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
    expect(video.currentTime).toBe(8);
    expect(playhead.getTime()).toBe(8);
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
    timeline.getEarliestStart.and.returnValue(5);
    timeline.getSegmentAvailabilityStart.and.returnValue(5);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
    timeline.getSegmentAvailabilityDuration.and.returnValue(null);

    playhead = new shaka.media.Playhead(
        video,
        manifest,
        10 /* rebufferingGoal */,
        5 /* startTime */,
        onBuffering, onSeek, onEvent, onChangePeriod);

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
      timeline.getEarliestStart.and.returnValue(5);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getEarliestStart.and.returnValue(10);
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      // Because this is buffered, the playhead should move to (start + 1),
      // which will cause a 'seeking' event.
      video.on['playing']();
      expect(video.currentTime).toBe(11);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(11);
      expect(onSeek).toHaveBeenCalled();
    });

    it('(VOD case)', function() {
      timeline.isLive.and.returnValue(false);
      timeline.getEarliestStart.and.returnValue(5);
      timeline.getSegmentAvailabilityStart.and.returnValue(5);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      // Simulate pausing.
      timeline.getEarliestStart.and.returnValue(10);
      timeline.getSegmentAvailabilityStart.and.returnValue(10);
      timeline.getSegmentAvailabilityEnd.and.returnValue(70);
      timeline.getSegmentAvailabilityDuration.and.returnValue(30);

      video.on['playing']();
      expect(video.currentTime).toBe(10);
      video.on['seeking']();
      expect(playhead.getTime()).toBe(10);
      expect(onSeek).toHaveBeenCalled();
    });
  });

  describe('enters/leaves buffering state', function() {
    it('enters buffering state when out of buffered content', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = createFakeBuffered([{start: 5, end: 10}]);

      video.duration = 20;

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      video.currentTime = 11;

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);
        done();
      });
    });

    it('does not enter buffering state when has buffered content',
        function(done) {
          video.readyState = HTMLMediaElement.HAVE_METADATA;

          video.buffered = createFakeBuffered([{start: 5, end: 10}]);

          video.duration = 20;

         playhead = new shaka.media.Playhead(
              video,
              manifest,
              10 /* rebufferingGoal */,
              5 /* startTime */,
              onBuffering, onSeek, onEvent, onChangePeriod);

          video.on['seeking']();
          expect(video.currentTime).toBe(5);
          expect(playhead.getTime()).toBe(5);

          // wait for the buffer checking event to fire
          shaka.test.Util.delay(0.5).then(function() {
            expect(onBuffering).not.toHaveBeenCalled();
            done();
          });
        });

    it('leaves buffering state if content got buffered', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      video.buffered = createFakeBuffered([{start: 5, end: 10}]);

      video.duration = 20;

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      video.on['seeking']();
      expect(video.currentTime).toBe(5);
      expect(playhead.getTime()).toBe(5);

      video.currentTime = 11;

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);

        video.buffered = createFakeBuffered([{start: 10, end: 25}]);

        onBuffering.and.callFake(function(buffering) {
          expect(buffering).toEqual(false);
          done();
        });
      });
    });

    it('leaves buffering state with small non-zero start time', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      // Nothing buffered.
      video.buffered = createFakeBuffered([]);

      video.duration = 60;
      timeline.getDuration.and.returnValue(60);
      timeline.getEarliestStart.and.returnValue(0);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          2 /* rebufferingGoal */,
          0 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      video.on['seeking']();
      expect(video.currentTime).toBe(0);
      expect(playhead.getTime()).toBe(0);

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);

        video.buffered = createFakeBuffered([{start: 0.2, end: 5}]);

        onBuffering.and.callFake(function(buffering) {
          expect(buffering).toEqual(false);
          done();
        });
      });
    });

    it('leaves buffering state with exact amount buffered', function(done) {
      video.readyState = HTMLMediaElement.HAVE_METADATA;

      // Nothing buffered.
      video.buffered = createFakeBuffered([]);

      video.duration = 20;
      timeline.getDuration.and.returnValue(20);
      timeline.getEarliestStart.and.returnValue(0);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* rebufferingGoal */,
          0 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      expect(video.currentTime).toBe(0);
      expect(playhead.getTime()).toBe(0);

      onBuffering.and.callFake(function(buffering) {
        expect(buffering).toEqual(true);

        // Exactly 10s (rebufferingGoal) is buffered now.
        video.buffered = createFakeBuffered([{start: 0, end: 10}]);

        onBuffering.and.callFake(function(buffering) {
          expect(buffering).toEqual(false);
          done();
        });
      });
    });
  });

  describe('timeline regions', function() {
    var regionInfo;

    beforeEach(function() {
      regionInfo = {
        schemeIdUri: 'http://example.com',
        value: 'something',
        startTime: 10,
        endTime: 20,
        id: 'abc',
        eventElement: null
      };

      video.readyState = HTMLMediaElement.HAVE_METADATA;

      timeline.getEarliestStart.and.returnValue(0);
      timeline.getDuration.and.returnValue(60);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);

      playhead = new shaka.media.Playhead(
          video, manifest, 10 /* rebufferingGoal */, 0 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);
    });

    it('fires enter/exit events when playhead plays into a region', function() {
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 0;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 12;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 17;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 22;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo);
    });

    it('fires enter/exit events for zero-length regions', function() {
      regionInfo.startTime = regionInfo.endTime = 10;
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 8;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 11;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(2);
      expectTimelineEvent('timelineregionenter', regionInfo, 0);
      expectTimelineEvent('timelineregionexit', regionInfo, 1);
    });

    it('fires enter event when adding a region the playead is in', function() {
      video.currentTime = 12;
      playhead.addTimelineRegion(regionInfo);
      expect(onEvent).toHaveBeenCalledTimes(2);
      expectTimelineEvent('timelineregionadded', regionInfo, 0);
      expectTimelineEvent('timelineregionenter', regionInfo, 1);
      onEvent.calls.reset();

      video.currentTime = 15;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('fires enter event when seeking into a region', function() {
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 13;
      video.on['seeking']();

      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 16;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('fires exit event when seeking out of a region', function() {
      video.currentTime = 12;
      playhead.addTimelineRegion(regionInfo);
      expect(onEvent).toHaveBeenCalledTimes(2);
      onEvent.calls.reset();

      video.currentTime = 0;
      video.on['seeking']();

      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 4;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('doesn\'t fire when seeking over a region', function() {
      playhead.addTimelineRegion(regionInfo);
      onEvent.calls.reset();

      video.currentTime = 4;
      video.on['timeupdate']();

      video.currentTime = 7;
      video.on['timeupdate']();

      video.currentTime = 25;
      video.on['seeking']();

      video.currentTime = 28;
      video.on['timeupdate']();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('correctly fires enter/exit events when regions overlap', function() {
      var regionInfo2 = {
        schemeIdUri: 'http://example.com',
        value: 'something',
        startTime: 15,
        endTime: 25,
        id: '123',
        eventElement: null
      };

      playhead.addTimelineRegion(regionInfo);
      playhead.addTimelineRegion(regionInfo2);
      expect(onEvent).toHaveBeenCalledTimes(2);
      onEvent.calls.reset();

      video.currentTime = 7;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();

      video.currentTime = 12;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 16;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionenter', regionInfo2);
      onEvent.calls.reset();

      video.currentTime = 22;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo);
      onEvent.calls.reset();

      video.currentTime = 26;
      video.on['timeupdate']();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent('timelineregionexit', regionInfo2);
      onEvent.calls.reset();

      video.currentTime = 28;
      video.on['timeupdate']();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t add duplicate regions', function() {
      // Regions with the same scheme ID and time ranges are ignored.
      var infoWithSameTime = {
        schemeIdUri: 'http://example.com',
        value: 'other',
        startTime: 10,
        endTime: 20,
        id: '123',
        eventElement: null
      };
      var differentInfo = {
        schemeIdUri: 'http://google.com',
        value: 'other',
        startTime: 10,
        endTime: 20,
        id: '123',
        eventElement: null
      };

      playhead.addTimelineRegion(regionInfo);
      playhead.addTimelineRegion(regionInfo);
      playhead.addTimelineRegion(differentInfo);
      playhead.addTimelineRegion(infoWithSameTime);
      expect(onEvent).toHaveBeenCalledTimes(2);
      expectTimelineEvent('timelineregionadded', regionInfo, 0);
      expectTimelineEvent('timelineregionadded', differentInfo, 1);
    });

    /**
     * @param {string} eventName
     * @param {shakaExtern.TimelineRegionInfo} info
     * @param {number=} opt_index
     */
    function expectTimelineEvent(eventName, info, opt_index) {
      var event = onEvent.calls.argsFor(opt_index || 0)[0];
      expect(event.type).toBe(eventName);
      expect(event.detail).toEqual(info);
    }
  });

  describe('changing Periods', function() {
    beforeEach(function() {
      manifest.periods = [
        {startTime: 0},
        {startTime: 10},
        {startTime: 20}
      ];

      video.readyState = HTMLMediaElement.HAVE_METADATA;

      timeline.getEarliestStart.and.returnValue(0);
      timeline.getDuration.and.returnValue(40);
      timeline.getSegmentAvailabilityStart.and.returnValue(0);
      timeline.getSegmentAvailabilityEnd.and.returnValue(40);

      playhead = new shaka.media.Playhead(
          video,
          manifest,
          10 /* minBufferTime */,
          5 /* startTime */,
          onBuffering, onSeek, onEvent, onChangePeriod);

      video.on['timeupdate']();
      expect(onChangePeriod).not.toHaveBeenCalled();
    });

    it('calls the callback when playing into new Period', function(done) {
      video.currentTime = 12;
      shaka.test.Util.delay(0.5).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(0, 1);

        onChangePeriod.calls.reset();
        video.currentTime = 18;
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onChangePeriod).not.toHaveBeenCalled();

        video.currentTime = 21;
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(1, 2);
      }).catch(fail).then(done);
    });

    it('calls the callback when seeking forward', function(done) {
      video.currentTime = 12;
      video.on['seeking']();
      shaka.test.Util.delay(0.5).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(0, 1);
      }).catch(fail).then(done);
    });

    it('calls the callback when seeking backward', function(done) {
      video.currentTime = 12;
      shaka.test.Util.delay(0.5).then(function() {
        onChangePeriod.calls.reset();

        video.currentTime = 2;
        video.on['seeking']();
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(1, 0);
      }).catch(fail).then(done);
    });

    it('calls the callback when seeking over a Period', function(done) {
      video.currentTime = 22;
      video.on['seeking']();
      shaka.test.Util.delay(0.5).then(function() {
        expect(onChangePeriod).toHaveBeenCalledTimes(1);
        expect(onChangePeriod).toHaveBeenCalledWith(0, 2);
      }).catch(fail).then(done);
    });
  });

  function createMockPresentationTimeline() {
    var getStart = jasmine.createSpy('getSegmentAvailabilityStart');
    var getSafeStart = jasmine.createSpy('getSafeAvailabilityStart');
    getSafeStart.and.callFake(function(delay) {
      return getStart() + delay;
    });

    return {
      getDuration: jasmine.createSpy('getDuration'),
      setDuration: jasmine.createSpy('setDuration'),
      getSegmentAvailabilityDuration:
          jasmine.createSpy('getSegmentAvailabilityDuration'),
      isLive: jasmine.createSpy('isLive'),
      getEarliestStart: jasmine.createSpy('getEarliestStart'),
      getSegmentAvailabilityStart: getStart,
      getSafeAvailabilityStart: getSafeStart,
      getSegmentAvailabilityEnd:
          jasmine.createSpy('getSegmentAvailabilityEnd')
    };
  }
});

