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

describe('PlayheadObserver', function() {
  var observer;
  var video;
  var timeline;
  var manifest;
  var config;

  var onBuffering;
  var onChangePeriod;
  var onEvent;

  beforeAll(function() {
    jasmine.clock().install();
  });

  afterAll(function() {
    jasmine.clock().uninstall();
  });

  beforeEach(function() {
    video = new shaka.test.FakeVideo();
    video.currentTime = 0;
    video.duration = 60;
    video.buffered = createFakeBuffered([]);

    timeline = new shaka.test.FakePresentationTimeline();

    // shakaExtern.Manifest
    manifest = {
      periods: [],
      offlineSessionIds: [],
      minBufferTime: 0,
      presentationTimeline: timeline
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

    onBuffering = jasmine.createSpy('onBuffering');
    onChangePeriod = jasmine.createSpy('onChangePeriod');
    onEvent = jasmine.createSpy('onEvent');

    // The observer should only call getSegmentAvailabilityEnd.
    shaka.test.Util.makeMockObjectStrict(timeline);
    timeline.getSegmentAvailabilityEnd.and.returnValue(60);
  });

  afterEach(function(done) {
    observer.destroy().catch(fail).then(done);
  });

  describe('buffering', function() {
    it('doesn\'t change buffering state when enough is buffered', function() {
      video.buffered = createFakeBuffered([{start: 0, end: 20}]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      observer.seeked();
      jasmine.clock().tick(1000);
      expect(onBuffering).not.toHaveBeenCalled();
    });

    it('enters buffering state when playing to end of buffer', function() {
      video.buffered = createFakeBuffered([{start: 0, end: 20}]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      video.currentTime = 20;
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(true);
    });

    it('enters buffering state when seeking to unbuffered region', function() {
      video.buffered = createFakeBuffered([{start: 0, end: 20}]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      video.currentTime = 40;
      observer.seeked();
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(true);
    });

    it('leaves buffering state when enough is buffered', function() {
      video.buffered = createFakeBuffered([{start: 0, end: 20}]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      video.currentTime = 22;
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(true);
      onBuffering.calls.reset();

      video.buffered = createFakeBuffered([{start: 15, end: 40}]);
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(false);
    });

    it('leaves buffering state with small non-zero start time', function() {
      video.buffered = createFakeBuffered([]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(true);
      onBuffering.calls.reset();

      video.buffered = createFakeBuffered([{start: 0.2, end: 15}]);
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(false);
    });

    it('leaves buffering state with exact amount buffered', function() {
      video.buffered = createFakeBuffered([]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(true);
      onBuffering.calls.reset();

      video.buffered = createFakeBuffered([{start: 0, end: 10}]);
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(false);
    });

    it('doesn\'t enter buffering state at end of VOD stream', function() {
      video.buffered = createFakeBuffered([{start: 40, end: 60}]);
      video.currentTime = 40;
      video.duration = 60;
      timeline.isLive.and.returnValue(false);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);

      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      jasmine.clock().tick(1000);
      expect(onBuffering).not.toHaveBeenCalled();

      video.currentTime = 60;
      jasmine.clock().tick(1000);
      expect(onBuffering).not.toHaveBeenCalled();
    });

    it('doesn\'t enter buffering state at live edge', function() {
      video.buffered = createFakeBuffered([{start: 40, end: 60}]);
      video.currentTime = 40;
      video.duration = 9999999999;
      timeline.isLive.and.returnValue(true);
      timeline.getSegmentAvailabilityEnd.and.returnValue(60);

      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      jasmine.clock().tick(1000);
      expect(onBuffering).not.toHaveBeenCalled();

      video.currentTime = 60;
      jasmine.clock().tick(1000);
      expect(onBuffering).not.toHaveBeenCalled();

      // When the live edge moves, should enter buffering state.
      timeline.getSegmentAvailabilityEnd.and.returnValue(90);
      jasmine.clock().tick(1000);
      expect(onBuffering).toHaveBeenCalledWith(true);
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

      video.buffered = createFakeBuffered([{start: 0, end: 60}]);
      video.currentTime = 0;
      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);
    });

    describe('adding regions', function() {
      it('fires added event when adding a new region', function() {
        expect(onEvent).not.toHaveBeenCalled();

        observer.addTimelineRegion(regionInfo);

        expect(onEvent).toHaveBeenCalledTimes(1);
        expectTimelineEvent('timelineregionadded', regionInfo);
      });

      it('won\'t fire an added event when adding a duplicate', function() {
        observer.addTimelineRegion(regionInfo);
        onEvent.calls.reset();

        observer.addTimelineRegion(regionInfo);
        observer.addTimelineRegion(regionInfo);
        observer.addTimelineRegion({
          // "Similar" event (i.e. same time and schemeIdUri.
          schemeIdUri: 'http://example.com',
          value: 'other',
          startTime: 10,
          endTime: 20,
          id: 'xyz',
          eventElement: null
        });
        observer.addTimelineRegion(regionInfo);

        expect(onEvent).not.toHaveBeenCalled();
        observer.addTimelineRegion({
          // Different event
          schemeIdUri: 'http://example.com/other',
          value: 'dog',
          startTime: 0,
          endTime: 50,
          id: '123',
          eventElement: null
        });
        expect(onEvent).toHaveBeenCalled();
      });

      it('fires an enter event when adding a region the playhead is in',
         function() {
           video.currentTime = 15;
           jasmine.clock().tick(1000);

           expect(onEvent).not.toHaveBeenCalled();
           observer.addTimelineRegion(regionInfo);
           jasmine.clock().tick(1000);

           expect(onEvent).toHaveBeenCalledTimes(2);
           expectTimelineEvent('timelineregionadded', regionInfo, 0);
           expectTimelineEvent('timelineregionenter', regionInfo, 1);
         });
    });

    describe('seeking', function() {
      beforeEach(function() {
        observer.addTimelineRegion(regionInfo);
        onEvent.calls.reset();
      });

      it('won\'t fire events when seeking over a region', function() {
        video.currentTime = 5;
        jasmine.clock().tick(1000);

        video.currentTime = 25;
        observer.seeked();
        jasmine.clock().tick(1000);

        expect(onEvent).not.toHaveBeenCalled();
      });

      it('fires an enter event when seeking into a region', function() {
        video.currentTime = 15;
        observer.seeked();
        jasmine.clock().tick(1000);

        expect(onEvent).toHaveBeenCalledTimes(1);
        expectTimelineEvent('timelineregionenter', regionInfo);
      });

      it('fires an exit event when seeking out of a region', function() {
        video.currentTime = 15;
        jasmine.clock().tick(1000);
        onEvent.calls.reset();

        video.currentTime = 0;
        observer.seeked();
        jasmine.clock().tick(1000);

        expect(onEvent).toHaveBeenCalledTimes(1);
        expectTimelineEvent('timelineregionexit', regionInfo);
      });
    });

    describe('playing', function() {
      beforeEach(function() {
        observer.addTimelineRegion(regionInfo);
        onEvent.calls.reset();
      });

      it('fires an enter/exit event when playing through a region', function() {
        moveToAndExpectEvent(15, 'timelineregionenter', regionInfo);
        moveToAndExpectEvent(25, 'timelineregionexit', regionInfo);
      });

      it('fires an enter/exit event when playing over a region', function() {
        video.currentTime = 25;
        jasmine.clock().tick(1000);

        expect(onEvent).toHaveBeenCalledTimes(2);
        expectTimelineEvent('timelineregionenter', regionInfo, 0);
        expectTimelineEvent('timelineregionexit', regionInfo, 1);
      });

      it('fires an enter/exit event for zero-duration regions', function() {
        var otherInfo = {
          schemeIdUri: 'http://example.com',
          value: 'something',
          startTime: 3,
          endTime: 3,
          id: 'abc',
          eventElement: null
        };
        observer.addTimelineRegion(otherInfo);
        onEvent.calls.reset();

        video.currentTime = 5;
        jasmine.clock().tick(1000);

        expect(onEvent).toHaveBeenCalledTimes(2);
        expectTimelineEvent('timelineregionenter', otherInfo, 0);
        expectTimelineEvent('timelineregionexit', otherInfo, 1);
      });

      it('fires correctly for overlapping regions', function() {
        // |---------|---------|---------|
        // |         |   1     |         |
        // |            |2 |             |
        // |                 | 3  |      |
        // |---------|---------|---------|
        //           10        20        30
        // 1: regionInfo, 2: nestedInfo, 3: overlapInfo

        var nestedInfo = {
          schemeIdUri: 'http://example.com',
          value: 'something',
          startTime: 13,
          endTime: 16,
          id: 'abc',
          eventElement: null
        };
        var overlapInfo = {
          schemeIdUri: 'http://example.com',
          value: 'something',
          startTime: 18,
          endTime: 23,
          id: 'abc',
          eventElement: null
        };
        observer.addTimelineRegion(nestedInfo);
        observer.addTimelineRegion(overlapInfo);
        onEvent.calls.reset();

        video.currentTime = 5;
        jasmine.clock().tick(1000);
        expect(onEvent).not.toHaveBeenCalled();

        moveToAndExpectEvent(12, 'timelineregionenter', regionInfo);
        moveToAndExpectEvent(15, 'timelineregionenter', nestedInfo);
        moveToAndExpectEvent(17, 'timelineregionexit', nestedInfo);
        moveToAndExpectEvent(19, 'timelineregionenter', overlapInfo);
        moveToAndExpectEvent(22, 'timelineregionexit', regionInfo);
        moveToAndExpectEvent(27, 'timelineregionexit', overlapInfo);
      });
    });

    /**
     * @param {string} name
     * @param {shakaExtern.TimelineRegionInfo} info
     * @param {number=} opt_index
     */
    function expectTimelineEvent(name, info, opt_index) {
      var event = onEvent.calls.argsFor(opt_index || 0)[0];
      expect(event.type).toBe(name);
      expect(event.detail).toEqual(info);
    }

    /**
     * @param {number} newTime
     * @param {string} eventName
     * @param {shakaExtern.TimelineRegionInfo} info
     */
    function moveToAndExpectEvent(newTime, eventName, info) {
      video.currentTime = newTime;
      jasmine.clock().tick(1000);

      expect(onEvent).toHaveBeenCalledTimes(1);
      expectTimelineEvent(eventName, info);
      onEvent.calls.reset();
    }
  });

  describe('changing periods', function() {
    beforeEach(function() {
      manifest.periods = [
        {startTime: 0},
        {startTime: 20},
        {startTime: 30}
      ];

      observer = new shaka.media.PlayheadObserver(
          video, manifest, config, onBuffering, onEvent, onChangePeriod);

      // Ignore the call for the initial Period.
      jasmine.clock().tick(1000);
      onChangePeriod.calls.reset();
    });

    it('won\'t call callback while playing inside Period', function() {
      video.currentTime = 0;
      jasmine.clock().tick(1000);

      video.currentTime = 6;
      jasmine.clock().tick(1000);

      video.currentTime = 12;
      jasmine.clock().tick(1000);

      expect(onChangePeriod).not.toHaveBeenCalled();
    });

    it('will call callback when playing into a Period', function() {
      video.currentTime = 6;
      jasmine.clock().tick(1000);

      video.currentTime = 22;
      jasmine.clock().tick(1000);

      expect(onChangePeriod).toHaveBeenCalled();
    });

    it('won\'t call callback when seeking within a Period', function() {
      video.currentTime = 2;
      jasmine.clock().tick(1000);

      video.currentTime = 13;
      observer.seeked();
      jasmine.clock().tick(1000);

      expect(onChangePeriod).not.toHaveBeenCalled();
    });

    it('will call callback when seeking into a different Period', function() {
      video.currentTime = 2;
      jasmine.clock().tick(1000);

      video.currentTime = 25;
      observer.seeked();
      jasmine.clock().tick(1000);

      expect(onChangePeriod).toHaveBeenCalled();
    });

    it('wil call callback when seeking backward into a different Period',
       function() {
         video.currentTime = 26;
         jasmine.clock().tick(1000);
         onChangePeriod.calls.reset();

         video.currentTime = 2;
         observer.seeked();
         jasmine.clock().tick(1000);

         expect(onChangePeriod).toHaveBeenCalled();
       });

    it('will call callback once when seeking over Periods', function() {
      video.currentTime = 2;
      jasmine.clock().tick(1000);

      video.currentTime = 35;
      observer.seeked();
      jasmine.clock().tick(1000);

      expect(onChangePeriod).toHaveBeenCalledTimes(1);
    });
  });
});
