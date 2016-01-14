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

goog.require('shaka.dash.DashParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.Uint8ArrayUtils');

// Test basic manifest parsing functionality.
describe('DashParser.Manifest', function() {
  var fakeNetEngine;
  var parser;

  beforeEach(function() {
    fakeNetEngine = {request: jasmine.createSpy('request')};
    parser = new shaka.dash.DashParser(
        fakeNetEngine, {}, function() {}, function() {});
  });

  /**
   * Sets the return value of the fake networking engine.
   *
   * @param {string} value
   */
  function setNetEngineReturnValue(value) {
    var data = shaka.util.Uint8ArrayUtils.fromString(value).buffer;
    var promise = Promise.resolve({data: data});
    fakeNetEngine.request.and.returnValue(promise);
  }

  /**
   * Makes a series of tests for the given manifest type.
   *
   * @param {!Array.<string>} startLines
   * @param {!Array.<string>} endLines
   * @param {shaka.media.Manifest} expected
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
    };

    /**
     * Tests that the parser produces the correct results.
     *
     * @param {function()} done
     * @param {string} manifestText
     */
    function testDashParser(done, manifestText) {
      var netEngine = new dashFakeNetEngine(manifestText);
      var dashParser = new shaka.dash.DashParser(netEngine, {}, function() {});
      dashParser.start('dummy://foo')
          .then(function(actual) { expect(actual).toEqual(expected); })
          .catch(fail)
          .then(done);
    };

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
  };

  describe('parses and inherits attributes', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet contentType="video" mimeType="video/mp4"',
          '        codecs="avc1.4d401f" lang="en">',
          '      <Representation bandwidth="100" width="768" height="576" />',
          '      <Representation bandwidth="50" width="576" height="432" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="text/vtt" codecs="mp4a.40.29"',
          '        lang="es">',
          '      <Role value="caption" />',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="audio/mp4">',
          '      <Role value="main" />',
          '      <Representation />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        {
          minBufferTime: 75,
          presentationTimeline: jasmine.any(shaka.media.PresentationTimeline),
          periods: [
            {
              startTime: 0,
              streamSets: [
                {
                  language: 'en',
                  type: 'video',
                  primary: false,
                  drmInfos: [],
                  streams: [
                    jasmine.objectContaining({
                      id: 1,
                      createSegmentIndex: jasmine.any(Function),
                      findSegmentPosition: jasmine.any(Function),
                      getSegmentReference: jasmine.any(Function),
                      initSegmentReference:
                          jasmine.any(shaka.media.InitSegmentReference),
                      mimeType: 'video/mp4',
                      codecs: 'avc1.4d401f',
                      bandwidth: 100,
                      width: 768,
                      height: 576,
                      keyIds: []
                    }),
                    jasmine.objectContaining({
                      id: 2,
                      createSegmentIndex: jasmine.any(Function),
                      findSegmentPosition: jasmine.any(Function),
                      getSegmentReference: jasmine.any(Function),
                      initSegmentReference:
                          jasmine.any(shaka.media.InitSegmentReference),
                      mimeType: 'video/mp4',
                      codecs: 'avc1.4d401f',
                      bandwidth: 50,
                      width: 576,
                      height: 432,
                      keyIds: []
                    })
                  ]
                },
                {
                  language: 'es',
                  type: 'text',
                  primary: false,
                  drmInfos: [],
                  streams: [
                    jasmine.objectContaining({
                      id: 3,
                      createSegmentIndex: jasmine.any(Function),
                      findSegmentPosition: jasmine.any(Function),
                      getSegmentReference: jasmine.any(Function),
                      initSegmentReference:
                          jasmine.any(shaka.media.InitSegmentReference),
                      mimeType: 'text/vtt',
                      codecs: 'mp4a.40.29',
                      bandwidth: 100,
                      keyIds: [],
                      kind: 'caption'
                    })
                  ]
                },
                {
                  language: '',
                  type: 'audio',
                  primary: true,
                  drmInfos: [],
                  streams: [
                    jasmine.objectContaining({
                      id: 4,
                      createSegmentIndex: jasmine.any(Function),
                      findSegmentPosition: jasmine.any(Function),
                      getSegmentReference: jasmine.any(Function),
                      initSegmentReference:
                          jasmine.any(shaka.media.InitSegmentReference),
                      mimeType: 'audio/mp4',
                      codecs: '',
                      keyIds: []
                    })
                  ]
                }
              ]
            }
          ]
        });
  });

  describe('squashes stream sets by @group', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        makeManifestFromStreamSets([
          {
            language: 'en',
            type: 'video',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 100}),
              jasmine.objectContaining({bandwidth: 200})
            ]
          }
        ]));
  });

  describe('does not squash different @group', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="2">',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        makeManifestFromStreamSets([
          {
            language: 'en',
            type: 'video',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 100})
            ]
          },
          {
            language: 'en',
            type: 'video',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 200})
            ]
          }
        ]));
  });

  describe('does not squash different languages', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="video/mp4" lang="es" group="1">',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        makeManifestFromStreamSets([
          {
            language: 'en',
            type: 'video',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 100})
            ]
          },
          {
            language: 'es',
            type: 'video',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 200})
            ]
          }
        ]));
  });

  describe('does not squash different content types', function() {
    makeTestsForEach(
        [
          '<MPD minBufferTime="PT75S">',
          '  <Period id="1" duration="PT30S">',
          '    <BaseURL>http://example.com</BaseURL>'
        ],
        [
          '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
          '      <Representation bandwidth="100" />',
          '    </AdaptationSet>',
          '    <AdaptationSet mimeType="audio/mp4" lang="en" group="1">',
          '      <Representation bandwidth="200" />',
          '    </AdaptationSet>',
          '  </Period>',
          '</MPD>'
        ],
        makeManifestFromStreamSets([
          {
            language: 'en',
            type: 'video',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 100})
            ]
          },
          {
            language: 'en',
            type: 'audio',
            primary: false,
            drmInfos: [],
            streams: [
              jasmine.objectContaining({bandwidth: 200})
            ]
          }
        ]));
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
      '<MPD minBufferTime="PT75S">',
      '  <Period id="1">',
      '%(periodContents)s',
      '  </Period>',
      '  <Period id="2">',
      '%(periodContents)s',
      '  </Period>',
      '</MPD>'
    ].join('\n');
    var source = sprintf(template, {periodContents: periodContents});

    setNetEngineReturnValue(source);
    parser.start('')
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

    setNetEngineReturnValue(source);
    parser.start('')
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
    var source = makeSimpleManifestText([
      '<SegmentBase presentationTimeOffset="1" indexRange="100-200">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '</SegmentBase>',
      '<SegmentList presentationTimeOffset="2" duration="10">',
      '  <Initialization sourceURL="init.mp4" range="201-300" />',
      '  <SegmentURL media="s1.mp4" />',
      '</SegmentList>'
    ]);

    setNetEngineReturnValue(source);
    parser.start('')
        .then(function(manifest) {
          var stream = manifest.periods[0].streamSets[0].streams[0];
          expect(stream.presentationTimeOffset).toBe(1);
        })
        .catch(fail)
        .then(done);
  });

  it('defaults to SegmentList with SegmentTemplate', function(done) {
    var source = makeSimpleManifestText([
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

    setNetEngineReturnValue(source);
    parser.start('')
        .then(function(manifest) {
          var stream = manifest.periods[0].streamSets[0].streams[0];
          expect(stream.presentationTimeOffset).toBe(2);
        })
        .catch(fail)
        .then(done);
  });

  describe('fails for', function() {
    it('invalid XML', function(done) {
      var source = '<not XML';
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML);
      dashTestFails(done, source, error);
    });

    it('failed network requests', function(done) {
      var expectedError = new shaka.util.Error(
          shaka.util.Error.Category.NETWORK, shaka.util.Error.Code.HTTP_STATUS);
      var promise = Promise.reject(expectedError);
      var fakeNetEngine = {
        request: jasmine.createSpy('request').and.returnValue(promise)
      };

      var dashParser =
          new shaka.dash.DashParser(fakeNetEngine, {}, function() {});
      dashParser.start('')
          .then(fail)
          .catch(function(error) { expect(error).toEqual(expectedError); })
          .then(done);
    });

    it('missing MPD element', function(done) {
      var source = '<XML></XML>';
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_XML);
      dashTestFails(done, source, error);
    });

    it('empty Representation', function(done) {
      var source = [
        '<MPD minBufferTime="PT75S">',
        '  <Period id="1" duration="PT30S">',
        '    <AdaptationSet mimeType="video/mp4" lang="en" group="1">',
        '      <Representation bandwidth="100" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      dashTestFails(done, source, error);
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
      dashTestFails(done, source, error);
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
      dashTestFails(done, source, error);
    });
  });
});
