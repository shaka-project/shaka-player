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

describe('MpdUtils', function() {
  var MpdUtils;

  beforeAll(function() {
    MpdUtils = shaka.dash.MpdUtils;
  });

  describe('fillUriTemplate', function() {
    it('handles a single RepresentationID identifier', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      // RepresentationID cannot use a width specifier.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID%01d$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$RepresentationID$.mp4');
    });

    it('handles a single Number identifier', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Number$.mp4',
              null, 100, null, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Number%05d$.mp4',
              null, 100, null, null).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Number$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Number$.mp4');
    });

    it('handles a single Bandwidth identifier', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, 100, null).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth%05d$.mp4',
              null, null, 100, null).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Bandwidth$.mp4');
    });

    it('handles a single Time identifier', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time$.mp4',
              null, null, null, 100).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time%05d$.mp4',
              null, null, null, 100).toString()).toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Time$.mp4');
    });

    it('handles rounding errors for calculated Times', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time$.mp4',
              null, null, null, 100.0001).toString()).toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time%05d$.mp4',
              null, null, null, 99.9999).toString()).toBe('/example/00100.mp4');
    });

    it('handles multiple identifiers', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$_$Number$_$Bandwidth$_$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1_2_3_4.mp4');

      // No spaces.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$$Number$$Bandwidth$$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1234.mp4');

      // Different order.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/3_4_1_2.mp4');

      // Single width.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%01d$_$Bandwidth%01d$_$Time%01d$',
              1, 2, 3, 400).toString()).toBe('1_2_3_400');

      // Different widths.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%02d$_$Bandwidth%02d$_$Time%02d$',
              1, 2, 3, 4).toString()).toBe('1_02_03_04');

      // Double $$.
      expect(
          MpdUtils.fillUriTemplate(
              '$$/$RepresentationID$$$$Number$$$$Bandwidth$$$$Time$$$.$$',
              1, 2, 3, 4).toString()).toBe('$/1$2$3$4$.$');
    });

    it('handles invalid identifiers', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Garbage$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Time.mp4');
    });
  });

  describe('createTimeline', function() {
    it('works in normal case', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles null start time', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(null, 10, 0),
        createTimePoint(null, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles gaps', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(15, 10, 0)
      ];
      var result = [
        { start: 0, end: 15 },
        { start: 15, end: 25 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles overlap', function() {
      var timePoints = [
        createTimePoint(0, 15, 0),
        createTimePoint(10, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles repetitions', function() {
      var timePoints = [
        createTimePoint(0, 10, 5),
        createTimePoint(60, 10, 0)
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
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles null repeat', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, null),
        createTimePoint(20, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles repetitions with gap', function() {
      var timePoints = [
        createTimePoint(0, 10, 2),
        createTimePoint(35, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 35 },
        { start: 35, end: 45 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(40, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 30, end: 40 },
        { start: 40, end: 50 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions with uneven border', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(45, 5, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 30, end: 40 },
        { start: 40, end: 45 },
        { start: 45, end: 50 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions w/ bad next start time', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(5, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions w/ null next start time', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(null, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions at end', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 5, -1)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 15 },
        { start: 15, end: 20 },
        { start: 20, end: 25 }
      ];
      checkTimePoints(timePoints, result, 1, 0, 25);
    });

    it('handles negative repetitions at end w/o Period length', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 5, -1)
      ];
      var result = [
        { start: 0, end: 10 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions at end w/ bad Period length', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(25, 5, -1)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 }
      ];
      checkTimePoints(timePoints, result, 1, 0, 20);
    });

    it('ignores elements after null duration', function() {
      var timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, null, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 }
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('adjust start with presentationTimeOffset', function() {
      var timePoints = [
        createTimePoint(10, 10, 0),
        createTimePoint(20, 10, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0)
      ];
      var result = [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 30, end: 40 }
      ];
      checkTimePoints(timePoints, result, 1, 10, Infinity);
    });
    /**
     * Creates a new TimePoint.
     *
     * @param {?number} t
     * @param {?number} d
     * @param {?number} r
     * @return {{t: ?number, d: ?number, r: ?number}}
     */
    function createTimePoint(t, d, r) {
      return { t: t, d: d, r: r };
    }

    /**
     * Checks that the createTimeline works with the given timePoints and the
     * given expected results.
     *
     * @param {!Array.<{t: ?number, d: ?number, r: ?number}>} points
     * @param {!Array.<{start: number, end: number}>} expected
     * @param {number} timescale
     * @param {number} presentationTimeOffset
     * @param {number} periodDuration
     */
    function checkTimePoints(points, expected, timescale,
        presentationTimeOffset, periodDuration) {
      // Construct a SegmentTimeline Node object.
      var xmlLines = ['<?xml version="1.0"?>', '<SegmentTimeline>'];
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        xmlLines.push('<S' +
                      (p.t != null ? ' t="' + p.t + '"' : '') +
                      (p.d != null ? ' d="' + p.d + '"' : '') +
                      (p.r != null ? ' r="' + p.r + '"' : '') +
                      ' />');
      }
      xmlLines.push('</SegmentTimeline>');
      var parser = new DOMParser();
      var xml = parser.parseFromString(xmlLines.join('\n'), 'application/xml');
      var segmentTimeline = xml.documentElement;
      console.assert(segmentTimeline);

      var timeline = MpdUtils.createTimeline(
          segmentTimeline, timescale, presentationTimeOffset, periodDuration);

      expect(timeline).toBeTruthy();
      expect(timeline.length).toBe(expected.length);
      for (var i = 0; i < expected.length; i++) {
        expect(timeline[i].start).toBe(expected[i].start);
        expect(timeline[i].end).toBe(expected[i].end);
      }
    }
  });

  describe('resolveUris', function() {
    it('resolves relative URIs', function() {
      var base = ['http://example.com/'];
      var relative = ['page.html'];
      var expected = ['http://example.com/page.html'];
      var actual = MpdUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('resolves URIs multiplicatively', function() {
      var base = ['http://example.com/', 'http://example.org'];
      var relative = ['page.html', 'site.css'];
      var expected = [
        'http://example.com/page.html',
        'http://example.com/site.css',
        'http://example.org/page.html',
        'http://example.org/site.css'
      ];
      var actual = MpdUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('returns base if no relative URIs', function() {
      var base = ['http://example.com'];
      var relative = [];
      var actual = MpdUtils.resolveUris(base, relative);
      expect(actual).toEqual(base);
    });

    it('handles manifest file as base URI', function() {
      var base = [
        'http://example.com/manifest.mpd',
        'http://example.org/path/to/manifest.mpd'
      ];
      var relative = ['segment.mp4', 'other/location/segment.webm'];
      var expected = [
        'http://example.com/segment.mp4',
        'http://example.com/other/location/segment.webm',
        'http://example.org/path/to/segment.mp4',
        'http://example.org/path/to/other/location/segment.webm'
      ];
      var actual = MpdUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });
  });
});
