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
  it('merges and overrides SegmentTemplate across levels', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentTemplate timescale="9000" presentationTimeOffset="100"',
      '        index="index$Number$.mp4">',
      '      <SegmentTimeline>',
      '        <S t="0" d="10" />',
      '      </SegmentTimeline>',
      '    </SegmentTemplate>',
      '    <AdaptationSet>',
      '      <SegmentTemplate presentationTimeOffset="200" startNumber="5"',
      '          initialization="init$Number$.mp4" />',
      '      <Representation>',
      '        <SegmentTemplate startNumber="9" media="segment$Number$.mp4">',
      '          <SegmentTimeline>',
      '            <S t="100" d="10" r="2" />',
      '            <S t="130" d="10" />',
      '          </SegmentTimeline>',
      '        </SegmentTemplate>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentTemplate(
        source,
        /** shaka.dash.mpd.SegmentTemplate */ ({
          timescale: 9000,
          presentationTimeOffset: 200,
          segmentDuration: null,
          startNumber: 9,
          mediaUrlTemplate: 'segment$Number$.mp4',
          indexUrlTemplate: 'index$Number$.mp4',
          initializationUrlTemplate: 'init$Number$.mp4',
          timeline: /** shaka.dash.mpd.SegmentTimeline */ ({
            timePoints: [
              /** shaka.dash.mpd.SegmentTimePoint */ ({
                startTime: 100,
                duration: 10,
                repeat: 2
              }),
              /** shaka.dash.mpd.SegmentTimePoint */ ({
                startTime: 130,
                duration: 10,
                repeat: null
              })]
          })
        }));
  });

  /**
   * Checks that the first Representation in |source| contains a SegmentTemplate
   * that matches |expected|.
   * @param {string} source
   * @param {!shaka.dash.mpd.SegmentTemplate} expected
   */
  var checkSegmentTemplate = function(source, expected) {
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

    var segmentTemplate = representation.segmentTemplate;
    expect(segmentTemplate).toBeTruthy();

    expect(segmentTemplate.timescale).toBe(expected.timescale);
    expect(segmentTemplate.presentationTimeOffset).toBe(
        expected.presentationTimeOffset);
    expect(segmentTemplate.segmentDuration).toBe(expected.segmentDuration);
    expect(segmentTemplate.startNumber).toBe(expected.startNumber);

    expect(segmentTemplate.mediaUrlTemplate).toBe(expected.mediaUrlTemplate);
    expect(segmentTemplate.indexUrlTemplate).toBe(expected.indexUrlTemplate);
    expect(segmentTemplate.initializationUrlTemplate).toBe(
        expected.initializationUrlTemplate);

    if (expected.timeline) {
      expect(segmentTemplate.timeline).toBeTruthy();
      expect(segmentTemplate.timeline.timePoints.length).toBe(
          expected.timeline.timePoints.length);
      for (var i = 0; i < expected.timeline.timePoints.length; ++i) {
        checkTimePoint(segmentTemplate.timeline.timePoints[i],
                       expected.timeline.timePoints[i]);
      }
    } else {
      expect(segmentTemplate.timeline).toBeNull();
    }
  };

  /**
   * @param {!shaka.dash.mpd.SegmentTimePoint} actual
   * @param {!shaka.dash.mpd.SegmentTimePoint} expected
   */
  var checkTimePoint = function(actual, expected) {
    expect(actual.startTime).toBe(expected.startTime);
    expect(actual.duration).toBe(expected.duration);
    expect(actual.repeat).toBe(expected.repeat);
  };
});

