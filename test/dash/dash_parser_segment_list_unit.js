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

describe('DashParser.SegmentList', function() {
  var Dash;
  var fakeNetEngine;
  var parser;
  var filterPeriod = function() {};

  beforeAll(function() {
    Dash = shaka.test.Dash;
  });

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
  });

  shaka.test.Dash.makeTimelineTests('SegmentList', '', [
    '<SegmentURL media="s1.mp4" />',
    '<SegmentURL media="s2.mp4" />',
    '<SegmentURL media="s3.mp4" />',
    '<SegmentURL media="s4.mp4" />',
    '<SegmentURL media="s5.mp4" />'
  ]);

  it('truncates segments when lengths don\'t match', function(done) {
    var source = Dash.makeSimpleManifestText([
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
    ], 65 /* duration */);
    var references = [
      Dash.makeReference('s1.mp4', 1, 50, 60),
      Dash.makeReference('s2.mp4', 2, 60, 65)
    ];
    Dash.testSegmentIndex(done, source, references);
  });

  it('supports single segment', function(done) {
    var source = Dash.makeSimpleManifestText([
      '<SegmentList>',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>'
    ], 30 /* duration */);
    var references = [Dash.makeReference('s1.mp4', 1, 0, 30)];
    Dash.testSegmentIndex(done, source, references);
  });

  describe('duration', function() {
    it('basic support', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="1" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        Dash.makeReference('s1.mp4', 1, 0, 10),
        Dash.makeReference('s2.mp4', 2, 10, 20),
        Dash.makeReference('s3.mp4', 3, 20, 30),
        Dash.makeReference('s4.mp4', 4, 30, 40)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('uses @startNumber correctly', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="5" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        Dash.makeReference('s1.mp4', 5, 40, 50),
        Dash.makeReference('s2.mp4', 6, 50, 60),
        Dash.makeReference('s3.mp4', 7, 60, 70),
        Dash.makeReference('s4.mp4', 8, 70, 80)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('supports @startNumber=0', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="0" duration="10">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        Dash.makeReference('s1.mp4', 1, 0, 10),
        Dash.makeReference('s2.mp4', 2, 10, 20)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('supports @timescale', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList startNumber="1" timescale="9000" duration="18000">',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '  <SegmentURL media="s4.mp4" />',
        '</SegmentList>'
      ]);
      var references = [
        Dash.makeReference('s1.mp4', 1, 0, 2),
        Dash.makeReference('s2.mp4', 2, 2, 4),
        Dash.makeReference('s3.mp4', 3, 4, 6),
        Dash.makeReference('s4.mp4', 4, 6, 8)
      ];
      Dash.testSegmentIndex(done, source, references);
    });
  });

  describe('presentation timeline', function() {
    it('returns correct earliest start time', function(done) {
      var source = [
        '<MPD>',
        '  <Period duration="PT60S">',
        '    <AdaptationSet mimeType="video/webm">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <Representation bandwidth="100">',
        '        <SegmentList>',
        '          <SegmentTimeline>',
        '            <S t="0" d="10" />',
        '          </SegmentTimeline>',
        '          <SegmentURL media="1-100.mp4" />',
        '        </SegmentList>',
        '      </Representation>',
        '      <Representation bandwidth="200">',
        '        <SegmentList>',
        '          <SegmentTimeline>',
        '            <S t="4" d="10" />',
        '          </SegmentTimeline>',
        '          <SegmentURL media="1-200.mp4" />',
        '        </SegmentList>',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(manifest) {
            var timeline = manifest.presentationTimeline;
            expect(timeline.getEarliestStart()).toBe(4);
          }).catch(fail).then(done);
    });
  });

  describe('rejects streams with', function() {
    it('no @duration or SegmentTimeline', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentURL media="s2.mp4" />',
        '  <SegmentURL media="s3.mp4" />',
        '</SegmentList>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });

    it('one segment and no durations', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '</SegmentList>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });

    it('empty SegmentTimeline', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentList>',
        '  <SegmentURL media="s1.mp4" />',
        '  <SegmentTimeline>',
        '  </SegmentTimeline>',
        '</SegmentList>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });
  });

  describe('inherits', function() {
    it('attributes', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT200S">',
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
        Dash.makeReference('s1.mp4', 1, 0, 50),
        Dash.makeReference('s2.mp4', 2, 50, 100),
        Dash.makeReference('s3.mp4', 3, 100, 150),
        Dash.makeReference('s4.mp4', 4, 150, 200)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('SegmentTimeline', function(done) {
      var source = [
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
        Dash.makeReference('s1.mp4', 1, 50, 60),
        Dash.makeReference('s2.mp4', 2, 60, 65),
        Dash.makeReference('s3.mp4', 3, 65, 73)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('SegmentURL', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT73S">',
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
        Dash.makeReference('s1.mp4', 1, 50, 60),
        Dash.makeReference('s2.mp4', 2, 60, 65),
        Dash.makeReference('s3.mp4', 3, 65, 73)
      ];
      Dash.testSegmentIndex(done, source, references);
    });
  });

  describe('Segment start', function() {
    it('shoud be adjusted with presentationTimeOffset', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT70S">',
        '  <Period>',
        '    <SegmentList>',
        '      <SegmentURL media="s1.mp4" />',
        '      <SegmentURL media="s2.mp4" />',
        '      <SegmentURL media="s3.mp4" />',
        '      <SegmentURL media="s4.mp4" />',
        '    </SegmentList>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation>',
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
        '</MPD>'
      ].join('\n');
      var references = [
        Dash.makeReference('s1.mp4', 1, 40, 50),
        Dash.makeReference('s2.mp4', 2, 50, 55),
        Dash.makeReference('s3.mp4', 3, 55, 63),
        Dash.makeReference('s4.mp4', 4, 63, 70)
      ];

      Dash.testSegmentIndex(done, source, references);
    });
  });
});

