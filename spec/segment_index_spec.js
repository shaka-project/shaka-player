/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview segment_index.js unit tests.
 */

goog.require('shaka.media.IsobmffSegmentIndexParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.WebmSegmentIndexParser');
goog.require('shaka.util.PublicPromise');

// TODO: Move IsobmffSegmentIndexParser and WebmSegmentIndexParser tests into
// their own respective files.
describe('SegmentIndex', function() {
  var sidxData;
  var sidxDataWithNonZeroStart;
  var webmData;
  var cuesData;

  var fetchArrayBuffer = function(url) {
    var p = new shaka.util.PublicPromise();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(event) { p.resolve(xhr.response); };
    xhr.send(null);
    return p;
  };

  var getSidxData = function() {
    // Get the SIDX data if we haven't yet.
    // This file contains just the SIDX, which was extracted from an actual MP4
    // file.
    if (sidxData) return Promise.resolve();
    return fetchArrayBuffer('assets/car-20120827-87.sidx.dat').then(
        function(data) { sidxData = data; });
  };

  var getSidxDataWithNonZeroStart = function() {
    // Get the SIDX data with non-zero start if we haven't yet.
    // This file contains just the SIDX, which was extracted from an actual MP4
    // file. It differs from the above SIDX in that it has a non-zero "earliest
    // presentation time" field.
    if (sidxDataWithNonZeroStart) return Promise.resolve();
    return fetchArrayBuffer('assets/angel_one.sidx.dat').then(
        function(data) { sidxDataWithNonZeroStart = data; });
  };

  var getWebmData = function() {
    // Get the WebM header data if we haven't yet.
    if (webmData) return Promise.resolve();
    return fetchArrayBuffer(
        'assets/feelings_vp9-20130806-171.webm.headers.dat'
    ).then(function(data) { webmData = data; });
  };

  var getCuesData = function() {
    // Get the WebM cues data if we haven't yet.
    if (cuesData) return Promise.resolve();
    return fetchArrayBuffer(
        'assets/feelings_vp9-20130806-171.webm.cues.dat'
    ).then(function(data) { cuesData = data; });
  };

  beforeEach(function(done) {
    var async = [
      getSidxData(),
      getSidxDataWithNonZeroStart(),
      getWebmData(),
      getCuesData()
    ];

    Promise.all(async).then(function() {
      done();
    });
  });

  it('parses an ISO BMFF segment index', function() {
    // The SIDX data was obtained from an MP4 file where the SIDX offset was
    // 708. We use this value here since the expected offsets for parsing this
    // SIDX are known.
    var parser = new shaka.media.IsobmffSegmentIndexParser();
    var references = parser.parse(null, new DataView(sidxData), 708);
    expect(references).not.toBeNull();

    // These values are rounded.
    /* gjslint: disable=0001,0006 */
    var expectedStartTimes = [
          0.000,   5.005,  10.010,  15.015,  20.020,  25.025,  30.030,
         35.035,  40.040,  45.045,  50.050,  55.055,  60.060,  65.065,
         70.070,  75.075,  80.080,  85.085,  90.090,  95.095, 100.100,
        105.105, 110.110, 115.115, 120.120, 125.125, 130.130, 135.135,
        140.140, 145.145, 150.150, 155.155, 160.160, 165.165, 170.170,
        175.175, 180.180
    ];

    /* gjslint: disable=0001,0006 */
    var expectedStartBytes = [
          1184,   727647,  1450907,  2164185,  2605829,  3151190,  3854669,
       4574758,  5224472,  5931518,  6320466,  6801107,  7307570,  7697596,
       8336571,  8820074,  9268630,  9706572, 10137561, 10676341, 11384276,
      12089373, 12708006, 13111442, 13805201, 14361322, 14996946, 15676293,
      16273342, 16812658, 17465320, 18038404, 18634288, 18855907, 19386647,
      19580549, 19700059
    ];

    checkReferences(references, 0, expectedStartTimes, expectedStartBytes);
  });

  it('correctly handles a non-zero start time', function() {
    // The SIDX data was obtained from an MP4 file where the SIDX offset was
    // 1322. We use this value here since the expected offsets for parsing this
    // SIDX are known.
    var parser = new shaka.media.IsobmffSegmentIndexParser();
    var references =
        parser.parse(null, new DataView(sidxDataWithNonZeroStart), 1322);
    expect(references).not.toBeNull();

    // These values are rounded.
    /* gjslint: disable=0001,0006 */
    var expectedStartTimes = [
          0.040,   3.040,   6.040,   9.040,  11.780,  14.780,  17.460,
         20.460,  23.460,  26.460,  29.460,  32.460,  35.460,  38.460,
         41.460,  44.460,  47.460,  50.460,  52.860,  55.860
    ];

    /* gjslint: disable=0001,0006 */
    var expectedStartBytes = [
          1594,  1175673,  1417937,  1665835,  1973789,  2294769,  2490199,
       2671008,  2954930,  3371950,  3778589,  4073258,  4527374,  5033136,
       5532306,  5788871,  6025088,  6313961,  6642589,  6993868
    ];

    checkReferences(references, 0, expectedStartTimes, expectedStartBytes);
  });

  it('parses a WebM segment index', function() {
    var parser = new shaka.media.WebmSegmentIndexParser();
    var references =
        parser.parse(new DataView(webmData), new DataView(cuesData), 0);
    expect(references).not.toBeNull();

    // These values are rounded.
    /* gjslint: disable=0001,0006 */
    var expectedStartTimes = [
         0.000,  10.012,  20.026,  30.048,  40.067,  50.081,  60.100,
        70.111,  80.116,  90.133, 100.136, 110.137, 120.156, 130.159
    ];

    /* gjslint: disable=0001,0006 */
    var expectedStartBytes = [
           4687,  144903,  297659,  459957,  618640,  773028,  924089,
        1069119, 1226240, 1387394, 1545708, 1699983, 1859342, 2009816
    ];

    checkReferences(references, 0, expectedStartTimes, expectedStartBytes);
  });

  describe('getRangeForInterval', function() {
    var index;

    beforeEach(function() {
      var parser = new shaka.media.WebmSegmentIndexParser();
      var references =
          parser.parse(new DataView(webmData), new DataView(cuesData), 0);
      expect(references).not.toBeNull();

      index = new shaka.media.SegmentIndex(references);
    });

    it('handles a regular interval', function() {
      var range = index.getRangeForInterval(31, 40);

      // These values are rounded.
      var expectedStartTimes = [30.048, 40.067, 50.081, 60.100, 70.111];
      var expectedStartBytes = [459957, 618640, 773028, 924089, 1069119];

      checkReferences(
          range.references, 3, expectedStartTimes, expectedStartBytes);
    });

    it('handles an interval starting at the first segment', function() {
      var range = index.getRangeForInterval(0, 40);

      // These values are rounded.
      var expectedStartTimes = [0.000, 10.012, 20.026, 30.048];
      var expectedStartBytes = [4687, 144903, 297659, 459957];

      checkReferences(
          range.references, 0, expectedStartTimes, expectedStartBytes);
    });

    it('handles an interval starting before the first segment', function() {
      var range = index.getRangeForInterval(-10, 21);

      // These values are rounded.
      var expectedStartTimes = [0.000, 10.012];
      var expectedStartBytes = [4687, 144903];

      checkReferences(
          range.references, 0, expectedStartTimes, expectedStartBytes);
    });

    it('handles an interval starting at the last segment', function() {
      var range = index.getRangeForInterval(130.159, 10);

      // These values are rounded.
      var expectedStartTimes = [130.159];
      var expectedStartBytes = [2009816];

      checkReferences(
          range.references, 13, expectedStartTimes, expectedStartBytes);
    });

    it('handles an interval starting after the last segment', function() {
      var range = index.getRangeForInterval(150, 10);

      // These values are rounded.
      var expectedStartTimes = [130.159];
      var expectedStartBytes = [2009816];

      checkReferences(
          range.references, 13, expectedStartTimes, expectedStartBytes);
    });

    it('handles an interval ending with a null time', function() {
      var url = new goog.Uri('http://example.com');

      var references = [
        new shaka.media.SegmentReference(0, 0, 1, 0, 5, url),
        new shaka.media.SegmentReference(1, 1, 2, 6, 9, url),
        new shaka.media.SegmentReference(2, 2, null, 10, null, url)
      ];

      var index2 = new shaka.media.SegmentIndex(references);
      var range = index2.getRangeForInterval(0, 2);

      var expectedStartTimes = [0, 1, 2];
      var expectedStartBytes = [0, 6, 10];

      checkReferences(
          range.references, 0, expectedStartTimes, expectedStartBytes);

      range = index2.getRangeForInterval(0, 3);

      expectedStartTimes = [0, 1, 2];
      expectedStartBytes = [0, 6, 10];

      checkReferences(
          range.references, 0, expectedStartTimes, expectedStartBytes);
    });

    it('handles no segments', function() {
      index = new shaka.media.SegmentIndex([]);
      var range = index.getRangeForInterval(31, 40);
      expect(range).toBeNull();
    });
  });

  checkReferences = function(references,
                             expectedFirstSegmentNumber,
                             expectedStartTimes,
                             expectedStartBytes) {
    console.assert(expectedStartTimes.length == expectedStartBytes.length);
    expect(references.length).toBe(expectedStartTimes.length);
    for (var i = 0; i < expectedStartTimes.length; i++) {
      var ref = references[i];
      expect(ref.segmentNumber).toBe(expectedFirstSegmentNumber + i);
      expect(ref.startTime.toFixed(3)).toBe(expectedStartTimes[i].toFixed(3));
      expect(ref.startByte).toBe(expectedStartBytes[i]);

      if (i < expectedStartTimes.length - 1) {
        expect(ref.endTime.toFixed(3)).toBe(
            expectedStartTimes[i + 1].toFixed(3));
        expect(ref.endByte).toBe(expectedStartBytes[i + 1] - 1);
      }
    }
  };
});

