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

describe('mpd', function() {
  it('inherits SegmentBase from Period', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="100-200" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="201-300" />',
      '    </SegmentBase>',
      '    <AdaptationSet>',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(
        source,
        /** shaka.dash.mpd.SegmentBase */ ({
          baseUrl: new goog.Uri('http://example.com'),
          timescale: 9000,
          presentationTimeOffset: null,
          indexRange: new shaka.dash.mpd.Range(100, 200),
          representationIndex: null,
          initialization: /** shaka.dash.mpd.Initialization */ ({
            url: new goog.Uri('http://example.com/init.mp4'),
            range: new shaka.dash.mpd.Range(201, 300)
          })
        }));
  });

  it('inherits SegmentBase from AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <BaseURL>http://example.com</BaseURL>',
      '      <SegmentBase presentationTimeOffset="10">',
      '        <Initialization sourceURL="init.mp4" range="201-300" />',
      '        <RepresentationIndex sourceURL="index.mp4" range="10-100" />',
      '      </SegmentBase>',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(
        source,
        /** shaka.dash.mpd.SegmentBase */ ({
          baseUrl: new goog.Uri('http://example.com'),
          timescale: 1,
          presentationTimeOffset: 10,
          indexRange: null,
          representationIndex: /** shaka.dash.mpd.RepresentationIndex */ ({
            url: new goog.Uri('http://example.com/index.mp4'),
            range: new shaka.dash.mpd.Range(10, 100)
          }),
          initialization: /** shaka.dash.mpd.Initialization */ ({
            url: new goog.Uri('http://example.com/init.mp4'),
            range: new shaka.dash.mpd.Range(201, 300)
          })
        }));
  });

  it('merges SegmentBase across levels', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="2001-3000" />',
      '    </SegmentBase>',
      '    <AdaptationSet>',
      '      <SegmentBase presentationTimeOffset="10" />',
      '      <Representation>',
      '        <SegmentBase>',
      '          <RepresentationIndex sourceURL="index.mp4" range="0-2000" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(
        source,
        /** shaka.dash.mpd.SegmentBase */ ({
          baseUrl: new goog.Uri('http://example.com'),
          timescale: 9000,
          presentationTimeOffset: 10,
          indexRange: null,
          representationIndex: /** shaka.dash.mpd.RepresentationIndex */ ({
            url: new goog.Uri('http://example.com/index.mp4'),
            range: new shaka.dash.mpd.Range(0, 2000)
          }),
          initialization: /** shaka.dash.mpd.Initialization */ ({
            url: new goog.Uri('http://example.com/init.mp4'),
            range: new shaka.dash.mpd.Range(2001, 3000)
          })
        }));
  });

  it('merges and overrides SegmentBase across levels', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <BaseURL>http://example.com</BaseURL>',
      '    <SegmentBase indexRange="0-10" timescale="9000">',
      '      <Initialization sourceURL="init.mp4" range="901-3000" />',
      '    </SegmentBase>',
      '    <AdaptationSet>',
      '      <SegmentBase timescale="10" presentationTimeOffset="10">',
      '        <Initialization sourceURL="special.mp4" />',
      '      </SegmentBase>',
      '      <Representation>',
      '        <SegmentBase indexRange="30-900" presentationTimeOffset="20" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(
        source,
        /** shaka.dash.mpd.SegmentBase */ ({
          baseUrl: new goog.Uri('http://example.com'),
          timescale: 10,
          presentationTimeOffset: 20,
          indexRange: new shaka.dash.mpd.Range(30, 900),
          representationIndex: null,
          initialization: /** shaka.dash.mpd.Initialization */ ({
            url: new goog.Uri('http://example.com/special.mp4'),
            range: null
          })
        }));
  });

  /**
   * Checks that the first Representation in |source| contains a SegmentBase
   * that matches |expected|.
   * @param {string} source
   * @param {!shaka.dash.mpd.SegmentBase} expected
   */
  var checkSegmentBase = function(source, expected) {
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

    var segmentBase = representation.segmentBase;
    expect(segmentBase).toBeTruthy();

    if (expected.baseUrl) {
      expect(segmentBase.baseUrl).toBeTruthy();
      expect(segmentBase.baseUrl.toString()).toBe(expected.baseUrl.toString());
    }

    expect(segmentBase.timescale).toBe(expected.timescale);
    expect(segmentBase.presentationTimeOffset).toBe(
        expected.presentationTimeOffset);

    checkRange(segmentBase.indexRange, expected.indexRange);

    checkUrlTypeObject(segmentBase.representationIndex,
                       expected.representationIndex);

    checkUrlTypeObject(segmentBase.initialization,
                       expected.initialization);
  };
});

