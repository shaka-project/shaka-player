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
  /** @const */
  var MpdUtils = shaka.dash.MpdUtils;

  describe('fillUriTemplate', function() {
    it('handles a single RepresentationID identifier', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$.mp4',
              '100', null, null, null).toString()).toBe('/example/100.mp4');

      // RepresentationID cannot use a width specifier.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID%01d$.mp4',
              '100', null, null, null).toString()).toBe('/example/100.mp4');

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
              '1', 2, 3, 4).toString()).toBe('/example/1_2_3_4.mp4');

      // No spaces.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$$Number$$Bandwidth$$Time$.mp4',
              '1', 2, 3, 4).toString()).toBe('/example/1234.mp4');

      // Different order.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4',
              '1', 2, 3, 4).toString()).toBe('/example/3_4_1_2.mp4');

      // Single width.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%01d$_$Bandwidth%01d$_$Time%01d$',
              '1', 2, 3, 400).toString()).toBe('1_2_3_400');

      // Different widths.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%02d$_$Bandwidth%02d$_$Time%02d$',
              '1', 2, 3, 4).toString()).toBe('1_02_03_04');

      // Double $$.
      expect(
          MpdUtils.fillUriTemplate(
              '$$/$RepresentationID$$$$Number$$$$Bandwidth$$$$Time$$$.$$',
              '1', 2, 3, 4).toString()).toBe('$/1$2$3$4$.$');
    });

    it('handles invalid identifiers', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Garbage$.mp4',
              '1', 2, 3, 4).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time.mp4',
              '1', 2, 3, 4).toString()).toBe('/example/$Time.mp4');
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

  describe('processXlinks', function() {
    /** @const */
    var Error = shaka.util.Error;

    /** @type {!shaka.test.FakeNetworkingEngine} */
    var fakeNetEngine;
    /** @type {shakaExtern.RetryParameters} */
    var retry;
    /** @type {!DOMParser} */
    var parser;
    /** @type {boolean} */
    var failGracefully;

    beforeEach(function() {
      failGracefully = false;
      retry = shaka.net.NetworkingEngine.defaultRetryParameters();
      fakeNetEngine = new shaka.test.FakeNetworkingEngine();
      parser = new DOMParser();
    });

    it('will replace elements and children', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      var xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      var desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testSucceeds(baseXMLString, desiredXMLString, 1, done);
    });

    it('preserves non-xlink attributes', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace otherVariable="q" xlink:href="https://xlink1" ' +
          'xlink:actuate="onLoad" />');
      var xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      var desiredXMLString = inBaseContainer(
          '<ToReplace otherVariable="q" variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testSucceeds(baseXMLString, desiredXMLString, 1, done);
    });

    it('preserves text', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      var xlinkXMLString =
          '<ToReplace variable="1">TEXT CONTAINED WITHIN</ToReplace>';
      var desiredXMLString = inBaseContainer(
          '<ToReplace variable="1">TEXT CONTAINED WITHIN</ToReplace>');

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testSucceeds(baseXMLString, desiredXMLString, 1, done);
    });

    it('supports multiple replacements', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />',
          '<ToReplace xlink:href="https://xlink2" xlink:actuate="onLoad" />');
      var xlinkXMLString1 = makeRecursiveXMLString(1, 'https://xlink3');
      var xlinkXMLString2 = '<ToReplace variable="2"><Contents /></ToReplace>';
      var xlinkXMLString3 = '<ToReplace otherVariable="blue" />';
      var desiredXMLString = inBaseContainer(
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<ToReplace otherVariable="blue" /></ToReplace>',
          '<ToReplace variable="2"><Contents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText({
        'https://xlink1': xlinkXMLString1,
        'https://xlink2': xlinkXMLString2,
        'https://xlink3': xlinkXMLString3});
      testSucceeds(baseXMLString, desiredXMLString, 3, done);
    });

    it('fails if loaded file is invalid xml', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      // Note this does not have a close angle bracket.
      var xlinkXMLString = '<ToReplace></ToReplace';
      var expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_INVALID_XML, 'https://xlink1');

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testFails(baseXMLString, expectedError, 1, done);
    });

    it('fails if it recurses too many times', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      // Create a large but finite number of links, so this won't
      // infinitely recurse if there isn't a depth limit.
      var responseMap = {};
      for (var i = 1; i < 20; i++) {
        responseMap['https://xlink' + i] =
            makeRecursiveXMLString(0, 'https://xlink' + (i + 1) + '');
      }
      var expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_XLINK_DEPTH_LIMIT);

      fakeNetEngine.setResponseMapAsText(responseMap);
      testFails(baseXMLString, expectedError, 5, done);
    });

    it('preserves url parameters', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1?parameter" ' +
          'xlink:actuate="onLoad" />');
      var xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      var desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText(
          {'https://xlink1?parameter': xlinkXMLString});
      testSucceeds(baseXMLString, desiredXMLString, 1, done);
    });

    it('replaces existing contents', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<Unwanted /></ToReplace>');
      var xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      var desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testSucceeds(baseXMLString, desiredXMLString, 1, done);
    });

    it('handles relative links', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="xlink1" xlink:actuate="onLoad" />',
          '<ToReplace xlink:href="xlink2" xlink:actuate="onLoad" />');
      var xlinkXMLString1 = // This is loaded relative to base.
          makeRecursiveXMLString(1, 'xlink3');
      var xlinkXMLString2 = // This is loaded relative to base.
          '<ToReplace variable="2"><Contents /></ToReplace>';
      var xlinkXMLString3 = // This is loaded relative to string1.
          '<ToReplace variable="3" />';
      var responseMap = {};
      responseMap['https://base/xlink1'] = xlinkXMLString1;
      responseMap['https://base/xlink2'] = xlinkXMLString2;
      responseMap['https://base/xlink3'] = xlinkXMLString3;
      var desiredXMLString = inBaseContainer(
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<ToReplace variable="3" /></ToReplace>',
          '<ToReplace variable="2"><Contents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText(responseMap);
      testSucceeds(baseXMLString, desiredXMLString, 3, done);
    });

    it('fails for actuate=onRequest', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" ' +
          'xlink:actuate="onRequest" />');
      var xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      var expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testFails(baseXMLString, expectedError, 0, done);
    });

    it('fails for no actuate', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" />');
      var xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      var expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testFails(baseXMLString, expectedError, 0, done);
    });

    it('removes elements with resolve-to-zero', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="urn:mpeg:dash:resolve-to-zero:2013" />');
      var desiredXMLString = inBaseContainer();

      testSucceeds(baseXMLString, desiredXMLString, 0, done);
    });

    it('needs the top-level to match the link\'s tagName', function(done) {
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      var xlinkXMLString = '<BadTagName</BadTagName>';

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testFails(baseXMLString, null, 1, done);
    });

    it('doesn\'t error when set to fail gracefully', function(done) {
      failGracefully = true;
      var baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<DefaultContents />' +
          '</ToReplace>');
      var xlinkXMLString = '<BadTagName</BadTagName>';
      var desiredXMLString = inBaseContainer(
          '<ToReplace><DefaultContents /></ToReplace>');

      fakeNetEngine.setResponseMapAsText({'https://xlink1': xlinkXMLString});
      testSucceeds(baseXMLString, desiredXMLString, 1, done);
    });

    function testSucceeds(
        baseXMLString, desiredXMLString, desiredNetCalls, done) {
      var desiredXML = parser.parseFromString(desiredXMLString, 'text/xml')
          .documentElement;
      testRequest(baseXMLString).then(function(finalXML) {
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
        expect(finalXML).toEqualElement(desiredXML);
        return Promise.resolve();
      }).catch(fail).then(done);
    }

    function testFails(baseXMLString, desiredError, desiredNetCalls, done) {
      testRequest(baseXMLString).then(fail).catch(function(error) {
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
        if (desiredError)
          shaka.test.Util.expectToEqualError(error, desiredError);
        return Promise.resolve();
      }).then(done);
    }

    /**
    * Creates an XML string with an xlink link to another URL,
    * for use in testing recursive chains of xlink links.
    * @param {number} variable
    * @param {string} link
    * @return {string}
    * @private
    */
    function makeRecursiveXMLString(variable, link) {
      var format =
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="%(var)s">' +
          '<ToReplace xlink:href="%(link)s" xlink:actuate="onLoad" />' +
          '</ToReplace>';
      return sprintf(format, {var : variable, link : link});
    }

    /**
     * @param {string=} opt_toReplaceOne
     * @param {string=} opt_toReplaceTwo
     * @return {string}
     * @private
     */
    function inBaseContainer(opt_toReplaceOne, opt_toReplaceTwo) {
      var format =
          '<Container xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink">' +
          '<Thing>' +
          '%(toReplaceOne)s' +
          '</Thing>' +
          '%(toReplaceTwo)s' +
          '</Container>';
      return sprintf(format, {
        toReplaceOne: opt_toReplaceOne || '',
        toReplaceTwo: opt_toReplaceTwo || ''});
    }

    function testRequest(baseXMLString) {
      var xml = parser.parseFromString(baseXMLString, 'text/xml')
          .documentElement;
      return MpdUtils.processXlinks(xml, retry, failGracefully, 'https://base',
                                    fakeNetEngine);
    }
  });
});
