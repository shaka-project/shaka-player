/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test basic manifest parsing functionality.
describe('DashParser Manifest', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Dash = shaka.test.Dash;
  const mp4IndexSegmentUri = '/base/test/test/assets/index-segment.mp4';

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {!ArrayBuffer} */
  let mp4Index;

  beforeAll(async () => {
    mp4Index = await shaka.test.Util.fetch(mp4IndexSegmentUri);
  });

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
    onEventSpy = jasmine.createSpy('onEvent');
    playerInterface = {
      networkingEngine: fakeNetEngine,
      filterNewPeriod: () => {},
      filterAllPeriods: () => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
      onError: fail,
    };
  });

  /**
   * Makes a series of tests for the given manifest type.
   *
   * @param {!Array.<string>} startLines
   * @param {!Array.<string>} endLines
   * @param {shaka.extern.Manifest} expected
   */
  function makeTestsForEach(startLines, endLines, expected) {
    /**
     * Makes manifest text for testing.
     *
     * @param {!Array.<string>} lines
     * @return {string}
     */
    function makeTestManifest(lines) {
      return startLines.concat(lines, endLines).join('\n');
    }

    /**
     * Tests that the parser produces the correct results.
     *
     * @param {string} manifestText
     * @return {!Promise}
     */
    async function testDashParser(manifestText) {
      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      const actual = await parser.start('dummy://foo', playerInterface);
      expect(actual).toEqual(expected);
    }

    it('with SegmentBase', async () => {
      const source = makeTestManifest([
        '    <SegmentBase indexRange="100-200" timescale="9000">',
        '      <Initialization sourceURL="init.mp4" range="201-300" />',
        '    </SegmentBase>',
      ]);
      await testDashParser(source);
    });

    it('with SegmentList', async () => {
      const source = makeTestManifest([
        '    <SegmentList startNumber="1" duration="10">',
        '      <Initialization sourceURL="init.mp4" range="201-300" />',
        '      <SegmentURL media="s1.mp4" />',
        '    </SegmentList>',
      ]);
      await testDashParser(source);
    });

    it('with SegmentTemplate', async () => {
      const source = makeTestManifest([
        '    <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '        initialization="init.mp4">',
        '      <Initialization sourceURL="init.mp4" range="201-300" />',
        '      <SegmentTimeline>',
        '        <S t="0" d="30" />',
        '      </SegmentTimeline>',
        '    </SegmentTemplate>',
      ]);
      await testDashParser(source);
    });
  }

  describe('parses and inherits attributes', () => {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>',
        ],
        [
          '    <AdaptationSet contentType="video" mimeType="video/mp4"',
          '        codecs="avc1.4d401f" frameRate="1000000/42000">',
          '      <Representation bandwidth="100" width="768" height="576" />',
          '      <Representation bandwidth="50" width="576" height="432" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="text/vtt"',
          '        lang="es" label="spanish">',
          '      <Role value="caption" />',
          '      <Role value="main" />',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="audio/mp4" lang="en" ',
          '                             codecs="mp4a.40.29">',
          '      <Role value="main" />',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ],
        shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.anyTimeline();
          manifest.minBufferTime = 75;
          manifest.addPeriod(null, (period) => {
            period.addPartialVariant((variant) => {
              variant.language = 'en';
              variant.bandwidth = 200;
              variant.primary = true;
              variant.addPartialStream(ContentType.VIDEO, (stream) => {
                stream.bandwidth = 100;
                stream.frameRate = 1000000 / 42000;
                stream.size(768, 576);
                stream.mime('video/mp4', 'avc1.4d401f');
              });
              variant.addPartialStream(ContentType.AUDIO, (stream) => {
                stream.bandwidth = 100;
                stream.primary = true;
                stream.roles = ['main'];
                stream.mime('audio/mp4', 'mp4a.40.29');
              });
            });
            period.addPartialVariant((variant) => {
              variant.language = 'en';
              variant.bandwidth = 150;
              variant.primary = true;
              variant.addPartialStream(ContentType.VIDEO, (stream) => {
                stream.bandwidth = 50;
                stream.frameRate = 1000000 / 42000;
                stream.size(576, 432);
                stream.mime('video/mp4', 'avc1.4d401f');
              });
              variant.addPartialStream(ContentType.AUDIO, (stream) => {
                stream.bandwidth = 100;
                stream.primary = true;
                stream.roles = ['main'];
                stream.mime('audio/mp4', 'mp4a.40.29');
              });
            });
            period.addPartialTextStream((stream) => {
              stream.language = 'es';
              stream.label = 'spanish';
              stream.primary = true;
              stream.mimeType = 'text/vtt';
              stream.bandwidth = 100;
              stream.kind = 'caption';
              stream.roles = ['caption', 'main'];
            });
          });
        }));
  });

  it('skips any periods after one without duration', async () => {
    const periodContents = [
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100">',
      '        <SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '          <Initialization sourceURL="init.mp4" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
    ].join('\n');
    const template = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period id="1">',
      '%(periodContents)s',
      '  </Period>',
      '  <Period id="2">',
      '%(periodContents)s',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const source = sprintf(template, {periodContents: periodContents});

    fakeNetEngine.setResponseText('dummy://foo', source);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);
  });

  it('calculates Period times when missing', async () => {
    const periodContents = [
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100">',
      '        <SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '          <Initialization sourceURL="init.mp4" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
    ].join('\n');
    const template = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period id="1" start="PT10S">',
      '%(periodContents)s',
      '  </Period>',
      '  <Period id="2" start="PT20S" duration="PT10S">',
      '%(periodContents)s',
      '  </Period>',
      '  <Period id="3" duration="PT10S">',
      '%(periodContents)s',
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const source = sprintf(template, {periodContents: periodContents});

    fakeNetEngine.setResponseText('dummy://foo', source);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(3);
    expect(manifest.periods[0].startTime).toBe(10);
    expect(manifest.periods[1].startTime).toBe(20);
    expect(manifest.periods[2].startTime).toBe(30);
  });

  it('defaults to SegmentBase with multiple Segment*', async () => {
    const source = Dash.makeSimpleManifestText([
      '<SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '</SegmentBase>',
      '<SegmentList presentationTimeOffset="2" duration="10">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>',
    ]);

    fakeNetEngine.setResponseText('dummy://foo', source);
    fakeNetEngine.setResponseValue('http://example.com', mp4Index);
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.periods[0].variants[0].video;
    await stream.createSegmentIndex();
    const ref = stream.segmentIndex.get(0);
    expect(ref.presentationTimeOffset).toBe(1);
  });

  it('defaults to SegmentList with SegmentTemplate', async () => {
    const source = Dash.makeSimpleManifestText([
      '<SegmentList presentationTimeOffset="2" duration="10">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>',
      '<SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
      '    presentationTimeOffset="3" initialization="init.mp4">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '  <SegmentTimeline>',
      '    <S t="0" d="30" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ]);

    fakeNetEngine.setResponseText('dummy://foo', source);
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.periods[0].variants[0].video;
    await stream.createSegmentIndex();
    const position = stream.segmentIndex.find(0);
    const ref = stream.segmentIndex.get(position);
    expect(ref.presentationTimeOffset).toBe(2);
  });

  it('generates a correct index for non-segmented text', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT30S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet mimeType="text/vtt" lang="de">',
      '      <Representation>',
      '        <BaseURL>http://example.com/de.vtt</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.periods[0].textStreams[0];
    await stream.createSegmentIndex();
    expect(stream.segmentIndex.find(0)).toBe(1);
    expect(stream.segmentIndex.get(1)).toEqual(new shaka.media.SegmentReference(
        /* position */ 1,
        /* startTime */ 0,
        /* endTime */ 30,
        /* getUris */ () => ['http://example.com/de.vtt'],
        /* startByte */ 0,
        /* endBytes */ null,
        /* initSegmentReference */ null,
        /* presentationTimeOffset */ 0));
  });

  it('correctly parses closed captions with channels and languages',
      async () => {
        const source = [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-608:2015"',
          '         value="CC1=eng;CC3=swe"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-608:2015"',
          '         value="CC1=lang:eng;CC3=lang:swe"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-608:2015"',
          '         value="1=lang:eng;3=lang:swe,war:1,er:1"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);

        const manifest = await parser.start('dummy://foo', playerInterface);
        // First Representation should be dropped.
        const period = manifest.periods[0];
        const stream1 = period.variants[0].video;
        const stream2 = period.variants[1].video;
        const stream3 = period.variants[2].video;

        const expectedClosedCaptions = new Map(
            [['CC1', shaka.util.LanguageUtils.normalize('eng')],
              ['CC3', shaka.util.LanguageUtils.normalize('swe')]]
        );
        expect(stream1.closedCaptions).toEqual(expectedClosedCaptions);
        expect(stream2.closedCaptions).toEqual(expectedClosedCaptions);
        expect(stream3.closedCaptions).toEqual(expectedClosedCaptions);
      });

  it('correctly parses closed captions without channel numbers', async () => {
    const source = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-608:2015"',
      '         value="eng;swe"/>',
      '      <Representation bandwidth="200">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.periods[0].variants[0].video;
    const expectedClosedCaptions = new Map(
        [['CC1', shaka.util.LanguageUtils.normalize('eng')],
          ['CC3', shaka.util.LanguageUtils.normalize('swe')]]
    );
    expect(stream.closedCaptions).toEqual(expectedClosedCaptions);
  });

  it('correctly parses closed captions with no channel and language info',
      async () => {
        const source = [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-608:2015"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);

        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream = manifest.periods[0].variants[0].video;
        const expectedClosedCaptions = new Map([['CC1', 'und']]);
        expect(stream.closedCaptions).toEqual(expectedClosedCaptions);
      });

  it('correctly parses UTF-8', async () => {
    const source = [
      '<MPD>',
      '  <Period duration="PT30M">',
      '    <AdaptationSet mimeType="audio/mp4" lang="\u2603">',
      '      <Representation bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="2.mp4" duration="1"',
      '            initialization="\u0227.mp4" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.periods[0].variants[0];
    const stream = manifest.periods[0].variants[0].audio;
    await stream.createSegmentIndex();
    const position = stream.segmentIndex.find(0);
    const segment = stream.segmentIndex.get(position);
    expect(segment.initSegmentReference.getUris()[0])
        .toBe('http://example.com/%C8%A7.mp4');
    expect(variant.language).toBe('\u2603');
  });

  describe('supports UTCTiming', () => {
    const originalNow = Date.now;

    beforeAll(() => {
      Date.now = () => 10 * 1000;
    });

    afterAll(() => {
      Date.now = originalNow;
    });

    /**
     * @param {!Array.<string>} lines
     * @return {string}
     */
    function makeManifest(lines) {
      const template = [
        '<MPD type="dynamic"',
        '     availabilityStartTime="1970-01-01T00:00:00Z"',
        '     timeShiftBufferDepth="PT60S"',
        '     maxSegmentDuration="PT5S"',
        '     suggestedPresentationDelay="PT0S">',
        '  %s',
        '  <Period>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="500">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentTemplate media="2.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      return sprintf(template, lines.join('\n'));
    }

    /**
     * @param {number} expectedTime
     * @return {!Promise}
     */
    async function runTest(expectedTime) {
      const manifest = await parser.start(
          'http://foo.bar/manifest', playerInterface);
      expect(manifest.presentationTimeline).toBeTruthy();
      expect(manifest.presentationTimeline.getSegmentAvailabilityEnd())
          .toBe(expectedTime);
    }

    it('with direct', async () => {
      const source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:direct:2014"',
        '    value="1970-01-01T00:00:30Z" />',
      ]);

      fakeNetEngine.setResponseText('http://foo.bar/manifest', source);
      await runTest(25);
    });

    it('does not produce errors', async () => {
      const source = makeManifest([
        '<UTCTiming schemeIdUri="unknown scheme" value="foobar" />',
      ]);

      fakeNetEngine.setResponseText('http://foo.bar/manifest', source);
      await runTest(5);
    });

    it('tries multiple sources', async () => {
      const source = makeManifest([
        '<UTCTiming schemeIdUri="unknown scheme" value="foobar" />',
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:direct:2014"',
        '    value="1970-01-01T00:00:55Z" />',
      ]);

      fakeNetEngine.setResponseText('http://foo.bar/manifest', source);
      await runTest(50);
    });

    it('with HEAD', async () => {
      const source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-head:2014"',
        '    value="http://foo.bar/date" />',
      ]);

      fakeNetEngine.request.and.callFake((type, request) => {
        if (request.uris[0] == 'http://foo.bar/manifest') {
          const data = shaka.util.StringUtils.toUTF8(source);
          return shaka.util.AbortableOperation.completed({
            data: data,
            headers: {},
            uri: '',
          });
        } else {
          expect(request.uris[0]).toBe('http://foo.bar/date');
          return shaka.util.AbortableOperation.completed({
            data: new ArrayBuffer(0),
            headers: {'date': '1970-01-01T00:00:40Z'},
            uri: '',
          });
        }
      });
      await runTest(35);
    });

    it('with xsdate', async () => {
      const source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="http://foo.bar/date" />',
      ]);

      fakeNetEngine
          .setResponseText('http://foo.bar/manifest', source)
          .setResponseText('http://foo.bar/date', '1970-01-01T00:00:50Z');
      await runTest(45);
    });

    it('with relative paths', async () => {
      const source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="/date" />',
      ]);

      fakeNetEngine
          .setResponseText('http://foo.bar/manifest', source)
          .setResponseText('http://foo.bar/date', '1970-01-01T00:00:50Z');
      await runTest(45);
    });

    it('with paths relative to BaseURLs', async () => {
      const source = makeManifest([
        '<BaseURL>http://example.com</BaseURL>',
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="/date" />',
      ]);

      fakeNetEngine
          .setResponseText('http://foo.bar/manifest', source)
          .setResponseText('http://example.com/date', '1970-01-01T00:00:50Z');
      await runTest(45);
    });
  });

  it('handles missing Segment* elements', async () => {
    const source = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100" />',
      '      <Representation bandwidth="200">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);

    const manifest = await parser.start('dummy://foo', playerInterface);
    // First Representation should be dropped.
    const period = manifest.periods[0];
    expect(period.variants.length).toBe(1);
    expect(period.variants[0].bandwidth).toBe(200);
  });

  describe('allows missing Segment* elements for text', () => {
    it('specified via AdaptationSet@contentType', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '    <AdaptationSet contentType="text" lang="en" group="1">',
        '      <Representation />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);

      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.periods[0].textStreams.length).toBe(1);
    });

    it('specified via AdaptationSet@mimeType', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '    <AdaptationSet mimeType="text/vtt" lang="en" group="1">',
        '      <Representation />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);

      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.periods[0].textStreams.length).toBe(1);
    });

    it('specified via Representation@mimeType', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '    <AdaptationSet>',
        '      <Representation mimeType="text/vtt" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);

      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.periods[0].textStreams.length).toBe(1);
    });
  });

  describe('fails for', () => {
    it('invalid XML', async () => {
      const source = '<not XML';
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML,
          'dummy://foo');
      await Dash.testFails(source, error);
    });

    it('XML with inner errors', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation', // Missing a close bracket.
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML,
          'dummy://foo');
      await Dash.testFails(source, error);
    });

    it('xlink problems when xlinkFailGracefully is false', async () => {
      const source = [
        '<MPD minBufferTime="PT75S" xmlns="urn:mpeg:dash:schema:mpd:2011" ' +
            'xmlns:xlink="http://www.w3.org/1999/xlink">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1" xlink:href="https://xlink1" ' +
            'xlink:actuate="onInvalid">', // Incorrect actuate
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_XLINK_ACTUATE);
      await Dash.testFails(source, error);
    });

    it('failed network requests', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      fakeNetEngine.request.and.returnValue(
          shaka.util.AbortableOperation.failed(expectedError));
      await expectAsync(parser.start('', playerInterface))
          .toBeRejectedWith(shaka.test.Util.jasmineError(expectedError));
    });

    it('missing MPD element', async () => {
      const source = '<XML></XML>';
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML,
          'dummy://foo');
      await Dash.testFails(source, error);
    });

    it('empty AdaptationSet', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4" lang="en" group="1" />',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_ADAPTATION_SET);
      await Dash.testFails(source, error);
    });

    it('empty Period', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S" />',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_PERIOD);
      await Dash.testFails(source, error);
    });

    it('duplicate Representation ids with live', async () => {
      const source = [
        '<MPD minBufferTime="PT75S" type="dynamic">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="1" bandwidth="1">',
        '        <SegmentTemplate media="1.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="1" bandwidth="1">',
        '        <SegmentTemplate media="2.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_DUPLICATE_REPRESENTATION_ID);
      await Dash.testFails(source, error);
    });
  });

  it('parses trickmode tracks', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);
    expect(manifest.periods[0].variants.length).toBe(1);
    expect(manifest.periods[0].textStreams.length).toBe(0);

    const variant = manifest.periods[0].variants[0];
    const trickModeVideo = variant && variant.video &&
                         variant.video.trickModeVideo;
    expect(trickModeVideo).toEqual(jasmine.objectContaining({
      id: 2,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
    }));
  });

  it('skips unrecognized EssentialProperty elements', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty schemeIdUri="http://foo.bar/" />',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);

    // The bogus EssentialProperty did not result in a variant.
    expect(manifest.periods[0].variants.length).toBe(1);
    expect(manifest.periods[0].textStreams.length).toBe(0);

    // The bogus EssentialProperty did not result in a trick mode track.
    const variant = manifest.periods[0].variants[0];
    const trickModeVideo = variant && variant.video &&
                         variant.video.trickModeVideo;
    expect(trickModeVideo).toBe(null);
  });

  it('sets contentType to text for embedded text mime types', async () => {
    // One MIME type for embedded TTML, one for embedded WebVTT.
    // One MIME type specified on AdaptationSet, on one Representation.
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="1" mimeType="application/mp4" codecs="stpp">',
      '      <Representation>',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2">',
      '      <Representation mimeType="application/mp4" codecs="wvtt">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);
    expect(manifest.periods[0].textStreams.length).toBe(2);
    // At one time, these came out as 'application' rather than 'text'.
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    expect(manifest.periods[0].textStreams[0].type).toBe(ContentType.TEXT);
    expect(manifest.periods[0].textStreams[1].type).toBe(ContentType.TEXT);
  });

  it('handles text with mime and codecs on different levels', async () => {
    // Regression test for #875
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="1" mimeType="application/mp4">',
      '      <Representation codecs="stpp">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);

    // In #875, this was an empty list.
    expect(manifest.periods[0].textStreams.length).toBe(1);
    if (manifest.periods[0].textStreams.length) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      expect(manifest.periods[0].textStreams[0].type).toBe(ContentType.TEXT);
    }
  });

  it('ignores duplicate Representation IDs for VOD', async () => {
    const source = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="1">',
      '        <SegmentTemplate media="1.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="30" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="1">',
      '        <SegmentTemplate media="2.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="30" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    // See https://bit.ly/2tx7f7A
    // The old error was that with SegmentTimeline, duplicate Representation IDs
    // would use the same segment index, so they would have the same references.
    // This test proves that duplicate Representation IDs are allowed for VOD
    // and that error doesn't occur.
    fakeNetEngine.setResponseText('dummy://foo', source);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);
    expect(manifest.periods[0].variants.length).toBe(2);

    const variant1 = manifest.periods[0].variants[0];
    const variant2 = manifest.periods[0].variants[1];
    expect(variant1.video).toBeTruthy();
    expect(variant2.video).toBeTruthy();
    await variant1.video.createSegmentIndex();
    await variant2.video.createSegmentIndex();
    expect(variant1.video.segmentIndex.get(1).getUris())
        .toEqual(['dummy://foo/1.mp4']);
    expect(variant2.video.segmentIndex.get(1).getUris())
        .toEqual(['dummy://foo/2.mp4']);
  });

  it('handles bandwidth of 0 or missing', async () => {
    // Regression test for https://github.com/google/shaka-player/issues/938
    const source = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="1">',
      '        <SegmentTemplate media="1-$Number$.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet mimeType="audio/mp4">',
      '      <Representation id="2" bandwidth="0">',
      '        <SegmentTemplate media="2-$Number$.mp4" duration="1" />',
      '      </Representation>',
      '      <Representation id="3">',
      '        <SegmentTemplate media="3-$Number$.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.periods.length).toBe(1);
    expect(manifest.periods[0].variants.length).toBe(2);

    const variant1 = manifest.periods[0].variants[0];
    expect(isNaN(variant1.bandwidth)).toBe(false);
    expect(variant1.bandwidth).toBeGreaterThan(0);

    const variant2 = manifest.periods[0].variants[1];
    expect(isNaN(variant2.bandwidth)).toBe(false);
    expect(variant2.bandwidth).toBeGreaterThan(0);
  });

  describe('AudioChannelConfiguration', () => {
    /**
     * @param {?number} expectedNumChannels The expected number of channels
     * @param {!Object.<string, string>} schemeMap A map where the map key is
     *   the AudioChannelConfiguration's schemeIdUri attribute, and the map
     *   value is the value attribute.
     * @return {!Promise}
     */
    async function testAudioChannelConfiguration(
        expectedNumChannels, schemeMap) {
      const header = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="audio/mp4">',
        '      <Representation id="1" bandwidth="1">',
      ].join('\n');

      const configs = [];
      for (const scheme in schemeMap) {
        const value = schemeMap[scheme];
        configs.push('<AudioChannelConfiguration schemeIdUri="' + scheme +
                     '" value="' + value + '" />');
      }

      const footer = [
        '        <SegmentTemplate media="1-$Number$.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const source = header + configs.join('\n') + footer;

      // Create a fresh parser, to avoid issues when we chain multiple tests
      // together.
      parser = shaka.test.Dash.makeDashParser();

      fakeNetEngine.setResponseText('dummy://foo', source);
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.periods.length).toBe(1);
      expect(manifest.periods[0].variants.length).toBe(1);

      const variant = manifest.periods[0].variants[0];
      expect(variant.audio.channelsCount).toBe(expectedNumChannels);
    }

    it('parses outputChannelPositionList scheme', async () => {
      // Parses the space-separated list and finds 8 channels.
      await testAudioChannelConfiguration(8,
          {'urn:mpeg:dash:outputChannelPositionList:2012':
                '2 0 1 4 5 3 17 1'});

      // Does not get confused about extra spaces.
      await testAudioChannelConfiguration(7,
          {'urn:mpeg:dash:outputChannelPositionList:2012':
                '  5 2 1 12   8 9   1  '});
    });

    it('parses 23003:3 scheme', async () => {
      // Parses a simple channel count.
      await testAudioChannelConfiguration(2,
          {'urn:mpeg:dash:23003:3:audio_channel_configuration:2011': '2'});

      // This scheme seems to use the same format.
      await testAudioChannelConfiguration(6,
          {'urn:dts:dash:audio_channel_configuration:2012': '6'});

      // Results in null if the value is not an integer.
      await testAudioChannelConfiguration(null,
          {'urn:mpeg:dash:23003:3:audio_channel_configuration:2011': 'foo'});
    });

    it('parses dolby scheme', async () => {
      // Parses a hex value in which each 1-bit is a channel.
      await testAudioChannelConfiguration(6,
          {'tag:dolby.com,2014:dash:audio_channel_configuration:2011':
                'F801'});

      // This scheme seems to use the same format.
      await testAudioChannelConfiguration(8,
          {'urn:dolby:dash:audio_channel_configuration:2011': '7037'});

      // Results in null if the value is not a valid hex number.
      await testAudioChannelConfiguration(null,
          {'urn:dolby:dash:audio_channel_configuration:2011': 'x'});
    });

    it('ignores unrecognized schemes', async () => {
      await testAudioChannelConfiguration(null, {'foo': 'bar'});

      await testAudioChannelConfiguration(2, {
        'foo': 'bar',
        'urn:mpeg:dash:23003:3:audio_channel_configuration:2011': '2',
      });
    });
  });

  it('does not fail on AdaptationSets without segment info', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" contentType="text">',
      '      <Representation mimeType="application/mp4" codecs="stpp">',
      '        <SegmentTemplate media="$Number$.mp4" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    await parser.start('dummy://foo', playerInterface);
  });

  it('exposes Representation IDs', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" contentType="text">',
      '      <Representation id="text-en" mimeType="text/webvtt">',
      '        <BaseURL>t-en.vtt</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="audio/mp4">',
      '      <Representation id="audio-en">',
      '        <BaseURL>a-en.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.periods[0].variants[0];
    const textStream = manifest.periods[0].textStreams[0];
    expect(variant.audio.originalId).toBe('audio-en');
    expect(variant.video.originalId).toBe('video-sd');
    expect(textStream.originalId).toBe('text-en');
  });

  it('Disable audio does not create audio streams', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="audio/mp4">',
      '      <Representation id="audio-en">',
      '        <BaseURL>a-en.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableAudio = true;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.periods[0].variants[0];
    expect(variant.audio).toBe(null);
    expect(variant.video).toBeTruthy();
  });

  it('Disable video does not create video streams', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="audio/mp4">',
      '      <Representation id="audio-en">',
      '        <BaseURL>a-en.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableVideo = true;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.periods[0].variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBe(null);
  });

  it('Disable text does not create text streams', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="audio/mp4">',
      '      <Representation id="audio-en">',
      '        <BaseURL>a-en.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet mimeType="text/vtt" lang="de">',
      '      <Representation>',
      '        <BaseURL>http://example.com/de.vtt</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableText = true;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.periods[0].textStreams[0];
    expect(stream).toBeUndefined();
  });

  it('override manifest value if ignoreMinBufferTime is true', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreMinBufferTime = true;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const minBufferTime = manifest.minBufferTime;
    expect(minBufferTime).toBe(0);
  });

  it('get manifest value if ignoreMinBufferTime is false', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreMinBufferTime = false;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const minBufferTime = manifest.minBufferTime;
    expect(minBufferTime).toBe(75);
  });

  it('does not set presentationDelay to NaN', async () => {
    // NOTE: This is a regression test for #2015. It ensures that, if
    // ignoreMinBufferTime is true and there is no suggestedPresentationDelay,
    // we do not erroneously set presentationDelay to NaN.
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreMinBufferTime = true;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const presentationTimeline = manifest.presentationTimeline;
    const presentationDelay = presentationTimeline.getDelay();
    expect(presentationDelay).not.toBeNaN();
    expect(presentationDelay).toBe(config.dash.defaultPresentationDelay);
  });

  it('Honors the ignoreSuggestedPresentationDelay config', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT2S" suggestedPresentationDelay="PT25S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreSuggestedPresentationDelay = true;
    parser.configure(config);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const presentationTimeline = manifest.presentationTimeline;
    const presentationDelay = presentationTimeline.getDelay();
    expect(presentationDelay).toBe(config.dash.defaultPresentationDelay);
  });

  it('converts Accessibility element to "kind"', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" contentType="text">',
      '      <Accessibility schemeIdUri="urn:mpeg:dash:role:2011" ',
      '          value="captions" />',
      '      <Accessibility schemeIdUri="urn:mpeg:dash:role:2011" ',
      '          value="foo" />',
      '      <Accessibility schemeIdUri="foobar" value="bar" />',
      '      <Representation id="text-en" mimeType="text/webvtt">',
      '        <BaseURL>t-en.vtt</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const manifest = await parser.start('dummy://foo', playerInterface);
    const textStream = manifest.periods[0].textStreams[0];
    expect(textStream.roles).toEqual(['captions', 'foo']);
    expect(textStream.kind).toBe('caption');
  });

  it('Does not error when image adaptation sets are present', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="audio/mp4">',
      '      <Representation id="audio-en">',
      '        <BaseURL>a-en.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet contentType="image" id="3">',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.periods[0].variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBeTruthy();
  });
});
