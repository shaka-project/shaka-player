/**
 * @license
 * Copyright 2015 Google Inc.
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

describe('DashParser.SegmentList', function() {
  dashMakeTimelineTests('SegmentList', '', [
    '<SegmentURL media="s1.mp4" />',
    '<SegmentURL media="s2.mp4" />',
    '<SegmentURL media="s3.mp4" />',
    '<SegmentURL media="s4.mp4" />',
    '<SegmentURL media="s5.mp4" />'
  ]);

  it('truncates segments when lengths don\'t match', function(done) {
    var source = makeSimpleManifestText([
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
      '</SegmentList>'
    ], 30 /* duration */);
    var references = [
      makeReference('s1.mp4', 1, 50, 60),
      makeReference('s2.mp4', 2, 60, 65)
    ];
    dashTestSegmentIndex(done, source, references);
  });

  it('supports single segment', function(done) {
    var source = makeSimpleManifestText([
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>'
    ], 30 /* duration */);
    var references = [makeReference('s1.mp4', 1, 0, 30)];
    dashTestSegmentIndex(done, source, references);
  });

  describe('duration', function() {
    it('basic support', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList startNumber="1" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        makeReference('s1.mp4', 1, 0, 10),
        makeReference('s2.mp4', 2, 10, 20),
        makeReference('s3.mp4', 3, 20, 30),
        makeReference('s4.mp4', 4, 30, 40)
      ];
      dashTestSegmentIndex(done, source, references);
    });

    it('uses @startNumber correctly', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList startNumber="5" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        makeReference('s1.mp4', 5, 40, 50),
        makeReference('s2.mp4', 6, 50, 60),
        makeReference('s3.mp4', 7, 60, 70),
        makeReference('s4.mp4', 8, 70, 80)
      ];
      dashTestSegmentIndex(done, source, references);
    });

    it('supports @startNumber=0', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList startNumber="0" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        makeReference('s1.mp4', 1, 0, 10),
        makeReference('s2.mp4', 2, 10, 20)
      ];
      dashTestSegmentIndex(done, source, references);
    });

    it('supports @timescale', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList startNumber="1" timescale="9000" duration="18000">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        makeReference('s1.mp4', 1, 0, 2),
        makeReference('s2.mp4', 2, 2, 4),
        makeReference('s3.mp4', 3, 4, 6),
        makeReference('s4.mp4', 4, 6, 8)
      ];
      dashTestSegmentIndex(done, source, references);
    });
  });

  describe('rejects streams with', function() {
    it('no @duration or SegmentTimeline', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '</SegmentList>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      dashTestFails(done, source, error);
    });

    it('one segment and no durations', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '</SegmentList>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      dashTestFails(done, source, error);
    });

    it('empty SegmentTimeline', function(done) {
      var source = makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentTimeline>',
        '  </SegmentTimeline>',
        '</SegmentList>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      dashTestFails(done, source, error);
    });
  });

  describe('inherits', function() {
    it('attributes', function(done) {
      var source = [
        '<MPD>',
        '  <Period>',
        '    <SegmentList startNumber="40" />',
        '    <AdaptationSet mimeType="video/webm">',
        '      <SegmentList startNumber="1" duration="50" />',
        '      <Representation>',
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
        '</MPD>'
      ].join('\n');
      var references = [
        makeReference('s1.mp4', 1, 0, 50),
        makeReference('s2.mp4', 2, 50, 100),
        makeReference('s3.mp4', 3, 100, 150),
        makeReference('s4.mp4', 4, 150, 200)
      ];
      dashTestSegmentIndex(done, source, references);
    });

    it('SegmentTimeline', function(done) {
      var source = [
        '<MPD>',
        '  <Period>',
        '    <SegmentList>',
        '      <SegmentTimeline>',
        '        <S d="10" t="50" />',
        '        <S d="5" />',
        '        <S d="8" />',
        '      </SegmentTimeline>',
        '    </SegmentList>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation>',
        '        <BaseURL>http://example.com</BaseURL>',
        '        <SegmentList>',
        '          <SegmentURL media="s1.mp4" />',
        '          <SegmentURL media="s2.mp4" />',
        '          <SegmentURL media="s3.mp4" />',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var references = [
        makeReference('s1.mp4', 1, 50, 60),
        makeReference('s2.mp4', 2, 60, 65),
        makeReference('s3.mp4', 3, 65, 73)
      ];
      dashTestSegmentIndex(done, source, references);
    });

    it('SegmentURL', function(done) {
      var source = [
        '<MPD>',
        '  <Period>',
        '    <SegmentList>',
        '      <SegmentURL media="s1.mp4" />',
        '      <SegmentURL media="s2.mp4" />',
        '      <SegmentURL media="s3.mp4" />',
        '    </SegmentList>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation>',
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
        '</MPD>'
      ].join('\n');
      var references = [
        makeReference('s1.mp4', 1, 50, 60),
        makeReference('s2.mp4', 2, 60, 65),
        makeReference('s3.mp4', 3, 65, 73)
      ];
      dashTestSegmentIndex(done, source, references);
    });
  });
});

