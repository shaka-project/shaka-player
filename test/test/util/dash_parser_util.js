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

goog.provide('shaka.test.Dash');


/**
 * Constructs and configures a very simple DASH parser.
 * @return {!shaka.dash.DashParser}
 */
shaka.test.Dash.makeDashParser = function() {
  var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
  var parser = new shaka.dash.DashParser();
  parser.configure({
    retryParameters: retry,
    dash: {
      customScheme: function(node) { return null; },
      clockSyncUri: ''
    }
  });
  return parser;
};


/**
 * Verifies the segment references in a manifest.
 *
 * @param {shakaExtern.Manifest} manifest
 * @param {!Array.<shaka.media.SegmentReference>} references
 * @param {number} periodIndex
 */
shaka.test.Dash.verifySegmentIndex = function(
    manifest, references, periodIndex) {
  expect(manifest).toBeTruthy();
  var stream = manifest.periods[periodIndex].streamSets[0].streams[0];
  expect(stream).toBeTruthy();
  expect(stream.findSegmentPosition).toBeTruthy();
  expect(stream.getSegmentReference).toBeTruthy();

  if (references.length == 0) {
    expect(stream.findSegmentPosition(0)).toBe(null);
    return;
  }

  var positionBeforeFirst =
      stream.findSegmentPosition(references[0].startTime - 1);
  expect(positionBeforeFirst).toBe(null);

  for (var i = 0; i < references.length - 1; i++) {
    var expectedRef = references[i];
    var position = stream.findSegmentPosition(expectedRef.startTime);
    expect(position).not.toBe(null);
    var actualRef =
        stream.getSegmentReference(/** @type {number} */ (position));
    expect(actualRef).toEqual(expectedRef);
  }

  // Make sure that the references stop at the end.
  var positionAfterEnd =
      stream.findSegmentPosition(references[references.length - 1].endTime);
  expect(positionAfterEnd).toBe(null);
};


/**
 * Tests the segment index produced by the DASH manifest parser.
 *
 * @param {function()} done
 * @param {string} manifestText
 * @param {!Array.<shaka.media.SegmentReference>} references
 */
shaka.test.Dash.testSegmentIndex = function(done, manifestText, references) {
  var buffer = shaka.util.StringUtils.toUTF8(manifestText);
  var fakeNetEngine =
      new shaka.test.FakeNetworkingEngine({'dummy://foo': buffer});
  var dashParser = shaka.test.Dash.makeDashParser();
  var filterPeriod = function() {};
  dashParser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, fail)
      .then(function(manifest) {
        shaka.test.Dash.verifySegmentIndex(manifest, references, 0);
      })
      .catch(fail)
      .then(done);
};


/**
 * Tests that the DASH manifest parser fails to parse the given manifest.
 *
 * @param {function()} done
 * @param {string} manifestText
 * @param {!shaka.util.Error} expectedError
 */
shaka.test.Dash.testFails = function(done, manifestText, expectedError) {
  var manifestData = shaka.util.StringUtils.toUTF8(manifestText);
  var fakeNetEngine =
      new shaka.test.FakeNetworkingEngine({'dummy://foo': manifestData});
  var dashParser = shaka.test.Dash.makeDashParser();
  var filterPeriod = function() {};
  dashParser.start('dummy://foo', fakeNetEngine, filterPeriod, fail, fail)
      .then(fail)
      .catch(function(error) {
        shaka.test.Util.expectToEqualError(error, expectedError);
      })
      .then(done);
};


/**
 * Makes a simple manifest with the given representation contents.
 *
 * @param {!Array.<string>} lines
 * @param {number=} opt_duration
 * @param {number=} opt_start
 * @return {string}
 */
shaka.test.Dash.makeSimpleManifestText =
    function(lines, opt_duration, opt_start) {
  var periodAttr = '';
  var mpdAttr = 'type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"';
  if (opt_duration) {
    periodAttr = 'duration="PT' + opt_duration + 'S"';
    mpdAttr = 'type="static"';
  }
  if (opt_start)
    periodAttr += ' start="PT' + opt_start + 'S"';

  var start = [
    '<MPD ' + mpdAttr + '>',
    '  <Period ' + periodAttr + '>',
    '    <AdaptationSet mimeType="video/mp4">',
    '      <Representation bandwidth="500">',
    '        <BaseURL>http://example.com</BaseURL>'
  ];
  var end = [
    '      </Representation>',
    '    </AdaptationSet>',
    '  </Period>',
    '</MPD>'
  ];
  return start.concat(lines, end).join('\n');
};


/**
 * Makes a simple manifest object for jasmine.toEqual; this does not do any
 * checking.  This only constructs one period with the given stream sets.
 *
 * @param {!Array.<shakaExtern.StreamSet>} streamSets
 * @return {shakaExtern.Manifest}
 */
shaka.test.Dash.makeManifestFromStreamSets = function(streamSets) {
  return /** @type {shakaExtern.Manifest} */ (jasmine.objectContaining({
    periods: [
      jasmine.objectContaining({
        streamSets: streamSets
      })
    ]
  }));
};


/**
 * Makes a simple manifest object for jasmine.toEqual; this does not do any
 * checking.  This only constructs one period with one stream with the given
 * initialization segment data.
 *
 * @param {string} uri The URI of the initialization segment.
 * @param {number} startByte
 * @param {?number} endByte
 * @param {number=} opt_pto The presentationTimeOffset of the stream.
 * @return {shakaExtern.Manifest}
 */
shaka.test.Dash.makeManifestFromInit = function(
    uri, startByte, endByte, opt_pto) {
  return shaka.test.Dash.makeManifestFromStreamSets([jasmine.objectContaining({
    streams: [jasmine.objectContaining({
      presentationTimeOffset: (opt_pto || 0),
      createSegmentIndex: jasmine.any(Function),
      findSegmentPosition: jasmine.any(Function),
      initSegmentReference: new shaka.media.InitSegmentReference(
          // TODO: Change back to checking specific URIs once jasmine is fixed.
          // https://github.com/jasmine/jasmine/issues/1138
          jasmine.any(Function), startByte, endByte)
    })]
  })]);
};


/**
 * Calls the createSegmentIndex function of the manifest.  Because we are
 * returning fake data, the parser will fail to parse the segment index; we
 * swallow the error and return a promise that will resolve.
 *
 * @param {shakaExtern.Manifest} manifest
 * @return {!Promise}
 */
shaka.test.Dash.callCreateSegmentIndex = function(manifest) {
  var stream = manifest.periods[0].streamSets[0].streams[0];
  return stream.createSegmentIndex().then(fail).catch(function() {});
};


/**
 * Creates a segment reference using a relative URI.
 *
 * @param {string} uri A relative URI to http://example.com
 * @param {number} position
 * @param {number} start
 * @param {number} end
 * @param {number=} opt_startByte
 * @param {?number=} opt_endByte
 * @return {!shaka.media.SegmentReference}
 */
shaka.test.Dash.makeReference =
    function(uri, position, start, end, opt_startByte, opt_endByte) {
  var base = 'http://example.com/';
  var startByte = opt_startByte || 0;
  var endByte = opt_endByte || null;
  var getUris = function() { return [base + uri]; };
  return new shaka.media.SegmentReference(
      position, start, end, getUris, startByte, endByte);
};


/**
 * Makes a set of tests for SegmentTimeline.  This is used to test
 * SegmentTimeline within both SegmentList and SegmentTemplate.
 *
 * @param {string} type The type of manifest being tested; either
 *   'SegmentTemplate' or 'SegmentList'.
 * @param {string} extraAttrs
 * @param {!Array.<string>} extraChildren
 */
shaka.test.Dash.makeTimelineTests = function(type, extraAttrs, extraChildren) {
  describe('SegmentTimeline', function() {
    var Dash = shaka.test.Dash;

    /**
     * @param {!Array.<string>} timeline
     * @param {string} testAttrs
     * @param {number=} opt_dur
     * @param {number=} opt_start
     * @return {string}
     */
    function makeManifestText(timeline, testAttrs, opt_dur, opt_start) {
      var start = '<' + type + ' ' + extraAttrs + ' ' + testAttrs + '>';
      var end = '</' + type + '>';
      var lines = [].concat(start, extraChildren, timeline, end);
      return Dash.makeSimpleManifestText(lines, opt_dur, opt_start);
    }

    // All tests should have 5 segments and have the relative URIs:
    // s1.mp4  s2.mp4  s3.mp4  s4.mp4  s5.mp4
    it('basic support', function(done) {
      var timeline = [
        '<SegmentTimeline>',
        '  <S d="12" t="34" />',
        '  <S d="21" />',
        '  <S d="44" />',
        '  <S d="10" />',
        '  <S d="10" />',
        '</SegmentTimeline>'
      ];
      var source = makeManifestText(timeline, '');
      var references = [
        Dash.makeReference('s1.mp4', 1, 34, 46),
        Dash.makeReference('s2.mp4', 2, 46, 67),
        Dash.makeReference('s3.mp4', 3, 67, 111),
        Dash.makeReference('s4.mp4', 4, 111, 121),
        Dash.makeReference('s5.mp4', 5, 121, 131)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('supports repetitions', function(done) {
      var timeline = [
        '<SegmentTimeline>',
        '  <S d="12" t="34" />',
        '  <S d="10" r="2" />',
        '  <S d="44" />',
        '</SegmentTimeline>'
      ];
      var source = makeManifestText(timeline, '');
      var references = [
        Dash.makeReference('s1.mp4', 1, 34, 46),
        Dash.makeReference('s2.mp4', 2, 46, 56),
        Dash.makeReference('s3.mp4', 3, 56, 66),
        Dash.makeReference('s4.mp4', 4, 66, 76),
        Dash.makeReference('s5.mp4', 5, 76, 120)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('supports negative repetitions', function(done) {
      var timeline = [
        '<SegmentTimeline>',
        '  <S d="8" t="22" />',
        '  <S d="10" r="-1" />',
        '  <S d="12" t="50" />',
        '  <S d="10" />',
        '</SegmentTimeline>'
      ];
      var source = makeManifestText(timeline, '');
      var references = [
        Dash.makeReference('s1.mp4', 1, 22, 30),
        Dash.makeReference('s2.mp4', 2, 30, 40),
        Dash.makeReference('s3.mp4', 3, 40, 50),
        Dash.makeReference('s4.mp4', 4, 50, 62),
        Dash.makeReference('s5.mp4', 5, 62, 72)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('supports negative repetitions at end', function(done) {
      var timeline = [
        '<SegmentTimeline>',
        '  <S d="5" t="5" />',
        '  <S d="10" r="-1" />',
        '</SegmentTimeline>'
      ];
      var source = makeManifestText(timeline, '', 50 /* duration */);
      var references = [
        Dash.makeReference('s1.mp4', 1, 5, 10),
        Dash.makeReference('s2.mp4', 2, 10, 20),
        Dash.makeReference('s3.mp4', 3, 20, 30),
        Dash.makeReference('s4.mp4', 4, 30, 40),
        Dash.makeReference('s5.mp4', 5, 40, 50)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('gives times relative to period', function(done) {
      var timeline = [
        '<SegmentTimeline>',
        '  <S t="0" d="10" r="-1" />',
        '</SegmentTimeline>'
      ];
      var source =
          makeManifestText(timeline, '', 50 /* duration */, 30 /* start */);
      var references = [
        Dash.makeReference('s1.mp4', 1, 0, 10),
        Dash.makeReference('s2.mp4', 2, 10, 20),
        Dash.makeReference('s3.mp4', 3, 20, 30),
        Dash.makeReference('s4.mp4', 4, 30, 40),
        Dash.makeReference('s5.mp4', 5, 40, 50)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('supports @timescale', function(done) {
      var timeline = [
        '<SegmentTimeline>',
        '  <S d="4500" t="18000" />',
        '  <S d="9000" />',
        '  <S d="31500" />',
        '  <S d="9000" />',
        '  <S d="9000" />',
        '</SegmentTimeline>'
      ];
      var source = makeManifestText(timeline, 'timescale="9000"');
      var references = [
        Dash.makeReference('s1.mp4', 1, 2, 2.5),
        Dash.makeReference('s2.mp4', 2, 2.5, 3.5),
        Dash.makeReference('s3.mp4', 3, 3.5, 7),
        Dash.makeReference('s4.mp4', 4, 7, 8),
        Dash.makeReference('s5.mp4', 5, 8, 9)
      ];
      Dash.testSegmentIndex(done, source, references);
    });
  });
};
