/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DashParser SegmentList', () => {
  const Dash = shaka.test.Dash;
  const ManifestParser = shaka.test.ManifestParser;
  const baseUri = 'http://example.com/';

  shaka.test.Dash.makeTimelineTests('SegmentList', '', [
    '<SegmentURL media="s1.mp4" />',
    '<SegmentURL media="s2.mp4" />',
    '<SegmentURL media="s3.mp4" />',
    '<SegmentURL media="s4.mp4" />',
    '<SegmentURL media="s5.mp4" />',
  ]);

  it('truncates segments when lengths don\'t match', async () => {
    const source = Dash.makeSimpleManifestText([
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '  <SegmentURL media="s2.mp4" />',
      '  <SegmentURL media="s3.mp4" />',
      '  <SegmentURL media="s4.mp4" />',
      '  <SegmentURL media="s5.mp4" />',
      '  <SegmentTimeline>',
      '    <S d="10" t="50" />',
      '    <S d="5" />',
      '  </SegmentTimeline>',
      '</SegmentList>',
    ], /* duration= */ 65);
    const references = [
      ManifestParser.makeReference('s1.mp4', 50, 60, baseUri),
      ManifestParser.makeReference('s2.mp4', 60, 65, baseUri),
    ];
    await Dash.testSegmentIndex(source, references);
  });

  it('supports single segment', async () => {
    const source = Dash.makeSimpleManifestText([
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>',
    ], /* duration= */ 30);
    const references = [
      ManifestParser.makeReference('s1.mp4', 0, 30, baseUri),
    ];
    await Dash.testSegmentIndex(source, references);
  });

  describe('duration', () => {
    it('basic support', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="1" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>',
      ]);
      const references = [
        ManifestParser.makeReference('s1.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('s3.mp4', 20, 30, baseUri),
        ManifestParser.makeReference('s4.mp4', 30, 40, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('uses @startNumber correctly', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="5" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>',
      ]);
      const references = [
        ManifestParser.makeReference('s1.mp4', 40, 50, baseUri),
        ManifestParser.makeReference('s2.mp4', 50, 60, baseUri),
        ManifestParser.makeReference('s3.mp4', 60, 70, baseUri),
        ManifestParser.makeReference('s4.mp4', 70, 80, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('supports @startNumber=0', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="0" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>',
      ]);
      const references = [
        ManifestParser.makeReference('s1.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 10, 20, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('supports @timescale', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="1" timescale="9000" duration="18000">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>',
      ]);
      const references = [
        ManifestParser.makeReference('s1.mp4', 0, 2, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 4, baseUri),
        ManifestParser.makeReference('s3.mp4', 4, 6, baseUri),
        ManifestParser.makeReference('s4.mp4', 6, 8, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });
  });

  describe('rejects streams with', () => {
    it('no @duration or SegmentTimeline', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '</SegmentList>',
      ]);
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });

    it('one segment and no durations', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '</SegmentList>',
      ]);
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });

    it('empty SegmentTimeline', async () => {
      const source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentTimeline>',
        '  </SegmentTimeline>',
        '</SegmentList>',
      ]);
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });
  });

  describe('inherits', () => {
    it('attributes', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT200S">',
        '  <Period>',
        '    <SegmentList startNumber="40" />',
        '    <AdaptationSet mimeType="video/webm">',
        '      <SegmentList startNumber="1" duration="50" />',
        '      <Representation bandwidth="1">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentList>',
        '          <SegmentURL media="s1.mp4" />',
        '          <SegmentURL media="s2.mp4" />',
        '          <SegmentURL media="s3.mp4" />',
        '          <SegmentURL media="s4.mp4" />',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const references = [
        ManifestParser.makeReference('s1.mp4', 0, 50, baseUri),
        ManifestParser.makeReference('s2.mp4', 50, 100, baseUri),
        ManifestParser.makeReference('s3.mp4', 100, 150, baseUri),
        ManifestParser.makeReference('s4.mp4', 150, 200, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('SegmentTimeline', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT73S">',
        '  <Period>',
        '    <SegmentList>',
        '      <SegmentTimeline>',
        '        <S d="10" t="50" />',
        '        <S d="5" />',
        '        <S d="8" />',
        '      </SegmentTimeline>',
        '    </SegmentList>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentList>',
        '          <SegmentURL media="s1.mp4" />',
        '          <SegmentURL media="s2.mp4" />',
        '          <SegmentURL media="s3.mp4" />',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const references = [
        ManifestParser.makeReference('s1.mp4', 50, 60, baseUri),
        ManifestParser.makeReference('s2.mp4', 60, 65, baseUri),
        ManifestParser.makeReference('s3.mp4', 65, 73, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('SegmentURL', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT73S">',
        '  <Period>',
        '    <SegmentList>',
        '      <SegmentURL media="s1.mp4" />',
        '      <SegmentURL media="s2.mp4" />',
        '      <SegmentURL media="s3.mp4" />',
        '    </SegmentList>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentList>',
        '          <SegmentTimeline>',
        '            <S d="10" t="50" />',
        '            <S d="5" />',
        '            <S d="8" />',
        '          </SegmentTimeline>',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const references = [
        ManifestParser.makeReference('s1.mp4', 50, 60, baseUri),
        ManifestParser.makeReference('s2.mp4', 60, 65, baseUri),
        ManifestParser.makeReference('s3.mp4', 65, 73, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });
  });

  describe('Segment start', () => {
    it('shoud be adjusted with presentationTimeOffset', async () => {
      const source = [
        '<MPD mediaPresentationDuration="PT70S">',
        '  <Period>',
        '    <SegmentList>',
        '      <SegmentURL media="s1.mp4" />',
        '      <SegmentURL media="s2.mp4" />',
        '      <SegmentURL media="s3.mp4" />',
        '      <SegmentURL media="s4.mp4" />',
        '    </SegmentList>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="1">',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentList presentationTimeOffset="10" startNumber="1">',
        '          <SegmentTimeline>',
        '            <S d="10" t="50" />',
        '            <S d="5" />',
        '            <S d="8" />',
        '            <S d="7" />',
        '          </SegmentTimeline>',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');

      const references = [
        ManifestParser.makeReference('s1.mp4', 40, 50, baseUri),
        ManifestParser.makeReference('s2.mp4', 50, 55, baseUri),
        ManifestParser.makeReference('s3.mp4', 55, 63, baseUri),
        ManifestParser.makeReference('s4.mp4', 63, 70, baseUri),
      ];
      for (const ref of references) {
        ref.timestampOffset = -10;
      }

      await Dash.testSegmentIndex(source, references);
    });
  });

  // https://github.com/shaka-project/shaka-player/issues/3230
  it('works with multi-Period with eviction', async () => {
    const setFormat = [
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation>',
      '        <SegmentList presentationTimeOffset="%s">',
      '          <SegmentURL media="s1.mp4" />',
      '          <SegmentURL media="s2.mp4" />',
      '          <SegmentURL media="s3.mp4" />',
      '          <SegmentURL media="s4.mp4" />',
      '          <SegmentURL media="s5.mp4" />',
      '          <SegmentTimeline>',
      '            <S d="10" t="0" r="4" />',
      '          </SegmentTimeline>',
      '        </SegmentList>',
      '      </Representation>',
      '    </AdaptationSet>',
    ].join('\n');
    const source = [
      '<MPD mediaPresentationDuration="PT60S">',
      `  <BaseURL>${baseUri}</BaseURL>`,
      '  <Period duration="PT30S">',
      `${sprintf(setFormat, [0])}`,
      '  </Period>',
      '  <Period duration="PT30S">',
      `${sprintf(setFormat, [20])}`,
      '  </Period>',
      '</MPD>',
    ].join('\n');
    const networkingEngine = new shaka.test.FakeNetworkingEngine()
        .setResponseText('dummy://foo', source);

    const dashParser = shaka.test.Dash.makeDashParser();

    const playerInterface = {
      networkingEngine: networkingEngine,
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: () => {},
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
    try {
      const manifest = await dashParser.start('dummy://foo', playerInterface);
      const stream = manifest.variants[0].video;
      await stream.createSegmentIndex();
      goog.asserts.assert(stream.segmentIndex, 'Expected index to be created');

      // Don't use Dash.testSegmentIndex since it uses SegmentIndex.find, which
      // doesn't reproduce this issue.  We want to use Array.from which uses
      // the iterator.
      const expected = [
        ManifestParser.makeReference('s1.mp4', 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 10, 20, baseUri),
        ManifestParser.makeReference('s3.mp4', 20, 30, baseUri),

        ManifestParser.makeReference('s3.mp4', 30, 40, baseUri),
        ManifestParser.makeReference('s4.mp4', 40, 50, baseUri),
        ManifestParser.makeReference('s5.mp4', 50, 60, baseUri),
      ];
      const actual = Array.from(stream.segmentIndex);
      expect(actual).toEqual(expected);
    } finally {
      dashParser.stop();
    }
  });
});
