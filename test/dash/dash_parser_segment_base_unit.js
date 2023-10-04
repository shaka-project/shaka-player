/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DashParser SegmentBase', () => {
  const Dash = shaka.test.Dash;

  const indexSegmentUri = '/base/test/test/assets/index-segment.mp4';

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {!ArrayBuffer} */
  let indexSegment;

  beforeAll(async () => {
    indexSegment = await shaka.test.Util.fetch(indexSegmentUri);
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

  it('requests init data for WebM', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <BaseURL>http://example.com</BaseURL>',
      '  <Period>',
      '    <AdaptationSet mimeType="video/webm">',
      '      <Representation id="1" bandwidth="1" frameRate="3000/3001">',
      '        <BaseURL>media-1.webm</BaseURL>',
      '        <SegmentBase indexRange="100-200" timescale="9000">',
      '          <Initialization sourceURL="init-1.webm" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '      <Representation id="2" bandwidth="1" frameRate="1500/1501">',
      '        <BaseURL>media-2.webm</BaseURL>',
      '        <SegmentBase indexRange="1100-1200" timescale="9000">',
      '          <Initialization sourceURL="init-2.webm" range="1201-1300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseText('http://example.com/media-1.webm', '')
        .setResponseText('http://example.com/media-2.webm', '')
        .setResponseText('http://example.com/init-1.webm', '')
        .setResponseText('http://example.com/init-2.webm', '');

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);

    // Call createSegmentIndex() on each stream to make the requests, but expect
    // failure from the actual parsing, since the data is bogus.
    const stream1 = manifest.variants[0].video;
    await expectAsync(stream1.createSegmentIndex()).toBeRejected();
    const stream2 = manifest.variants[1].video;
    await expectAsync(stream2.createSegmentIndex()).toBeRejected();

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(5);

    // Expect calls to fetch part of the media and init segments of each stream.
    fakeNetEngine.expectRangeRequest(
        'http://example.com/media-1.webm', 100, 200, /* isInit= */ false);
    fakeNetEngine.expectRangeRequest(
        'http://example.com/init-1.webm', 201, 300, /* isInit= */ true);
    fakeNetEngine.expectRangeRequest(
        'http://example.com/media-2.webm', 1100, 1200, /* isInit= */ false);
    fakeNetEngine.expectRangeRequest(
        'http://example.com/init-2.webm', 1201, 1300, /* isInit= */ true);
  });

  it('inherits from Period', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="100-200" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const segmentReference = await Dash.getFirstVideoSegmentReference(manifest);
    const initSegmentReference = segmentReference.initSegmentReference;
    expect(initSegmentReference.getUris()).toEqual(
        ['http://example.com/init.mp4']);
    expect(initSegmentReference.getStartByte()).toBe(201);
    expect(initSegmentReference.getEndByte()).toBe(300);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
    fakeNetEngine.expectRangeRequest(
        'http://example.com', 100, 200, /* isInit= */ false);
  });

  it('inherits from AdaptationSet', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <BaseURL>http://example.com</BaseURL>',
      '      <SegmentBase indexRange="100-200" timescale="9000">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentBase>',
      '      <Representation bandwidth="1" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const segmentReference = await Dash.getFirstVideoSegmentReference(manifest);
    const initSegmentReference = segmentReference.initSegmentReference;
    expect(initSegmentReference.getUris()).toEqual(
        ['http://example.com/init.mp4']);
    expect(initSegmentReference.getStartByte()).toBe(201);
    expect(initSegmentReference.getEndByte()).toBe(300);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
    fakeNetEngine.expectRangeRequest(
        'http://example.com', 100, 200, /* isInit= */ false);
  });

  it('does not require sourceURL in Initialization', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com/stream.mp4</BaseURL>',
      '        <SegmentBase indexRange="100-200" timescale="9000">',
      '          <Initialization range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com/stream.mp4', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const segmentReference = await Dash.getFirstVideoSegmentReference(manifest);
    const initSegmentReference = segmentReference.initSegmentReference;
    expect(initSegmentReference.getUris()).toEqual(
        ['http://example.com/stream.mp4']);
    expect(initSegmentReference.getStartByte()).toBe(201);
    expect(initSegmentReference.getEndByte()).toBe(300);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
    fakeNetEngine.expectRangeRequest(
        'http://example.com/stream.mp4', 100, 200, /* isInit= */ false);
  });

  it('merges across levels', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <SegmentBase presentationTimeOffset="90000">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentBase>',
      '      <Representation bandwidth="1">',
      '        <SegmentBase>',
      '          <RepresentationIndex sourceURL="index.mp4" range="5-2000" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com/index.mp4', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const segmentReference = await Dash.getFirstVideoSegmentReference(manifest);
    const initSegmentReference = segmentReference.initSegmentReference;
    expect(initSegmentReference.getUris()).toEqual(
        ['http://example.com/init.mp4']);
    expect(initSegmentReference.getStartByte()).toBe(201);
    expect(initSegmentReference.getEndByte()).toBe(300);
    expect(segmentReference.timestampOffset).toBe(-10);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
    fakeNetEngine.expectRangeRequest(
        'http://example.com/index.mp4', 5, 2000, /* isInit= */ false);
  });

  it('merges and overrides across levels', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="0-10" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <SegmentBase timescale="10" presentationTimeOffset="10">',
      '        <Initialization sourceURL="special.mp4" />',
      '      </SegmentBase>',
      '      <Representation bandwidth="1">',
      '        <SegmentBase indexRange="30-900" ',
      '                     presentationTimeOffset="200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const segmentReference = await Dash.getFirstVideoSegmentReference(manifest);
    const initSegmentReference = segmentReference.initSegmentReference;
    expect(initSegmentReference.getUris()).toEqual(
        ['http://example.com/special.mp4']);
    expect(initSegmentReference.getStartByte()).toBe(0);
    expect(initSegmentReference.getEndByte()).toBe(null);
    expect(segmentReference.timestampOffset).toBe(-20);

    expect(fakeNetEngine.request).toHaveBeenCalledTimes(2);
    fakeNetEngine.expectRangeRequest(
        'http://example.com', 30, 900, /* isInit= */ false);
  });

  it('does not assume the same timescale as media', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com/index.mp4</BaseURL>',
      '        <SegmentBase indexRange="30-900" ',
      '                     timescale="1000"',
      '                     presentationTimeOffset="2000" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com/index.mp4', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const video = manifest.variants[0].video;
    await video.createSegmentIndex();  // real data, should succeed
    goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');

    const reference = Array.from(video.segmentIndex)[0];
    expect(reference.startTime).toBe(-2);
    expect(reference.endTime).toBe(10);  // would be 12 without PTO
  });

  // https://github.com/shaka-project/shaka-player/issues/3230
  it('works with multi-Period with eviction', async () => {
    const source = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com/index.mp4</BaseURL>',
      '        <SegmentBase indexRange="30-900" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period>',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <BaseURL>http://example.com/index.mp4</BaseURL>',
      '        <SegmentBase indexRange="30-900" presentationTimeOffset="30" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>',
    ].join('\n');

    fakeNetEngine
        .setResponseText('dummy://foo', source)
        .setResponseValue('http://example.com/index.mp4', indexSegment);

    /** @type {shaka.extern.Manifest} */
    const manifest = await parser.start('dummy://foo', playerInterface);
    const video = manifest.variants[0].video;
    await video.createSegmentIndex();  // real data, should succeed
    goog.asserts.assert(video.segmentIndex != null, 'Null segmentIndex!');

    // There are originally 5 references, but the segment that spans the Period
    // boundary is duplicated.  In the bug, we'd stop references at the Period
    // boundary and only have 3 references.
    const references = Array.from(video.segmentIndex);
    expect(references.length).toBe(6);
  });

  describe('fails for', () => {
    it('unsupported container', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/cat">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="30-900" />',
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

    it('missing init segment for WebM', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="30-900" />',
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

    it('no @indexRange nor RepresentationIndex', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase>',
        '          <Initialization sourceURL="test.webm" />',
        '        </SegmentBase>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });
  });
});
