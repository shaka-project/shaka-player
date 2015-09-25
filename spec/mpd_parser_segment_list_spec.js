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

goog.require('shaka.dash.mpd');

describe('mpd.SegmentList', function() {

  /* @const {string} */
  var completeSource = [
    '<MPD>',
    '  <Period>',
    '    <BaseURL>http://example.com</BaseURL>',
    '    <SegmentList timescale="9000" ',
    '     presentationTimeOffset="10" startNumber="5">',
    '      <SegmentURL media="default.mp4" />',
    '      <SegmentTimeline>',
    '        <S d="12" t="34" />',
    '        <S d="34" />',
    '        <S d="23" r="2" />',
    '        <S d="452" />',
    '      </SegmentTimeline>',
    '    </SegmentList>',
    '    <AdaptationSet>',
    '      <SegmentList presentationTimeOffset="5">',
    '        <Initialization sourceURL="init.mp4" range="201-300" />',
    '      </SegmentList>',
    '      <Representation>',
    '        <SegmentList startNumber="9" duration="10">',
    '          <SegmentURL media="segment1.mp4" />',
    '          <SegmentURL media="segment2.mp4" mediaRange="100-200" />',
    '        </SegmentList>',
    '      </Representation>',
    '      <Representation>',
    '        <BaseURL>http://google.com</BaseURL>',
    '        <SegmentList startNumber="27" duration="7">',
    '          <SegmentURL media="segment3.mp4" />',
    '          <SegmentURL media="segment4.mp4"  />',
    '        </SegmentList>',
    '      </Representation>',
    '    </AdaptationSet>',
    '    <AdaptationSet>',
    '      <Representation>',
    '      </Representation>',
    '    </AdaptationSet>',
    '  </Period>',
    '</MPD>'].join('\n');

  /* {shaka.dash.mpd.Mpd} */
  var mpd;

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();
  });

  beforeEach(function() {
    mpd = shaka.dash.mpd.parseMpd(completeSource, createFailover('').urls);
  });

  afterAll(function() {
    // Restore normal assertion behavior.
    assertsToFailures.uninstall();
  });

  it('parses SegmentLists', function() {
    expect(mpd).toBeTruthy();
    expect(mpd.periods).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.segmentList).toBeTruthy();
    expect(period.adaptationSets).toBeTruthy();
    expect(period.adaptationSets.length).toBe(2);

    for (var i = 0; i < period.adaptationSets.length; i++) {
      var as = period.adaptationSets[i];
      expect(as).toBeTruthy();
      expect(as.segmentList).toBeTruthy();
      expect(as.representations).toBeTruthy();
      expect(as.representations.length).toBe(2 - i);

      for (var j = 0; j < as.representations.length; j++) {
        var representation = as.representations[j];
        expect(representation).toBeTruthy();
        expect(representation.segmentList).toBeTruthy();
      }
    }
  });

  it('parses SegmentTimeline', function() {
    checkSegmentTimeline(mpd.periods[0].segmentList.timeline);
  });

  it('inherits SegmentTimeline', function() {
    for (var i = 0; i < 2; i++) {
      var as = mpd.periods[0].adaptationSets[i];
      checkSegmentTimeline(as.segmentList.timeline);

      var representation = as.representations[0];
      checkSegmentTimeline(representation.segmentList.timeline);
    }
  });

  it('inherits attributes', function() {
    var as0 = mpd.periods[0].adaptationSets[0];
    expect(as0.segmentList.timescale).toBe(9000);
    expect(as0.segmentList.startNumber).toBe(5);

    for (var i = 0; i < 2; i++) {
      var as0_repr = as0.representations[i];
      expect(as0_repr.segmentList.presentationTimeOffset).toBe(5);
      expect(as0_repr.segmentList.timescale).toBe(9000);
    }

    var as1_repr = mpd.periods[0].adaptationSets[1].representations[0];
    expect(as1_repr.segmentList.timescale).toBe(9000);
    expect(as1_repr.segmentList.presentationTimeOffset).toBe(10);
    expect(as1_repr.segmentList.startNumber).toBe(5);
  });

  it('overrides attributes', function() {
    var as0 = mpd.periods[0].adaptationSets[0];
    expect(as0.segmentList.presentationTimeOffset).toBe(5);

    var as0_repr0 = as0.representations[0];
    expect(as0_repr0.segmentList.startNumber).toBe(9);
    expect(as0_repr0.segmentList.segmentDuration).toBe(10);

    var as0_repr1 = as0.representations[1];
    expect(as0_repr1.segmentList.startNumber).toBe(27);
    expect(as0_repr1.segmentList.segmentDuration).toBe(7);
  });

  it('handles media urls', function() {
    var repr0 = mpd.periods[0].adaptationSets[0].representations[0];
    var segmentList = repr0.segmentList;

    expect(segmentList.segmentUrls.length).toBe(2);
    expect(segmentList.segmentUrls[0].mediaUrl.toString()).toBe(
        'http://example.com/segment1.mp4');
    expect(segmentList.segmentUrls[0].mediaRange).toBeFalsy();
    expect(segmentList.segmentUrls[1].mediaUrl.toString()).toBe(
        'http://example.com/segment2.mp4');
    expect(segmentList.segmentUrls[1].mediaRange.begin).toBe(100);
    expect(segmentList.segmentUrls[1].mediaRange.end).toBe(200);

    var repr1 = mpd.periods[0].adaptationSets[0].representations[1];
    var segmentList1 = repr1.segmentList;

    expect(segmentList1.segmentUrls.length).toBe(2);
    expect(segmentList1.segmentUrls[0].mediaUrl.toString()).toBe(
        'http://google.com/segment3.mp4');
    expect(segmentList1.segmentUrls[0].mediaRange).toBeFalsy();
    expect(segmentList1.segmentUrls[1].mediaUrl.toString()).toBe(
        'http://google.com/segment4.mp4');
    expect(segmentList1.segmentUrls[1].mediaRange).toBeFalsy();
  });

  it('handles initialization', function() {
    var as = mpd.periods[0].adaptationSets[0];
    checkSegmentInitialization(as.segmentList.initialization);
  });

  it('inherits initialization', function() {
    var repr0 = mpd.periods[0].adaptationSets[0].representations[0];
    checkSegmentInitialization(repr0.segmentList.initialization);

    var repr1 = mpd.periods[0].adaptationSets[0].representations[1];
    checkSegmentInitialization(repr1.segmentList.initialization);
  });

  /**
   * Checks that the given |timeline| matches the expected value.
   * @param {shaka.dash.mpd.SegmentTimeline} timeline
   */
  var checkSegmentTimeline = function(timeline) {
    expect(timeline).toBeTruthy();

    var timepoints = timeline.timePoints;
    expect(timepoints).toBeTruthy();
    expect(timepoints.length).toBe(4);

    expect(timepoints[0].startTime).toBe(34);
    expect(timepoints[0].duration).toBe(12);

    expect(timepoints[1].duration).toBe(34);

    expect(timepoints[2].duration).toBe(23);
    expect(timepoints[2].repeat).toBe(2);

    expect(timepoints[3].duration).toBe(452);
  };

  /**
   * Checks that the given |initialization| matches the expected value.
   * @param {shaka.dash.mpd.Initialization} initialization
   */
  var checkSegmentInitialization = function(initialization) {
    expect(initialization).toBeTruthy();

    expect(initialization.url.toString()).toBe('http://example.com/init.mp4');
    expect(initialization.range).toBeTruthy();
    expect(initialization.range.begin).toBe(201);
    expect(initialization.range.end).toBe(300);
  };
});

