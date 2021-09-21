/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');
goog.require('shaka.test.Dash');
goog.require('shaka.test.FakeNetworkingEngine');
goog.require('shaka.test.ManifestParser');
goog.require('shaka.test.Util');
goog.require('shaka.util.Error');
goog.require('shaka.util.PlayerConfiguration');
goog.requireType('shaka.dash.DashParser');

describe('DashParser SegmentTemplate', () => {
  const Dash = shaka.test.Dash;
  const ManifestParser = shaka.test.ManifestParser;
  const baseUri = 'http://example.com/';
  const mp4IndexSegmentUri = '/base/test/test/assets/index-segment.mp4';
  const webmIndexSegmentUri = '/base/test/test/assets/index-segment.webm';
  const webmInitSegmentUri = '/base/test/test/assets/init-segment.webm';

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {!ArrayBuffer} */
  let mp4Index;
  /** @type {!ArrayBuffer} */
  let webmIndex;
  /** @type {!ArrayBuffer} */
  let webmInit;

  beforeAll(async () => {
    mp4Index = await shaka.test.Util.fetch(mp4IndexSegmentUri);
    webmIndex = await shaka.test.Util.fetch(webmIndexSegmentUri);
    webmInit = await shaka.test.Util.fetch(webmInitSegmentUri);
  });

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();

    playerInterface = {
      networkingEngine: fakeNetEngine,
      modifyRequest: (request) => { },
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
    };
  });

  shaka.test.Dash.makeTimelineTests(
      'SegmentTemplate', 'media="s$Number$.mp4"', []);

  describe('duration', () => {
    it('basic support', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '  duration="10" />',
      ], /* duration= */ 60);
      const references = [
        ManifestParser.makeReference('s1.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('s3.mp4', 20, 30, baseUri),
        ManifestParser.makeReference('s4.mp4', 30, 40, baseUri),
        ManifestParser.makeReference('s5.mp4', 40, 50, baseUri),
        ManifestParser.makeReference('s6.mp4', 50, 60, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('with @startNumber > 1', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="10" media="s$Number$.mp4"',
        '   duration="10" />',
      ], /* duration= */ 30);
      const references = [
        ManifestParser.makeReference('s10.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('s11.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('s12.mp4', 20, 30, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('honors presentationTimeOffset', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="10"',
        ' presentationTimeOffset="50" />',
      ], /* duration= */ 30, /* startTime= */ 40);

      fakeNetEngine.setResponseText('dummy://foo', source);
      const manifest = await parser.start('dummy://foo', playerInterface);

      expect(manifest.variants.length).toBe(1);

      const stream = manifest.variants[0].video;
      expect(stream).toBeTruthy();
      await stream.createSegmentIndex();

      const expectedRef1 = ManifestParser.makeReference(
          's1.mp4', 40, 50, baseUri);
      expectedRef1.timestampOffset = -10;

      const expectedRef2 = ManifestParser.makeReference(
          's2.mp4', 50, 60, baseUri);
      expectedRef2.timestampOffset = -10;

      const iterator = stream.segmentIndex[Symbol.iterator]();
      const ref1 = iterator.seek(45);
      const ref2 = iterator.seek(55);
      expect(ref1).toEqual(expectedRef1);
      expect(ref2).toEqual(expectedRef2);
    });

    it('handles segments larger than the period', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="60" />',
      ], /* duration= */ 30);
      // The first segment is number 1 and position 0.
      // Although the segment is 60 seconds long, it is clipped to the period
      // duration of 30 seconds.
      const ref = ManifestParser.makeReference('s1.mp4', 0, 30, baseUri);
      ref.trueEndTime = 60;
      const references = [ref];
      await Dash.testSegmentIndex(source, references);
    });

    it('presentation start is parsed correctly', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="60" />',
      ], /* duration= */ 30, /* startTime= */ 30);

      fakeNetEngine.setResponseText('dummy://foo', source);
      const manifest = await parser.start('dummy://foo', playerInterface);
      expect(manifest.presentationTimeline.getSeekRangeStart()).toBe(30);
    });

    it('limits segment count for Live', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="1" />',
      ]);

      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.initialSegmentLimit = 100;
      parser.configure(config);

      fakeNetEngine.setResponseText('dummy://foo', source);
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex, 'Should have created index');

      const segments = Array.from(stream.segmentIndex);
      expect(segments.length).toBe(config.dash.initialSegmentLimit);
    });

    it('doesn\'t limit segment count for VOD', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="1" />',
      ], /* duration= */ 200);

      const config = shaka.util.PlayerConfiguration.createDefault().manifest;
      config.dash.initialSegmentLimit = 100;
      parser.configure(config);

      fakeNetEngine.setResponseText('dummy://foo', source);
      const manifest = await parser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex, 'Should have created index');

      const segments = Array.from(stream.segmentIndex);
      expect(segments.length).toBe(200);
    });
  });

  describe('index', () => {
    it('basic support', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '    initialization="init-$Bandwidth$.mp4" />',
      ]);

      fakeNetEngine
          .setResponseText('dummy://foo', source)
          .setResponseValue('http://example.com/index-500.mp4', mp4Index);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const segmentReference =
          await Dash.getFirstVideoSegmentReference(manifest);
      const initSegmentReference = segmentReference.initSegmentReference;
      expect(initSegmentReference.getUris()).toEqual(
          ['http://example.com/init-500.mp4']);
      expect(initSegmentReference.getStartByte()).toBe(0);
      expect(initSegmentReference.getEndByte()).toBe(null);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/index-500.mp4', 0, null);
    });

    it('defaults to index with multiple segment sources', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '    initialization="init-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="3" r="12" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>',
      ]);

      fakeNetEngine
          .setResponseText('dummy://foo', source)
          .setResponseValue('http://example.com/index-500.mp4', mp4Index);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const segmentReference =
          await Dash.getFirstVideoSegmentReference(manifest);
      const initSegmentReference = segmentReference.initSegmentReference;
      expect(initSegmentReference.getUris()).toEqual(
          ['http://example.com/init-500.mp4']);
      expect(initSegmentReference.getStartByte()).toBe(0);
      expect(initSegmentReference.getEndByte()).toBe(null);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/index-500.mp4', 0, null);
    });

    it('requests init data for WebM', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="500">',
        '        <SegmentTemplate startNumber="1"',
        '            index="index-$Bandwidth$.webm"',
        '            initialization="init-$Bandwidth$.webm" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine
          .setResponseText('dummy://foo', source)
          .setResponseValue('http://example.com/index-500.webm', webmIndex)
          .setResponseValue('http://example.com/init-500.webm', webmInit);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const segmentReference =
          await Dash.getFirstVideoSegmentReference(manifest);
      const initSegmentReference = segmentReference.initSegmentReference;
      expect(initSegmentReference.getUris()).toEqual(
          ['http://example.com/init-500.webm']);
      expect(initSegmentReference.getStartByte()).toBe(0);
      expect(initSegmentReference.getEndByte()).toBe(null);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(3);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/init-500.webm', 0, null);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/index-500.webm', 0, null);
    });

    it('inherits from Period', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '        initialization="init-$Bandwidth$.mp4" />',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="500" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine
          .setResponseText('dummy://foo', source)
          .setResponseValue('http://example.com/index-500.mp4', mp4Index);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const segmentReference =
          await Dash.getFirstVideoSegmentReference(manifest);
      const initSegmentReference = segmentReference.initSegmentReference;
      expect(initSegmentReference.getUris()).toEqual(
          ['http://example.com/init-500.mp4']);
      expect(initSegmentReference.getStartByte()).toBe(0);
      expect(initSegmentReference.getEndByte()).toBe(null);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/index-500.mp4', 0, null);
    });

    it('inherits from AdaptationSet', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '          initialization="init-$Bandwidth$.mp4" />',
        '      <Representation bandwidth="500" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine
          .setResponseText('dummy://foo', source)
          .setResponseValue('http://example.com/index-500.mp4', mp4Index);

      const manifest = await parser.start('dummy://foo', playerInterface);
      const segmentReference =
          await Dash.getFirstVideoSegmentReference(manifest);
      const initSegmentReference = segmentReference.initSegmentReference;
      expect(initSegmentReference.getUris()).toEqual(
          ['http://example.com/init-500.mp4']);
      expect(initSegmentReference.getStartByte()).toBe(0);
      expect(initSegmentReference.getEndByte()).toBe(null);

      expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/index-500.mp4', 0, null);
    });
  });

  describe('media template', () => {
    it('defaults to timeline when also has duration', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="15" r="2" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>',
      ], /* duration= */ 45);
      const references = [
        ManifestParser.makeReference('0-0-500.mp4', 0, 15, baseUri),
        ManifestParser.makeReference('1-15-500.mp4', 15, 30, baseUri),
        ManifestParser.makeReference('2-30-500.mp4', 30, 45, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('uses PTO with t attribute missing', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" presentationTimeOffset="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S d="15" r="2" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>',
      ], /* duration= */ 35);
      const references = [
        ManifestParser.makeReference('0-0-500.mp4', -10, 5, baseUri),
        ManifestParser.makeReference('1-15-500.mp4', 5, 20, baseUri),
        ManifestParser.makeReference('2-30-500.mp4', 20, 35, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('with @startnumber = 0', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />',
      ], /* duration= */ 30);
      const references = [
        ManifestParser.makeReference('0-0-500.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('1-10-500.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('2-20-500.mp4', 20, 30, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('with @startNumber = 1', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />',
      ], /* duration= */ 30);
      const references = [
        ManifestParser.makeReference('1-0-500.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('2-10-500.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('3-20-500.mp4', 20, 30, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('with @startNumber > 1', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="10" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />',
      ], /* duration= */ 30);
      const references = [
        ManifestParser.makeReference('10-0-500.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('11-10-500.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('12-20-500.mp4', 20, 30, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('with @timescale > 1', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" timescale="9000" duration="9000"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />',
      ], /* duration= */ 3);
      const references = [
        ManifestParser.makeReference('1-0-500.mp4', 0, 1, baseUri),
        ManifestParser.makeReference('2-9000-500.mp4', 1, 2, baseUri),
        ManifestParser.makeReference('3-18000-500.mp4', 2, 3, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('across representations', async () => {
      const source = [
        '<MPD>',
        '  <Period duration="PT60S">',
        '    <AdaptationSet mimeType="video/webm">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <SegmentTemplate startNumber="1" duration="10"',
        '          media="$Number$-$Time$-$Bandwidth$.mp4" />',
        '      <Representation bandwidth="100" />',
        '      <Representation bandwidth="200" />',
        '      <Representation bandwidth="300" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);
      const actual = await parser.start('dummy://foo', playerInterface);
      expect(actual).toBeTruthy();

      const variants = actual.variants;
      expect(variants.length).toBe(3);

      await variants[0].video.createSegmentIndex();
      await variants[1].video.createSegmentIndex();
      await variants[2].video.createSegmentIndex();

      const getRefAt = (stream, time) => {
        return stream.segmentIndex[Symbol.iterator]().seek(time);
      };

      expect(getRefAt(variants[0].video, 0)).toEqual(
          ManifestParser.makeReference('1-0-100.mp4', 0, 10, baseUri));
      expect(getRefAt(variants[0].video, 12)).toEqual(
          ManifestParser.makeReference('2-10-100.mp4', 10, 20, baseUri));
      expect(getRefAt(variants[1].video, 0)).toEqual(
          ManifestParser.makeReference('1-0-200.mp4', 0, 10, baseUri));
      expect(getRefAt(variants[1].video, 12)).toEqual(
          ManifestParser.makeReference('2-10-200.mp4', 10, 20, baseUri));
      expect(getRefAt(variants[2].video, 0)).toEqual(
          ManifestParser.makeReference('1-0-300.mp4', 0, 10, baseUri));
      expect(getRefAt(variants[2].video, 12)).toEqual(
          ManifestParser.makeReference('2-10-300.mp4', 10, 20, baseUri));
    });

    it('create correct Uris when multiple representations', async () => {
      const source = [
        '<MPD>',
        '  <Period duration="PT60S">',
        '    <AdaptationSet mimeType="video/webm">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <SegmentTemplate timescale="1000"',
        '         initialization="segment-$RepresentationID$.dash"',
        '          media="segment-$RepresentationID$-$Time$.dash">',
        '        <SegmentTimeline>',
        '           <S t="0" d="6000" r="1176" />',
        '         <S d="4520" />',
        '       </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="test1" bandwidth="100" />',
        '      <Representation id="test2" bandwidth="200" />',
        '      <Representation id="test3" bandwidth="300" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      fakeNetEngine.setResponseText('dummy://foo', source);
      const actual = await parser.start('dummy://foo', playerInterface);
      expect(actual).toBeTruthy();

      const variants = actual.variants;
      expect(variants.length).toBe(3);
      await variants[0].video.createSegmentIndex();
      await variants[1].video.createSegmentIndex();
      await variants[2].video.createSegmentIndex();

      const firstSegment = (variant) => {
        return Array.from(variant.video.segmentIndex)[0];
      };

      expect(firstSegment(variants[0]).getUris()).toEqual(
          ['http://example.com/segment-test1-0.dash']);
      expect(firstSegment(variants[1]).getUris()).toEqual(
          ['http://example.com/segment-test2-0.dash']);
      expect(firstSegment(variants[2]).getUris()).toEqual(
          ['http://example.com/segment-test3-0.dash']);
    });
  });

  describe('rejects streams with', () => {
    it('bad container type', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/cats">',
        '      <Representation bandwidth="500">',
        '        <SegmentTemplate startNumber="1"',
        '            index="index-$Bandwidth$.webm"',
        '            initialization="init-$Bandwidth$.webm" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
      await Dash.testFails(source, error);
    });

    it('no init data with webm', async () => {
      const source = [
        '<MPD>',
        '  <Period duration="PT30S">',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="500">',
        '        <SegmentTemplate startNumber="1"',
        '            index="index-$Bandwidth$.webm" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
      await Dash.testFails(source, error);
    });

    it('not enough segment info', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" />',
      ]);
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });

    it('no media template', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1">',
        '  <SegmentTimeline>',
        '    <S d="10" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>',
      ]);
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });
  });
});
