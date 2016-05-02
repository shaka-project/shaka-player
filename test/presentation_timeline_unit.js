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
  var infinity;

  beforeEach(function() {
    baseTime = new Date(2015, 11, 30);
    originalDateNow = Date.now;
    Date.now = function() { return baseTime.getTime(); };
    infinity = Number.POSITIVE_INFINITY;
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
   * @param {number} duration
   * @param {?number} presentationStartTime
   * @param {number} segmentAvailabilityDuration
   * @param {number} maxSegmentDuration
   * @param {number} clockOffset
   *
   * @return {shaka.media.PresentationTimeline}
   */
  function makePresentationTimeline(
      duration,
      presentationStartTime,
      segmentAvailabilityDuration,
      maxSegmentDuration,
      clockOffset) {
    var timeline = new shaka.media.PresentationTimeline(presentationStartTime);
    timeline.setDuration(duration || infinity);
    timeline.setSegmentAvailabilityDuration(segmentAvailabilityDuration);
    timeline.notifyMaxSegmentDuration(maxSegmentDuration);
    timeline.setClockOffset(clockOffset);
    return timeline;
  }

  describe('getSegmentAvailabilityStart', function() {
    it('returns 0 for VOD', function() {
      setElapsed(0);
      var timeline1 = makePresentationTimeline(
          60, null, infinity, 10, 0);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(0);
      var timeline2 = makePresentationTimeline(
          infinity, null, infinity, 10, 0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);
    });

    it('returns the correct time for live without duration', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          infinity, Date.now() / 1000.0, 20, 10, 0);
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

    it('returns the correct time for live with duration', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          60, Date.now() / 1000.0, 20, 10, 0);
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
      expect(timeline.getSegmentAvailabilityStart()).toBe(40);
    });

    it('returns the correct time for live with inf. availability', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          60, Date.now() / 1000.0, infinity, 10, 0);
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
      setElapsed(0);
      var timeline1 = makePresentationTimeline(
          60, null, infinity, 10, 0);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(0);
      var timeline2 = makePresentationTimeline(
          infinity, null, infinity, 10, 0);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(infinity);
    });

    it('returns the correct time for live without duration', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          infinity, Date.now() / 1000.0, 20, 10, 0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

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

      setElapsed(71);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(61);
    });

    it('returns the correct time for live with duration', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          60, Date.now() / 1000.0, 20, 10, 0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(11);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(69);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(70);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      // The seek window should stop.
      // TODO: Check if real encoders serve the end of a live stream
      // indefinitely or close the availability window entirely.
      setElapsed(71);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });
  });

  describe('getDuration', function() {
    it('returns the correct value for VOD', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          60, null, infinity, 10, 0);
      expect(timeline.getDuration()).toBe(60);

      timeline = makePresentationTimeline(
          infinity, null, infinity, 10, 0);
      expect(timeline.getDuration()).toBe(infinity);
    });

    it('returns the correct value for live', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          60, Date.now() / 1000.0, 20, 10, 0);
      expect(timeline.getDuration()).toBe(60);

      timeline = makePresentationTimeline(
          infinity, Date.now() / 1000.0, 20, 10, 0);
      expect(timeline.getDuration()).toBe(infinity);
    });
  });

  describe('setDuration', function() {
    it('affects VOD', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          60, null, infinity, 10, 0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });

    it('affects live', function() {
      setElapsed(0);
      var timeline = makePresentationTimeline(
          infinity, Date.now() / 1000.0, 20, 10, 0);

      setElapsed(40);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(30);

      setElapsed(100);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);

      timeline.setDuration(60);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });
  });

  it('getSegmentAvailabilityDuration', function() {
    setElapsed(0);
    var timeline = makePresentationTimeline(
        60, null, infinity, 10, 0);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(infinity);

    timeline = makePresentationTimeline(
        infinity, Date.now() / 1000.0, 20, 10, 0);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(20);

    timeline = makePresentationTimeline(
        infinity, Date.now() / 1000.0, infinity, 10, 0);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(infinity);
  });

  it('setSegmentAvailabilityDuration', function() {
    setElapsed(0);
    var timeline = makePresentationTimeline(
        60, null, infinity, 10, 0);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(infinity);

    timeline = makePresentationTimeline(
        infinity, Date.now() / 1000.0, 20, 10, 0);
    timeline.setSegmentAvailabilityDuration(7);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(7);

    timeline = makePresentationTimeline(
        infinity, Date.now() / 1000.0, 20, 10, 0);
    timeline.setSegmentAvailabilityDuration(infinity);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(infinity);

    timeline = makePresentationTimeline(
        60, null, infinity, 10, 0);
    timeline.setSegmentAvailabilityDuration(infinity);
    expect(timeline.getSegmentAvailabilityDuration()).toBe(infinity);
  });

  it('clockOffset', function() {
    // setElapsed sets the local clock.  The server is 10 seconds ahead so it
    // should return 10.
    setElapsed(0);
    var timeline = makePresentationTimeline(
        infinity, Date.now() / 1000.0, 10, 5, 10000);
    expect(timeline.getSegmentAvailabilityEnd()).toBeCloseTo(5);
  });
});

