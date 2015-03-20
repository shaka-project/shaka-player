/**
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
 *
 * @fileoverview mpd_parser.js unit tests.
 */

goog.require('shaka.dash.mpd');

// TODO: Write more tests.
describe('mpd', function() {
  it('merges and overrides SegmentList across levels', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentList timescale="9000" presentationTimeOffset="100">',
      '      <SegmentURL media="default.mp4" />',
      '    </SegmentList>',
      '    <AdaptationSet>',
      '      <SegmentList presentationTimeOffset="200" startNumber="5">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '      </SegmentList>',
      '      <Representation>',
      '        <SegmentList startNumber="9" duration="10">',
      '          <SegmentURL media="segment1.mp4" />',
      '          <SegmentURL media="segment2.mp4" mediaRange="100-200" />',
      '        </SegmentList>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentList(
        source,
        /** shaka.dash.mpd.SegmentList */ ({
          baseUrl: new goog.Uri('http://example.com'),
          timescale: 9000,
          presentationTimeOffset: 200,
          segmentDuration: 10,
          startNumber: 9,
          initialization: /** shaka.dash.mpd.Initialization */ ({
            url: new goog.Uri('http://example.com/init.mp4'),
            range: new shaka.dash.mpd.Range(201, 300)
          }),
          segmentUrls: [
            /** shaka.dash.mpd.SegmentUrl */ ({
              mediaUrl: 'http://example.com/segment1.mp4',
              mediaRange: null
            }),
            /** shaka.dash.mpd.SegmentUrl */ ({
              mediaUrl: 'http://example.com/segment2.mp4',
              mediaRange: new shaka.dash.mpd.Range(100, 200)
            })]
        }));
  });

  /**
   * Checks that the first Representation in |source| contains a SegmentList
   * that matches |expected|.
   * @param {string} source
   * @param {!shaka.dash.mpd.SegmentList} expected
   */
  var checkSegmentList = function(source, expected) {
    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.representations.length).toBe(1);

    var representation = adaptationSet.representations[0];
    expect(representation).toBeTruthy();

    var segmentList = representation.segmentList;
    expect(segmentList).toBeTruthy();

    if (expected.baseUrl) {
      expect(segmentList.baseUrl).toBeTruthy();
      expect(segmentList.baseUrl.toString()).toBe(expected.baseUrl.toString());
    }

    expect(segmentList.timescale).toBe(expected.timescale);
    expect(segmentList.presentationTimeOffset).toBe(
        expected.presentationTimeOffset);
    expect(segmentList.segmentDuration).toBe(expected.segmentDuration);
    expect(segmentList.startNumber).toBe(expected.startNumber);

    checkUrlTypeObject(segmentList.initialization, expected.initialization);

    expect(segmentList.segmentUrls.length).toBe(
        expected.segmentUrls.length);
    for (var i = 0; i < expected.segmentUrls.length; ++i) {
      checkSegmentUrl(segmentList.segmentUrls[i], expected.segmentUrls[i]);
    }
  };

  /**
   * @param {!shaka.dash.mpd.SegmentUrl} actual
   * @param {!shaka.dash.mpd.SegmentUrl} expected
   */
  var checkSegmentUrl = function(actual, expected) {
    if (expected.mediaUrl) {
      expect(actual.mediaUrl).toBeTruthy();
      expect(actual.mediaUrl.toString()).toBe(expected.mediaUrl.toString());
    } else {
      expect(actual.mediaUrl).toBeNull();
    }

    checkRange(actual.mediaRange, expected.mediaRange);

    expect(actual.startTime).toBe(expected.startTime);
    expect(actual.duration).toBe(expected.duration);
  };
});

