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

describe('DashParser.SegmentTemplate', function() {
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

  shaka.test.Dash.makeTimelineTests(
      'SegmentTemplate', 'media="s$Number$.mp4"', []);

  describe('duration', function() {
    it('basic support', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '  duration="10" />'
      ], 60 /* duration */);
      var references = [
        Dash.makeReference('s1.mp4', 0, 0, 10),
        Dash.makeReference('s2.mp4', 1, 10, 20),
        Dash.makeReference('s3.mp4', 2, 20, 30),
        Dash.makeReference('s4.mp4', 3, 30, 40),
        Dash.makeReference('s5.mp4', 4, 40, 50),
        Dash.makeReference('s6.mp4', 5, 50, 60)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startNumber > 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="10" media="s$Number$.mp4"',
        '   duration="10" />'
      ], 30 /* duration */);
      var references = [
        Dash.makeReference('s10.mp4', 0, 0, 10),
        Dash.makeReference('s11.mp4', 1, 10, 20),
        Dash.makeReference('s12.mp4', 2, 20, 30)
      ];
      Dash.testSegmentIndex(done, source, references);
    });
  });

  describe('index', function() {
    it('basic support', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '    initialization="init-$Bandwidth$.mp4" />'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('defaults to index with multiple segment sources', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '    initialization="init-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="3" r="12" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('requests init data for WebM', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.webm': '',
        'http://example.com/init-500.webm': ''
      });
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.webm', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(3);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/init-500.webm', 0, null);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.webm', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('inherits from Period', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '        initialization="init-$Bandwidth$.mp4" />',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="500" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('inherits from AdaptationSet', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '          initialization="init-$Bandwidth$.mp4" />',
        '      <Representation bandwidth="500" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });
  });

  describe('media template', function() {
    it('defaults to timeline when also has duration', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="15" r="2" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ], 45 /* duration */);
      var references = [
        Dash.makeReference('0-0-500.mp4', 0, 0, 15),
        Dash.makeReference('1-15-500.mp4', 1, 15, 30),
        Dash.makeReference('2-30-500.mp4', 2, 30, 45)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startnumber = 0', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 30 /* duration */);
      var references = [
        Dash.makeReference('0-0-500.mp4', 0, 0, 10),
        Dash.makeReference('1-10-500.mp4', 1, 10, 20),
        Dash.makeReference('2-20-500.mp4', 2, 20, 30)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startNumber = 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 30 /* duration */);
      var references = [
        Dash.makeReference('1-0-500.mp4', 0, 0, 10),
        Dash.makeReference('2-10-500.mp4', 1, 10, 20),
        Dash.makeReference('3-20-500.mp4', 2, 20, 30)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startNumber > 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="10" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 30 /* duration */);
      var references = [
        Dash.makeReference('10-0-500.mp4', 0, 0, 10),
        Dash.makeReference('11-10-500.mp4', 1, 10, 20),
        Dash.makeReference('12-20-500.mp4', 2, 20, 30)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @timescale > 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" timescale="9000" duration="9000"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 3 /* duration */);
      var references = [
        Dash.makeReference('1-0-500.mp4', 0, 0, 1),
        Dash.makeReference('2-9000-500.mp4', 1, 1, 2),
        Dash.makeReference('3-18000-500.mp4', 2, 2, 3)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('across representations', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail)
          .then(function(actual) {
            expect(actual).toBeTruthy();

            var streamSet = actual.periods[0].streamSets[0];
            expect(streamSet).toBeTruthy();
            expect(streamSet.streams.length).toBe(3);

            expect(streamSet.streams[0].findSegmentPosition(0)).toBe(0);
            expect(streamSet.streams[0].getSegmentReference(0)).toEqual(
                Dash.makeReference('1-0-100.mp4', 0, 0, 10));
            expect(streamSet.streams[0].findSegmentPosition(12)).toBe(1);
            expect(streamSet.streams[0].getSegmentReference(1)).toEqual(
                Dash.makeReference('2-10-100.mp4', 1, 10, 20));
            expect(streamSet.streams[1].findSegmentPosition(0)).toBe(0);
            expect(streamSet.streams[1].getSegmentReference(0)).toEqual(
                Dash.makeReference('1-0-200.mp4', 0, 0, 10));
            expect(streamSet.streams[1].findSegmentPosition(12)).toBe(1);
            expect(streamSet.streams[1].getSegmentReference(1)).toEqual(
                Dash.makeReference('2-10-200.mp4', 1, 10, 20));
            expect(streamSet.streams[2].findSegmentPosition(0)).toBe(0);
            expect(streamSet.streams[2].getSegmentReference(0)).toEqual(
                Dash.makeReference('1-0-300.mp4', 0, 0, 10));
            expect(streamSet.streams[2].findSegmentPosition(12)).toBe(1);
            expect(streamSet.streams[2].getSegmentReference(1)).toEqual(
                Dash.makeReference('2-10-300.mp4', 1, 10, 20));
          }).catch(fail).then(done);
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
        '        <SegmentTemplate media="$Number$-$Bandwidth$.mp4">',
        '          <SegmentTimeline>',
        '            <S t="0" d="10" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
        '      </Representation>',
        '      <Representation bandwidth="200">',
        '        <SegmentTemplate media="$Number$-$Bandwidth$.mp4">',
        '          <SegmentTimeline>',
        '            <S t="4" d="10" />',
        '          </SegmentTimeline>',
        '        </SegmentTemplate>',
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
    it('bad container type', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
      Dash.testFails(done, source, error);
    });

    it('no init data with webm', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
      Dash.testFails(done, source, error);
    });

    it('not enough segment info', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" />'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });

    it('no media template', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1">',
        '  <SegmentTimeline>',
        '    <S d="10" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });
  });
});

