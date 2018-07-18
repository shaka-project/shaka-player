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

describe('DashParser SegmentList', function() {
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
    let source = Dash.makeSimpleManifestText([
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
    ], 65 /* duration */);
    let references = [
      ManifestParser.makeReference('s1.mp4', 1, 50, 60, baseUri),
      ManifestParser.makeReference('s2.mp4', 2, 60, 65, baseUri),
    ];
    await Dash.testSegmentIndex(source, references);
  });

  it('supports single segment', async () => {
    let source = Dash.makeSimpleManifestText([
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>',
    ], 30 /* duration */);
    let references = [ManifestParser.makeReference('s1.mp4', 1,
                                                   0, 30, baseUri)];
    await Dash.testSegmentIndex(source, references);
  });

  describe('duration', function() {
    it('basic support', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="1" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>',
      ]);
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 10, 20, baseUri),
        ManifestParser.makeReference('s3.mp4', 3, 20, 30, baseUri),
        ManifestParser.makeReference('s4.mp4', 4, 30, 40, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('uses @startNumber correctly', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="5" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>',
      ]);
      let references = [
        ManifestParser.makeReference('s1.mp4', 5, 40, 50, baseUri),
        ManifestParser.makeReference('s2.mp4', 6, 50, 60, baseUri),
        ManifestParser.makeReference('s3.mp4', 7, 60, 70, baseUri),
        ManifestParser.makeReference('s4.mp4', 8, 70, 80, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('supports @startNumber=0', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="0" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>',
      ]);
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 10, 20, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('supports @timescale', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="1" timescale="9000" duration="18000">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>',
      ]);
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 0, 2, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 2, 4, baseUri),
        ManifestParser.makeReference('s3.mp4', 3, 4, 6, baseUri),
        ManifestParser.makeReference('s4.mp4', 4, 6, 8, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });
  });

  describe('rejects streams with', function() {
    it('no @duration or SegmentTimeline', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '</SegmentList>',
      ]);
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });

    it('one segment and no durations', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '</SegmentList>',
      ]);
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });

    it('empty SegmentTimeline', async () => {
      let source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentTimeline>',
        '  </SegmentTimeline>',
        '</SegmentList>',
      ]);
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      await Dash.testFails(source, error);
    });
  });

  describe('inherits', function() {
    it('attributes', async () => {
      let source = [
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
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 0, 50, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 50, 100, baseUri),
        ManifestParser.makeReference('s3.mp4', 3, 100, 150, baseUri),
        ManifestParser.makeReference('s4.mp4', 4, 150, 200, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('SegmentTimeline', async () => {
      let source = [
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
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 50, 60, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 60, 65, baseUri),
        ManifestParser.makeReference('s3.mp4', 3, 65, 73, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });

    it('SegmentURL', async () => {
      let source = [
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
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 50, 60, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 60, 65, baseUri),
        ManifestParser.makeReference('s3.mp4', 3, 65, 73, baseUri),
      ];
      await Dash.testSegmentIndex(source, references);
    });
  });

  describe('Segment start', function() {
    it('shoud be adjusted with presentationTimeOffset', async () => {
      let source = [
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
      let references = [
        ManifestParser.makeReference('s1.mp4', 1, 40, 50, baseUri),
        ManifestParser.makeReference('s2.mp4', 2, 50, 55, baseUri),
        ManifestParser.makeReference('s3.mp4', 3, 55, 63, baseUri),
        ManifestParser.makeReference('s4.mp4', 4, 63, 70, baseUri),
      ];

      await Dash.testSegmentIndex(source, references);
    });
  });
});

