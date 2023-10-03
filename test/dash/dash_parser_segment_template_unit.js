/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => 1e6,
    };
  });

  afterEach(() => {
    // Dash parser stop is synchronous.
    parser.stop();
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

      const ref1 = stream.segmentIndex.getIteratorForTime(45).next().value;
      const ref2 = stream.segmentIndex.getIteratorForTime(55).next().value;
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
          'http://example.com/index-500.mp4', 0, null, /* isInit= */ false);
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
          'http://example.com/index-500.mp4', 0, null, /* isInit= */ false);
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
          'http://example.com/init-500.webm', 0, null, /* isInit= */ true);
      fakeNetEngine.expectRangeRequest(
          'http://example.com/index-500.webm', 0, null, /* isInit= */ false);
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
          'http://example.com/index-500.mp4', 0, null, /* isInit= */ false);
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
          'http://example.com/index-500.mp4', 0, null, /* isInit= */ false);
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
        return stream.segmentIndex.getIteratorForTime(time).next().value;
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

  describe('TimelineSegmentIndex', () => {
    describe('find', () => {
      it('finds the correct references', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 10));
        const infoClone = shaka.util.ObjectUtils.cloneObject(info);
        const index = await makeTimelineSegmentIndex(infoClone,
            /* delayPeriodEnd= */ true,
            /* shouldFit= */ true);

        const pos1 = index.find(1.0);
        expect(pos1).toBe(0);
        const pos2 = index.find(2.0);
        expect(pos2).toBe(1);

        // After the end of the last reference but before the end of the period
        // should return index of the last reference
        const lastRef = info.timeline[info.timeline.length - 1];
        const pos3 = index.find(lastRef.end + 0.5);
        expect(pos3).toBe(info.timeline.length - 1);

        const pos4 = index.find(123.45);
        expect(pos4).toBeNull();
      });

      it('finds correct position if time is in gap', async () => {
        const ranges = [
          {
            start: 0,
            end: 2,
            unscaledStart: 0,
          },
          {
            start: 3,
            end: 5,
            unscaledStart: 3 * 90000,
          },
        ];
        const info = makeTemplateInfo(ranges);
        const index = await makeTimelineSegmentIndex(info);
        const pos = index.find(2.5);
        expect(pos).toBe(0);
      });

      it('finds correct position if time === first start time', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 10));
        const index = await makeTimelineSegmentIndex(info);

        const pos = index.find(0);
        expect(pos).toBe(0);
      });

      it('finds correct position if time === first end time', async () => {
        const ranges = [
          {
            start: 0,
            end: 2,
            unscaledStart: 0,
          },
          {
            start: 2.1,
            end: 5,
            unscaledStart: 3 * 90000,
          },
        ];
        const info = makeTemplateInfo(ranges);
        const index = await makeTimelineSegmentIndex(info);

        const pos = index.find(2.0);
        expect(pos).toBe(0);
      });

      it('finds correct position if time === second start time', async () => {
        const ranges = [
          {
            start: 0,
            end: 2,
            unscaledStart: 0,
          },
          {
            start: 2.1,
            end: 5,
            unscaledStart: 3 * 90000,
          },
        ];
        const info = makeTemplateInfo(ranges);
        const index = await makeTimelineSegmentIndex(info);

        const pos = index.find(2.1);
        expect(pos).toBe(1);
      });

      it('finds correct position in multiperiod content', async () => {
        const source = [
          '<MPD type="static" availabilityStartTime="1970-01-01T00:00:00Z">',
          '  <Period duration="PT30S">',
          '    <AdaptationSet mimeType="video/mp4">',
          '      <Representation bandwidth="500">',
          '        <BaseURL>http://example.com</BaseURL>',
          '          <SegmentTemplate startNumber="0"',
          '            media="$Number$-$Time$-$Bandwidth$.mp4">',
          '            <SegmentTimeline>',
          '              <S t="0" d="5" r="6" />',
          '            </SegmentTimeline>',
          '          </SegmentTemplate>',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '  <Period duration="PT30S">',
          '    <AdaptationSet mimeType="video/mp4">',
          '      <Representation bandwidth="500">',
          '        <BaseURL>http://example.com</BaseURL>',
          '          <SegmentTemplate startNumber="6"',
          '            media="$Number$-$Time$-$Bandwidth$.mp4">',
          '            <SegmentTimeline>',
          '              <S t="0" d="5" r="6" />',
          '            </SegmentTimeline>',
          '          </SegmentTemplate>',
          '      </Representation>',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>',
        ].join('\n');

        fakeNetEngine.setResponseText('dummy://foo', source);
        const manifest = await parser.start('dummy://foo', playerInterface);
        const stream = manifest.variants[0].video;
        await stream.createSegmentIndex();

        // simulate a seek into the second period
        const segmentIterator = stream.segmentIndex.getIteratorForTime(42);
        const ref = segmentIterator.next().value;
        expect(ref.startTime).toBe(40);
      });

      it('returns null if time === last end time', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 2));
        const index = await makeTimelineSegmentIndex(info, false);

        const pos = index.find(4.0);
        expect(pos).toBeNull();
      });

      it('returns null if time > last end time', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 2));
        const index = await makeTimelineSegmentIndex(info, false);

        const pos = index.find(6.0);
        expect(pos).toBeNull();
      });
    });
    describe('get', () => {
      it('creates a segment reference for a given position', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 10));
        const index = await makeTimelineSegmentIndex(info);
        const pos = index.find(2.0);
        goog.asserts.assert(pos != null, 'Null position!');
        const ref = index.get(pos);
        expect(ref).toEqual(jasmine.objectContaining({
          'startTime': 2,
          'endTime': 4,
          'trueEndTime': 4,
          'startByte': 0,
          'endByte': null,
          'timestampOffset': 0,
          'appendWindowStart': 0,
          'appendWindowEnd': 21,
          'partialReferences': [],
          'tilesLayout': '',
          'tileDuration': null,
        }));
      });

      it('returns null if a position is unknown', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 10));
        const index = await makeTimelineSegmentIndex(info);
        const ref = index.get(12345);
        expect(ref).toBeNull();
      });

      it('returns null if a position < 0', async () => {
        const info = makeTemplateInfo(makeRanges(0, 2.0, 10));
        const index = await makeTimelineSegmentIndex(info);
        const ref = index.get(-12);
        expect(ref).toBeNull();
      });
    });

    describe('appendTemplateInfo', () => {
      it('appends new timeline to existing', async () => {
        const initialRanges = makeRanges(0, 2.0, 10);
        const info = makeTemplateInfo(initialRanges);
        const index = await makeTimelineSegmentIndex(info, false);

        const newStart = initialRanges[initialRanges.length - 1].end;
        expect(index.find(newStart)).toBeNull();

        const newRanges = makeRanges(newStart, 2.0, 10);
        const newTemplateInfo = makeTemplateInfo(newRanges);

        const newEnd = newRanges[newRanges.length - 1].end;
        index.appendTemplateInfo(newTemplateInfo, newEnd);
        expect(index.find(newStart)).toBe(10);
        expect(index.find(newEnd - 1.0)).toBe(19);
      });
    });

    describe('evict', () => {
      it('evicts old entries and maintains position', async () => {
        const initialRanges = makeRanges(0, 2.0, 10);
        const info = makeTemplateInfo(initialRanges);
        const index = await makeTimelineSegmentIndex(info, false);

        index.evict(4.0);
        expect(index.find(2.0)).toBe(2);
        expect(index.find(6.0)).toBe(3);
      });
    });
  });

  /**
   *
   * @param {shaka.dash.SegmentTemplate.SegmentTemplateInfo} info
   * @param {boolean} delayPeriodEnd
   * @param {boolean} shouldFit
   * @return {?}
   */
  async function makeTimelineSegmentIndex(info, delayPeriodEnd = true,
      shouldFit = false) {
    // Period end may be a bit after the last timeline entry
    let periodEnd = info.timeline[info.timeline.length - 1].end;
    if (delayPeriodEnd) {
      periodEnd += 1.0;
    }

    const dummySource = Dash.makeSimpleManifestText([
      '<SegmentTemplate startNumber="0" duration="10"',
      '    media="$Number$-$Time$-$Bandwidth$.mp4">',
      '  <SegmentTimeline>',
      '    <S t="0" d="15" r="2" />',
      '  </SegmentTimeline>',
      '</SegmentTemplate>',
    ], /* duration= */ 45);

    fakeNetEngine.setResponseText('dummy://foo', dummySource);
    const manifest = await parser.start('dummy://foo', playerInterface);

    expect(manifest.variants.length).toBe(1);

    const stream = manifest.variants[0].video;
    expect(stream).toBeTruthy();
    await stream.createSegmentIndex();

    /** @type {?} */
    const index = stream.segmentIndex;
    index.release();
    index.appendTemplateInfo(info, info.timeline[0].start,
        periodEnd, shouldFit);

    return index;
  }
});

/**
 * Creates a URI string.
 *
 * @param {number} x
 * @return {string}
 */
function uri(x) {
  return 'http://example.com/video_' + x + '.m4s';
}

/**
 *
 * @return {shaka.media.InitSegmentReference}
 */
function makeInitSegmentReference() {
  return new shaka.media.InitSegmentReference(() => [], 0, null);
}

/**
 * Create a list of continuous time ranges
 * @param {number} start
 * @param {number} duration
 * @param {number} num
 * @return {Array<shaka.media.PresentationTimeline.TimeRange>}
 */
function makeRanges(start, duration, num) {
  const ranges = [];
  let currentPos = start;
  for (let i = 0; i < num; i += 1) {
    ranges.push({
      start: currentPos,
      end: currentPos + duration,
      unscaledStart: currentPos * 90000,
    });
    currentPos += duration;
  }
  return ranges;
}

/**
 * Creates a real SegmentReference.  This is distinct from the fake ones used
 * in ManifestParser tests because it can be on the left-hand side of an
 * expect().  You can't expect jasmine.any(Number) to equal
 * jasmine.any(Number).  :-(
 *
 * @param {Array<shaka.media.PresentationTimeline.TimeRange>} timeline
 * @return {shaka.dash.SegmentTemplate.SegmentTemplateInfo}
 */
function makeTemplateInfo(timeline) {
  return {
    'segmentDuration': null,
    'timescale': 90000,
    'startNumber': 1,
    'scaledPresentationTimeOffset': 0,
    'unscaledPresentationTimeOffset': 0,
    'timeline': timeline,
    'mediaTemplate': 'master_540_2997_$Number%09d$.cmfv',
    'indexTemplate': null,
  };
}
