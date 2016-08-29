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

describe('PresentationTimeline', function() {
  var originalDateNow;
  var baseTime;

  beforeEach(function() {
    baseTime = new Date(2015, 11, 30);
    originalDateNow = Date.now;
    Date.now = function() { return baseTime.getTime(); };
  });

  afterEach(function() {
    Date.now = originalDateNow;
  });

  function setElapsed(secondsSinceBaseTime) {
    Date.now = function() {
      return baseTime.getTime() + (secondsSinceBaseTime * 1000);
    };
  }

  /**
   * Creates a PresentationTimeline.
   *
   * @param {boolean} isStatic
   * @param {number} duration
   * @param {?number} presentationStartTime
   * @param {number} segmentAvailabilityDuration
   * @param {number} maxSegmentDuration
   * @param {number} clockOffset
   * @param {number} presentationDelay
   *
   * @return {shaka.media.PresentationTimeline}
   */
  function makePresentationTimeline(
      isStatic,
      duration,
      presentationStartTime,
      segmentAvailabilityDuration,
      maxSegmentDuration,
      clockOffset,
      presentationDelay) {
    var timeline = new shaka.media.PresentationTimeline(
        presentationStartTime, presentationDelay);
    timeline.setStatic(isStatic);
    timeline.setDuration(duration || Infinity);
    timeline.setSegmentAvailabilityDuration(segmentAvailabilityDuration);
    timeline.notifyMaxSegmentDuration(maxSegmentDuration);
    timeline.setClockOffset(clockOffset);
    timeline.assertIsValid();
    return timeline;
  }

  /**
   * Creates a VOD PresentationTimeline.
   *
   * @param {number} duration
   * @return {shaka.media.PresentationTimeline}
   */
  function makeVodTimeline(duration) {
    var timeline = makePresentationTimeline(
        /* static */ true, duration, /* start time */ null,
        /* availability */ Infinity, /* max seg dur */ 10,
        /* clock offset */ 0, /* presentation delay */ 0);
    expect(timeline.isLive()).toBe(false);
    expect(timeline.isInProgress()).toBe(false);
    return timeline;
  }

  /**
   * Creates a IPR PresentationTimeline.
   *
   * @param {number} duration
   * @param {number=} opt_delay
   * @return {shaka.media.PresentationTimeline}
   */
  function makeIprTimeline(duration, opt_delay) {
    var now = Date.now() / 1000;
    var timeline = makePresentationTimeline(
        /* static */ false, duration, /* start time */ now,
        /* availability */ Infinity, /* max seg dur */ 10,
        /* clock offset */ 0, opt_delay || 0);
    expect(timeline.isLive()).toBe(false);
    expect(timeline.isInProgress()).toBe(true);
    return timeline;
  }

  /**
   * Creates a live PresentationTimeline.
   *
   * @param {number} availability
   * @param {number=} opt_delay
   * @return {shaka.media.PresentationTimeline}
   */
  function makeLiveTimeline(availability, opt_delay) {
    var now = Date.now() / 1000;
    var timeline = makePresentationTimeline(
        /* static */ false, /* duration */ Infinity, /* start time */ now,
        availability, /* max seg dur */ 10,
        /* clock offset */ 0, opt_delay || 0);
    expect(timeline.isLive()).toBe(true);
    expect(timeline.isInProgress()).toBe(false);
    return timeline;
  }

  describe('getSegmentAvailabilityStart', function() {
    it('returns 0 for VOD and IPR', function() {
      var timeline1 = makeVodTimeline(/* duration */ 60);
      var timeline2 = makeIprTimeline(/* duration */ 60);

      setElapsed(0);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(100);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);
    });

    it('calculates time for live with finite availability', function() {
      var timeline = makeLiveTimeline(/* availability */ 20);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(29);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(30);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(31);
      expect(timeline.getSegmentAvailabilityStart()).toBe(1);

      setElapsed(69);
      expect(timeline.getSegmentAvailabilityStart()).toBe(39);

      setElapsed(70);
      expect(timeline.getSegmentAvailabilityStart()).toBe(40);

      setElapsed(71);
      expect(timeline.getSegmentAvailabilityStart()).toBe(41);
    });

    it('calculates time for live with infinite availability', function() {
      var timeline = makeLiveTimeline(/* availability */ Infinity);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(61);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);
    });
  });

  describe('getSegmentAvailabilityEnd', function() {
    it('returns duration for VOD', function() {
      var timeline = makeVodTimeline(/* duration */ 60);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(100);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });

    it('calculates time for IPR', function() {
      var timeline = makeIprTimeline(/* duration */ 60);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(10);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(11);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(69);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(70);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(100);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });

    it('calculates time for live', function() {
      var timeline1 = makeLiveTimeline(/* availability */ 20);
      var timeline2 = makeLiveTimeline(/* availability */ Infinity);

      setElapsed(0);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(0);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(10);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(0);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(11);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(1);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(69);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(59);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(70);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(60);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(71);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(61);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(61);
    });
  });

  describe('getDuration', function() {
    it('returns the timeline duration', function() {
      setElapsed(0);
      var timeline1 = makeVodTimeline(/* duration */ 60);
      var timeline2 = makeIprTimeline(/* duration */ 60);
      var timeline3 = makeLiveTimeline(/* availability */ 20);
      var timeline4 = makeLiveTimeline(/* availability */ Infinity);
      expect(timeline1.getDuration()).toBe(60);
      expect(timeline2.getDuration()).toBe(60);
      expect(timeline3.getDuration()).toBe(Infinity);
      expect(timeline4.getDuration()).toBe(Infinity);
    });
  });

  describe('setDuration', function() {
    it('affects availability end for VOD', function() {
      setElapsed(0);
      var timeline = makeVodTimeline(/* duration */ 60);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });

    it('affects availability end for IPR', function() {
      var timeline = makeIprTimeline(/* duration */ 60);

      setElapsed(85);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(75);
    });
  });

  describe('getSegmentAvailabilityDuration', function() {
    it('returns the availability duration', function() {
      setElapsed(0);
      var timeline1 = makeVodTimeline(/* duration */ 60);
      var timeline2 = makeIprTimeline(/* duration */ 60);
      var timeline3 = makeLiveTimeline(/* availability */ 20);
      var timeline4 = makeLiveTimeline(/* availability */ Infinity);
      expect(timeline1.getSegmentAvailabilityDuration()).toBe(Infinity);
      expect(timeline2.getSegmentAvailabilityDuration()).toBe(Infinity);
      expect(timeline3.getSegmentAvailabilityDuration()).toBe(20);
      expect(timeline4.getSegmentAvailabilityDuration()).toBe(Infinity);
    });
  });

  describe('setSegmentAvailabilityDuration', function() {
    it('alters the availability duration', function() {
      setElapsed(0);
      var timeline = makeLiveTimeline(/* availability */ Infinity);
      expect(timeline.getSegmentAvailabilityDuration()).toBe(Infinity);

      timeline.setSegmentAvailabilityDuration(7);
      expect(timeline.getSegmentAvailabilityDuration()).toBe(7);

      timeline.setSegmentAvailabilityDuration(Infinity);
      expect(timeline.getSegmentAvailabilityDuration()).toBe(Infinity);

      timeline.setSegmentAvailabilityDuration(20);
      expect(timeline.getSegmentAvailabilityDuration()).toBe(20);
    });
  });

  describe('clockOffset', function() {
    it('offsets availability calculations', function() {
      var timeline = makeLiveTimeline(/* availability */ 10);
      setElapsed(11);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      timeline.setClockOffset(5000 /* ms */);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(6);
    });
  });

  describe('getSeekRangeEnd', function() {
    it('accounts for delay for live and IPR', function() {
      var timeline1 = makeIprTimeline(/* duration */ 60, /* delay */ 7);
      var timeline2 = makeLiveTimeline(/* duration */ 60, /* delay */ 7);

      setElapsed(11);
      expect(timeline1.getSeekRangeEnd()).toBe(0);
      expect(timeline2.getSeekRangeEnd()).toBe(0);

      setElapsed(18);
      expect(timeline1.getSeekRangeEnd()).toBe(1);
      expect(timeline2.getSeekRangeEnd()).toBe(1);

      setElapsed(37);
      expect(timeline1.getSeekRangeEnd()).toBe(20);
      expect(timeline2.getSeekRangeEnd()).toBe(20);
    });
  });
});

