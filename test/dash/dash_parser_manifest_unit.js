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
describe('DashParser Manifest', function() {
  var Dash;
  var fakeNetEngine;
  var parser;
  var onEventSpy;
  var playerInterface;

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
    onEventSpy = jasmine.createSpy('onEvent');
    playerInterface = {
      networkingEngine: fakeNetEngine,
      filterPeriod: function() {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: onEventSpy,
      onError: fail
    };
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
      parser.start('dummy://foo', playerInterface)
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
          '        codecs="avc1.4d401f" frameRate="1000000/42000">',
          '      <Representation bandwidth="100" width="768" height="576" />',
          '      <Representation bandwidth="50" width="576" height="432" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="text/vtt"',
          '        lang="es">',
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
          '</MPD>'
        ],
        new shaka.test.ManifestGenerator()
          .anyTimeline()
          .minBufferTime(75)
          .addPeriod(jasmine.any(Number))
            .addVariant(jasmine.any(Number))
              .language('en')
              .bandwidth(200)
              .primary()
              .addVideo(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .presentationTimeOffset(0)
                .mime('video/mp4', 'avc1.4d401f')
                .bandwidth(100)
                .frameRate(1000000 / 42000)
                .size(768, 576)
              .addAudio(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .bandwidth(100)
                .presentationTimeOffset(0)
                .mime('audio/mp4', 'mp4a.40.29')
                .primary()
            .addVariant(jasmine.any(Number))
              .language('en')
              .bandwidth(150)
              .primary()
              .addVideo(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .presentationTimeOffset(0)
                .mime('video/mp4', 'avc1.4d401f')
                .bandwidth(50)
                .frameRate(1000000 / 42000)
                .size(576, 432)
              .addAudio(jasmine.any(Number))
                .anySegmentFunctions()
                .anyInitSegment()
                .bandwidth(100)
                .presentationTimeOffset(0)
                .mime('audio/mp4', 'mp4a.40.29')
                .primary()
            .addTextStream(jasmine.any(Number))
              .language('es')
              .primary()
              .anySegmentFunctions()
              .anyInitSegment()
              .presentationTimeOffset(0)
              .mime('text/vtt')
              .bandwidth(100)
              .kind('caption')
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
    parser.start('dummy://foo', playerInterface)
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
    parser.start('dummy://foo', playerInterface)
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
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          var stream = manifest.periods[0].variants[0].video;
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
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          var stream = manifest.periods[0].variants[0].video;
          expect(stream.presentationTimeOffset).toBe(2);
        })
        .catch(fail)
        .then(done);
  });

  it('generates a correct index for non-segmented text', function(done) {
    var source = [
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
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

    var stream;
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          stream = manifest.periods[0].textStreams[0];
          return stream.createSegmentIndex();
        })
        .then(function() {
          expect(stream.initSegmentReference).toBe(null);
          expect(stream.findSegmentPosition(0)).toBe(1);
          expect(stream.getSegmentReference(1))
              .toEqual(new shaka.media.SegmentReference(1, 0, 30, function() {
                return ['http://example.com/de.vtt'];
              }, 0, null));
        })
        .catch(fail)
        .then(done);
  });

  it('correctly parses UTF-8', function(done) {
    var source = [
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
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          var variant = manifest.periods[0].variants[0];
          var stream = manifest.periods[0].variants[0].audio;
          expect(stream.initSegmentReference.getUris()[0])
              .toBe('http://example.com/%C8%A7.mp4');
          expect(variant.language).toBe('\u2603');
        })
        .catch(fail)
        .then(done);
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
      parser.start('http://foo.bar/manifest', playerInterface)
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

    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          // First Representation should be dropped.
          var period = manifest.periods[0];
          expect(period.variants.length).toBe(1);
          expect(period.variants[0].bandwidth).toBe(200);
        })
        .catch(fail)
        .then(done);
  });

  describe('allows missing Segment* elements for text', function() {
    it('specified via AdaptationSet@contentType', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest.periods[0].textStreams.length).toBe(1);
          })
          .catch(fail)
          .then(done);
    });

    it('specified via AdaptationSet@mimeType', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest.periods[0].textStreams.length).toBe(1);
          })
          .catch(fail)
          .then(done);
    });

    it('specified via Representation@mimeType', function(done) {
      var source = [
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
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});

      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest.periods[0].textStreams.length).toBe(1);
          })
          .catch(fail)
          .then(done);
    });
  });

  describe('fails for', function() {
    it('invalid XML', function(done) {
      var source = '<not XML';
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML);
      Dash.testFails(done, source, error);
    });

    it('XML with inner errors', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="1">',
        '        <SegmentBase indexRange="100-200" />',
        '      </Representation', // Missing a close bracket.
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML);
      Dash.testFails(done, source, error);
    });

    it('failed network requests', function(done) {
      var expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      fakeNetEngine.request.and.returnValue(Promise.reject(expectedError));
      parser.start('', playerInterface)
          .then(fail)
          .catch(function(error) { expect(error).toEqual(expectedError); })
          .then(done);
    });

    it('missing MPD element', function(done) {
      var source = '<XML></XML>';
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
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
          shaka.util.Error.Severity.CRITICAL,
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
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_EMPTY_PERIOD);
      Dash.testFails(done, source, error);
    });

    it('duplicate Representation ids with live', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S" type="dynamic">',
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
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_DUPLICATE_REPRESENTATION_ID);
      Dash.testFails(done, source, error);
    });
  });

  it('parses trickmode tracks', function(done) {
    var manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet id="1" mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2" mimeType="video/mp4">',
      '      <EssentialProperty value="1" ',
      '        schemeIdUri="http://dashif.org/guidelines/trickmode" />',
      '      <Representation bandwidth="1">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          expect(manifest.periods[0].variants.length).toBe(1);
          expect(manifest.periods[0].textStreams.length).toBe(0);

          var variant = manifest.periods[0].variants[0];
          var trickModeVideo = variant && variant.video &&
                               variant.video.trickModeVideo;
          expect(trickModeVideo).toEqual(jasmine.objectContaining({
            id: 2,
            type: shaka.util.ManifestParserUtils.ContentType.VIDEO
          }));
        })
        .catch(fail)
        .then(done);
  });

  it('skips unrecognized EssentialProperty elements', function(done) {
    var manifestText = [
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
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);

          // The bogus EssentialProperty did not result in a variant.
          expect(manifest.periods[0].variants.length).toBe(1);
          expect(manifest.periods[0].textStreams.length).toBe(0);

          // The bogus EssentialProperty did not result in a trick mode track.
          var variant = manifest.periods[0].variants[0];
          var trickModeVideo = variant && variant.video &&
                               variant.video.trickModeVideo;
          expect(trickModeVideo).toBe(null);
        })
        .catch(fail)
        .then(done);
  });

  it('sets contentType to text for embedded text mime types', function(done) {
    // One MIME type for embedded TTML, one for embedded WebVTT.
    // One MIME type specified on AdaptationSet, on one Representation.
    var manifestText = [
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1" duration="PT30S">',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation bandwidth="1">',
      '        <SegmentBase indexRange="100-200" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="1" mimeType="application/mp4" codecs="stpp">',
      '      <Representation>',
      '        <SegmentTemplate media="1.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet id="2">',
      '      <Representation mimeType="application/mp4" codecs="wvtt">',
      '        <SegmentTemplate media="2.mp4" duration="1" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          expect(manifest.periods[0].textStreams.length).toBe(2);
          // At one time, these came out as 'application' rather than 'text'.
          var ContentType = shaka.util.ManifestParserUtils.ContentType;
          expect(manifest.periods[0].textStreams[0].type)
            .toBe(ContentType.TEXT);
          expect(manifest.periods[0].textStreams[1].type)
            .toBe(ContentType.TEXT);
        })
        .catch(fail)
        .then(done);
  });

  it('ignores duplicate Representation IDs for VOD', function(done) {
    var source = [
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
      '      <Representation id="1" bandwidth="1">',
      '        <SegmentTemplate media="2.mp4">',
      '          <SegmentTimeline>',
      '            <S t="0" d="30" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'
    ].join('\n');

    // See https://goo.gl/BAM3mi
    // The old error was that with SegmentTimeline, duplicate Representation IDs
    // would use the same segment index, so they would have the same references.
    // This test proves that duplicate Representation IDs are allowed for VOD
    // and that error doesn't occur.
    fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
    parser.start('dummy://foo', playerInterface)
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);
          expect(manifest.periods[0].variants.length).toBe(2);

          var variant1 = manifest.periods[0].variants[0];
          var variant2 = manifest.periods[0].variants[1];
          expect(variant1.video).toBeTruthy();
          expect(variant2.video).toBeTruthy();
          expect(variant1.video.getSegmentReference(1).getUris())
              .toEqual(['dummy://foo/1.mp4']);
          expect(variant2.video.getSegmentReference(1).getUris())
              .toEqual(['dummy://foo/2.mp4']);
        })
        .catch(fail)
        .then(done);
  });

  /**
   * @param {string} manifestText
   * @param {Uint8Array} emsgUpdate
   * @param {Function} done
   */
  function emsgBoxPresenceHelper(manifestText, emsgUpdate, done) {
    fakeNetEngine.setResponseMapAsText({'dummy://foo': manifestText});
    parser.start('dummy://foo', playerInterface)
        .then(function() {
          expect(fakeNetEngine.registerResponseFilter).toHaveBeenCalled();
          var filter =
              fakeNetEngine.registerResponseFilter.calls.mostRecent().args[0];
          var type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
          var response = {data: emsgUpdate.buffer};
          fakeNetEngine.request.calls.reset();
          filter(type, response);
          expect(fakeNetEngine.request).toHaveBeenCalled();
        })
        .catch(fail)
        .then(done);
  }
});
