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

// Test basic manifest parsing functionality.
describe('DashParser.Manifest', function() {
  var Dash;
  var fakeNetEngine;
  var parser;
  var filterPeriod = function() {};
  var onEventSpy;

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
    onEventSpy = jasmine.createSpy('onEvent');
  });

  beforeAll(function() {
    Dash = shaka.test.Dash;
  });

  /**
   * Makes a series of tests for the given manifest type.
   *
   * @param {!Array.<string>} startLines
   * @param {!Array.<string>} endLines
   * @param {shakaExtern.Manifest} expected
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
     * @param {function()} done
     * @param {string} manifestText
     */
    function testDashParser(done, manifestText) {
      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
          .then(function(actual) { expect(actual).toEqual(expected); })
          .catch(fail)
          .then(done);
    }

    it('with SegmentBase', function(done) {
      var source = makeTestManifest([
        '    <SegmentBase indexRange="100-200" timescale="9000">',
        '      <Initialization sourceURL="init.mp4" range="201-300" />',
        '    </SegmentBase>'
      ]);
      testDashParser(done, source);
    });

    it('with SegmentList', function(done) {
      var source = makeTestManifest([
        '    <SegmentList startNumber="1" duration="10">',
        '      <Initialization sourceURL="init.mp4" range="201-300" />',
        '      <SegmentURL media="s1.mp4" />',
        '    </SegmentList>'
      ]);
      testDashParser(done, source);
    });

    it('with SegmentTemplate', function(done) {
      var source = makeTestManifest([
        '    <SegmentTemplate startNumber="1" media="l-$Number$.mp4"',
        '        initialization="init.mp4">',
        '      <Initialization sourceURL="init.mp4" range="201-300" />',
        '      <SegmentTimeline>',
        '        <S t="0" d="30" />',
        '      </SegmentTimeline>',
        '    </SegmentTemplate>'
      ]);
      testDashParser(done, source);
    });
  }

  describe('parses and inherits attributes', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet contentType="video" mimeType="video/mp4"',
          '        codecs="avc1.4d401f" frameRate="1000000/42000" lang="en">',
          '      <Representation bandwidth="100" width="768" height="576" />',
          '      <Representation bandwidth="50" width="576" height="432" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="text/vtt" codecs="mp4a.40.29"',
          '        lang="es">',
          '      <Role value="caption" />',
          '      <Role value="main" />',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="audio/mp4">',
          '      <Role value="main" />',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(75)
          .addPeriod(0)
            .addStreamSet('video')
              .language('en')
              .addStream(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .presentationTimeOffset(0)
                .mime('video/mp4', 'avc1.4d401f')
                .bandwidth(100)
                .frameRate(1000000 / 42000)
                .size(768, 576)
              .addStream(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .presentationTimeOffset(0)
                .mime('video/mp4', 'avc1.4d401f')
                .bandwidth(50)
                .frameRate(1000000 / 42000)
                .size(576, 432)
            .addStreamSet('text')
              .language('es')
              .primary()
              .addStream(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .presentationTimeOffset(0)
                .mime('text/vtt', 'mp4a.40.29')
                .bandwidth(100)
                .kind('caption')
            .addStreamSet('audio')
              .primary()
              .addStream(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .bandwidth(100)
                .presentationTimeOffset(0)
                .mime('audio/mp4')
          .build());
  });

  describe('squashes stream sets by AdaptationSetSwitching', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet id="1" mimeType="video/mp4" lang="en">',
          '      <SupplementalProperty value="2"',
          'schemeIdUri="http://dashif.org/guidelines/AdaptationSetSwitching"/>',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet id="2" mimeType="video/mp4" lang="en">',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(75)
          .addPeriod(0)
            .addStreamSet('video')
              .language('en')
              .addPartialStream().bandwidth(100)
              .addPartialStream().bandwidth(200)
          .build());
  });

  describe('ignores unrecognized IDs in AdaptationSetSwitching', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" id="1">',
          '      <SupplementalProperty value="4"',
          'schemeIdUri="http://dashif.org/descriptor/AdaptationSetSwitching"/>',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="en" id="2">',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(75)
          .addPeriod(0)
            .addStreamSet('video')
              .language('en')
              .addPartialStream().bandwidth(100)
            .addStreamSet('video')
              .language('en')
              .addPartialStream().bandwidth(200)
          .build());
  });

  describe('does not squash different languages', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" id="1">',
          '      <SupplementalProperty value="2"',
          'schemeIdUri="urn:mpeg:dash:adaptation-set-switching:2016"/>',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="es" id="2">',
          '      <SupplementalProperty value="1"',
          'schemeIdUri="http://dashif.org/guidelines/AdaptationSetSwitching"/>',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(75)
          .addPeriod(0)
            .addStreamSet('video')
              .language('en')
              .addPartialStream().bandwidth(100)
            .addStreamSet('video')
              .language('es')
              .addPartialStream().bandwidth(200)
          .build());
  });

  describe('does not squash different content types', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" id="1">',
          '      <SupplementalProperty value="2"',
          'schemeIdUri="http://dashif.org/descriptor/AdaptationSetSwitching"/>',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="audio/mp4" lang="en" id="2">',
          '      <SupplementalProperty value="1"',
          'schemeIdUri="urn:mpeg:dash:adaptation-set-switching:2016"/>',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(75)
          .addPeriod(0)
            .addStreamSet('video')
              .language('en')
              .addPartialStream().bandwidth(100)
            .addStreamSet('audio')
              .language('en')
              .addPartialStream().bandwidth(200)
          .build());
  });

  it('skips any periods after one without duration', function(done) {
    var periodContents = [
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100">',
      '        <SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '          <Initialization sourceURL="init.mp4" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>'
    ].join('\n');
    var template = [
      '<MPD mediaPresentationDuration="PT75S">',
      '  <Period id="1">',
      '%(periodContents)s',
      '  </Period>',
      '  <Period id="2">',
      '%(periodContents)s',
      '  </Period>',
      '</MPD>'
    ].join('\n');
    var source = sprintf(template, {periodContents: periodContents});

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
        })
        .catch(fail)
        .then(done);
  });

  it('calculates Period times when missing', function(done) {
    var periodContents = [
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100">',
      '        <SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '          <Initialization sourceURL="init.mp4" range="201-300" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>'
    ].join('\n');
    var template = [
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
      '</MPD>'
    ].join('\n');
    var source = sprintf(template, {periodContents: periodContents});

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(3);
          expect(manifest.periods[0].startTime).toBe(10);
          expect(manifest.periods[1].startTime).toBe(20);
          expect(manifest.periods[2].startTime).toBe(30);
        })
        .catch(fail)
        .then(done);
  });

  it('defaults to SegmentBase with multiple Segment*', function(done) {
    var source = Dash.makeSimpleManifestText([
      '<SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '</SegmentBase>',
      '<SegmentList presentationTimeOffset="2" duration="10">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>'
    ]);

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          var stream = manifest.periods[0].streamSets[0].streams[0];
          expect(stream.presentationTimeOffset).toBe(1);
        })
        .catch(fail)
        .then(done);
  });

  it('defaults to SegmentList with SegmentTemplate', function(done) {
    var source = Dash.makeSimpleManifestText([
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
      '</SegmentTemplate>'
    ]);

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          var stream = manifest.periods[0].streamSets[0].streams[0];
          expect(stream.presentationTimeOffset).toBe(2);
        })
        .catch(fail)
        .then(done);
  });

  it('generates a correct index for non-segmented text', function(done) {
    var source = [
      '<MPD mediaPresentationDuration="PT30S">',
      '  <Period>',
      '    <AdaptationSet mimeType="text/vtt" lang="de">',
      '      <Representation>',
      '        <BaseURL>http://example.com/de.vtt</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

    var stream;
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          stream = manifest.periods[0].streamSets[0].streams[0];
          return stream.createSegmentIndex();
        }).then(function() {
          expect(stream.initSegmentReference).toBe(null);
          expect(stream.findSegmentPosition(0)).toBe(1);
          expect(stream.getSegmentReference(1))
              .toEqual(new shaka.media.SegmentReference(1, 0, 30, function() {
                return ['http://example.com/de.vtt'];
              }, 0, null));
        }).catch(fail).then(done);
  });

  it('correctly parses UTF-8', function(done) {
    var source = [
      '<MPD>',
      '  <Period duration="PT30M">',
      '    <AdaptationSet mimeType="video/mp4" lang="\u2603">',
      '      <Representation bandwidth="500">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentTemplate media="2.mp4" duration="1"',
      '            initialization="\u0227.mp4" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          var streamSet = manifest.periods[0].streamSets[0];
          var stream = streamSet.streams[0];
          expect(stream.initSegmentReference.getUris()[0])
              .toBe('http://example.com/%C8%A7.mp4');
          expect(streamSet.language).toBe('\u2603');
        }).catch(fail).then(done);
  });

  describe('supports UTCTiming', function() {
    var originalNow;

    beforeAll(function() {
      originalNow = Date.now;
      Date.now = function() { return 10 * 1000; };
    });

    afterAll(function() {
      Date.now = originalNow;
    });

    /**
     * @param {!Array.<string>} lines
     * @return {string}
     */
    function makeManifest(lines) {
      var template = [
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
        '</MPD>'
      ].join('\n');
      return sprintf(template, lines.join('\n'));
    }

    /**
     * @param {function()} done
     * @param {number} expectedTime
     */
    function runTest(done, expectedTime) {
      parser.start(
          'http://foo.bar/manifest',
          fakeNetEngine,
          filterPeriod,
          fail,
          onEventSpy)
          .then(function(manifest) {
            expect(manifest.presentationTimeline).toBeTruthy();
            expect(manifest.presentationTimeline.getSegmentAvailabilityEnd())
                .toBe(expectedTime);
          })
          .catch(fail)
          .then(done);
    }

    it('with direct', function(done) {
      var source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:direct:2014"',
        '    value="1970-01-01T00:00:30Z" />'
      ]);

      fakeNetEngine.setResponseMapAsText({'http://foo.bar/manifest': source});
      runTest(done, 25);
    });

    it('does not produce errors', function(done) {
      var source = makeManifest([
        '<UTCTiming schemeIdUri="unknown scheme" value="foobar" />'
      ]);

      fakeNetEngine.setResponseMapAsText({'http://foo.bar/manifest': source});
      runTest(done, 5);
    });

    it('tries multiple sources', function(done) {
      var source = makeManifest([
        '<UTCTiming schemeIdUri="unknown scheme" value="foobar" />',
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:direct:2014"',
        '    value="1970-01-01T00:00:55Z" />'
      ]);

      fakeNetEngine.setResponseMapAsText({'http://foo.bar/manifest': source});
      runTest(done, 50);
    });

    it('with HEAD', function(done) {
      var source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-head:2014"',
        '    value="http://foo.bar/date" />'
      ]);

      fakeNetEngine.request.and.callFake(function(type, request) {
        if (request.uris[0] == 'http://foo.bar/manifest') {
          var data = shaka.util.StringUtils.toUTF8(source);
          return Promise.resolve({data: data, headers: {}, uri: ''});
        } else {
          expect(request.uris[0]).toBe('http://foo.bar/date');
          return Promise.resolve({
            data: new ArrayBuffer(0),
            headers: {'date': '1970-01-01T00:00:40Z'},
            uri: ''
          });
        }
      });
      runTest(done, 35);
    });

    it('with xsdate', function(done) {
      var source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="http://foo.bar/date" />'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'http://foo.bar/manifest': source,
        'http://foo.bar/date': '1970-01-01T00:00:50Z'
      });
      runTest(done, 45);
    });

    it('with relative paths', function(done) {
      var source = makeManifest([
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="/date" />'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'http://foo.bar/manifest': source,
        'http://foo.bar/date': '1970-01-01T00:00:50Z'
      });
      runTest(done, 45);
    });

    it('with paths relative to BaseURLs', function(done) {
      var source = makeManifest([
        '<BaseURL>http://example.com</BaseURL>',
        '<UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014"',
        '    value="/date" />'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'http://foo.bar/manifest': source,
        'http://example.com/date': '1970-01-01T00:00:50Z'
      });
      runTest(done, 45);
    });
  });

  it('handles missing Segment* elements', function(done) {
    var source = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
      '      <Representation bandwidth="100" />',
      '      <Representation bandwidth="200">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          // First Representation should be dropped.
          var period = manifest.periods[0];
          expect(period.streamSets[0].streams.length).toBe(1);
          expect(period.streamSets[0].streams[0].bandwidth).toBe(200);
        }).catch(fail).then(done);
  });

  describe('allows missing Segment* elements for text', function() {
    it('specified via AdaptationSet@contentType', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet contentType="text" lang="en" group="1">',
        '      <Representation />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
          .then(function(manifest) {
            expect(manifest.periods[0].streamSets[0].streams.length).toBe(1);
          }).catch(fail).then(done);
    });

    it('specified via AdaptationSet@mimeType', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="text/vtt" lang="en" group="1">',
        '      <Representation />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
          .then(function(manifest) {
            expect(manifest.periods[0].streamSets[0].streams.length).toBe(1);
          }).catch(fail).then(done);
    });

    it('specified via Representation@mimeType', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet>',
        '      <Representation mimeType="text/vtt" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
          .then(function(manifest) {
            expect(manifest.periods[0].streamSets[0].streams.length).toBe(1);
          }).catch(fail).then(done);
    });
  });

  describe('fails for', function() {
    it('invalid XML', function(done) {
      var source = '<not XML';
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML);
      Dash.testFails(done, source, error);
    });

    it('failed network requests', function(done) {
      var expectedError = new shaka.util.Error(
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      fakeNetEngine.request.and.returnValue(Promise.reject(expectedError));
      parser.start('', fakeNetEngine, filterPeriod, fail, onEventSpy)
          .then(fail)
          .catch(function(error) { expect(error).toEqual(expectedError); })
          .then(done);
    });

    it('missing MPD element', function(done) {
      var source = '<XML></XML>';
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML);
      Dash.testFails(done, source, error);
    });

    it('empty AdaptationSet', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4" lang="en" group="1" />',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_ADAPTATION_SET);
      Dash.testFails(done, source, error);
    });

    it('empty Period', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S" />',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_PERIOD);
      Dash.testFails(done, source, error);
    });
  });

  describe('parses inband information', function() {
    var nonEmsg = new Uint8Array([
      0, 0, 0, 33, 108, 109, 115, 103,
      117, 114, 110, 58, 109, 112, 101,
      103, 58, 100, 97, 115, 104, 58,
      101, 118, 101, 110, 116, 58, 50,
      48, 49, 50, 0
    ]);

    var emsgUpdate = new Uint8Array([
      0, 0, 0, 52, 101, 109, 115, 103,
      0, 0, 0, 0, 117, 114, 110, 58,
      109, 112, 101, 103, 58, 100, 97,
      115, 104, 58, 101, 118, 101, 110,
      116, 58, 50, 48, 49, 50, 0, 0, 0,
      49, 0, 0, 0, 8, 0, 0, 255, 255, 116,
      101, 115, 116
    ]);

    var emsgCustom = new Uint8Array([
      0, 0, 0, 59, 101, 109, 115, 103,
      0, 0, 0, 0, 102, 111, 111, 58, 98,
      97, 114, 58, 99, 117, 115, 116, 111,
      109, 100, 97, 116, 97, 115, 99, 104,
      101, 109, 101, 0, 49, 0, 0, 0, 0,
      1, 0, 0, 0, 8, 0, 0, 255, 255, 0,
      0, 0, 1, 116, 101, 115, 116
    ]);

    it('registers response filter', function(done) {
      var manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet>',
        '      <InbandEventStream scheme_id_uri="urn:mpeg:dash:event:2012" />',
        '      <Representation>',
        '        <SegmentTemplate media="1.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
      .then(function() {
            expect(fakeNetEngine.registerResponseFilter).toHaveBeenCalled();
          }).catch(fail).then(done);
    });

    it('updates manifest when emsg box is present', function(done) {
      var manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet>',
        '      <InbandEventStream scheme_id_uri="urn:mpeg:dash:event:2012" />',
        '      <Representation>',
        '        <SegmentTemplate media="1.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
      .then(function() {
            expect(fakeNetEngine.registerResponseFilter).toHaveBeenCalled();
            var filter =
                fakeNetEngine.registerResponseFilter.calls.mostRecent().args[0];
            var type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
            var response = {data: emsgUpdate.buffer};
            fakeNetEngine.request.calls.reset();
            filter(type, response);
            expect(fakeNetEngine.request).toHaveBeenCalled();
          }).catch(fail).then(done);
    });

    it('dispatches an event on non-typical emsg content', function(done) {
      var manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet>',
        '      <InbandEventStream scheme_id_uri="urn:mpeg:dash:event:2012" />',
        '      <Representation>',
        '        <SegmentTemplate media="1.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
      parser.start(
          'dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
      .then(function() {
            expect(fakeNetEngine.registerResponseFilter).toHaveBeenCalled();
            var filter =
                fakeNetEngine.registerResponseFilter.calls.mostRecent().args[0];
            var type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
            var response = {data: emsgCustom.buffer};
            fakeNetEngine.request.calls.reset();
            filter(type, response);
            expect(onEventSpy)
              .toHaveBeenCalledWith(jasmine.any(shaka.util.FakeEvent));
            var event =
                onEventSpy.calls.mostRecent().args[0];
            var emsg = event.detail;
            expect(emsg.schemeIdUri).toBe('foo:bar:customdatascheme');
            expect(emsg.value).toBe('1');
            expect(emsg.timescale).toBe(1);
            expect(emsg.presentationTimeDelta).toBe(8);
            expect(emsg.eventDuration).toBe(0xFFFF);
            expect(emsg.id).toBe(1);
            expect(emsg.messageData).toEqual(
                new Uint8Array([116, 101, 115, 116]));
          }).catch(fail).then(done);
    });

    it('does not update manifest when emsg box is not present', function(done) {
      var manifestText = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet>',
        '      <InbandEventStream scheme_id_uri="urn:mpeg:dash:event:2012" />',
        '      <Representation>',
        '        <SegmentTemplate media="1.mp4" duration="1" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
      parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
      .then(function() {
            expect(fakeNetEngine.registerResponseFilter).toHaveBeenCalled();
            var filter =
                fakeNetEngine.registerResponseFilter.calls.mostRecent().args[0];
            var type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
            var response = {data: nonEmsg.buffer};
            fakeNetEngine.request.calls.reset();
            filter(type, response);
            expect(fakeNetEngine.request).not.toHaveBeenCalled();
            expect(onEventSpy).not.toHaveBeenCalled();
          }).catch(fail).then(done);
    });
  });

  it('ignores trickmode tracks', function(done) {
    var manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1">',
      '      <Representation>',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation>',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
    parser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, onEventSpy)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          expect(manifest.periods[0].streamSets.length).toBe(1);
          expect(manifest.periods[0].streamSets[0].streams.length).toBe(1);
        }).catch(fail).then(done);
  });
});
