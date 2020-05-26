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
  const MpdUtils = shaka.dash.MpdUtils;

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

    it('handles non-decimal format specifiers', function() {
      expect(
          MpdUtils.fillUriTemplate(
              '/$Number%05x$_$Number%01X$_$Number%01u$_$Number%01o$.mp4',
              '', 180, 0, 0).toString()).toBe('/000b4_B4_180_264.mp4');
    });
  });

  describe('createTimeline', function() {
    it('works in normal case', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles null start time', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(null, 10, 0),
        createTimePoint(null, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles gaps', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(15, 10, 0),
      ];
      let result = [
        {start: 0, end: 15},
        {start: 15, end: 25},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles overlap', function() {
      let timePoints = [
        createTimePoint(0, 15, 0),
        createTimePoint(10, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles repetitions', function() {
      let timePoints = [
        createTimePoint(0, 10, 5),
        createTimePoint(60, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
        {start: 40, end: 50},
        {start: 50, end: 60},
        {start: 60, end: 70},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles null repeat', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, null),
        createTimePoint(20, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles repetitions with gap', function() {
      let timePoints = [
        createTimePoint(0, 10, 2),
        createTimePoint(35, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 35},
        {start: 35, end: 45},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(40, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
        {start: 40, end: 50},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions with uneven border', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(45, 5, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
        {start: 40, end: 45},
        {start: 45, end: 50},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions w/ bad next start time', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(5, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions w/ null next start time', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(null, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions at end', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 5, -1),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 15},
        {start: 15, end: 20},
        {start: 20, end: 25},
      ];
      checkTimePoints(timePoints, result, 1, 0, 25);
    });

    it('handles negative repetitions at end w/o Period length', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 5, -1),
      ];
      let result = [
        {start: 0, end: 10},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions at end w/ bad Period length', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(25, 5, -1),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
      ];
      checkTimePoints(timePoints, result, 1, 0, 20);
    });

    it('ignores elements after null duration', function() {
      let timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, null, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('adjust start with presentationTimeOffset', function() {
      let timePoints = [
        createTimePoint(10, 10, 0),
        createTimePoint(20, 10, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0),
      ];
      let result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
      ];
      checkTimePoints(timePoints, result, 1, 10, Infinity);
    });

    it('adjust start time w/ t missing', () => {
      // No S@t is equivalent to t=0, which should use PTO to make negative.
      // See https://github.com/google/shaka-player/issues/2590
      const timePoints = [
        createTimePoint(null, 10, 0),
        createTimePoint(10, 10, 0),
      ];
      const result = [
        {start: -5, end: 5},
        {start: 5, end: 15},
      ];
      checkTimePoints(timePoints, result, 1, 5, Infinity);
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
      return {t: t, d: d, r: r};
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
      let xmlLines = ['<?xml version="1.0"?>', '<SegmentTimeline>'];
      for (let i = 0; i < points.length; i++) {
        let p = points[i];
        xmlLines.push('<S' +
                      (p.t != null ? ' t="' + p.t + '"' : '') +
                      (p.d != null ? ' d="' + p.d + '"' : '') +
                      (p.r != null ? ' r="' + p.r + '"' : '') +
                      ' />');
      }
      xmlLines.push('</SegmentTimeline>');
      let parser = new DOMParser();
      let xml = parser.parseFromString(xmlLines.join('\n'), 'application/xml');
      let segmentTimeline = xml.documentElement;
      console.assert(segmentTimeline);

      let timeline = MpdUtils.createTimeline(
          segmentTimeline, timescale, presentationTimeOffset, periodDuration);

      expect(timeline).toBeTruthy();
      expect(timeline.length).toBe(expected.length);
      for (let i = 0; i < expected.length; i++) {
        expect(timeline[i].start).toBe(expected[i].start);
        expect(timeline[i].end).toBe(expected[i].end);
      }
    }
  });

  describe('processXlinks', function() {
    const Error = shaka.util.Error;

    /** @type {!shaka.test.FakeNetworkingEngine} */
    let fakeNetEngine;
    /** @type {shaka.extern.RetryParameters} */
    let retry;
    /** @type {!DOMParser} */
    let parser;
    /** @type {boolean} */
    let failGracefully;

    beforeEach(function() {
      failGracefully = false;
      retry = shaka.net.NetworkingEngine.defaultRetryParameters();
      fakeNetEngine = new shaka.test.FakeNetworkingEngine();
      parser = new DOMParser();
    });

    it('will replace elements and children', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      let xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      let desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('preserves non-xlink attributes', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace otherVariable="q" xlink:href="https://xlink1" ' +
          'xlink:actuate="onLoad" />');
      let xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      let desiredXMLString = inBaseContainer(
          '<ToReplace otherVariable="q" variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('preserves text', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      let xlinkXMLString =
          '<ToReplace variable="1">TEXT CONTAINED WITHIN</ToReplace>';
      let desiredXMLString = inBaseContainer(
          '<ToReplace variable="1">TEXT CONTAINED WITHIN</ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('supports multiple replacements', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />',
          '<ToReplace xlink:href="https://xlink2" xlink:actuate="onLoad" />');
      let xlinkXMLString1 = makeRecursiveXMLString(1, 'https://xlink3');
      let xlinkXMLString2 = '<ToReplace variable="2"><Contents /></ToReplace>';
      let xlinkXMLString3 = '<ToReplace otherVariable="blue" />';
      let desiredXMLString = inBaseContainer(
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<ToReplace otherVariable="blue" /></ToReplace>',
          '<ToReplace variable="2"><Contents /></ToReplace>');

      fakeNetEngine
          .setResponseText('https://xlink1', xlinkXMLString1)
          .setResponseText('https://xlink2', xlinkXMLString2)
          .setResponseText('https://xlink3', xlinkXMLString3);
      await testSucceeds(baseXMLString, desiredXMLString, 3);
    });

    it('fails if loaded file is invalid xml', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      // Note this does not have a close angle bracket.
      let xlinkXMLString = '<ToReplace></ToReplace';
      let expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_INVALID_XML, 'https://xlink1');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 1);
    });

    it('fails if it recurses too many times', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      // Create a large but finite number of links, so this won't
      // infinitely recurse if there isn't a depth limit.
      for (let i = 1; i < 20; i++) {
        const key = 'https://xlink' + i;
        const value = makeRecursiveXMLString(0, 'https://xlink' + (i + 1) + '');

        fakeNetEngine.setResponseText(key, value);
      }
      let expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_XLINK_DEPTH_LIMIT);

      await testFails(baseXMLString, expectedError, 5);
    });

    it('preserves url parameters', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1?parameter" ' +
          'xlink:actuate="onLoad" />');
      let xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      let desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText(
          'https://xlink1?parameter', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('replaces existing contents', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<Unwanted /></ToReplace>');
      let xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      let desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('handles relative links', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="xlink1" xlink:actuate="onLoad" />',
          '<ToReplace xlink:href="xlink2" xlink:actuate="onLoad" />');
      let xlinkXMLString1 = // This is loaded relative to base.
          makeRecursiveXMLString(1, 'xlink3');
      let xlinkXMLString2 = // This is loaded relative to base.
          '<ToReplace variable="2"><Contents /></ToReplace>';
      let xlinkXMLString3 = // This is loaded relative to string1.
          '<ToReplace variable="3" />';
      fakeNetEngine
          .setResponseText('https://base/xlink1', xlinkXMLString1)
          .setResponseText('https://base/xlink2', xlinkXMLString2)
          .setResponseText('https://base/xlink3', xlinkXMLString3);

      let desiredXMLString = inBaseContainer(
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<ToReplace variable="3" /></ToReplace>',
          '<ToReplace variable="2"><Contents /></ToReplace>');

      await testSucceeds(baseXMLString, desiredXMLString, 3);
    });

    it('fails for actuate=onRequest', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" ' +
          'xlink:actuate="onRequest" />');
      let xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      let expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 0);
    });

    it('fails for no actuate', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" />');
      let xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      let expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 0);
    });

    it('removes elements with resolve-to-zero', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="urn:mpeg:dash:resolve-to-zero:2013" />');
      let desiredXMLString = inBaseContainer();

      await testSucceeds(baseXMLString, desiredXMLString, 0);
    });

    it('needs the top-level to match the link\'s tagName', async () => {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      let xlinkXMLString = '<BadTagName</BadTagName>';

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, null, 1);
    });

    it('doesn\'t error when set to fail gracefully', async () => {
      failGracefully = true;
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<DefaultContents />' +
          '</ToReplace>');
      let xlinkXMLString = '<BadTagName</BadTagName>';
      let desiredXMLString = inBaseContainer(
          '<ToReplace><DefaultContents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('interrupts requests on abort', function(done) {
      let baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      // Create a few links.  This is few enough that it would succeed if we
      // didn't abort it.
      for (let i = 1; i < 3; i++) {
        const key = 'https://xlink' + i;
        const value = makeRecursiveXMLString(0, 'https://xlink' + (i + 1) + '');

        fakeNetEngine.setResponseText(key, value);
      }
      let continuePromise = fakeNetEngine.delayNextRequest();

      let xml = parser.parseFromString(baseXMLString, 'text/xml')
          .documentElement;
      let operation = MpdUtils.processXlinks(
          xml, retry, failGracefully, 'https://base', fakeNetEngine);

      shaka.test.Util.delay(0.1).then(() => {
        // Only one request has been made so far.
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
        continuePromise.resolve();

        // Abort the operation.
        operation.abort();
      });

      operation.promise.then(fail).catch((error) => {
        // Still only one request has been made.
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);

        // The operation was aborted.
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            Error.Severity.CRITICAL,
            Error.Category.PLAYER,
            Error.Code.OPERATION_ABORTED));
      });

      operation.finally(done);
    });

    it('ignores SegmentTimeline children', async () => {
      let baseXMLString = inBaseContainer(
          '<SegmentTimeline>' +
          '  <ToReplace xlink:href="https://xlink1" ' +
          '     xlink:actuate="onRequest" />' +
          '</SegmentTimeline>');
      await testSucceeds(baseXMLString, baseXMLString, 0);
    });

    async function testSucceeds(
        baseXMLString, desiredXMLString, desiredNetCalls) {
      let desiredXML = parser.parseFromString(desiredXMLString, 'text/xml')
          .documentElement;
      let finalXML = await testRequest(baseXMLString);
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
      expect(finalXML).toEqualElement(desiredXML);
    }

    function testFails(baseXMLString, desiredError, desiredNetCalls) {
      return testRequest(baseXMLString).then(fail).catch(function(error) {
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
        if (desiredError) {
          shaka.test.Util.expectToEqualError(error, desiredError);
        }
        return Promise.resolve();
      });
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
      let format =
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="%(let)s">' +
          '<ToReplace xlink:href="%(link)s" xlink:actuate="onLoad" />' +
          '</ToReplace>';
      return sprintf(format, {'let': variable, 'link': link});
    }

    /**
     * @param {string=} toReplaceOne
     * @param {string=} toReplaceTwo
     * @return {string}
     * @private
     */
    function inBaseContainer(toReplaceOne = '', toReplaceTwo = '') {
      let format =
          '<Container xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink">' +
          '<Thing>' +
          '%(toReplaceOne)s' +
          '</Thing>' +
          '%(toReplaceTwo)s' +
          '</Container>';
      return sprintf(format, {
        toReplaceOne: toReplaceOne,
        toReplaceTwo: toReplaceTwo});
    }

    function testRequest(baseXMLString) {
      let xml = parser.parseFromString(baseXMLString, 'text/xml')
          .documentElement;
      return MpdUtils.processXlinks(xml, retry, failGracefully, 'https://base',
                                    fakeNetEngine).promise;
    }
  });
});
