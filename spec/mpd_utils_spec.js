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

goog.require('shaka.dash.MpdUtils');
goog.require('shaka.dash.mpd');

describe('MpdUtils', function() {
  // Alias.
  var MpdUtils = shaka.dash.MpdUtils;

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();
  });

  afterAll(function() {
    assertsToFailures.uninstall();
  });

  describe('fillUrlTemplate', function() {
    it('handles a single RepresentationID identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      // RepresentationID cannot use a width specifier.
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID%01d$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$RepresentationID$.mp4');
    });

    it('handles a single Number identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Number$.mp4',
              null, 100, null, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Number%05d$.mp4',
              null, 100, null, null).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Number$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Number$.mp4');
    });

    it('handles a single Bandwidth identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, 100, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth%05d$.mp4',
              null, null, 100, null).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Bandwidth$.mp4');
    });

    it('handles a single Time identifier', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time$.mp4',
              null, null, null, 100).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time%05d$.mp4',
              null, null, null, 100).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Time$.mp4');
    });

    it('handles multiple identifiers', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$_$Number$_$Bandwidth$_$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1_2_3_4.mp4');

      // No spaces.
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID$$Number$$Bandwidth$$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1234.mp4');

      // Different order.
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/3_4_1_2.mp4');

      // Single width.
      expect(
          MpdUtils.fillUrlTemplate(
              '$RepresentationID$_$Number%01d$_$Bandwidth%01d$_$Time%01d$',
              1, 2, 3, 400).toString()).toBe('1_2_3_400');

      // Different widths.
      expect(
          MpdUtils.fillUrlTemplate(
              '$RepresentationID$_$Number%02d$_$Bandwidth%02d$_$Time%02d$',
              1, 2, 3, 4).toString()).toBe('1_02_03_04');

      // Double $$.
      expect(
          MpdUtils.fillUrlTemplate(
              '$$/$RepresentationID$$$$Number$$$$Bandwidth$$$$Time$$$.$$',
              1, 2, 3, 4).toString()).toBe('$/1$2$3$4$.$');
    });

    it('handles invalid identifiers', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Garbage$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$RepresentationID%$',
              1, 2, 3, 4)).toBeNull();
    });

    it('handles partial identifiers', function() {
      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Time.mp4');

      expect(
          MpdUtils.fillUrlTemplate(
              '/example/$Time%.mp4',
              1, 2, 3, 4)).toBeNull();
    });
  });

  describe('createTimeline', function() {
    it('works in normal case', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(10, 10, 0),
        createTimepoint(20, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles null start time', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(null, 10, 0),
        createTimepoint(null, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles gaps', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(15, 10, 0)
      ];
      var result = [
        { start: 0, end: 15 },
        { start: 15, end: 25 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles overlap', function() {
      var timepoints = [
        createTimepoint(0, 15, 0),
        createTimepoint(10, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles repetitions', function() {
      var timepoints = [
        createTimepoint(0, 10, 5),
        createTimepoint(60, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 30, end: 40 },
        { start: 40, end: 50 },
        { start: 50, end: 60 },
        { start: 60, end: 70 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles null repeat', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(10, 10, null),
        createTimepoint(20, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles repetitions with gap', function() {
      var timepoints = [
        createTimepoint(0, 10, 2),
        createTimepoint(35, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 35 },
        { start: 35, end: 45 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles negative repetitions', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(10, 10, -1),
        createTimepoint(40, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 30, end: 40 },
        { start: 40, end: 50 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles negative repetitions with uneven border', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(10, 10, -1),
        createTimepoint(45, 5, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 30, end: 40 },
        { start: 40, end: 45 },
        { start: 45, end: 50 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    it('handles negative repetitions at end', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(10, 5, -1)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 15 },
        { start: 15, end: 20 },
        { start: 20, end: 25 }
      ];
      checkTimepoints(timepoints, result, 1, 25);
    });

    it('ignores elements after null duration', function() {
      var timepoints = [
        createTimepoint(0, 10, 0),
        createTimepoint(10, 10, 0),
        createTimepoint(20, null, 0),
        createTimepoint(30, 10, 0),
        createTimepoint(40, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 }
      ];
      checkTimepoints(timepoints, result, 1, 0);
    });

    /**
     * Creates a new timepoint.
     *
     * @param {?number} start
     * @param {?number} dur
     * @param {?number} rep
     */
    function createTimepoint(start, dur, rep) {
      var ret = new shaka.dash.mpd.SegmentTimePoint();
      ret.startTime = start;
      ret.duration = dur;
      ret.repeat = rep;
      return ret;
    }

    /**
     * Checks that the createTimeline works with the given timepoints and the
     * given expected results.
     *
     * @param {!Array.<!shaka.dash.mpd.TimePoint>} points
     * @param {!Array.<{start: number, end: number}} expected
     * @param {number} scale
     * @param {number} duration
     */
    function checkTimepoints(points, expected, scale, duration) {
      var timeline = new shaka.dash.mpd.SegmentTimeline();
      timeline.timePoints = points;

      var data = MpdUtils.createTimeline(timeline, scale, duration);
      expect(data).toBeTruthy();
      expect(data.length).toBe(expected.length);
      for (var i = 0; i < expected.length; i++) {
        expect(data[i].start).toBe(expected[i].start);
        expect(data[i].end).toBe(expected[i].end);
      }
    }
  });
});

