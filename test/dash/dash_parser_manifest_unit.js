/*! @license
 * Shaka Player
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
  /** @type {!jasmine.Spy} */
  let addFontSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {!ArrayBuffer} */
  let mp4Index;

  /** @type {string} */
  const thumbnailScheme = 'http://dashif.org/guidelines/thumbnail_tile';
  /**
   * CICP scheme. parameter must be one of the following: "ColourPrimaries",
   * "TransferCharacteristics", or "MatrixCoefficients".
   *
   * @param {string} parameter
   * @return {string}
   */
  const cicpScheme = (parameter) => `urn:mpeg:mpegB:cicp:${parameter}`;

  beforeAll(async () => {
    mp4Index = await shaka.test.Util.fetch(mp4IndexSegmentUri);
  });

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
    onEventSpy = jasmine.createSpy('onEvent');
    addFontSpy = jasmine.createSpy('addFont');
    playerInterface = {
      networkingEngine: fakeNetEngine,
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
      onError: fail,
      isLowLatencyMode: () => false,
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
      onMetadata: () => {},
      disableStream: (stream) => {},
      addFont: shaka.test.Util.spyFunc(addFontSpy),
    };
  });

  afterEach(() => {
    // Dash parser stop is synchronous.
    parser.stop();
  });

  /**
   * Makes a series of tests for the given manifest type.
   *
   * @param {!Array<string>} startLines
   * @param {!Array<string>} endLines
   * @param {shaka.extern.Manifest} expected
   */
  function makeTestsForEach(startLines, endLines, expected) {
    /**
     * Makes manifest text for testing.
     *
     * @param {!Array<string>} lines
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

  describe('parses and inherits attributes with sequenceMode', () => {
    beforeEach(() => {
      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.sequenceMode = true;
      parser.configure(config);
    });

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
          '        lang="spa" label="spanish">',
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
          manifest.sequenceMode = true;
          manifest.type = shaka.media.ManifestParser.DASH;
          manifest.anyTimeline();
          manifest.addPartialVariant((variant) => {
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
          manifest.addPartialVariant((variant) => {
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
          manifest.addPartialTextStream((stream) => {
            stream.language = 'es';
            stream.originalLanguage = 'spa';
            stream.label = 'spanish';
            stream.primary = true;
            stream.mimeType = 'text/vtt';
            stream.bandwidth = 100;
            stream.kind = 'caption';
            stream.roles = ['caption', 'main'];
          });
        }));
  });

  describe('parses and inherits attributes without sequenceMode', () => {
    beforeEach(() => {
      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.sequenceMode = false;
      parser.configure(config);
    });


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
          manifest.sequenceMode = false;
          manifest.type = shaka.media.ManifestParser.DASH;
          manifest.anyTimeline();
          manifest.addPartialVariant((variant) => {
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
          manifest.addPartialVariant((variant) => {
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
          manifest.addPartialTextStream((stream) => {
            stream.language = 'es';
            stream.label = 'spanish';
            stream.primary = true;
            stream.mimeType = 'text/vtt';
            stream.bandwidth = 100;
            stream.kind = 'caption';
            stream.roles = ['caption', 'main'];
          });
        }));
  });

  it('calculates Period times when missing', async () => {
    const periodContents = [
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100">',
      '        <SegmentTemplate duration="2" media="s$Number$.mp4" />',
      '      </Representation>',
      '    </AdaptationSet>',
    ].join('\n');
    const template = [
      '<MPD>',
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const timeline = manifest.presentationTimeline;
    expect(timeline.getDuration()).toBe(40);
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.variants[0].video;
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

    const ref = Array.from(stream.segmentIndex)[0];
    expect(ref.timestampOffset).toBe(-1);
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.variants[0].video;
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

    const ref = Array.from(stream.segmentIndex)[0];
    expect(ref.timestampOffset).toBe(-2);
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.textStreams[0];
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

    const ref = Array.from(stream.segmentIndex)[0];
    expect(ref).toEqual(new shaka.media.SegmentReference(
        /* startTime= */ 0,
        /* endTime= */ 30,
        /* getUris= */ () => ['http://example.com/de.vtt'],
        /* startByte= */ 0,
        /* endBytes= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ 30));
  });

  it('correctly parses mixed captions with channels, services, and languages',
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
          '    <AdaptationSet mimeType="video/mp4" lang="ru" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-708:2015"',
          '         value="1=lang:bos;3=lang:cze,war:1,er:1"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);

        /** @type {shaka.extern.Manifest} */
        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream1 = manifest.variants[0].video;
        const stream2 = manifest.variants[1].video;

        const expectedClosedCaptions1 = new Map([
          ['CC1', shaka.util.LanguageUtils.normalize('eng')],
          ['CC3', shaka.util.LanguageUtils.normalize('swe')],
        ]);

        const expectedClosedCaptions2 = new Map([
          ['svc1', shaka.util.LanguageUtils.normalize('bos')],
          ['svc3', shaka.util.LanguageUtils.normalize('cze')],
        ]);
        expect(stream1.closedCaptions).toEqual(expectedClosedCaptions1);
        expect(stream2.closedCaptions).toEqual(expectedClosedCaptions2);
      });

  it('correctly parses CEA-708 caption tags with service numbers and languages',
      async () => {
        const source = [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-708:2015"',
          '         value="1=lang:eng;3=lang:swe,er"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);

        /** @type {shaka.extern.Manifest} */
        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream = manifest.variants[0].video;
        const expectedClosedCaptions = new Map([
          ['svc1', shaka.util.LanguageUtils.normalize('eng')],
          ['svc3', shaka.util.LanguageUtils.normalize('swe')],
        ]);
        expect(stream.closedCaptions).toEqual(expectedClosedCaptions);
      });

  it('correctly parses CEA-708 caption tags without service #s and languages',
      async () => {
        const source = [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-708:2015"',
          '         value="eng;swe"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);

        /** @type {shaka.extern.Manifest} */
        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream = manifest.variants[0].video;
        const expectedClosedCaptions = new Map([
          ['svc1', shaka.util.LanguageUtils.normalize('eng')],
          ['svc2', shaka.util.LanguageUtils.normalize('swe')],
        ]);
        expect(stream.closedCaptions).toEqual(expectedClosedCaptions);
      });

  it('Detects spatial audio', async () => {
    const idUri = 'tag:dolby.com,2018:dash:EC3_ExtensionType:2018';
    const source = [
      '<MPD>',
      '  <Period duration="PT30M">',
      '    <AdaptationSet mimeType="audio/mp4" lang="\u2603">',
      '      <Representation bandwidth="500">',
      '        <SupplementalProperty schemeIdUri="' + idUri + '" value="JOC"/>',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.variants[0].audio;
    expect(stream.spatialAudio).toBe(true);
  });

  it('correctly parses CEA-608 closed caption tags without channel numbers',
      async () => {
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
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Accessibility schemeIdUri="urn:scte:dash:cc:cea-608:2015"',
          '         value="eng;swe;fre;pol"/>',
          '      <Representation bandwidth="200">',
          '        <SegmentTemplate media="1.mp4" duration="1" />',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);

        /** @type {shaka.extern.Manifest} */
        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream1 = manifest.variants[0].video;
        const stream2 = manifest.variants[1].video;

        const expectedClosedCaptions1 = new Map([
          ['CC1', shaka.util.LanguageUtils.normalize('eng')],
          ['CC3', shaka.util.LanguageUtils.normalize('swe')],
        ]);

        const expectedClosedCaptions2 = new Map([
          ['CC1', shaka.util.LanguageUtils.normalize('eng')],
          ['CC2', shaka.util.LanguageUtils.normalize('swe')],
          ['CC3', shaka.util.LanguageUtils.normalize('fre')],
          ['CC4', shaka.util.LanguageUtils.normalize('pol')],
        ]);

        expect(stream1.closedCaptions).toEqual(expectedClosedCaptions1);
        expect(stream2.closedCaptions).toEqual(expectedClosedCaptions2);
      });

  it('correctly parses CEA-608 caption tags with no channel and language info',
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

        /** @type {shaka.extern.Manifest} */
        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream = manifest.variants[0].video;
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    const stream = variant.audio;
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

    const segment = Array.from(stream.segmentIndex)[0];
    expect(segment.initSegmentReference.getUris()[0])
        .toBe('http://example.com/%C8%A7.mp4');
    expect(variant.language).toBe('\u2603');
  });

  describe('UTCTiming', () => {
    const originalNow = Date.now;
    const dateRequestType = shaka.net.NetworkingEngine.RequestType.TIMING;

    beforeAll(() => {
      Date.now = () => 10 * 1000;
    });

    beforeEach(() => {
      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.autoCorrectDrift = false;
      parser.configure(config);
    });

    afterAll(() => {
      Date.now = originalNow;
    });

    /**
     * @param {!Array<string>} lines
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
        '        <SegmentList>',
        '          <SegmentURL media="s1.mp4" />',
        '          <SegmentTimeline>',
        '            <S d="5" t="0" />',
        '          </SegmentTimeline>',
        '        </SegmentList>',
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
      /** @type {shaka.extern.Manifest} */
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

      fakeNetEngine.request.and.callFake((type, request, context) => {
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
      fakeNetEngine.expectRequest('http://foo.bar/date', dateRequestType);
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
      fakeNetEngine.expectRequest('http://foo.bar/date', dateRequestType);
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
      fakeNetEngine.expectRequest('http://foo.bar/date', dateRequestType);
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
      fakeNetEngine.expectRequest('http://example.com/date', dateRequestType);
    });

    it('ignored with autoCorrectDrift', async () => {
      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.autoCorrectDrift = true;
      parser.configure(config);

      const source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="http://foo.bar/date" />',
      ]);

      fakeNetEngine
          .setResponseText('http://foo.bar/manifest', source)
          .setResponseText('http://foo.bar/date', '1970-01-01T00:00:50Z');
      // Expect the presentation timeline to end at 5 based on the segments
      // instead of 45 based on the UTCTiming element.
      await runTest(5);
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    // First Representation should be dropped.
    expect(manifest.variants.length).toBe(1);
    expect(manifest.variants[0].bandwidth).toBe(200);
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

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.textStreams.length).toBe(1);
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

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.textStreams.length).toBe(1);
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

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.textStreams.length).toBe(1);
    });
  });

  describe('fails for', () => {
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

      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.disableXlinkProcessing = false;

      await Dash.testFails(source, error, config);
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
        '<MPD minBufferTime="PT75S" type="dynamic"',
        '     availabilityStartTime="1970-01-01T00:00:00Z">',
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

  it('parses dependencyStream tracks', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="main" bandwidth="1" codecs="avc1.4d401f"',
      '          bandwidth="2">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="enhance" dependencyId="main"',
      '          bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(2);
    expect(manifest.textStreams.length).toBe(0);

    let variant = manifest.variants[0];
    expect(variant.bandwidth).toBe(2);
    let video = variant && variant.video;
    expect(video).toEqual(jasmine.objectContaining({
      originalId: 'main',
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      bandwidth: 2,
    }));
    let dependencyStream = video && video.dependencyStream;
    expect(dependencyStream).toBeNull();

    variant = manifest.variants[1];
    expect(variant.bandwidth).toBe(3);
    video = variant && variant.video;
    expect(video).toEqual(jasmine.objectContaining({
      originalId: 'mainenhance',
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      bandwidth: 2,
    }));
    dependencyStream = video && video.dependencyStream;
    expect(dependencyStream).toEqual(jasmine.objectContaining({
      originalId: 'enhance',
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      bandwidth: 1,
      baseOriginalId: 'main',
    }));
  });

  it('parses trickmode tracks', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    expect(manifest.textStreams.length).toBe(0);

    const variant = manifest.variants[0];
    const trickModeVideo = variant && variant.video &&
                         variant.video.trickModeVideo;
    expect(trickModeVideo).toEqual(jasmine.objectContaining({
      id: 2,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
    }));
  });

  it('trick-mode track with multiple AdaptationSet elements', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation bandwidth="2" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="video/mp4">',
      '      <EssentialProperty value="1 2" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(2);
    expect(manifest.textStreams.length).toBe(0);

    const variant = manifest.variants[0];
    const trickModeVideo = variant && variant.video &&
                         variant.video.trickModeVideo;
    expect(trickModeVideo).toEqual(jasmine.objectContaining({
      id: 3,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
    }));

    const variant2 = manifest.variants[1];
    const trickModeVideo2 = variant2 && variant2.video &&
                         variant2.video.trickModeVideo;
    expect(trickModeVideo2).toEqual(jasmine.objectContaining({
      id: 3,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
    }));
  });

  it('multiple trick-mode tracks with multiple AdaptationSet elements', async () => { // eslint-disable-line @stylistic/max-len
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1" codecs="avc1.4d401f"',
      '          width="640" height="360">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '      <Representation bandwidth="2" codecs="avc1.4d401f"',
      '          width="1024" height="576">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="3" mimeType="video/mp4">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1" codecs="avc1.4d401f"',
      '          width="640" height="360">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '      <Representation bandwidth="2" codecs="avc1.4d401f"',
      '          width="1024" height="576">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(2);
    expect(manifest.textStreams.length).toBe(0);

    const variant = manifest.variants[0];
    const trickModeVideo = variant && variant.video &&
                         variant.video.trickModeVideo;
    expect(trickModeVideo).toEqual(jasmine.objectContaining({
      id: 3,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
    }));
    expect(trickModeVideo.bandwidth).toBe(1);

    const variant2 = manifest.variants[1];
    const trickModeVideo2 = variant2 && variant2.video &&
                         variant2.video.trickModeVideo;
    expect(trickModeVideo2).toEqual(jasmine.objectContaining({
      id: 4,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
    }));
    expect(trickModeVideo2.bandwidth).toBe(2);
  });

  it('ignore incompatible trickmode tracks', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1" codecs="foo">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    expect(manifest.textStreams.length).toBe(0);
    expect(manifest.variants[0].video.trickModeVideo).toBeUndefined();
  });

  it('Disable I-Frame does not create I-Frame streams', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1" codecs="avc1.4d401f">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.disableIFrames = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    expect(manifest.textStreams.length).toBe(0);

    const trickModeVideo = manifest.variants[0].video.trickModeVideo;
    expect(trickModeVideo).toBeNull();
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    // The bogus EssentialProperty did not result in a variant.
    expect(manifest.variants.length).toBe(1);
    expect(manifest.textStreams.length).toBe(0);

    // The bogus EssentialProperty did not result in a trick mode track.
    const variant = manifest.variants[0];
    const trickModeVideo = variant && variant.video &&
                         variant.video.trickModeVideo;
    expect(trickModeVideo).toBe(null);
  });

  it('populates groupId', async () => {
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);


    expect(manifest.variants.length).toBe(1);
    const variant = manifest.variants[0];
    expect(variant.audio.groupId).toBe('3');
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
      '    <AdaptationSet',
      '      id="1"',
      '      mimeType="application/mp4"',
      '      codecs="stpp"',
      '      lang="en"',
      '    >',
      '      <Representation>',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" lang="fr">',
      '      <Representation mimeType="application/mp4" codecs="wvtt">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.textStreams.length).toBe(2);
    // At one time, these came out as 'application' rather than 'text'.
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    expect(manifest.textStreams[0].type).toBe(ContentType.TEXT);
    expect(manifest.textStreams[1].type).toBe(ContentType.TEXT);
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    // In #875, this was an empty list.
    expect(manifest.textStreams.length).toBe(1);
    if (manifest.textStreams.length) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      expect(manifest.textStreams[0].type).toBe(ContentType.TEXT);
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
      '      <Representation id="1" bandwidth="2">',
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(2);

    const variant1 = manifest.variants[0];
    const variant2 = manifest.variants[1];

    await variant1.video.createSegmentIndex();
    await variant2.video.createSegmentIndex();
    goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');
    goog.asserts.assert(variant2.video.segmentIndex, 'Null segmentIndex!');

    const variant1Ref = Array.from(variant1.video.segmentIndex)[0];
    const variant2Ref = Array.from(variant2.video.segmentIndex)[0];

    expect(variant1Ref.getUris()).toEqual(['dummy://foo/1.mp4']);
    expect(variant2Ref.getUris()).toEqual(['dummy://foo/2.mp4']);
  });

  it('handles bandwidth of 0 or missing', async () => {
    // Regression test for
    // https://github.com/shaka-project/shaka-player/issues/938
    const source = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation id="1" bandwidth="1">',
      '        <SegmentTemplate media="1-$Number$.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet mimeType="audio/mp4" lang="en">',
      '      <Representation id="2" bandwidth="0">',
      '        <SegmentTemplate media="2-$Number$.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet mimeType="audio/mp4" lang="de">',
      '      <Representation id="3" >',
      '        <SegmentTemplate media="3-$Number$.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(2);

    const variant1 = manifest.variants[0];
    expect(isNaN(variant1.bandwidth)).toBe(false);
    expect(variant1.bandwidth).toBeGreaterThan(0);

    const variant2 = manifest.variants[1];
    expect(isNaN(variant2.bandwidth)).toBe(false);
    expect(variant2.bandwidth).toBeGreaterThan(0);
  });

  describe('AudioChannelConfiguration', () => {
    /**
     * @param {?number} expectedNumChannels The expected number of channels
     * @param {!Object<string, string>} schemeMap A map where the map key is
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
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant = manifest.variants[0];
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
      // L,R,C,LFE,Ls,Rs (5.1)
      await testAudioChannelConfiguration(6,
          {'tag:dolby.com,2014:dash:audio_channel_configuration:2011':
             'F801'});

      // L,R,C,LFE,Ls,Rs,Lrs,Rrs (7.1)
      await testAudioChannelConfiguration(8,
          {'tag:dolby.com,2014:dash:audio_channel_configuration:2011':
             'FA01'});

      // L,R,C,LFE,Ls,Rs,Ltm,Rtm (5.1.2)
      await testAudioChannelConfiguration(8,
          {'tag:dolby.com,2014:dash:audio_channel_configuration:2011':
             'F805'});

      // L,R,C,LFE,Ls,Rs (5.1)
      await testAudioChannelConfiguration(6,
          {'urn:dolby:dash:audio_channel_configuration:2011': 'F801'});

      // L,R,C,LFE,Ls,Rs,Lrs,Rrs (7.1)
      await testAudioChannelConfiguration(8,
          {'urn:dolby:dash:audio_channel_configuration:2011': 'FA01'});

      // L,R,C,LFE,Ls,Rs,Ltm,Rtm (5.1.2)
      await testAudioChannelConfiguration(8,
          {'urn:dolby:dash:audio_channel_configuration:2011': 'F805'});

      // Results in null if the value is not a valid hex number.
      await testAudioChannelConfiguration(null,
          {'urn:dolby:dash:audio_channel_configuration:2011': 'x'});

      // L,R,C,LFE,Ls,Rs (5.1)
      await testAudioChannelConfiguration(6,
          {'tag:dolby.com,2015:dash:audio_channel_configuration:2015':
             '000047'});

      // L,R,C,LFE,Ls,Rs,Lrs,Rrs (7.1)
      await testAudioChannelConfiguration(8,
          {'tag:dolby.com,2015:dash:audio_channel_configuration:2015':
             '00004F'});

      // L,R,C,LFE,Ls,Rs,Ltm,Rtm (5.1.2)
      await testAudioChannelConfiguration(8,
          {'tag:dolby.com,2015:dash:audio_channel_configuration:2015':
             '0000c7'});

      // Results in null if the value is not a valid hex number.
      await testAudioChannelConfiguration(null,
          {'tag:dolby.com,2015:dash:audio_channel_configuration:2015': 'x'});
    });

    it('parses MPEG channel configuration scheme', async () => {
      // Parses a simple channel count.
      await testAudioChannelConfiguration(2,
          {'urn:mpeg:mpegB:cicp:ChannelConfiguration': '2'});

      // Parses a high channel count.
      await testAudioChannelConfiguration(24,
          {'urn:mpeg:mpegB:cicp:ChannelConfiguration': '13'});

      // Results in null if the value is not an integer.
      await testAudioChannelConfiguration(null,
          {'urn:mpeg:mpegB:cicp:ChannelConfiguration': 'foo'});

      // Results in null if the value is not in a spec range.
      await testAudioChannelConfiguration(null,
          {'urn:mpeg:mpegB:cicp:ChannelConfiguration': '100'});
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    const textStream = manifest.textStreams[0];
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.textStreams[0];
    expect(stream).toBeUndefined();
  });

  it('honors the ignoreMaxSegmentDuration config', async () => {
    const manifestText = [
      '<MPD maxSegmentDuration="PT5S">',
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
    config.dash.ignoreMaxSegmentDuration = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const maxSegmentDuration =
        manifest.presentationTimeline.getMaxSegmentDuration();
    expect(maxSegmentDuration).toBe(1);
  });

  it('gets manifest value if ignoreMaxSegmentDuration is false', async () => {
    const manifestText = [
      '<MPD maxSegmentDuration="PT5S">',
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
    config.dash.ignoreMaxSegmentDuration = false;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const maxSegmentDuration =
        manifest.presentationTimeline.getMaxSegmentDuration();
    expect(maxSegmentDuration).toBe(5);
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const presentationTimeline = manifest.presentationTimeline;
    const presentationDelay = presentationTimeline.getDelay();
    expect(presentationDelay).not.toBeNaN();
    expect(presentationDelay).toBe(config.defaultPresentationDelay);
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
    config.defaultPresentationDelay = 10;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const presentationTimeline = manifest.presentationTimeline;
    const presentationDelay = presentationTimeline.getDelay();
    expect(presentationDelay).toBe(config.defaultPresentationDelay);
  });

  it('Uses 1.5 times minBufferTime as default presentation delay', async () => {
    // When suggestedPresentDelay should be ignored, and
    // config.defaultPresentationDelay is not set other than 0,
    // use 1.5*minBufferTime as the presentationDelay.
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const presentationTimeline = manifest.presentationTimeline;
    const presentationDelay = presentationTimeline.getDelay();
    expect(presentationDelay).toBe(3);
  });

  it('Honors the ignoreEmptyAdaptationSet config', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT2S" suggestedPresentationDelay="PT25S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="audio/mp4">',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.dash.ignoreEmptyAdaptationSet = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.presentationTimeline).toBeTruthy();
  });

  it('Invokes manifestPreprocessorTXml in config', async () => {
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
    config.dash.manifestPreprocessorTXml = (mpd) => {
      /** @type {shaka.extern.xml.Node} */
      const manifest = /** @type {shaka.extern.xml.Node} */ (
        /** @type {shaka.extern.xml.Node} */(mpd).children[0]);
      manifest.children = [
        manifest.children[0],
        manifest.children[1],
      ];
    };
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const stream = manifest.textStreams[0];
    expect(stream).toBeUndefined();
  });

  it('reads accessibility purpose elements', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" contentType="text">',
      '      <Accessibility ',
      '          schemeIdUri="urn:tva:metadata:cs:AudioPurposeCS:2007"',
      '          value="2" />',
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
      '    <AdaptationSet id="1" mimeType="audio/mp4">',
      '      <Accessibility ',
      '          schemeIdUri="urn:tva:metadata:cs:AudioPurposeCS:2007"',
      '          value="1" />',
      '      <Representation id="audio-sd" width="640" height="480">',
      '        <BaseURL>v-sd.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const textStream = manifest.textStreams[0];
    expect(textStream.accessibilityPurpose).toBe(
        shaka.media.ManifestParser.AccessibilityPurpose.HARD_OF_HEARING);
    const variant = manifest.variants[0];
    expect(variant.video.accessibilityPurpose).toBeUndefined();
    expect(variant.audio.accessibilityPurpose).toBe(
        shaka.media.ManifestParser.AccessibilityPurpose.VISUALLY_IMPAIRED);
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const textStream = manifest.textStreams[0];
    expect(textStream.roles).toEqual(['captions', 'foo']);
    expect(textStream.kind).toBe('caption');
  });

  it('converts Roles element to "forced" (old role)', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" contentType="text">',
      '      <Accessibility schemeIdUri="urn:mpeg:dash:role:2011" ',
      '          value="captions" />',
      '      <Accessibility schemeIdUri="urn:mpeg:dash:role:2011" ',
      '          value="forced_subtitle" />',
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const textStream = manifest.textStreams[0];
    expect(textStream.roles).toEqual(['captions', 'forced_subtitle']);
    expect(textStream.forced).toBe(true);
  });

  it('converts Roles element to "forced"', async () => {
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" contentType="text">',
      '      <Accessibility schemeIdUri="urn:mpeg:dash:role:2011" ',
      '          value="captions" />',
      '      <Accessibility schemeIdUri="urn:mpeg:dash:role:2011" ',
      '          value="forced-subtitle" />',
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
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const textStream = manifest.textStreams[0];
    expect(textStream.roles).toEqual(['captions', 'forced-subtitle']);
    expect(textStream.forced).toBe(true);
  });

  it('supports HDR signaling via profiles', async () => {
    // (DASH-IF IOP v4.3 10.3.3.)
    const hdrProfile =
        'http://dashif.org/guidelines/dash-if-uhd#hevc-hdr-pq10';
    const manifestText = [
      `<MPD minBufferTime="PT75S" profiles="${hdrProfile}">`,
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation codecs="hvc1.2.4.L153.B0">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    const stream = manifest.variants[0].video;
    expect(stream.hdr).toBe('PQ');
  });

  it('supports HDR signaling via SupplementalProperty', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const hdrScheme = cicpScheme('TransferCharacteristics');
    const pq = 16;
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      `      <SupplementalProperty schemeIdUri="${hdrScheme}" value="${pq}" />`,
      '      <Representation codecs="hvc1.2.4.L150.90">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    const stream = manifest.variants[0].video;
    expect(stream.hdr).toBe('PQ');
  });

  it('supports SupplementalProperty MatrixCoefficients', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const scheme = cicpScheme('MatrixCoefficients');
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      `      <SupplementalProperty schemeIdUri="${scheme}" value="9" />`,
      '      <Representation codecs="hvc1.2.4.L153.B0">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
  });

  it('supports SupplementalProperty ColourPrimaries', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const scheme = cicpScheme('ColourPrimaries');
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      `      <SupplementalProperty schemeIdUri="${scheme}" value="9" />`,
      '      <Representation codecs="hvc1.2.4.L153.B0">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    const stream = manifest.variants[0].video;
    expect(stream.colorGamut).toBe('rec2020');
  });

  it('supports HDR signaling via EssentialProperty', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const hdrScheme = cicpScheme('TransferCharacteristics');
    const hlg = 18;
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      `      <EssentialProperty schemeIdUri="${hdrScheme}" value="${hlg}" />`,
      '      <Representation codecs="hvc1.2.4.L153.B0">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    const stream = manifest.variants[0].video;
    expect(stream.hdr).toBe('HLG');
  });

  it('supports EssentialProperty MatrixCoefficients', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const hdrScheme = cicpScheme('MatrixCoefficients');
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      `      <EssentialProperty schemeIdUri="${hdrScheme}" value="9" />`,
      '      <Representation codecs="hvc1.2.4.L153.B0">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
  });

  it('supports EssentialProperty ColourPrimaries', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const hdrScheme = cicpScheme('ColourPrimaries');
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      `      <EssentialProperty schemeIdUri="${hdrScheme}" value="9" />`,
      '      <Representation codecs="hvc1.2.4.L153.B0">',
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

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
  });

  it('supports SDR signalling via EssentialProperty', async () => {
    // (DASH-IF IOP v4.3 6.2.5.1.)
    const scheme = cicpScheme('TransferCharacteristics');
    const sdrValues = [1, 6, 13, 14, 15];
    for (const value of sdrValues) {
      const manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        `      <EssentialProperty schemeIdUri="${scheme}" value="${value}" />`,
        '      <Representation codecs="avc1.640028">',
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

      /** @type {shaka.extern.Manifest} */
      // eslint-disable-next-line no-await-in-loop
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.variants.length).toBe(1);
      const stream = manifest.variants[0].video;
      expect(stream.hdr).toBe('SDR');
    }
  });

  it('signaling last segment number via SupplementalProperty', async () => {
    // (DASH-IF IOP v4.3 4.4.3.6.)
    const scheme = 'http://dashif.org/guidelines/last-segment-number';
    const value = 368;
    const manifestText = [
      '<MPD minBufferTime="PT75S" type="static">',
      '  <Period id="1" duration="PT0H12M14.167S">',
      '    <AdaptationSet id="2">',
      `      <SupplementalProperty schemeIdUri="${scheme}" value="${value}" />`,
      '      <Representation codecs="avc1.640028" mimeType="video/mp4">',
      '        <SegmentTemplate startNumber="1" media="m-$Number$.mp4"',
      '          initialization="i.mp4" timescale="12288" duration="24576"/>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(1);
    const stream = manifest.variants[0].video;
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex, 'Null segmentIndex!');
    expect(Array.from(stream.segmentIndex).length).toBe(367);
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
      '      <SegmentTemplate media="$Number$.jpg" ',
      '        duration="2" startNumber="1"/>',
      '      <Representation id="thumbnails" width="1024" height="1152">',
      `        <EssentialProperty schemeIdUri="${thumbnailScheme}" value="10x20"/>`, // eslint-disable-line @stylistic/max-len
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const variant = manifest.variants[0];
    expect(variant.audio).toBeTruthy();
    expect(variant.video).toBeTruthy();
  });

  it('parse single representation of image adaptation sets', async () => {
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
      '      <SegmentTemplate media="$Number$.jpg" ',
      '        duration="2" startNumber="1"/>',
      '      <Representation id="thumbnails" width="1024" height="1152">',
      `        <EssentialProperty schemeIdUri="${thumbnailScheme}" value="10x20"/>`, // eslint-disable-line @stylistic/max-len
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.imageStreams.length).toBe(1);
    expect(manifest.presentationTimeline.getMaxSegmentDuration()).toBe(1);
    const imageStream = manifest.imageStreams[0];
    expect(imageStream.width).toBe(1024);
    expect(imageStream.height).toBe(1152);
    expect(imageStream.tilesLayout).toBe('10x20');
  });


  it('parse multiple representation of image adaptation sets', async () => {
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
      '      <SegmentTemplate media="$Number$.jpg" ',
      '        duration="2" startNumber="1"/>',
      '      <Representation id="thumbnails" width="1024" height="1152">',
      `        <EssentialProperty schemeIdUri="${thumbnailScheme}" value="10x20"/>`, // eslint-disable-line @stylistic/max-len
      '      </Representation>',
      '      <Representation id="thumbnails" width="2048" height="1152">',
      `        <EssentialProperty schemeIdUri="${thumbnailScheme}" value="20x20"/>`, // eslint-disable-line @stylistic/max-len
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.imageStreams.length).toBe(2);
    const firstImageStream = manifest.imageStreams[0];
    expect(firstImageStream.width).toBe(1024);
    expect(firstImageStream.height).toBe(1152);
    expect(firstImageStream.tilesLayout).toBe('10x20');
    const secondImageStream = manifest.imageStreams[1];
    expect(secondImageStream.width).toBe(2048);
    expect(secondImageStream.height).toBe(1152);
    expect(secondImageStream.tilesLayout).toBe('20x20');
  });

  // Regression #2650 in v3.0.0
  // A later BaseURL was being applied to earlier Representations, specifically
  // in the context of SegmentTimeline.
  it('uses the correct BaseURL for SegmentTimeline', async () => {
    const manifestText = [
      '<MPD type="static">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
      '        <SegmentTimeline>',
      '          <S t="0" d="30" />',
      '        </SegmentTimeline>',
      '      </SegmentTemplate>',
      '      <Representation id="video-sd" width="640" height="480">',
      '        <BaseURL>http://example.com/r0/</BaseURL>',
      '      </Representation>',
      '      <Representation id="video-hd" width="1920" height="1080">',
      '        <BaseURL>http://example.com/r1/</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    const video0 = manifest.variants[0].video;
    await video0.createSegmentIndex();
    goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
    const segment0 = Array.from(video0.segmentIndex)[0];
    const uri0 = segment0.getUris()[0];

    const video1 = manifest.variants[1].video;
    await video1.createSegmentIndex();
    goog.asserts.assert(video1.segmentIndex, 'Null segmentIndex!');
    const segment1 = Array.from(video1.segmentIndex)[0];
    const uri1 = segment1.getUris()[0];

    expect(uri0).toBe('http://example.com/r0/1.mp4');
    expect(uri1).toBe('http://example.com/r1/1.mp4');
  });

  describe('Continuity Timelines', () => {
    it('are tagged correctly on the segment index for matching timelines',
        async () => {
          const manifestText = [
            `<MPD type="static">`,
            '  <Period id="1" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="0">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="0" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="2" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '  <Period id="3" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="30">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="30" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="2" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          fakeNetEngine.setResponseText('dummy://foo', manifestText);

          /** @type {shaka.extern.Manifest} */
          const manifest = await parser.start('dummy://foo', playerInterface);

          const video0 = manifest.variants[0].video;
          await video0.createSegmentIndex();

          expect(video0.segmentIndex)
              .toBeInstanceOf(shaka.media.MetaSegmentIndex);

          if (video0.segmentIndex instanceof shaka.media.MetaSegmentIndex) {
            const continuityTimelines = [];
            video0.segmentIndex.forEachIndex((index) => {
              continuityTimelines.push(index.continuityTimeline());
            });

            expect(continuityTimelines).toEqual([0, 0]);
          }
        });

    it('are tagged correctly on the segment index for non-matching timelines',
        async () => {
          const manifestText = [
            `<MPD type="static">`,
            '  <Period id="1" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="0" startNumber="0">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="0" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="2" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '  <Period id="3" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="0" startNumber="0">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="0" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="4" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          fakeNetEngine.setResponseText('dummy://foo', manifestText);

          /** @type {shaka.extern.Manifest} */
          const manifest = await parser.start('dummy://foo', playerInterface);

          const video0 = manifest.variants[0].video;
          await video0.createSegmentIndex();

          expect(video0.segmentIndex)
              .toBeInstanceOf(shaka.media.MetaSegmentIndex);

          if (video0.segmentIndex instanceof shaka.media.MetaSegmentIndex) {
            const continuityTimelines = [];
            video0.segmentIndex.forEachIndex((index) => {
              continuityTimelines.push(index.continuityTimeline());
            });
            expect(continuityTimelines).toEqual([0, 1]);
          }
        });

    it('are tagged correctly on the segment index for mixed timelines',
        async () => {
          const manifestText = [
            `<MPD type="static">`,
            '  <Period id="1" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="0" startNumber="0">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="0" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="2" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '  <Period id="3" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="0" startNumber="0">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="0" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="4" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '  <Period id="5" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="30">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="30" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="2" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '  <Period id="6" duration="PT30S">',
            '    <AdaptationSet mimeType="video/mp4">',
            '      <SegmentTemplate media="$Number$.mp4" presentationTimeOffset="0" startNumber="0">', // eslint-disable-line @stylistic/max-len
            '        <SegmentTimeline>',
            '          <S t="0" d="30" />',
            '        </SegmentTimeline>',
            '      </SegmentTemplate>',
            '      <Representation id="7" width="640" height="480">',
            '      </Representation>',
            '    </AdaptationSet>',
            '  </Period>',
            '</MPD>',
          ].join('\n');

          fakeNetEngine.setResponseText('dummy://foo', manifestText);

          /** @type {shaka.extern.Manifest} */
          const manifest = await parser.start('dummy://foo', playerInterface);

          const video0 = manifest.variants[0].video;
          await video0.createSegmentIndex();

          expect(video0.segmentIndex)
              .toBeInstanceOf(shaka.media.MetaSegmentIndex);

          if (video0.segmentIndex instanceof shaka.media.MetaSegmentIndex) {
            const continuityTimelines = [];
            video0.segmentIndex.forEachIndex((index) => {
              continuityTimelines.push(index.continuityTimeline());
            });
            expect(continuityTimelines).toEqual([0, 1, 0, 2]);
          }
        });
  });

  // b/179025415: A "future" period (past the segment availability window end)
  // would cause us to generate bogus segment references for that period.  This
  // would happen upon update (once per segment duration), but not on initial
  // load.
  it('creates no references for future Periods', async () => {
    // Pretend the live stream started 10 seconds ago.  This is long enough to
    // have segments (1s each), but not long enough to have segments in the
    // second period (30s into the live stream).
    const availabilityStartTimeMilliseconds = Date.now() - 10e3;
    const availabilityStartTime =
        (new Date(availabilityStartTimeMilliseconds)).toISOString();
    const manifestText = [
      `<MPD type="dynamic" availabilityStartTime="${availabilityStartTime}">`,
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <SegmentTemplate media="$Number$.mp4" duration="1" />',
      '      <Representation id="3" width="640" height="480">',
      '        <BaseURL>http://example.com/p1/</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="4" duration="PT30S">',
      '    <AdaptationSet id="5" mimeType="video/mp4">',
      '      <SegmentTemplate media="$Number$.mp4" duration="1" />',
      '      <Representation id="6" width="640" height="480">',
      '        <BaseURL>http://example.com/p2/</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    const video0 = manifest.variants[0].video;
    await video0.createSegmentIndex();

    // Wait two segment durations, so that the updateEvery callback fires.
    // In the original bug, we generated bogus references during update.
    await shaka.test.Util.delay(2);

    goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
    const segments = Array.from(video0.segmentIndex);

    // There should be some segments, but not more than the 30 that would appear
    // in the complete first period.
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length).toBeLessThanOrEqual(30);

    // We should also not find /p2/ (the second period URL) in any of them.
    const segmentUris = segments.map((s) => s.getUris()[0]);
    for (const uri of segmentUris) {
      expect(uri).not.toContain('/p2/');
    }
  });

  /**
   * @param {!Array<number>} periods Start time of multiple periods
   * @return {string}
   */
  function buildManifestWithPeriodStartTime(periods) {
    const mpdTemplate = [
      `<MPD type="dynamic"`,
      'availabilityStartTime="1970-01-01T00:00:00Z"',
      'timeShiftBufferDepth="PT10H">',
      '    %(periods)s',
      '</MPD>',
    ].join('\n');
    const periodTemplate = (id, period, duration) => {
      return [
        `    <Period id="${id}" start="PT${period}S">`,
        '        <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
        '            <SegmentTemplate startNumber="1" media="l-$Number$.mp4">',
        '                <SegmentTimeline>',
        `                    <S t="0" d="${duration}" />`,
        '                </SegmentTimeline>',
        '            </SegmentTemplate>',
        '            <Representation id="1"/>',
        '        </AdaptationSet>',
        '    </Period>',
      ].join('\n');
    };
    const periodXmls = periods.map((period, i) => {
      const duration = i+1 === periods.length ? 10 : periods[i+1] - period;
      // Period start time as ID here. If we use index then there will be
      // periods with same period ID and different start time which are invalid.
      return periodTemplate(period, period, duration);
    });
    return sprintf(mpdTemplate, {
      periods: periodXmls.join('\n'),
    });
  }

  // Bug description: Inconsistent period start time in the manifests due
  // to failover triggered in backend servers

  // When one of the servers is down, the manifest will be served by other
  // redundant servers. The period start time might become out of sync
  // during the switch-over/recovery.

  it('skip periods that are earlier than max period start time', async () => {
    const sources = [
      buildManifestWithPeriodStartTime([5, 15]),
      buildManifestWithPeriodStartTime([6, 15]), // simulate out-of-sync of +1s
      buildManifestWithPeriodStartTime([4, 15]), // simulate out-of-sync of -1s
    ];
    const segments = [];

    for (const source of sources) {
      fakeNetEngine.setResponseText('dummy://foo', source);
      /** @type {shaka.extern.Manifest} */
      // eslint-disable-next-line no-await-in-loop
      const manifest = await parser.start('dummy://foo', playerInterface);
      const video = manifest.variants[0].video;
      // eslint-disable-next-line no-await-in-loop
      await video.createSegmentIndex();
      goog.asserts.assert(video.segmentIndex, 'Null segmentIndex!');
      segments.push(Array.from(video.segmentIndex));
    }

    // Expect identical segments
    expect(segments[0].length).toBe(2);
    expect(segments[1].length).toBe(2);
    expect(segments[0][0].startTime).toBe(5);
    expect(segments[1][0].startTime).toBe(5);
    expect(segments[0][1].startTime).toBe(15);
    expect(segments[1][1].startTime).toBe(15);
  });

  describe('Parses ServiceDescription', () => {
    it('with PlaybackRate and Latency', async () => {
      const source = [
        '<MPD minBufferTime="PT75S" type="dynamic"',
        '     availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <ServiceDescription id="0">',
        '    <Latency max="4000" min="1000" referenceId="0" target="2000" />',
        '    <PlaybackRate max="1.10" min="0.95" />',
        '  </ServiceDescription>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest.serviceDescription.targetLatency).toBe(2);
      expect(manifest.serviceDescription.maxLatency).toBe(4);
      expect(manifest.serviceDescription.maxPlaybackRate).toBe(1.1);
      expect(manifest.serviceDescription.minLatency).toBe(1);
      expect(manifest.serviceDescription.minPlaybackRate).toBe(0.95);
    });

    it('and excludes missing attributes', async () => {
      const source = [
        '<MPD minBufferTime="PT75S" type="dynamic"',
        '     availabilityStartTime="1970-01-01T00:00:00Z">',
        '  <ServiceDescription id="0">',
        '    <Latency referenceId="0" target="2000" />',
        '    <PlaybackRate max="1.10" min="0.95" />',
        '  </ServiceDescription>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest.serviceDescription.targetLatency).toBe(2);
      expect(manifest.serviceDescription.maxLatency).toBeUndefined();
      expect(manifest.serviceDescription.maxPlaybackRate).toBe(1.1);
      expect(manifest.serviceDescription.minLatency).toBeUndefined();
      expect(manifest.serviceDescription.minPlaybackRate).toBe(0.95);
    });
  });

  it('parses urn:mpeg:dash:chaining:2016', async () => {
    const source = [
      '<MPD minBufferTime="PT75S" type="dynamic"',
      '     availabilityStartTime="1970-01-01T00:00:00Z">',
      '  <SupplementalProperty schemeIdUri="urn:mpeg:dash:chaining:2016"',
      '    value="https://nextUrl" />',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', source);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    expect(manifest.nextUrl).toBe('https://nextUrl');
  });

  it('parses urn:mpeg:dash:ssr:2023', async () => { // eslint-disable-line @stylistic/max-len
    const manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="2" codecs="avc1.4d401f"',
      '          height="1080" width="1920">',
      '        <SegmentTemplate startNumber="1" media="l2-$Number$.mp4"',
      '          initialization="init.mp4" timescale="50" duration="100">',
      '          <SegmentTimeline>',
      '            <S t="0" d="100"/>',
      '            <S d="100"/>',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty value="video_primary" ',
      '        schemeIdUri="urn:mpeg:dash:ssr:2023" />',
      '      <Representation bandwidth="1" codecs="avc1.4d401f"',
      '          height="720" width="1280">',
      '        <SegmentTemplate startNumber="1"',
      '          media="l-$Number$-p$SubNumber$.mp4"',
      '          initialization="init.mp4" timescale="50" duration="100">',
      '            <SegmentTimeline>',
      '              <S t="0" d="100" k="4"/>',
      '              <S d="100" k="4"/>',
      '            </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);
    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.variants.length).toBe(2);

    const normalStream = manifest.variants[0].video;
    expect(normalStream.width).toBe(1920);
    expect(normalStream.height).toBe(1080);
    expect(normalStream.fastSwitching).toBe(false);
    await normalStream.createSegmentIndex();
    goog.asserts.assert(normalStream.segmentIndex != null,
        'Null segmentIndex!');

    const firstNormalReference = normalStream.segmentIndex.get(0);
    expect(firstNormalReference.partialReferences.length).toBe(0);

    const stream = manifest.variants[1].video;
    expect(stream.width).toBe(1280);
    expect(stream.height).toBe(720);
    expect(stream.fastSwitching).toBe(true);
    await stream.createSegmentIndex();
    goog.asserts.assert(stream.segmentIndex != null,
        'Null segmentIndex!');

    const firstReference = stream.segmentIndex.get(0);
    expect(firstReference.partialReferences.length).toBe(4);
  });

  describe('parses partial segments correctly', () => {
    it('without cadence', async () => {
      const manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="1" mimeType="video/mp4">',
        '      <Representation bandwidth="1" codecs="avc1.4d401f">',
        '        <SegmentTemplate startNumber="1"',
        '          media="l-$Number$-p$SubNumber$.mp4"',
        '          initialization="init.mp4" timescale="50" duration="100">',
        '            <SegmentTimeline>',
        '              <S t="0" d="100" k="4"/>',
        '              <S d="100" k="4"/>',
        '            </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

      const firstReference = stream.segmentIndex.get(0);
      expect(firstReference.startTime).toBe(0);
      expect(firstReference.endTime).toBe(2);
      expect(firstReference.getUris()).toEqual([]);
      expect(firstReference.partialReferences.length).toBe(4);
      const firstPartialReference = firstReference.partialReferences[0];
      expect(firstPartialReference.startTime).toBe(0);
      expect(firstPartialReference.endTime).toBe(0.5);
      expect(firstPartialReference.getUris())
          .toEqual(['dummy://foo/l-1-p1.mp4']);
      const secondPartialReference = firstReference.partialReferences[1];
      expect(secondPartialReference.startTime).toBe(0.5);
      expect(secondPartialReference.endTime).toBe(1);
      expect(secondPartialReference.getUris())
          .toEqual(['dummy://foo/l-1-p2.mp4']);
      const thirdPartialReference = firstReference.partialReferences[2];
      expect(thirdPartialReference.startTime).toBe(1);
      expect(thirdPartialReference.endTime).toBe(1.5);
      expect(thirdPartialReference.getUris())
          .toEqual(['dummy://foo/l-1-p3.mp4']);
      const fourthPartialReference = firstReference.partialReferences[3];
      expect(fourthPartialReference.startTime).toBe(1.5);
      expect(fourthPartialReference.endTime).toBe(2);
      expect(fourthPartialReference.getUris())
          .toEqual(['dummy://foo/l-1-p4.mp4']);
    });

    it('with cadence equal to 1', async () => {
      const manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="1" mimeType="video/mp4">',
        '      <Representation bandwidth="1" codecs="avc1.4d401f">',
        '        <SegmentTemplate startNumber="1"',
        '          media="l-$Number$-p$SubNumber$.mp4"',
        '          initialization="init.mp4" timescale="50" duration="100">',
        '            <SegmentTimeline>',
        '              <S t="0" d="100" k="4"/>',
        '              <S d="100" k="4"/>',
        '            </SegmentTimeline>',
        '        </SegmentTemplate>',
        '        <SegmentSequenceProperties>',
        '          <SAP type="1" cadence="1" />',
        '        </SegmentSequenceProperties>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

      const firstReference = stream.segmentIndex.get(0);
      const firstPartialReference = firstReference.partialReferences[0];
      expect(firstPartialReference.isIndependent()).toBeTruthy();
      const secondPartialReference = firstReference.partialReferences[1];
      expect(secondPartialReference.isIndependent()).toBeTruthy();
      const thirdPartialReference = firstReference.partialReferences[2];
      expect(thirdPartialReference.isIndependent()).toBeTruthy();
      const fourthPartialReference = firstReference.partialReferences[3];
      expect(fourthPartialReference.isIndependent()).toBeTruthy();
    });

    it('with cadence equal to 2', async () => {
      const manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="1" mimeType="video/mp4">',
        '      <Representation bandwidth="1" codecs="avc1.4d401f">',
        '        <SegmentTemplate startNumber="1"',
        '          media="l-$Number$-p$SubNumber$.mp4"',
        '          initialization="init.mp4" timescale="50" duration="100">',
        '            <SegmentTimeline>',
        '              <S t="0" d="100" k="4"/>',
        '              <S d="100" k="4"/>',
        '            </SegmentTimeline>',
        '        </SegmentTemplate>',
        '        <SegmentSequenceProperties>',
        '          <SAP type="1" cadence="2" />',
        '        </SegmentSequenceProperties>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

      const firstReference = stream.segmentIndex.get(0);
      const firstPartialReference = firstReference.partialReferences[0];
      expect(firstPartialReference.isIndependent()).toBeTruthy();
      const secondPartialReference = firstReference.partialReferences[1];
      expect(secondPartialReference.isIndependent()).toBeFalsy();
      const thirdPartialReference = firstReference.partialReferences[2];
      expect(thirdPartialReference.isIndependent()).toBeTruthy();
      const fourthPartialReference = firstReference.partialReferences[3];
      expect(fourthPartialReference.isIndependent()).toBeFalsy();
    });

    it('with SegmentTemplate and $Number$', async () => {
      const manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="1" mimeType="video/mp4">',
        '      <Representation bandwidth="1" codecs="avc1.4d401f">',
        '        <SegmentTemplate startNumber="1" k="4"',
        '          media="l-$Number$-p$SubNumber$.mp4"',
        '          initialization="init.mp4" timescale="50" duration="100">',
        '        </SegmentTemplate>',
        '        <SegmentSequenceProperties>',
        '          <SAP type="1" cadence="1" />',
        '        </SegmentSequenceProperties>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex != null, 'Null segmentIndex!');

      const firstReference = stream.segmentIndex.get(0);
      const firstPartialReference = firstReference.partialReferences[0];
      expect(firstPartialReference.isIndependent()).toBeTruthy();
      const secondPartialReference = firstReference.partialReferences[1];
      expect(secondPartialReference.isIndependent()).toBeTruthy();
      const thirdPartialReference = firstReference.partialReferences[2];
      expect(thirdPartialReference.isIndependent()).toBeTruthy();
      const fourthPartialReference = firstReference.partialReferences[3];
      expect(fourthPartialReference.isIndependent()).toBeTruthy();
    });
  });

  describe('supports ContentSteering', () => {
    it('with defaultServiceLocation', async () => {
      const manifestText = [
        '<MPD type="static">',
        '  <BaseURL serviceLocation="a">http://example.com/r0/</BaseURL>',
        '  <BaseURL serviceLocation="b">http://example.com/r1/</BaseURL>',
        '  <ContentSteering defaultServiceLocation="a,b" ',
        'queryBeforeStart="true">http://contentsteering</ContentSteering>',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="video-sd" width="640" height="480">',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      const contentSteering = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://contentsteering/update',
        'PATHWAY-PRIORITY': [],
      });

      fakeNetEngine.setResponseText('http://contentsteering', contentSteering);

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      const video0 = manifest.variants[0].video;
      await video0.createSegmentIndex();
      goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
      const segment0 = Array.from(video0.segmentIndex)[0];
      const uri0 = segment0.getUris()[0];
      const uri1 = segment0.getUris()[1];

      expect(uri0).toBe('http://example.com/r0/1.mp4');
      expect(uri1).toBe('http://example.com/r1/1.mp4');
    });

    it('without defaultServiceLocation', async () => {
      const manifestText = [
        '<MPD type="static">',
        '  <BaseURL serviceLocation="a">http://example.com/r0/</BaseURL>',
        '  <BaseURL serviceLocation="b">http://example.com/r1/</BaseURL>',
        '  <ContentSteering',
        'queryBeforeStart="true">http://contentsteering</ContentSteering>',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="video-sd" width="640" height="480">',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      const contentSteering = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://contentsteering/update',
        'PATHWAY-PRIORITY': [
          'b',
          'a',
        ],
      });

      fakeNetEngine.setResponseText('http://contentsteering', contentSteering);

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      const video0 = manifest.variants[0].video;
      await video0.createSegmentIndex();
      goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
      const segment0 = Array.from(video0.segmentIndex)[0];
      const uri0 = segment0.getUris()[0];
      const uri1 = segment0.getUris()[1];

      expect(uri0).toBe('http://example.com/r1/1.mp4');
      expect(uri1).toBe('http://example.com/r0/1.mp4');
    });

    it('with queryBeforeStart', async () => {
      const manifestText = [
        '<MPD type="static">',
        '  <BaseURL serviceLocation="a">http://example.com/r0/</BaseURL>',
        '  <BaseURL serviceLocation="b">http://example.com/r1/</BaseURL>',
        '  <ContentSteering defaultServiceLocation="b" ',
        'queryBeforeStart="true">http://contentsteering</ContentSteering>',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="video-sd" width="640" height="480">',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      const contentSteering = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://contentsteering/update',
        'PATHWAY-PRIORITY': [
          'a',
        ],
      });

      fakeNetEngine.setResponseText('http://contentsteering', contentSteering);

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      const video0 = manifest.variants[0].video;
      await video0.createSegmentIndex();
      goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
      const segment0 = Array.from(video0.segmentIndex)[0];
      expect(segment0.getUris().length).toBe(1);
      const uri0 = segment0.getUris()[0];

      expect(uri0).toBe('http://example.com/r0/1.mp4');
    });

    it('without queryBeforeStart', async () => {
      const manifestText = [
        '<MPD type="static">',
        '  <BaseURL serviceLocation="a">http://example.com/r0/</BaseURL>',
        '  <BaseURL serviceLocation="b">http://example.com/r1/</BaseURL>',
        '  <ContentSteering defaultServiceLocation="b">',
        'http://contentsteering</ContentSteering>',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="video-sd" width="640" height="480">',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      fakeNetEngine.setResponseText('http://contentsteering', 'foo');

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      const video0 = manifest.variants[0].video;
      await video0.createSegmentIndex();
      goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
      const segment0 = Array.from(video0.segmentIndex)[0];
      expect(segment0.getUris().length).toBe(1);
      const uri0 = segment0.getUris()[0];

      expect(uri0).toBe('http://example.com/r1/1.mp4');
    });

    it('without serviceLocation in BaseURL', async () => {
      const manifestText = [
        '<MPD type="static">',
        '  <BaseURL>http://example.com/r0/</BaseURL>',
        '  <BaseURL>http://example.com/r1/</BaseURL>',
        '  <ContentSteering',
        'queryBeforeStart="true">http://contentsteering</ContentSteering>',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="video-sd" width="640" height="480">',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      fakeNetEngine.setResponseText('http://contentsteering', 'foo');

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      const video0 = manifest.variants[0].video;
      await video0.createSegmentIndex();
      goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
      const segment0 = Array.from(video0.segmentIndex)[0];
      const uri0 = segment0.getUris()[0];
      const uri1 = segment0.getUris()[1];

      expect(uri0).toBe('http://example.com/r0/1.mp4');
      expect(uri1).toBe('http://example.com/r1/1.mp4');
    });

    it('specify MPD BaseURL and AdaptationSet BaseURL', async () => {
      const manifestText = [
        '<MPD type="static">',
        '  <BaseURL serviceLocation="a">http://example.com/r0/</BaseURL>',
        '  <BaseURL serviceLocation="b">http://example.com/r1/</BaseURL>',
        '  <ContentSteering defaultServiceLocation="a,b" ',
        'queryBeforeStart="true">http://contentsteering</ContentSteering>',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet id="2" mimeType="video/mp4">',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="video-sd" width="640" height="480">',
        '      </Representation>',
        '    </AdaptationSet>',
        '    <AdaptationSet id="3" mimeType="audio/mp4">',
        '      <BaseURL serviceLocation="c">http://example.foo/r0/</BaseURL>',
        '      <BaseURL serviceLocation="d">http://example.foo/r1/</BaseURL>',
        '      <SegmentTemplate media="$Number$.mp4" startNumber="1">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="audio">',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', manifestText);

      const contentSteering = JSON.stringify({
        'VERSION': 1,
        'TTL': 1,
        'RELOAD-URI': 'http://contentsteering/update',
        'PATHWAY-PRIORITY': [
          'a',
          'c',
        ],
      });

      fakeNetEngine.setResponseText('http://contentsteering', contentSteering);

      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo', playerInterface);

      const video0 = manifest.variants[0].video;
      await video0.createSegmentIndex();
      goog.asserts.assert(video0.segmentIndex, 'Null segmentIndex!');
      const videoSegment0 = Array.from(video0.segmentIndex)[0];
      expect(videoSegment0.getUris().length).toBe(1);
      const videoUri0 = videoSegment0.getUris()[0];

      expect(videoUri0).toBe('http://example.com/r0/1.mp4');

      const audio0 = manifest.variants[0].audio;
      await audio0.createSegmentIndex();
      goog.asserts.assert(audio0.segmentIndex, 'Null segmentIndex!');
      const audioSegment0 = Array.from(audio0.segmentIndex)[0];
      expect(audioSegment0.getUris().length).toBe(1);
      const audioUri0 = audioSegment0.getUris()[0];

      expect(audioUri0).toBe('http://example.foo/r0/1.mp4');
    });
  });

  it('counts gaps', async () => {
    const manifestText = [
      '<MPD type="static">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video" bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="2" start="PT31S" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="video" bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    const manifest = await parser.start('dummy://foo', playerInterface);
    expect(manifest.gapCount).toBe(1);
  });

  it('supports dvb fonts', async () => {
    const manifestText = [
      '<MPD type="static">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <SupplementalProperty',
      '         schemeIdUri="urn:dvb:dash:fontdownload:2014"',
      '         value="1" dvb:url="foo.woff"',
      '         dvb:mimeType="application/font-woff" dvb:fontFamily="foo"/>',
      '      <Representation id="video" bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="2" start="PT31S" duration="PT30S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty schemeIdUri="urn:dvb:dash:fontdownload:2014"',
      '         value="1" dvb:url="https://foo/foo2.woff"',
      '         dvb:mimeType="application/font-woff" dvb:fontFamily="foo2"/>',
      '      <Representation id="video" bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    await parser.start('dummy://foo', playerInterface);
    expect(addFontSpy).toHaveBeenCalledTimes(2);
    expect(addFontSpy).toHaveBeenCalledWith('foo', 'dummy://foo/foo.woff');
    expect(addFontSpy).toHaveBeenCalledWith('foo2', 'https://foo/foo2.woff');
  });

  // DASH: Annex I
  describe('supports flexible insertion of URL parameters', () => {
    it('with SegmentList', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <SupplementalProperty',
        '        schemeIdUri="urn:mpeg:dash:urlparam:2014"',
        '        xmlns:up="urn:mpeg:dash:schema:urlparam:2014">',
        '     <up:UrlQueryInfo queryTemplate="$querypart$&b=1"',
        '          useMPDUrlQuery="true"/>',
        '    </SupplementalProperty>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="1" bandwidth="1">',
        '        <SegmentList startNumber="1" duration="10">',
        '          <Initialization sourceURL="init.mp4" range="201-300" />',
        '          <SegmentURL media="s1.mp4" />',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo?a=1', source);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo?a=1', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant1 = manifest.variants[0];

      await variant1.video.createSegmentIndex();
      goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');

      const variant1Ref = Array.from(variant1.video.segmentIndex)[0];

      expect(variant1Ref.getUris()).toEqual(['dummy://foo/s1.mp4?a=1&b=1']);
      expect(variant1Ref.initSegmentReference.getUris())
          .toEqual(['dummy://foo/init.mp4?a=1&b=1']);
    });

    it('with SegmentTemplate', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <SupplementalProperty',
        '        schemeIdUri="urn:mpeg:dash:urlparam:2014"',
        '        xmlns:up="urn:mpeg:dash:schema:urlparam:2014">',
        '     <up:UrlQueryInfo queryTemplate="$querypart$"',
        '          useMPDUrlQuery="true"/>',
        '    </SupplementalProperty>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="1" bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '            initialization="init.mp4">',
        '          <Initialization sourceURL="init.mp4" range="201-300" />',
        '          <SegmentTimeline>',
        '            <S t="0" d="30" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo?a=1', source);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo?a=1', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant1 = manifest.variants[0];

      await variant1.video.createSegmentIndex();
      goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');

      const variant1Ref = Array.from(variant1.video.segmentIndex)[0];

      expect(variant1Ref.getUris()).toEqual(['dummy://foo/l-1.mp4?a=1']);
      expect(variant1Ref.initSegmentReference.getUris())
          .toEqual(['dummy://foo/init.mp4?a=1']);
    });

    it('with SupplementalProperty in AdaptationSet', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SupplementalProperty',
        '          schemeIdUri="urn:mpeg:dash:urlparam:2014"',
        '          xmlns:up="urn:mpeg:dash:schema:urlparam:2014">',
        '       <up:UrlQueryInfo queryTemplate="$querypart$"',
        '            useMPDUrlQuery="true"/>',
        '      </SupplementalProperty>',
        '      <Representation id="1" bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '            initialization="init.mp4">',
        '          <Initialization sourceURL="init.mp4" range="201-300" />',
        '          <SegmentTimeline>',
        '            <S t="0" d="30" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo?a=1', source);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo?a=1', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant1 = manifest.variants[0];

      await variant1.video.createSegmentIndex();
      goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');

      const variant1Ref = Array.from(variant1.video.segmentIndex)[0];

      expect(variant1Ref.getUris()).toEqual(['dummy://foo/l-1.mp4?a=1']);
      expect(variant1Ref.initSegmentReference.getUris())
          .toEqual(['dummy://foo/init.mp4?a=1']);
    });

    it('with EssentialProperty in AdaptationSet', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <EssentialProperty',
        '          schemeIdUri="urn:mpeg:dash:urlparam:2014"',
        '          xmlns:up="urn:mpeg:dash:schema:urlparam:2014">',
        '       <up:UrlQueryInfo queryTemplate="$querypart$"',
        '            useMPDUrlQuery="true"/>',
        '      </EssentialProperty>',
        '      <Representation id="1" bandwidth="1">',
        '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '            initialization="init.mp4">',
        '          <Initialization sourceURL="init.mp4" range="201-300" />',
        '          <SegmentTimeline>',
        '            <S t="0" d="30" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo?a=1', source);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo?a=1', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant1 = manifest.variants[0];

      await variant1.video.createSegmentIndex();
      goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');

      const variant1Ref = Array.from(variant1.video.segmentIndex)[0];

      expect(variant1Ref.getUris()).toEqual(['dummy://foo/l-1.mp4?a=1']);
      expect(variant1Ref.initSegmentReference.getUris())
          .toEqual(['dummy://foo/init.mp4?a=1']);
    });

    it('with SupplementalProperty in Representation', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="1" bandwidth="1">',
        '        <SupplementalProperty',
        '            schemeIdUri="urn:mpeg:dash:urlparam:2014"',
        '            xmlns:up="urn:mpeg:dash:schema:urlparam:2014">',
        '          <up:UrlQueryInfo queryTemplate="$query:a$&b=foo"',
        '              useMPDUrlQuery="true"/>',
        '        </SupplementalProperty>',
        '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '            initialization="init.mp4">',
        '          <Initialization sourceURL="init.mp4" range="201-300" />',
        '          <SegmentTimeline>',
        '            <S t="0" d="30" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo?a=1', source);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo?a=1', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant1 = manifest.variants[0];

      await variant1.video.createSegmentIndex();
      goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');

      const variant1Ref = Array.from(variant1.video.segmentIndex)[0];

      expect(variant1Ref.getUris()).toEqual(['dummy://foo/l-1.mp4?a=1&b=foo']);
      expect(variant1Ref.initSegmentReference.getUris())
          .toEqual(['dummy://foo/init.mp4?a=1&b=foo']);
    });

    it('with EssentialProperty in Representation', async () => {
      const source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation id="1" bandwidth="1">',
        '        <EssentialProperty',
        '            schemeIdUri="urn:mpeg:dash:urlparam:2014"',
        '            xmlns:up="urn:mpeg:dash:schema:urlparam:2014">',
        '          <up:UrlQueryInfo queryTemplate="$query:a$"',
        '              useMPDUrlQuery="true"/>',
        '        </EssentialProperty>',
        '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '            initialization="init.mp4">',
        '          <Initialization sourceURL="init.mp4" range="201-300" />',
        '          <SegmentTimeline>',
        '            <S t="0" d="30" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo?a=1', source);
      /** @type {shaka.extern.Manifest} */
      const manifest = await parser.start('dummy://foo?a=1', playerInterface);
      expect(manifest.variants.length).toBe(1);

      const variant1 = manifest.variants[0];

      await variant1.video.createSegmentIndex();
      goog.asserts.assert(variant1.video.segmentIndex, 'Null segmentIndex!');

      const variant1Ref = Array.from(variant1.video.segmentIndex)[0];

      expect(variant1Ref.getUris()).toEqual(['dummy://foo/l-1.mp4?a=1']);
      expect(variant1Ref.initSegmentReference.getUris())
          .toEqual(['dummy://foo/init.mp4?a=1']);
    });
  });

  it('mixing SegmentTemplate-SegmentTimeline with SegmentTemplate-numbering', async () => { // eslint-disable-line @stylistic/max-len
    const manifestText = [
      '<MPD type="static">',
      '  <Period id="1" duration="PT2S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="3" width="640" height="480">',
      '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="4" duration="PT30S">',
      '    <AdaptationSet id="5" mimeType="video/mp4">',
      '      <SegmentTemplate media="$Number$.mp4" duration="1" />',
      '      <Representation id="6" width="640" height="480" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    const timeline = manifest.presentationTimeline;
    expect(timeline.getSeekRangeStart()).toBe(0);
    expect(timeline.getSeekRangeEnd()).toBe(32);
  });

  it('mixing SegmentTemplate-numbering with SegmentTemplate-SegmentTimeline', async () => { // eslint-disable-line @stylistic/max-len
    const manifestText = [
      '<MPD type="static">',
      '  <Period id="4" duration="PT30S">',
      '    <AdaptationSet id="5" mimeType="video/mp4">',
      '      <SegmentTemplate media="$Number$.mp4" duration="1" />',
      '      <Representation id="6" width="640" height="480" />',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period id="1" duration="PT2S">',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <Representation id="3" width="640" height="480">',
      '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    const timeline = manifest.presentationTimeline;
    expect(timeline.getSeekRangeStart()).toBe(0);
    expect(timeline.getSeekRangeEnd()).toBe(32);
  });

  it('supports scte214:supplementalCodecs', async () => {
    const manifestText = [
      '<MPD type="static" xmlns:scte214="urn:scte:dash:scte214-extensions">',
      '  <Period id="0" duration="PT2S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="2" width="640" height="480"',
      '          codecs="av01.0.04M.10.0.111.09.16.09.0"',
      '          scte214:supplementalCodecs="dav1.10.01">',
      '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    expect(manifest.variants.length).toBe(2);
    expect(manifest.textStreams.length).toBe(0);

    const video1 = manifest.variants[0] && manifest.variants[0].video;
    expect(video1.codecs).toBe('av01.0.04M.10.0.111.09.16.09.0');

    const video2 = manifest.variants[1] && manifest.variants[1].video;
    expect(video2.codecs).toBe('dav1.10.01');
  });

  it('ignore scte214:supplementalCodecs by config', async () => {
    const manifestText = [
      '<MPD type="static" xmlns:scte214="urn:scte:dash:scte214-extensions">',
      '  <Period id="0" duration="PT2S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation id="2" width="640" height="480"',
      '          codecs="av01.0.04M.10.0.111.09.16.09.0"',
      '          scte214:supplementalCodecs="dav1.10.01">',
      '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="2" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    config.ignoreSupplementalCodecs = true;
    parser.configure(config);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    expect(manifest.variants.length).toBe(1);
    expect(manifest.textStreams.length).toBe(0);

    const video1 = manifest.variants[0] && manifest.variants[0].video;
    expect(video1.codecs).toBe('av01.0.04M.10.0.111.09.16.09.0');
  });

  it('parses ProducerReferenceTime', async () => {
    const manifestText = [
      '<MPD type="static">',
      '  <Period id="0" duration="PT2S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <ProducerReferenceTime presentationTime="52431344916"',
      '                             wallClockTime="2025-04-09T14:53:43.797Z">',
      '        <UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-iso:2014"/>',
      '      </ProducerReferenceTime>',
      '      <Representation id="2" width="640" height="480">',
      '        <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
      '                         timescale="10000000">',
      '          <SegmentTimeline>',
      '            <S t="0" d="20000000" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine.setResponseText('dummy://foo', manifestText);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    const programStartTime = 1744205180.662;
    const expectedEvent = {
      type: shaka.util.FakeEvent.EventName.Prft,
      detail: {
        wallClockTime: 1744210423797,
        programStartDate: new Date(programStartTime * 1000),
      },
    };

    expect(onEventSpy).toHaveBeenCalledWith(
        jasmine.objectContaining(expectedEvent));

    const timeline = manifest.presentationTimeline;
    expect(timeline.getInitialProgramDateTime()).toBe(programStartTime);
  });
});
