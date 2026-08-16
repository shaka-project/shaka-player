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
              '/example/$RepresentationID$_$Number$_$SubNumber$_$Bandwidth$_$Time$.mp4', // eslint-disable-line @stylistic/max-len
              '1', 2, 3, 4, 5).toString()).toBe('/example/1_2_3_4_5.mp4');

      // No spaces.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$RepresentationID$$Number$$SubNumber$$Bandwidth$$Time$.mp4', // eslint-disable-line @stylistic/max-len
              '1', 2, 3, 4, 5).toString()).toBe('/example/12345.mp4');

      // Different order.
      expect(
          MpdUtils.fillUriTemplate(
              '/example/$SubNumber$_$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4', // eslint-disable-line @stylistic/max-len
              '1', 2, 3, 4, 5).toString()).toBe('/example/3_4_5_1_2.mp4');

      // Single width.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%01d$_$SubNumber%01d$_$Bandwidth%01d$_$Time%01d$', // eslint-disable-line @stylistic/max-len
              '1', 2, 3, 4, 500).toString()).toBe('1_2_3_4_500');

      // Different widths.
      expect(
          MpdUtils.fillUriTemplate(
              '$RepresentationID$_$Number%02d$_$SubNumber%02d$_$Bandwidth%02d$_$Time%02d$', // eslint-disable-line @stylistic/max-len
              '1', 2, 3, 4, 5).toString()).toBe('1_02_03_04_05');

      // Double $$.
      expect(
          MpdUtils.fillUriTemplate(
              '$$/$RepresentationID$$$$Number$$$$SubNumber$$$$Bandwidth$$$$Time$$$.$$', // eslint-disable-line @stylistic/max-len
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

    it('ignores elements with null duration', () => {
      const timePoints = [
        createTimePoint(0, 10, 0),
        createTimePoint(10, 10, 0),
        createTimePoint(20, null, 0),
        createTimePoint(30, 10, 0),
        createTimePoint(40, 10, 0),
      ];
      const result = [
        {start: 0, end: 10},
        {start: 10, end: 30},
        {start: 30, end: 40},
        {start: 40, end: 50},
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
     * @param {!Array<{t: ?number, d: ?number, r: ?number}>} points
     * @param {!Array<{start: number, end: number}>} expected
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
      const segmentTimeline = /** @type {shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(xmlLines.join('\n'),
            'SegmentTimeline'));

      const timePoints = shaka.util.TXml.findChildren(segmentTimeline, 'S');

      const timeline = MpdUtils.createTimeline(
          timePoints, timescale, presentationTimeOffset, periodDuration, 0);
      expect(timeline).toEqual(
          expected.map((c) => jasmine.objectContaining(c)));
    }
  });

  describe('hasXlinks', () => {
    function parse(xmlString) {
      return /** @type {shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(xmlString));
    }

    function wrapInMpd(inner = '') {
      return (
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
        'xmlns:xlink="http://www.w3.org/1999/xlink">' +
          '<Period>' +
            inner +
          '</Period>' +
        '</MPD>'
      );
    }

    it('returns false when no xlink is present', () => {
      const xml = parse(wrapInMpd(
          '<AdaptationSet><Representation /></AdaptationSet>'));

      expect(MpdUtils.hasXlinks(xml)).toBe(false);
    });

    it('returns true when child has xlink:href', () => {
      const xml = parse(wrapInMpd(
          '<AdaptationSet xlink:href="https://xlink1" ' +
          'xlink:actuate="onLoad" />'));

      expect(MpdUtils.hasXlinks(xml)).toBe(true);
    });

    it('returns true for deeply nested xlink', () => {
      const xml = parse(wrapInMpd(
          '<AdaptationSet>' +
            '<Representation>' +
              '<SegmentList xlink:href="https://deep" ' +
              'xlink:actuate="onLoad" />' +
            '</Representation>' +
          '</AdaptationSet>',
      ));

      expect(MpdUtils.hasXlinks(xml)).toBe(true);
    });

    it('returns false when xlink is inside SegmentTimeline', () => {
      const xml = parse(wrapInMpd(
          '<SegmentTimeline>' +
            '<S xlink:href="https://shouldIgnore" ' +
            'xlink:actuate="onLoad" />' +
          '</SegmentTimeline>',
      ));

      expect(MpdUtils.hasXlinks(xml)).toBe(false);
    });

    it('returns true when one of multiple branches has xlink', () => {
      const xml = parse(wrapInMpd(
          '<AdaptationSet>' +
            '<Representation />' +
          '</AdaptationSet>' +
          '<AdaptationSet xlink:href="https://branch" ' +
          'xlink:actuate="onLoad" />',
      ));

      expect(MpdUtils.hasXlinks(xml)).toBe(true);
    });

    it('does not require xlink:actuate to detect xlink', () => {
      const xml = parse(wrapInMpd(
          '<AdaptationSet xlink:href="https://xlink1" />'));

      expect(MpdUtils.hasXlinks(xml)).toBe(true);
    });

    it('handles empty document safely', () => {
      const xml = parse(
          '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"></MPD>');

      expect(MpdUtils.hasXlinks(xml)).toBe(false);
    });
  });

  describe('processXlinks', () => {
    const Error = shaka.util.Error;

    /** @type {!shaka.test.FakeNetworkingEngine} */
    let fakeNetEngine;
    /** @type {shaka.extern.RetryParameters} */
    let retry;
    /** @type {boolean} */
    let failGracefully;

    beforeEach(() => {
      failGracefully = false;
      retry = shaka.net.NetworkingEngine.defaultRetryParameters();
      fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    });

    it('will replace elements and children', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      const xlinkXMLString =
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('preserves non-xlink attributes', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet otherVariable="q" xlink:href="https://xlink1" ' +
          'xlink:actuate="onLoad" />');
      const xlinkXMLString =
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet otherVariable="q" variable="1"><Contents />' +
          '</AdaptationSet>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('preserves text', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      const xlinkXMLString =
          '<AdaptationSet variable="1">TEXT CONTAINED WITHIN</AdaptationSet>';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet variable="1">TEXT CONTAINED WITHIN</AdaptationSet>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('supports multiple replacements', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" xlink:actuate="onLoad" />',
          '<AdaptationSet xlink:href="https://xlink2" xlink:actuate="onLoad" />');
      const xlinkXMLString1 = makeRecursiveXMLString(1, 'https://xlink3');
      const xlinkXMLString2 =
          '<AdaptationSet variable="2"><Contents /></AdaptationSet>';
      const xlinkXMLString3 = '<AdaptationSet otherVariable="blue" />';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<AdaptationSet otherVariable="blue" /></AdaptationSet>',
          '<AdaptationSet variable="2"><Contents /></AdaptationSet>');

      fakeNetEngine
          .setResponseText('https://xlink1', xlinkXMLString1)
          .setResponseText('https://xlink2', xlinkXMLString2)
          .setResponseText('https://xlink3', xlinkXMLString3);
      await testSucceeds(baseXMLString, desiredXMLString, 3);
    });


    it('fails if it recurses too many times', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink0" xlink:actuate="onLoad" />');
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
          '<AdaptationSet xlink:href="https://xlink1?parameter" ' +
          'xlink:actuate="onLoad" />');
      const xlinkXMLString =
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>');

      fakeNetEngine.setResponseText(
          'https://xlink1?parameter', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('replaces existing contents', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<Unwanted /></AdaptationSet>');
      const xlinkXMLString =
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('handles relative links', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="xlink1" xlink:actuate="onLoad" />',
          '<AdaptationSet xlink:href="xlink2" xlink:actuate="onLoad" />');
      const xlinkXMLString1 = // This is loaded relative to base.
          makeRecursiveXMLString(1, 'xlink3');
      const xlinkXMLString2 = // This is loaded relative to base.
          '<AdaptationSet variable="2"><Contents /></AdaptationSet>';
      const xlinkXMLString3 = // This is loaded relative to string1.
          '<AdaptationSet variable="3" />';
      fakeNetEngine
          .setResponseText('https://base/xlink1', xlinkXMLString1)
          .setResponseText('https://base/xlink2', xlinkXMLString2)
          .setResponseText('https://base/xlink3', xlinkXMLString3);

      const desiredXMLString = inBaseContainer(
          '<AdaptationSet xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="1">' +
          '<AdaptationSet variable="3" /></AdaptationSet>',
          '<AdaptationSet variable="2"><Contents /></AdaptationSet>');

      await testSucceeds(baseXMLString, desiredXMLString, 3);
    });

    it('fails for actuate=onRequest', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" ' +
          'xlink:actuate="onRequest" />');
      const xlinkXMLString =
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>';
      const expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 0);
    });

    it('fails for no actuate', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" />');
      const xlinkXMLString =
          '<AdaptationSet variable="1"><Contents /></AdaptationSet>';
      const expectedError = new shaka.util.Error(
          Error.Severity.CRITICAL, Error.Category.MANIFEST,
          Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, expectedError, 0);
    });

    it('removes elements with resolve-to-zero', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="urn:mpeg:dash:resolve-to-zero:2013" />');
      const desiredXMLString = inBaseContainer();

      await testSucceeds(baseXMLString, desiredXMLString, 0);
    });

    it('needs the top-level to match the link\'s tagName', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" xlink:actuate="onLoad" />');
      const xlinkXMLString = '<BadTagName</BadTagName>';

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testFails(baseXMLString, null, 1);
    });

    it('doesn\'t error when set to fail gracefully', async () => {
      failGracefully = true;
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink1" xlink:actuate="onLoad">' +
          '<DefaultContents />' +
          '</AdaptationSet>');
      const xlinkXMLString = '<BadTagName</BadTagName>';
      const desiredXMLString = inBaseContainer(
          '<AdaptationSet><DefaultContents /></AdaptationSet>');

      fakeNetEngine.setResponseText('https://xlink1', xlinkXMLString);
      await testSucceeds(baseXMLString, desiredXMLString, 1);
    });

    it('interrupts requests on abort', async () => {
      const baseXMLString = inBaseContainer(
          '<AdaptationSet xlink:href="https://xlink0" xlink:actuate="onLoad" />');
      // Create a few links.  This is few enough that it would succeed if we
      // didn't abort it.
      for (let i = 0; i < 4; i++) {
        const key = 'https://xlink' + i;
        const value = makeRecursiveXMLString(0, 'https://xlink' + (i + 1));

        fakeNetEngine.setResponseText(key, value);
      }
      /** @type {!Promise.PromiseWithResolvers} */
      const continuePromise = fakeNetEngine.delayNextRequest();

      const xml = /** @type {shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(baseXMLString));
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
          '  <Ignore xlink:href="https://xlink1" ' +
          '     xlink:actuate="onRequest" />' +
          '</SegmentTimeline>');
      await testSucceeds(baseXMLString, baseXMLString, 0);
    });

    async function testSucceeds(
        baseXMLString, desiredXMLString, desiredNetCalls) {
      const desiredXML = /** @type {shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(desiredXMLString));
      const finalXML = await testRequest(baseXMLString);
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(desiredNetCalls);
      expect(finalXML).toEqual(desiredXML);
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
          '<AdaptationSet xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink" variable="%(let)s">' +
          '<AdaptationSet xlink:href="%(link)s" xlink:actuate="onLoad" />' +
          '</AdaptationSet>';
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
          '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
          'xmlns:xlink="http://www.w3.org/1999/xlink">' +
          '<Period>' +
          '%(toReplaceOne)s' +
          '</Period>' +
          '<Period>' +
          '%(toReplaceTwo)s' +
          '</Period>' +
          '</MPD>';
      return sprintf(format, {
        toReplaceOne: toReplaceOne,
        toReplaceTwo: toReplaceTwo});
    }

    function testRequest(baseXMLString) {
      const xml = /** @type {shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(baseXMLString));
      return MpdUtils.processXlinks(xml, retry, failGracefully, 'https://base',
          fakeNetEngine).promise;
    }
  });

  describe('hasLinkedPeriods', () => {
    it('returns false when no Period has ImportedMPD', () => {
      const xml = /** @type {!shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString([
          '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">',
          '  <Period id="1" duration="PT10S">',
          '    <AdaptationSet mimeType="video/mp4"/>',
          '  </Period>',
          '</MPD>',
        ].join('\n')));
      expect(MpdUtils.hasLinkedPeriods(xml)).toBe(false);
    });

    it('returns false for an empty MPD', () => {
      const xml = /** @type {!shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"/>'));
      expect(MpdUtils.hasLinkedPeriods(xml)).toBe(false);
    });

    it('returns true when a Period has an ImportedMPD child', () => {
      const xml = /** @type {!shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString([
          '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
          '  <Period id="1">',
          '    <ImportedMPD>https://example.com/ad.mpd</ImportedMPD>',
          '  </Period>',
          '</MPD>',
        ].join('\n')));
      expect(MpdUtils.hasLinkedPeriods(xml)).toBe(true);
    });

    it('returns true when only one of multiple Periods has ImportedMPD', () => {
      const xml = /** @type {!shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString([
          '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
          '  <Period id="1" duration="PT10S">',
          '    <AdaptationSet mimeType="video/mp4"/>',
          '  </Period>',
          '  <Period id="2">',
          '    <ImportedMPD>https://example.com/ad.mpd</ImportedMPD>',
          '  </Period>',
          '</MPD>',
        ].join('\n')));
      expect(MpdUtils.hasLinkedPeriods(xml)).toBe(true);
    });
  });

  describe('processLinkedPeriods', () => {
    /** @type {!shaka.test.FakeNetworkingEngine} */
    let fakeNetEngine;
    /** @type {shaka.extern.RetryParameters} */
    let retry;

    // Minimal single-period static MPD returned by the imported URL.
    const importedMpdXml = [
      '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"',
      '    mediaPresentationDuration="PT10S">',
      '  <Period duration="PT10S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <SegmentTemplate media="$RepresentationID$/$Number$.m4s"',
      '          initialization="$RepresentationID$/init.mp4"',
      '          timescale="12288" startNumber="1" duration="24576"/>',
      '      <Representation id="V1" bandwidth="1000"',
      '          codecs="avc1.64001E" width="640" height="360"/>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    beforeEach(() => {
      retry = shaka.net.NetworkingEngine.defaultRetryParameters();
      fakeNetEngine = new shaka.test.FakeNetworkingEngine();
      fakeNetEngine.setResponseText(
          'https://example.com/ad/manifest.mpd', importedMpdXml);
    });

    /**
     * @param {string} listMpdXml
     * @return {!Promise<!shaka.extern.xml.Node>}
     */
    function processLinkedPeriods(listMpdXml) {
      const xml = /** @type {!shaka.extern.xml.Node} */ (
        shaka.util.TXml.parseXmlString(listMpdXml));
      return MpdUtils.processLinkedPeriods(
          xml, 'https://base/ads.mpd', retry, fakeNetEngine).promise;
    }

    /**
     * Resolves the Linked Period and returns the first Period node, asserting
     * that it is non-null.
     * @param {string} listMpd
     * @return {!Promise<!shaka.extern.xml.Node>}
     */
    async function getPeriod(listMpd) {
      const mpd = await processLinkedPeriods(listMpd);
      const period = shaka.util.TXml.findChild(mpd, 'Period');
      goog.asserts.assert(period, 'Expected Period element');
      return /** @type {!shaka.extern.xml.Node} */ (period);
    }

    /** @return {string} */
    function singlePeriodMpd() {
      return [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
        '  <Period id="1">',
        '    <ImportedMPD>https://example.com/ad/manifest.mpd</ImportedMPD>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
    }

    it('removes the ImportedMPD element after resolution', async () => {
      const period = await getPeriod(singlePeriodMpd());
      const TXml = shaka.util.TXml;
      expect(TXml.findChild(period, 'ImportedMPD')).toBeNull();
    });

    it('merges AdaptationSets from the imported MPD into the Linked Period',
        async () => {
          const period = await getPeriod(singlePeriodMpd());
          const TXml = shaka.util.TXml;
          const adaptationSets = TXml.findChildren(period, 'AdaptationSet');
          expect(adaptationSets.length).toBe(1);
          expect(adaptationSets[0].attributes['mimeType']).toBe('video/mp4');
        });

    it('copies SegmentTemplate from the imported Period', async () => {
      const TXml = shaka.util.TXml;
      const period = await getPeriod(singlePeriodMpd());
      const adaptationSet = TXml.findChild(period, 'AdaptationSet');
      goog.asserts.assert(adaptationSet, 'Expected AdaptationSet');
      const segTemplate = TXml.findChild(
          /** @type {!shaka.extern.xml.Node} */ (adaptationSet),
          'SegmentTemplate');
      expect(segTemplate).not.toBeNull();
      goog.asserts.assert(segTemplate, 'Expected SegmentTemplate');
      expect(segTemplate.attributes['timescale']).toBe('12288');
      expect(segTemplate.attributes['duration']).toBe('24576');
    });

    it('copies duration from the imported Period if not set on Linked Period',
        async () => {
          const period = await getPeriod(singlePeriodMpd());
          expect(period.attributes['duration']).toBe('PT10S');
        });

    it('does not override duration already set on the Linked Period',
        async () => {
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1" duration="PT5S">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          const period = await getPeriod(listMpd);
          expect(period.attributes['duration']).toBe('PT5S');
        });

    it('injects a BaseURL with the imported MPD URL for segment resolution',
        async () => {
          const TXml = shaka.util.TXml;
          const period = await getPeriod(singlePeriodMpd());
          const baseUrls = TXml.findChildren(period, 'BaseURL');
          expect(baseUrls.length).toBeGreaterThanOrEqual(1);
          expect(TXml.getContents(baseUrls[0]))
              .toBe('https://example.com/ad/manifest.mpd');
        });

    it('makes exactly one network request per Linked Period', async () => {
      await processLinkedPeriods(singlePeriodMpd());
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      expect(fakeNetEngine.request).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.MANIFEST,
          jasmine.objectContaining(
              {uris: ['https://example.com/ad/manifest.mpd']}));
    });

    it('resolves relative ImportedMPD href against the base URI', async () => {
      fakeNetEngine.setResponseText(
          'https://base/ad/manifest.mpd', importedMpdXml);
      const listMpd = [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
        '  <Period id="1">',
        '    <ImportedMPD>ad/manifest.mpd</ImportedMPD>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const TXml = shaka.util.TXml;
      const period = await getPeriod(listMpd);
      expect(TXml.findChildren(period, 'AdaptationSet').length).toBe(1);
    });

    it('processes two Linked Periods independently', async () => {
      const TXml = shaka.util.TXml;
      const importedMpd2Xml = importedMpdXml.replace('V1', 'W1');
      fakeNetEngine.setResponseText(
          'https://example.com/ad2/manifest.mpd', importedMpd2Xml);

      const listMpd = [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
        '  <Period id="1">',
        '    <ImportedMPD>https://example.com/ad/manifest.mpd</ImportedMPD>',
        '  </Period>',
        '  <Period id="2">',
        '    <ImportedMPD>https://example.com/ad2/manifest.mpd</ImportedMPD>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const mpd = await processLinkedPeriods(listMpd);
      const periods = TXml.findChildren(mpd, 'Period');
      expect(periods.length).toBe(2);

      // Period 1: no ImportedMPD, has AdaptationSet with Representation V1
      expect(TXml.findChild(periods[0], 'ImportedMPD')).toBeNull();
      const as1 = TXml.findChild(periods[0], 'AdaptationSet');
      goog.asserts.assert(as1, 'Expected AdaptationSet in Period 1');
      const rep1 = TXml.findChild(
          /** @type {!shaka.extern.xml.Node} */ (as1), 'Representation');
      goog.asserts.assert(rep1, 'Expected Representation in Period 1');
      expect(rep1.attributes['id']).toBe('V1');

      // Period 2: no ImportedMPD, has AdaptationSet with Representation W1
      expect(TXml.findChild(periods[1], 'ImportedMPD')).toBeNull();
      const as2 = TXml.findChild(periods[1], 'AdaptationSet');
      goog.asserts.assert(as2, 'Expected AdaptationSet in Period 2');
      const rep2 = TXml.findChild(
          /** @type {!shaka.extern.xml.Node} */ (as2), 'Representation');
      goog.asserts.assert(rep2, 'Expected Representation in Period 2');
      expect(rep2.attributes['id']).toBe('W1');

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
    });

    it('removes an empty Linked Period when ImportedMPD has no URI',
        async () => {
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1">',
            '    <ImportedMPD/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          const TXml = shaka.util.TXml;
          // No URI to resolve -> resolution fails (§5.3.2.6.3 step 1.a). The
          // Period has no valid content, so it is removed entirely (step 2),
          // and no network request is made.
          const mpd = await processLinkedPeriods(listMpd);
          expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
          expect(fakeNetEngine.request).not.toHaveBeenCalled();
        });

    it('removes the Linked Period when the imported MPD is invalid XML',
        async () => {
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', '<not valid xml!!');
          const TXml = shaka.util.TXml;
          // Resolution fails (step 1.b) and the Period has no content, so it is
          // removed (step 2).
          const mpd = await processLinkedPeriods(singlePeriodMpd());
          expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
        });

    it('keeps a Linked Period with its own content when the import fails',
        async () => {
          // Point the import at a URL with no response so the fetch fails.
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1" duration="PT5S">',
            '    <ImportedMPD>https://example.com/missing.mpd</ImportedMPD>',
            '    <AdaptationSet mimeType="audio/mp4"/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          const TXml = shaka.util.TXml;
          // Resolution fails (step 1.a). The Period already has valid content,
          // so ImportedMPD is removed and the Period survives as a regular
          // Period (step 2).
          const mpd = await processLinkedPeriods(listMpd);
          const period = TXml.findChild(mpd, 'Period');
          goog.asserts.assert(period, 'Expected Period element');
          expect(TXml.findChild(
              /** @type {!shaka.extern.xml.Node} */ (period), 'ImportedMPD'))
              .toBeNull();
          expect(TXml.findChildren(
              /** @type {!shaka.extern.xml.Node} */ (period), 'AdaptationSet')
              .length).toBe(1);
        });

    it('removes the Linked Period when the imported MPD has expired',
        async () => {
          // §5.3.2.6.3 step 1.c: availabilityEndTime in the past -> fails.
          const expiredMpd = importedMpdXml.replace(
              'type="static"',
              'type="static" availabilityEndTime="2000-01-01T00:00:00Z"');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', expiredMpd);

          const TXml = shaka.util.TXml;
          const mpd = await processLinkedPeriods(singlePeriodMpd());
          expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
        });

    it('moves imported MPD-level EssentialProperty to Period level',
        async () => {
          const importedWithEssential = importedMpdXml.replace(
              'mediaPresentationDuration="PT10S">',
              'mediaPresentationDuration="PT10S">\n' +
              '  <EssentialProperty schemeIdUri="urn:example:e" ' +
              'value="7"/>');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithEssential);

          const TXml = shaka.util.TXml;
          const period = await getPeriod(singlePeriodMpd());
          const essential = TXml.findChild(period, 'EssentialProperty');
          expect(essential).not.toBeNull();
          goog.asserts.assert(essential, 'Expected EssentialProperty');
          expect(essential.attributes['value']).toBe('7');
        });

    it('uses the smaller of the imported and Linked Period durations',
        async () => {
          // Linked Period duration PT5S, imported PT10S -> keep PT5S.
          const longerThanLinked = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1" duration="PT5S">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          let period = await getPeriod(longerThanLinked);
          expect(period.attributes['duration']).toBe('PT5S');

          // Imported duration PT3S is smaller than Linked PT5S -> use PT3S.
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd',
              importedMpdXml.replace(/PT10S/g, 'PT3S'));
          period = await getPeriod(longerThanLinked);
          expect(period.attributes['duration']).toBe('PT3S');
        });

    it('resolves imported MPD-level and Period-level BaseURLs (clause 5.6)',
        async () => {
          const importedWithBaseUrls = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"',
            '    mediaPresentationDuration="PT10S">',
            '  <BaseURL>cdn/</BaseURL>',
            '  <Period duration="PT10S">',
            '    <BaseURL>v1/</BaseURL>',
            '    <AdaptationSet mimeType="video/mp4"/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithBaseUrls);

          const TXml = shaka.util.TXml;
          const period = await getPeriod(singlePeriodMpd());
          const baseUrls = TXml.findChildren(period, 'BaseURL');
          expect(baseUrls.length).toBe(1);
          // https://example.com/ad/manifest.mpd + cdn/ + v1/
          expect(TXml.getContents(baseUrls[0]))
              .toBe('https://example.com/ad/cdn/v1/');
        });

    it('moves imported MPD-level SupplementalProperty to Period level',
        async () => {
          const importedWithSupplemental = importedMpdXml.replace(
              'mediaPresentationDuration="PT10S">',
              'mediaPresentationDuration="PT10S">\n' +
              '  <SupplementalProperty schemeIdUri="urn:example:s" ' +
              'value="42"/>');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithSupplemental);

          const TXml = shaka.util.TXml;
          const period = await getPeriod(singlePeriodMpd());
          const supplemental =
              TXml.findChild(period, 'SupplementalProperty');
          expect(supplemental).not.toBeNull();
          goog.asserts.assert(supplemental, 'Expected SupplementalProperty');
          expect(supplemental.attributes['value']).toBe('42');
        });

    it('removes disallowed elements of the Linked Period on merge',
        async () => {
          // The Linked Period carries its own AdaptationSet (not allowed by
          // §5.3.2.6.3 step 3.b); it must be removed and replaced by the
          // imported one.
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '    <AdaptationSet mimeType="audio/mp4"/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          const TXml = shaka.util.TXml;
          const period = await getPeriod(listMpd);
          const adaptationSets = TXml.findChildren(period, 'AdaptationSet');
          // Only the imported (video) AdaptationSet remains.
          expect(adaptationSets.length).toBe(1);
          expect(adaptationSets[0].attributes['mimeType']).toBe('video/mp4');
        });

    it('copies ContentProtection and EventStream from the imported Period',
        async () => {
          const importedWithExtras = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"',
            '    mediaPresentationDuration="PT10S">',
            '  <Period duration="PT10S">',
            '    <ContentProtection ' +
            'schemeIdUri="urn:mpeg:dash:mp4protection:2011"/>',
            '    <EventStream schemeIdUri="urn:example:ad" value="1"/>',
            '    <AdaptationSet mimeType="video/mp4"/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithExtras);

          const TXml = shaka.util.TXml;
          const period = await getPeriod(singlePeriodMpd());
          expect(TXml.findChild(period, 'ContentProtection')).not.toBeNull();
          expect(TXml.findChild(period, 'EventStream')).not.toBeNull();
        });

    it('imported equivalent element overrides the Linked Period one',
        async () => {
          // Both Periods carry a SupplementalProperty with the same
          // schemeIdUri+value; the imported one must win (§5.3.2.6.3 step 3.c).
          const importedWithSupplemental = importedMpdXml.replace(
              '  <Period duration="PT10S">',
              '  <Period duration="PT10S">\n' +
              '    <SupplementalProperty schemeIdUri="urn:example:s" ' +
              'value="1" id="imported"/>');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithSupplemental);

          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '    <SupplementalProperty schemeIdUri="urn:example:s" ' +
            'value="1" id="linked"/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          const TXml = shaka.util.TXml;
          const period = await getPeriod(listMpd);
          const supplemental =
              TXml.findChildren(period, 'SupplementalProperty');
          expect(supplemental.length).toBe(1);
          expect(supplemental[0].attributes['id']).toBe('imported');
        });

    it('preserves non-ImportedMPD children of the Linked Period', async () => {
      const listMpd = [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
        '  <Period id="1">',
        '    <ImportedMPD>https://example.com/ad/manifest.mpd</ImportedMPD>',
        '    <EventStream schemeIdUri="urn:example:events" timescale="1">',
        '      <Event presentationTime="0" id="ev1"/>',
        '    </EventStream>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const TXml = shaka.util.TXml;
      const period = await getPeriod(listMpd);
      // EventStream from the list MPD must still be present.
      expect(TXml.findChild(period, 'EventStream')).not.toBeNull();
      // And the imported AdaptationSet is also present.
      expect(TXml.findChildren(period, 'AdaptationSet').length).toBe(1);
    });

    it('removes the Linked Period when the imported MPD has no Period',
        async () => {
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd',
              '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"/>');
          const TXml = shaka.util.TXml;
          // Valid XML but no Period -> resolution fails (step 1.b) and the
          // empty Linked Period is removed (step 2).
          const mpd = await processLinkedPeriods(singlePeriodMpd());
          expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
        });

    it('keeps a zero-duration Linked Period when the import fails',
        async () => {
          // No response is set for this URL, so the fetch fails.
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1" duration="PT0S">',
            '    <ImportedMPD>https://example.com/missing.mpd</ImportedMPD>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          const TXml = shaka.util.TXml;
          // A zero-duration Period is valid even without an AdaptationSet
          // (Table 4), so it survives as a regular Period (step 2).
          const period = await getPeriod(listMpd);
          expect(TXml.findChild(period, 'ImportedMPD')).toBeNull();
          expect(TXml.findChildren(period, 'AdaptationSet').length).toBe(0);
        });

    it('strips disallowed Linked Period attributes but keeps id/start',
        async () => {
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1" start="PT2S" bitstreamSwitching="true">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          const period = await getPeriod(listMpd);
          // §5.3.2.6.3 step 3.b: only @id/@start/@duration are kept.
          expect(period.attributes['bitstreamSwitching']).toBeUndefined();
          expect(period.attributes['id']).toBe('1');
          expect(period.attributes['start']).toBe('PT2S');
        });

    it('preserves foreign-namespace children of the Linked Period',
        async () => {
          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"',
            '    xmlns:scte35="urn:scte:scte35:2013:xml" type="list">',
            '  <Period id="1">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '    <scte35:Signal/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          const TXml = shaka.util.TXml;
          const period = await getPeriod(listMpd);
          // The element from a foreign namespace is kept (step 3.b), and the
          // imported AdaptationSet is also present.
          expect(TXml.findChild(period, 'scte35:Signal')).not.toBeNull();
          expect(TXml.findChildren(period, 'AdaptationSet').length).toBe(1);
        });

    it('keeps non-equivalent descriptors from both Periods', async () => {
      // Linked Period SupplementalProperty (value 1) and imported MPD-level
      // SupplementalProperty (value 2) are not equivalent, so both are kept.
      const importedWithSupplemental = importedMpdXml.replace(
          'mediaPresentationDuration="PT10S">',
          'mediaPresentationDuration="PT10S">\n' +
          '  <SupplementalProperty schemeIdUri="urn:example:s" value="2"/>');
      fakeNetEngine.setResponseText(
          'https://example.com/ad/manifest.mpd', importedWithSupplemental);

      const listMpd = [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
        '  <Period id="1">',
        '    <ImportedMPD>' +
        'https://example.com/ad/manifest.mpd</ImportedMPD>',
        '    <SupplementalProperty schemeIdUri="urn:example:s" value="1"/>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const TXml = shaka.util.TXml;
      const period = await getPeriod(listMpd);
      const values = TXml.findChildren(period, 'SupplementalProperty')
          .map((s) => s.attributes['value']).sort();
      expect(values).toEqual(['1', '2']);
    });

    it('keeps the Linked Period @id and @start over the imported ones',
        async () => {
          // The imported Period has its own @id/@start that must be ignored
          // (§5.3.2.6.3 steps 3.d.i / 3.d.ii).
          const importedWithIdStart = importedMpdXml.replace(
              '  <Period duration="PT10S">',
              '  <Period id="999" start="PT99S" duration="PT10S">');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithIdStart);

          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1" start="PT2S">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '  </Period>',
            '</MPD>',
          ].join('\n');
          const period = await getPeriod(listMpd);
          expect(period.attributes['id']).toBe('1');
          expect(period.attributes['start']).toBe('PT2S');
        });

    it('imported ServiceDescription overrides the Linked one by @id',
        async () => {
          const importedWithSd = importedMpdXml.replace(
              '  <Period duration="PT10S">',
              '  <Period duration="PT10S">\n' +
              '    <ServiceDescription id="0" test="imported"/>');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', importedWithSd);

          const listMpd = [
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
            '  <Period id="1">',
            '    <ImportedMPD>' +
            'https://example.com/ad/manifest.mpd</ImportedMPD>',
            '    <ServiceDescription id="0" test="linked"/>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          const TXml = shaka.util.TXml;
          const period = await getPeriod(listMpd);
          const sds = TXml.findChildren(period, 'ServiceDescription');
          expect(sds.length).toBe(1);
          expect(sds[0].attributes['test']).toBe('imported');
        });

    it('rejects a live (type="dynamic") imported MPD', async () => {
      // §8.15: the Single-Period Static Profile requires MPD@type="static", so
      // a dynamic (live) imported MPD does not conform (step 1.b) and the empty
      // Linked Period is removed (step 2).
      const dynamicMpd =
          importedMpdXml.replace('type="static"', 'type="dynamic"');
      fakeNetEngine.setResponseText(
          'https://example.com/ad/manifest.mpd', dynamicMpd);

      const TXml = shaka.util.TXml;
      const mpd = await processLinkedPeriods(singlePeriodMpd());
      expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
    });

    it('rejects an imported MPD with more than one Period', async () => {
      // Clause 8.15.2: one and only one Period element shall be present, so a
      // multi-Period imported MPD does not conform (step 1.b) and the empty
      // Linked Period is removed (step 2).
      const twoPeriodMpd = [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"',
        '    mediaPresentationDuration="PT20S">',
        '  <Period duration="PT10S">',
        '    <AdaptationSet mimeType="video/mp4"/>',
        '  </Period>',
        '  <Period duration="PT10S">',
        '    <AdaptationSet mimeType="video/mp4"/>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      fakeNetEngine.setResponseText(
          'https://example.com/ad/manifest.mpd', twoPeriodMpd);

      const TXml = shaka.util.TXml;
      const mpd = await processLinkedPeriods(singlePeriodMpd());
      expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
    });

    it('rejects a type="list" imported MPD', async () => {
      const listImported =
          importedMpdXml.replace('type="static"', 'type="list"');
      fakeNetEngine.setResponseText(
          'https://example.com/ad/manifest.mpd', listImported);

      const TXml = shaka.util.TXml;
      const mpd = await processLinkedPeriods(singlePeriodMpd());
      expect(TXml.findChildren(mpd, 'Period').length).toBe(0);
    });

    it('accepts an imported MPD with no @type (defaults to static)',
        async () => {
          const noType = importedMpdXml.replace(' type="static"', '');
          fakeNetEngine.setResponseText(
              'https://example.com/ad/manifest.mpd', noType);

          const TXml = shaka.util.TXml;
          const period = await getPeriod(singlePeriodMpd());
          expect(TXml.findChildren(period, 'AdaptationSet').length).toBe(1);
        });

    it('handles a mix of resolvable and failing Linked Periods', async () => {
      // Period 1 resolves; Period 2 points at a missing URL and has no content.
      const listMpd = [
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="list">',
        '  <Period id="1">',
        '    <ImportedMPD>https://example.com/ad/manifest.mpd</ImportedMPD>',
        '  </Period>',
        '  <Period id="2">',
        '    <ImportedMPD>https://example.com/missing.mpd</ImportedMPD>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const TXml = shaka.util.TXml;
      const mpd = await processLinkedPeriods(listMpd);
      const periods = TXml.findChildren(mpd, 'Period');
      // The failing, empty Period 2 is removed; Period 1 is merged (step 2).
      expect(periods.length).toBe(1);
      expect(periods[0].attributes['id']).toBe('1');
      expect(TXml.findChildren(periods[0], 'AdaptationSet').length).toBe(1);
    });
  });
});
