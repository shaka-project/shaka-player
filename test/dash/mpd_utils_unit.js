/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MpdUtils', () => {
  const MpdUtils = shaka.dash.MpdUtils;

  describe('fillUriTemplate', () => {
    it('handles a single RepresentationID identifier', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$.mp4',
              '100', null, null, null, null).toString())
          .toBe('/example/100.mp4');

      // RepresentationID cannot use a width specifier.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID%01d$.mp4',
              '100', null, null, null, null).toString())
          .toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$.mp4',
              null, null, null, null, null).toString())
          .toBe('/example/$RepresentationID$.mp4');
    });

    it('handles a single Number identifier', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Number$.mp4',
              null, 100, null, null, null).toString())
          .toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Number%05d$.mp4',
              null, 100, null, null, null).toString())
          .toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Number$.mp4',
              null, null, null, null, null).toString())
          .toBe('/example/$Number$.mp4');
    });

    it('handles a single SubNumber identifier', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$SubNumber$.mp4',
              null, null, 100, null, null).toString())
          .toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$SubNumber%05d$.mp4',
              null, null, 100, null, null).toString())
          .toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$SubNumber$.mp4',
              null, null, null, null, null).toString())
          .toBe('/example/$SubNumber$.mp4');
    });

    it('handles a single Bandwidth identifier', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, null, 100, null).toString())
          .toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth%05d$.mp4',
              null, null, null, 100, null).toString())
          .toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Bandwidth$.mp4',
              null, null, null, null, null).toString())
          .toBe('/example/$Bandwidth$.mp4');
    });

    it('handles a single Time identifier', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time$.mp4',
              null, null, null, null, 100).toString())
          .toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time%05d$.mp4',
              null, null, null, null, 100).toString())
          .toBe('/example/00100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time$.mp4',
              null, null, null, null, null).toString())
          .toBe('/example/$Time$.mp4');
    });

    it('handles rounding errors for calculated Times', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time$.mp4',
              null, null, null, null, 100.0001).toString())
          .toBe('/example/100.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time%05d$.mp4',
              null, null, null, null, 99.9999).toString())
          .toBe('/example/00100.mp4');
    });

    it('handles multiple identifiers', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$_$Number$_$SubNumber$_$Bandwidth$_$Time$.mp4', // eslint-disable-line max-len
              '1', 2, 3, 4, 5).toString()).toBe('/example/1_2_3_4_5.mp4');

      // No spaces.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$$Number$$SubNumber$$Bandwidth$$Time$.mp4', // eslint-disable-line max-len
              '1', 2, 3, 4, 5).toString()).toBe('/example/12345.mp4');

      // Different order.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$SubNumber$_$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4', // eslint-disable-line max-len
              '1', 2, 3, 4, 5).toString()).toBe('/example/3_4_5_1_2.mp4');

      // Single width.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%01d$_$SubNumber%01d$_$Bandwidth%01d$_$Time%01d$', // eslint-disable-line max-len
              '1', 2, 3, 4, 500).toString()).toBe('1_2_3_4_500');

      // Different widths.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%02d$_$SubNumber%02d$_$Bandwidth%02d$_$Time%02d$', // eslint-disable-line max-len
              '1', 2, 3, 4, 5).toString()).toBe('1_02_03_04_05');

      // Double $$.
      expect(
          MpdUtils.fillUriTemplate(
              '$$/$RepresentationID$$$$Number$$$$SubNumber$$$$Bandwidth$$$$Time$$$.$$', // eslint-disable-line max-len
              '1', 2, 3, 4, 5).toString()).toBe('$/1$2$3$4$5$.$');
    });

    it('handles invalid identifiers', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Garbage$.mp4',
              '1', 2, 3, 4, 5).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          MpdUtils.fillUriTemplate(
              '/example/$Time.mp4',
              '1', 2, 3, 4, 5).toString()).toBe('/example/$Time.mp4');
    });

    it('handles non-decimal format specifiers', () => {
      expect(
          MpdUtils.fillUriTemplate(
              '/$Number%05x$_$Number%01X$_$Number%01u$_$Number%01o$.mp4',
              '', 180, 0, 0, 0).toString()).toBe('/000b4_B4_180_264.mp4');
    });
  });

  describe('createTimeline', () => {
    it('works in normal case', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles null start time', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(null, 10, 0),
        createTimePoint(null, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles gaps', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(15, 10, 0),
      ];
      const result = [
        {start: 0, end: 15},
        {start: 15, end: 25},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles overlap', () => {
      const timePoints = [
        createTimePoint(0, 15, 0),
        createTimePoint(10, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles repetitions', () => {
      const timePoints = [
        createTimePoint(0, 10, 5),
        createTimePoint(60, 10, 0),
      ];
      const result = [
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

    it('handles null repeat', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, null),
        createTimePoint(20, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles repetitions with gap', () => {
      const timePoints = [
        createTimePoint(0, 10, 2),
        createTimePoint(35, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 35},
        {start: 35, end: 45},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(40, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
        {start: 40, end: 50},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions with uneven border', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(45, 5, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
        {start: 40, end: 45},
        {start: 45, end: 50},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions w/ bad next start time', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(5, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions w/ null next start time', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, -1),
        createTimePoint(null, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions at end', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 5, -1),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 15},
        {start: 15, end: 20},
        {start: 20, end: 25},
      ];
      checkTimePoints(timePoints, result, 1, 0, 25);
    });

    it('handles negative repetitions at end w/o Period length', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 5, -1),
      ];
      const result = [
        {start: 0, end: 10},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('handles negative repetitions at end w/ bad Period length', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(25, 5, -1),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
      ];
      checkTimePoints(timePoints, result, 1, 0, 20);
    });

    it('ignores elements after null duration', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, null, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
      ];
      checkTimePoints(timePoints, result, 1, 0, Infinity);
    });

    it('adjust start with presentationTimeOffset', () => {
      const timePoints = [
        createTimePoint(10, 10, 0),
        createTimePoint(20, 10, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 20},
        {start: 20, end: 30},
        {start: 30, end: 40},
      ];
      checkTimePoints(timePoints, result, 1, 10, Infinity);
    });

    it('adjust start time w/ t missing', () => {
      // No S@t is equivalent to t=0, which should use PTO to make negative.
      // See https://github.com/shaka-project/shaka-player/issues/2590
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
      const xmlLines = ['<?xml version="1.0"?>', '<SegmentTimeline>'];
      for (const p of points) {
        xmlLines.push('<S' +
                      (p.t != null ? ' t="' + p.t + '"' : '') +
                      (p.d != null ? ' d="' + p.d + '"' : '') +
                      (p.r != null ? ' r="' + p.r + '"' : '') +
                      ' />');
      }
      xmlLines.push('</SegmentTimeline>');
      const parser = new DOMParser();
      const xml =
          parser.parseFromString(xmlLines.join('\n'), 'application/xml');
      const segmentTimeline = xml.documentElement;
      console.assert(segmentTimeline);

      const timeline = MpdUtils.createTimeline(
          segmentTimeline, timescale, presentationTimeOffset, periodDuration);
      expect(timeline).toEqual(
          expected.map((c) => jasmine.objectContaining(c)));
    }
  });

  describe('processXlinks', () => {
    const Error = shaka.util.Error;

    /** @type {!shaka.test.FakeNetworkingEngine} */
    let fakeNetEngine;
    /** @type {shaka.extern.RetryParameters} */
    let retry;
    /** @type {!DOMParser} */
    let parser;
    /** @type {boolean} */
    let failGracefully;

    beforeEach(() => {
      failGracefully = false;
      retry = shaka.net.NetworkingEngine.defaultRetryParameters();
      fakeNetEngine = new shaka.test.FakeNetworkingEngine();
      parser = new DOMParser();
    });

    it('will replace elements and children', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      const xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      const desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('preserves non-xlink attributes', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace otherVariable="q" xlink:href="https://xlink1" ' +
          'xlink:actuate="onLoad" />');
      const xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      const desiredXMLString = inBaseContainer(
          '<ToReplace otherVariable="q" variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('preserves text', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      const xlinkXMLString =
          '<ToReplace variable="1">TEXT CONTAINED WITHIN</ToReplace>';
      const desiredXMLString = inBaseContainer(
          '<ToReplace variable="1">TEXT CONTAINED WITHIN</ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('supports multiple replacements', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />',
          '<ToReplace xlink:href="https://xlink2" xlink:actuate="onLoad" />');
      const xlinkXMLString1 = makeRecursiveXMLString(1, 'https://xlink3');
      const xlinkXMLString2 =
          '<ToReplace variable="2"><Contents /></ToReplace>';
      const xlinkXMLString3 = '<ToReplace otherVariable="blue" />';
      const desiredXMLString = inBaseContainer(
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
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      // Note this does not have a close angle bracket.
      const xlinkXMLString = '<ToReplace></ToReplace';
      const expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_INVALID_XML, 'https://xlink1');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 1);
    });

    it('fails if it recurses too many times', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink0" xlink:actuate="onLoad" />');
      // Create a large but finite number of links, so this won't
      // infinitely recurse if there isn't a depth limit.
      for (let i = 0; i < 20; i++) {
        const key = 'https://xlink' + i;
        const value = makeRecursiveXMLString(0, 'https://xlink' + (i + 1));

        fakeNetEngine.setResponseText(key, value);
      }
      const expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_XLINK_DEPTH_LIMIT);

      await testFails(baseXMLString, expectedError, 5);
    });

    it('preserves url parameters', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1?parameter" ' +
          'xlink:actuate="onLoad" />');
      const xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      const desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText(
          'https://xlink1?parameter', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('replaces existing contents', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<Unwanted /></ToReplace>');
      const xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      const desiredXMLString = inBaseContainer(
          '<ToReplace variable="1"><Contents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('handles relative links', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="xlink1" xlink:actuate="onLoad" />',
          '<ToReplace xlink:href="xlink2" xlink:actuate="onLoad" />');
      const xlinkXMLString1 = // This is loaded relative to base.
          makeRecursiveXMLString(1, 'xlink3');
      const xlinkXMLString2 = // This is loaded relative to base.
          '<ToReplace variable="2"><Contents /></ToReplace>';
      const xlinkXMLString3 = // This is loaded relative to string1.
          '<ToReplace variable="3" />';
      fakeNetEngine
          .setResponseText('https://base/xlink1', xlinkXMLString1)
          .setResponseText('https://base/xlink2', xlinkXMLString2)
          .setResponseText('https://base/xlink3', xlinkXMLString3);

      const desiredXMLString = inBaseContainer(
          '<ToReplace xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<ToReplace variable="3" /></ToReplace>',
          '<ToReplace variable="2"><Contents /></ToReplace>');

      await testSucceeds(baseXMLString, desiredXMLString, 3);
    });

    it('fails for actuate=onRequest', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" ' +
          'xlink:actuate="onRequest" />');
      const xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      const expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 0);
    });

    it('fails for no actuate', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" />');
      const xlinkXMLString = '<ToReplace variable="1"><Contents /></ToReplace>';
      const expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 0);
    });

    it('removes elements with resolve-to-zero', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="urn:mpeg:dash:resolve-to-zero:2013" />');
      const desiredXMLString = inBaseContainer();

      await testSucceeds(baseXMLString, desiredXMLString, 0);
    });

    it('needs the top-level to match the link\'s tagName', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      const xlinkXMLString = '<BadTagName</BadTagName>';

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, null, 1);
    });

    it('doesn\'t error when set to fail gracefully', async () => {
      failGracefully = true;
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<DefaultContents />' +
          '</ToReplace>');
      const xlinkXMLString = '<BadTagName</BadTagName>';
      const desiredXMLString = inBaseContainer(
          '<ToReplace><DefaultContents /></ToReplace>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('interrupts requests on abort', async () => {
      const baseXMLString = inBaseContainer(
          '<ToReplace xlink:href="https://xlink0" xlink:actuate="onLoad" />');
      // Create a few links.  This is few enough that it would succeed if we
      // didn't abort it.
      for (let i = 0; i < 4; i++) {
        const key = 'https://xlink' + i;
        const value = makeRecursiveXMLString(0, 'https://xlink' + (i + 1));

        fakeNetEngine.setResponseText(key, value);
      }
      /** @type {!shaka.util.PublicPromise} */
      const continuePromise = fakeNetEngine.delayNextRequest();

      const xml = parser.parseFromString(baseXMLString, 'text/xml')
          .documentElement;
      /** @type {!shaka.extern.IAbortableOperation} */
      const operation = MpdUtils.processXlinks(
          xml, retry, failGracefully, 'https://base', fakeNetEngine);

      const abort = async () => {
        await shaka.test.Util.shortDelay();
        // Only one request has been made so far.
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
        continuePromise.resolve();

        // Abort the operation.
        operation.abort();
      };

      // The operation was aborted.
      const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
          Error.Severity.CRITICAL,
          Error.Category.PLAYER,
          Error.Code.OPERATION_ABORTED));
      const p = expectAsync(operation.promise).toBeRejectedWith(expected);

      await Promise.all([abort(), p]);
      // Still only one request has been made.
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
    });

    it('ignores SegmentTimeline children', async () => {
      const baseXMLString = inBaseContainer(
          '<SegmentTimeline>' +
          '  <ToReplace xlink:href="https://xlink1" ' +
          '     xlink:actuate="onRequest" />' +
          '</SegmentTimeline>');
      await testSucceeds(baseXMLString, baseXMLString, 0);
    });

    async function testSucceeds(
        baseXMLString, desiredXMLString, desiredNetCalls) {
      const desiredXML = parser.parseFromString(desiredXMLString, 'text/xml')
          .documentElement;
      const finalXML = await testRequest(baseXMLString);
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
      expect(finalXML).toEqualElement(desiredXML);
    }

    async function testFails(baseXMLString, desiredError, desiredNetCalls) {
      if (desiredError) {
        await expectAsync(testRequest(baseXMLString))
            .toBeRejectedWith(shaka.test.Util.jasmineError(desiredError));
      } else {
        await expectAsync(testRequest(baseXMLString)).toBeRejected();
      }
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
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
      const format =
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
      const format =
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
      const xml = parser.parseFromString(baseXMLString, 'text/xml')
          .documentElement;
      return MpdUtils.processXlinks(xml, retry, failGracefully, 'https://base',
          fakeNetEngine).promise;
    }
  });
});
