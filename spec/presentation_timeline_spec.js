/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.media.PresentationTimeline');

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

  describe('getSegmentAvailabilityStart', function() {
    it('returns 0 for VOD', function() {
      setElapsed(0);
      var timeline1 = new shaka.media.PresentationTimeline(60, null, null);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(0);
      var timeline2 = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, null, null);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);
    });

    it('returns the correct time for live without duration', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, Date.now() / 1000.0, 20);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(19);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(20);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(21);
      expect(timeline.getSegmentAvailabilityStart()).toBe(1);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityStart()).toBe(39);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityStart()).toBe(40);

      setElapsed(61);
      expect(timeline.getSegmentAvailabilityStart()).toBe(41);
    });

    it('returns the correct time for live with duration', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          60, Date.now() / 1000.0, 20);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(19);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(20);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(21);
      expect(timeline.getSegmentAvailabilityStart()).toBe(1);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityStart()).toBe(39);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityStart()).toBe(40);

      setElapsed(61);
      expect(timeline.getSegmentAvailabilityStart()).toBe(40);
    });

    it('returns the correct time for live with inf. availability', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          60, Date.now() / 1000.0, Number.POSITIVE_INFINITY);
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
      var timeline1 = new shaka.media.PresentationTimeline(60, null, null);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(0);
      var timeline2 = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, null, null);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(
          Number.POSITIVE_INFINITY);
    });

    it('returns the correct time for live without duration', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, Date.now() / 1000.0, 20);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(1);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(61);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(61);
    });

    it('returns the correct time for live with duration', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          60, Date.now() / 1000.0, 20);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(1);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      // The seek window should stop.
      // TODO: Check if real encoders serve the end of a live stream
      // indefinitely or close the availability window entirely.
      setElapsed(61);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });
  });

  describe('hasEnded', function() {
    var longDuration = 5 * 365 * 24 * 60 * 60;  // 5 years.

    it('returns false for VOD', function() {
      setElapsed(0);
      var timeline1 = new shaka.media.PresentationTimeline(60, null, null);
      expect(timeline1.hasEnded()).toBe(false);

      setElapsed(longDuration);
      expect(timeline1.hasEnded()).toBe(false);

      setElapsed(0);
      var timeline2 = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, null, null);
      expect(timeline2.hasEnded()).toBe(false);

      setElapsed(longDuration);
      expect(timeline2.hasEnded()).toBe(false);
    });

    it('returns the correct value for live without duration', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, Date.now() / 1000.0, 20);
      expect(timeline.hasEnded()).toBe(false);

      setElapsed(longDuration);
      expect(timeline.hasEnded()).toBe(false);
    });

    it('returns the correct value for live with duration', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          60, Date.now() / 1000.0, 20);
      expect(timeline.hasEnded()).toBe(false);

      setElapsed(59);
      expect(timeline.hasEnded()).toBe(false);

      setElapsed(60);
      expect(timeline.hasEnded()).toBe(true);

      setElapsed(61);
      expect(timeline.hasEnded()).toBe(true);
    });
  });

  describe('setDuration', function() {
    it('affects VOD', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(60, null, null);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });

    it('affects live', function() {
      setElapsed(0);
      var timeline = new shaka.media.PresentationTimeline(
          Number.POSITIVE_INFINITY, Date.now() / 1000.0, 20);
      expect(timeline.hasEnded()).toBe(false);

      setElapsed(61);
      expect(timeline.hasEnded()).toBe(false);

      timeline.setDuration(60);
      expect(timeline.hasEnded()).toBe(true);
    });
  });
});

