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
  const originalDateNow = Date.now;

  /** @type {!Date} */
  let baseTime;

  beforeEach(function() {
    baseTime = new Date(2015, 11, 30);
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
   * @param {boolean=} autoCorrectDrift
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
      presentationDelay,
      autoCorrectDrift = true) {
    let timeline = new shaka.media.PresentationTimeline(
        presentationStartTime, presentationDelay, autoCorrectDrift);
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
    let timeline = makePresentationTimeline(
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
   * @param {number=} delay
   * @return {shaka.media.PresentationTimeline}
   */
  function makeIprTimeline(duration, delay) {
    let now = Date.now() / 1000;
    let timeline = makePresentationTimeline(
        /* static */ false, duration, /* start time */ now,
        /* availability */ Infinity, /* max seg dur */ 10,
        /* clock offset */ 0, delay || 0);
    expect(timeline.isLive()).toBe(false);
    expect(timeline.isInProgress()).toBe(true);
    return timeline;
  }

  /**
   * Creates a live PresentationTimeline.
   *
   * @param {number} availability
   * @param {number=} delay
   * @param {boolean=} autoCorrectDrift
   * @return {shaka.media.PresentationTimeline}
   */
  function makeLiveTimeline(availability, delay, autoCorrectDrift = true) {
    let now = Date.now() / 1000;
    let timeline = makePresentationTimeline(
        /* static */ false, /* duration */ Infinity, /* start time */ now,
        availability, /* max seg dur */ 10,
        /* clock offset */ 0, delay || 0, autoCorrectDrift);
    expect(timeline.isLive()).toBe(true);
    expect(timeline.isInProgress()).toBe(false);
    return timeline;
  }

  /**
   * Creates a simple, dummy segment reference.
   * @param {number} startTime
   * @param {number} endTime
   * @return {shaka.media.SegmentReference}
   */
  function makeSegmentReference(startTime, endTime) {
      // start and end times are the only fields that matter to
      // PresentationTimeline.
      return new shaka.media.SegmentReference(
          /* position */ 0,
          startTime,
          endTime,
          /* uris */ function() { return []; },
          /* startByte */ 0,
          /* endByte */ null);
  }

  describe('getSegmentAvailabilityStart', function() {
    it('returns 0 for VOD and IPR', function() {
      let timeline1 = makeVodTimeline(/* duration */ 60);
      let timeline2 = makeIprTimeline(/* duration */ 60);

      setElapsed(0);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(100);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);
    });

    it('calculates time for live with finite availability', function() {
      let timeline = makeLiveTimeline(/* availability */ 20);

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
      let timeline = makeLiveTimeline(/* availability */ Infinity);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(61);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);
    });

    it('calculates time based on segment times when available', () => {
      let timeline = makeLiveTimeline(/* availability */ 20);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      // In spite of the current time, the explicit segment times will decide
      // the availability window.
      // See https://github.com/google/shaka-player/issues/999
      setElapsed(1000);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5],
                              /* periodStart */ 0);

      // last segment time (50) - availability (20)
      expect(timeline.getSegmentAvailabilityStart()).toBe(30);
    });

    it('ignores segment times when configured to', () => {
      const timeline = makeLiveTimeline(
          /* availability */ 20, /* drift */ 0, /* autoCorrectDrift */ false);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      setElapsed(100);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5],
                              /* periodStart */ 0);

      // now (100) - max segment duration (10) - availability start time (0)
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });
  });

  describe('getSegmentAvailabilityEnd', function() {
    it('returns duration for VOD', function() {
      let timeline = makeVodTimeline(/* duration */ 60);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(100);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });

    it('calculates time for IPR', function() {
      let timeline = makeIprTimeline(/* duration */ 60);

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
      let timeline1 = makeLiveTimeline(/* availability */ 20);
      let timeline2 = makeLiveTimeline(/* availability */ Infinity);

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

    it('calculates time based on segment times when available', () => {
      let timeline = makeLiveTimeline(/* availability */ 20);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      // In spite of the current time, the explicit segment times will decide
      // the availability window.
      // See https://github.com/google/shaka-player/issues/999
      setElapsed(1000);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5],
                              /* periodStart */ 0);

      // last segment time (50)
      expect(timeline.getSegmentAvailabilityEnd()).toBe(50);
    });
  });

  describe('getDuration', function() {
    it('returns the timeline duration', function() {
      setElapsed(0);
      let timeline1 = makeVodTimeline(/* duration */ 60);
      let timeline2 = makeIprTimeline(/* duration */ 60);
      let timeline3 = makeLiveTimeline(/* availability */ 20);
      let timeline4 = makeLiveTimeline(/* availability */ Infinity);
      expect(timeline1.getDuration()).toBe(60);
      expect(timeline2.getDuration()).toBe(60);
      expect(timeline3.getDuration()).toBe(Infinity);
      expect(timeline4.getDuration()).toBe(Infinity);
    });
  });

  describe('setDuration', function() {
    it('affects availability end for VOD', function() {
      setElapsed(0);
      let timeline = makeVodTimeline(/* duration */ 60);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });

    it('affects availability end for IPR', function() {
      let timeline = makeIprTimeline(/* duration */ 60);

      setElapsed(85);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(75);
    });
  });

  describe('clockOffset', function() {
    it('offsets availability calculations', function() {
      let timeline = makeLiveTimeline(/* availability */ 10);
      setElapsed(11);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      timeline.setClockOffset(5000 /* ms */);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(6);
    });
  });

  describe('getSafeSeekRangeStart', function() {
    it('ignores offset for VOD', function() {
      let timeline = makeVodTimeline(/* duration */ 60);
      expect(timeline.getSafeSeekRangeStart(0)).toBe(0);
      expect(timeline.getSafeSeekRangeStart(10)).toBe(0);
      expect(timeline.getSafeSeekRangeStart(25)).toBe(0);
    });

    it('offsets from live edge', function() {
      let timeline = makeLiveTimeline(/* availability */ 60, /* delay */ 0);

      setElapsed(120);
      // now (120) - availability (60) - segment size (10) = 50
      expect(timeline.getSeekRangeStart()).toBe(50);

      expect(timeline.getSafeSeekRangeStart(10)).toBe(60);
      expect(timeline.getSafeSeekRangeStart(25)).toBe(75);
    });

    it('clamps to end', function() {
      let timeline = makeLiveTimeline(/* availability */ 60, /* delay */ 0);

      setElapsed(120);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(110);
      expect(timeline.getSafeSeekRangeStart(70)).toBe(110);
      expect(timeline.getSafeSeekRangeStart(85)).toBe(110);
      expect(timeline.getSafeSeekRangeStart(200)).toBe(110);
    });

    it('will return 0 if safe', function() {
      let timeline = makeLiveTimeline(/* availability */ 60, /* delay */ 0);

      setElapsed(50);
      // now (50) - availability (60) - segment size (10) = -20
      expect(timeline.getSeekRangeStart()).toBe(0);
      expect(timeline.getSafeSeekRangeStart(0)).toBe(0);
      expect(timeline.getSafeSeekRangeStart(25)).toBe(5);
    });

    it('adjusts segment times to the presentation timeline', () => {
      // All of these segments fit in the availability window.
      let timeline = makeLiveTimeline(/* availability */ 100);

      // A reference from 30-40, + period start 0
      timeline.notifySegments([makeSegmentReference(30, 40)],
                              /* periodStart */ 0);

      // A reference from 0-10, + period start 40
      timeline.notifySegments([makeSegmentReference(0, 10)],
                              /* periodStart */ 40);

      // If we hadn't adjusted for period start, this would be 0.
      expect(timeline.getSeekRangeStart()).toBe(30);
    });

    // Regression test for https://github.com/google/shaka-player/issues/2831
    it('will round up to the nearest ms', () => {
      const timeline = makeVodTimeline(/* duration= */ 60);
      // Seeking to this exact number may result in seeking to slightly less
      // than that, due to rounding.
      timeline.setUserSeekStart(1.458666666666666666666666);
      // So the safe range start should be slightly higher, with fewer digits.
      expect(timeline.getSafeSeekRangeStart(0)).toBe(1.459);
    });
  });

  describe('getSeekRangeEnd', function() {
    it('accounts for delay for live and IPR', function() {
      let timeline1 = makeIprTimeline(/* duration */ 60, /* delay */ 7);
      let timeline2 = makeLiveTimeline(/* duration */ 60, /* delay */ 7);

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

