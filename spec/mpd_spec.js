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
 * @fileoverview mpd.js unit tests.
 */

goog.require('shaka.dash.mpd');

describe('mpd', function() {
  beforeEach(function() {
    jasmine.addMatchers(customMatchers);
  });

  it('parses an MPD time string', function() {
    var parseDuration = shaka.dash.mpd.parseDuration_;

    // Days only.
    expect(parseDuration('P7D')).toBe(604800);

    // Hours only.
    expect(parseDuration('PT1H')).toBe(3600);

    // Minutes only.
    expect(parseDuration('PT1M')).toBe(60);

    // Seconds only (with no fractional part).
    expect(parseDuration('PT1S')).toBe(1);

    // Seconds only (with no whole part).
    expect(parseDuration('PT0.1S')).toBe(0.1);
    expect(parseDuration('PT.1S')).toBe(0.1);

    // Seconds only (with whole part and fractional part).
    expect(parseDuration('PT1.1S')).toBe(1.1);

    // Hours, and minutes.
    expect(parseDuration('PT1H2M')).toBe(3720);

    // Hours, and seconds.
    expect(parseDuration('PT1H2S')).toBe(3602);
    expect(parseDuration('PT1H2.2S')).toBe(3602.2);

    // Minutes, and seconds.
    expect(parseDuration('PT1M2S')).toBe(62);
    expect(parseDuration('PT1M2.2S')).toBe(62.2);

    // Hours, minutes, and seconds.
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('PT1H2M3.3S')).toBe(3723.3);

    // Days, hours, minutes, and seconds.
    expect(parseDuration('P1DT1H2M3S')).toBe(90123);
    expect(parseDuration('P1DT1H2M3.3S')).toBe(90123.3);

    // Error cases.
    expect(parseDuration('P1Sasdf')).toBeNull();
    expect(parseDuration('P1Y')).toBeNull();
    expect(parseDuration('P1YT1S')).toBeNull();
    expect(parseDuration('P1M')).toBeNull();
    expect(parseDuration('P1MT1S')).toBeNull();
    expect(parseDuration('P1M1D')).toBeNull();
    expect(parseDuration('P1M1DT1S')).toBeNull();
    expect(parseDuration('1H2M3S')).toBeNull();
    expect(parseDuration('123')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('parses an MPD range string', function() {
    var parseRange = shaka.dash.mpd.parseRange_;
    var Range = shaka.dash.mpd.Range;

    expect(parseRange('0-0')).toMatchRange(new Range(0, 0));
    expect(parseRange('1-1')).toMatchRange(new Range(1, 1));
    expect(parseRange('1-50')).toMatchRange(new Range(1, 50));
    expect(parseRange('50-1')).toMatchRange(new Range(50, 1));

    expect(parseRange('-1')).toBeNull();
    expect(parseRange('1-')).toBeNull();
    expect(parseRange('1')).toBeNull();
    expect(parseRange('-')).toBeNull();
    expect(parseRange('')).toBeNull();
  });

  it('parses basic MPD XML which has a SegmentBase', function() {
    var source = [
      '<MPD>',
      '  <Period id="1" duration="PT0H3M1.63S" start="PT0S">',
      '    <AdaptationSet id="1" lang="en" contentType="video">',
      '      <Representation id="r1" codecs="mp4a.40.2">',
      '        <BaseURL>http://example.com</BaseURL>',
      '        <SegmentBase indexRange="1000-3540">',
      '          <Initialization range="0-999" />',
      '        </SegmentBase>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.id).toBe('1');
    expect(period.duration).toBe(181.63);
    expect(period.start).toBe(0);
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.id).toBe('1');
    expect(adaptationSet.lang).toBe('en');
    expect(adaptationSet.contentType).toBe('video');
    expect(adaptationSet.representations.length).toBe(1);

    var representation = adaptationSet.representations[0];
    expect(representation).toBeTruthy();
    expect(representation.id).toBe('r1');
    expect(representation.codecs).toBe('mp4a.40.2');

    var baseUrl = representation.baseUrl;
    expect(baseUrl).toBeTruthy();
    expect(baseUrl.toString()).toBe('http://example.com');

    var segmentBase = representation.segmentBase;
    expect(segmentBase).toBeTruthy();
    expect(segmentBase.indexRange.begin).toBe(1000);
    expect(segmentBase.indexRange.end).toBe(3540);

    var initialization = segmentBase.initialization;
    expect(initialization).toBeTruthy();
    expect(initialization.range.begin).toBe(0);
    expect(initialization.range.end).toBe(999);
  });

  it('parses basic MPD XML which has a SegmentTemplate', function() {
    var source = [
      '<MPD>',
      '  <Period id="1" duration="PT0H3M1.63S" start="PT0S">',
      '    <AdaptationSet id="1" lang="en" contentType="video">',
      '      <BaseURL>http://example.com</BaseURL>',
      '      <SegmentTemplate',
      '       timescale="9000"',
      '       initialization="$Bandwidth$/init.mp4"',
      '       media="$Bandwidth$/frames.mp4">',
      '        <SegmentTimeline>',
      '          <S t="0" d="1000" r="400" />',
      '        </SegmentTimeline>',
      '      </SegmentTemplate>',
      '      <Representation id="r1" bandwidth="250000" codecs="mp4a.40.2" />',
      '      <Representation id="r2" bandwidth="500000" codecs="mp4a.40.2" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.id).toBe('1');
    expect(period.duration).toBe(181.63);
    expect(period.start).toBe(0);
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.id).toBe('1');
    expect(adaptationSet.lang).toBe('en');
    expect(adaptationSet.contentType).toBe('video');
    expect(adaptationSet.representations.length).toBe(2);

    var baseUrl = adaptationSet.baseUrl;
    expect(baseUrl).toBeTruthy();
    expect(baseUrl.toString()).toBe('http://example.com');

    var segmentTemplate = adaptationSet.segmentTemplate;
    expect(segmentTemplate).toBeTruthy();
    expect(segmentTemplate.timescale).toBe(9000);
    expect(segmentTemplate.initializationUrlTemplate).toBe(
        '$Bandwidth$/init.mp4');
    expect(segmentTemplate.mediaUrlTemplate).toBe('$Bandwidth$/frames.mp4');

    var timeline = segmentTemplate.timeline;
    expect(timeline).toBeTruthy();

    var timePoints = timeline.timePoints;
    expect(timePoints).toBeTruthy();
    expect(timePoints.length).toBe(1);

    var tp = timePoints[0];
    expect(tp.startTime).toBe(0);
    expect(tp.duration).toBe(1000);
    expect(tp.repeat).toBe(400);

    var representation = adaptationSet.representations[0];
    expect(representation).toBeTruthy();
    expect(representation.id).toBe('r1');
    expect(representation.bandwidth).toBe(250000);
    expect(representation.codecs).toBe('mp4a.40.2');

    representation = adaptationSet.representations[1];
    expect(representation).toBeTruthy();
    expect(representation.id).toBe('r2');
    expect(representation.bandwidth).toBe(500000);
    expect(representation.codecs).toBe('mp4a.40.2');
  });

  it('inherits ContentComponent attributes in AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period id="1" duration="PT0H3M1.63S" start="PT0S">',
      '    <AdaptationSet id="1">',
      '      <ContentComponent id="1" contentType="video" lang="en" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.lang).toBe('en');
    expect(adaptationSet.contentType).toBe('video');
  });

  it('overrides ContentComponent attributes in AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period id="1" duration="PT0H3M1.63S" start="PT0S">',
      '    <AdaptationSet id="1" lang="fr" contentType="audio">',
      '      <ContentComponent id="1" contentType="video" lang="en" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.lang).toBe('fr');
    expect(adaptationSet.contentType).toBe('audio');
  });

  it('inherits a SegmentBase from a Period', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase indexRange="100-200" />',
      '    <AdaptationSet>',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(source, 100, 200);
  });

  it('inherits a SegmentBase from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <SegmentBase indexRange="100-200" />',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(source, 100, 200);

    var source = [
      '<MPD>',
      '  <Period>',
      '  <SegmentBase indexRange="100-200" />',
      '    <AdaptationSet>',
      '      <SegmentBase indexRange="1000-2000" />',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(source, 1000, 2000);
  });

  it('overrides a SegmentBase from a Period', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '  <SegmentBase indexRange="0-1" />',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <SegmentBase indexRange="1000-2000" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(source, 1000, 2000);
  });

  it('overrides a SegmentBase from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '     <SegmentBase indexRange="0-1" />',
      '      <Representation>',
      '        <SegmentBase indexRange="1000-2000" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(source, 1000, 2000);

    source = [
      '<MPD>',
      '  <Period>',
      '  <SegmentBase indexRange="100-200" />',
      '    <AdaptationSet>',
      '     <SegmentBase indexRange="1000-2000" />',
      '     <Representation>',
      '       <SegmentBase indexRange="10000-20000" />',
      '     </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkSegmentBase(source, 10000, 20000);
  });

  /**
   * Checks that a SegmentBase exists with the given index range.
   * @param {string} source The XML source.
   * @param {number} indexBegin
   * @param {number} indexEnd
   */
  var checkSegmentBase = function(source, indexBegin, indexEnd) {
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
    expect(segmentBase.indexRange.begin).toBe(indexBegin);
    expect(segmentBase.indexRange.end).toBe(indexEnd);
  };

  it('inherits a ContentProtection from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '     <ContentProtection schemeIdUri="http://example.com" />',
      '     <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://example.com');

    source = [
      '<MPD>',
      '  <Period>',
      '  <ContentProtection schemeIdUri="http://example.com" />',
      '    <AdaptationSet>',
      '      <ContentProtection schemeIdUri="http://google.com" />',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://google.com');
  });

  it('overrides a ContentProtection from a Period', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '  <ContentProtection schemeIdUri="http://example.com" />',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <ContentProtection schemeIdUri="http://google.com" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://google.com');
  });

  it('overrides a ContentProtection from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '     <ContentProtection schemeIdUri="http://example.com" />',
      '      <Representation>',
      '        <ContentProtection schemeIdUri="http://google.com" />',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://google.com');

    source = [
      '<MPD>',
      '  <Period>',
      '  <ContentProtection schemeIdUri="http://example.com" />',
      '    <AdaptationSet>',
      '     <ContentProtection schemeIdUri="http://google.com" />',
      '     <Representation>',
      '       <ContentProtection schemeIdUri="http://youtube.com" />',
      '     </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkContentProtection(source, 'http://youtube.com');
  });

  /**
   * Checks that a ContentProtection exists with the given schemeIdUri.
   * @param {string} source The XML source.
   * @param {string} schemeIdUri
   */
  var checkContentProtection = function(source, schemeIdUri) {
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
    expect(representation.contentProtections.length).toBeTruthy();

    var foundMatch = false;
    for (var i = 0; i < representation.contentProtections.length; ++i) {
      var contentProtection = representation.contentProtections[i];
      expect(contentProtection).toBeTruthy();
      if (contentProtection.schemeIdUri == schemeIdUri) {
        foundMatch = true;
      }
    }
    expect(foundMatch).toBeTruthy();
  };

  it('inherits a "mimeType" attribute from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase />',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkRepresentationMimeType(source, 'video/mp4');
  });

  it('overrides a "mimeType" attribute from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase />',
      '    <AdaptationSet mimeType="video/mp4">',
      '      <Representation mimeType="video/webm"/>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkRepresentationMimeType(source, 'video/webm');
  });

  /**
   * @param {string} source The XML source.
   * @param {string} mimeType
   */
  var checkRepresentationMimeType = function(source, mimeType) {
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
    expect(representation.mimeType).toBe(mimeType);
  };

  it('infers a "contentType" attribute from "mimeType"', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase />',
      '    <AdaptationSet mimeType="video/mp4" />',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.contentType).toBe('video');
  });

  it('infers a "mimeType" attribute from Representations', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase />',
      '    <AdaptationSet>',
      '      <Representation mimeType="video/mp4" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var period = mpd.periods[0];
    expect(period).toBeTruthy();
    expect(period.adaptationSets.length).toBe(1);

    var adaptationSet = period.adaptationSets[0];
    expect(adaptationSet).toBeTruthy();
    expect(adaptationSet.mimeType).toBe('video/mp4');
    expect(adaptationSet.contentType).toBe('video');
  });

  it('inherits a "codecs" attribute from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase />',
      '    <AdaptationSet codecs="vp8">',
      '      <Representation />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkCodecs(source, 'vp8');
  });

  it('overrides a "codecs" attribute from an AdaptationSet', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <SegmentBase />',
      '    <AdaptationSet codecs="vp8">',
      '      <Representation codecs="vp9"/>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    checkCodecs(source, 'vp9');
  });

  /**
   * @param {string} source The XML source.
   * @param {string} codecs
   */
  var checkCodecs = function(source, codecs) {
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
    expect(representation.codecs).toBe(codecs);
  };

  it('resolves relative and absolute URLs at every level', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>http://example.com/</BaseURL>',
      '  <Period>',
      '    <BaseURL>Period1/</BaseURL>',
      '    <AdaptationSet>',
      '      <BaseURL>AdaptationSet1/</BaseURL>',
      '      <Representation>',
      '        <BaseURL>Representation1</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period>',
      '    <BaseURL>Period2</BaseURL>',
      '    <AdaptationSet>',
      '      <BaseURL>AdaptationSet2</BaseURL>',
      '      <Representation>',
      '        <BaseURL>Representation2</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period>',
      '    <BaseURL>/Period3/</BaseURL>',
      '    <AdaptationSet>',
      '      <BaseURL>/AdaptationSet3</BaseURL>',
      '      <Representation>',
      '        <BaseURL>?Representation3</BaseURL>',
      '      </Representation>',
      '      <Representation>',
      '        <BaseURL>#Representation4</BaseURL>',
      '      </Representation>',
      '      <Representation>',
      '        <BaseURL>http://foo.bar/</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet>',
      '      <BaseURL>http://foo.bar/multi/level</BaseURL>',
      '      <Representation>',
      '        <BaseURL>?Representation5</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.baseUrl.toString()).toBe('http://example.com/');
    expect(mpd.periods.length).toBe(3);

    var p = mpd.periods;
    expect(p[0].baseUrl.toString()).
        toBe('http://example.com/Period1/');
    expect(p[0].adaptationSets[0].baseUrl.toString()).
        toBe('http://example.com/Period1/AdaptationSet1/');
    expect(p[0].adaptationSets[0].representations[0].baseUrl.toString()).
        toBe('http://example.com/Period1/AdaptationSet1/Representation1');

    expect(p[1].baseUrl.toString()).
        toBe('http://example.com/Period2');
    expect(p[1].adaptationSets[0].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet2');
    expect(p[1].adaptationSets[0].representations[0].baseUrl.toString()).
        toBe('http://example.com/Representation2');

    expect(p[2].baseUrl.toString()).
        toBe('http://example.com/Period3/');
    expect(p[2].adaptationSets[0].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet3');
    expect(p[2].adaptationSets[0].representations[0].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet3?Representation3');
    expect(p[2].adaptationSets[0].representations[1].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet3#Representation4');
    expect(p[2].adaptationSets[0].representations[2].baseUrl.toString()).
        toBe('http://foo.bar/');

    expect(p[2].adaptationSets[1].baseUrl.toString()).
        toBe('http://foo.bar/multi/level');
    expect(p[2].adaptationSets[1].representations[0].baseUrl.toString()).
        toBe('http://foo.bar/multi/level?Representation5');
  });

  it('resolves relative URLs across levels', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>sub/</BaseURL>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>1.webm</BaseURL>',
      '      </Representation>',
      '      <Representation>',
      '        <BaseURL>2.webm</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
    expect(mpd.baseUrl.toString()).toBe('sub/');
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.baseUrl.toString()).toBe('sub/');
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.baseUrl.toString()).toBe('sub/');
    expect(as.representations.length).toBe(2);

    var r = as.representations;
    expect(r[0].baseUrl.toString()).toBe('sub/1.webm');
    expect(r[1].baseUrl.toString()).toBe('sub/2.webm');
  });

  it('resolves relative URLs with respect to the MPD URL', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>1.webm</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpdUrl = 'http://example.com/dash/test.mpd';

    var mpd = shaka.dash.mpd.parseMpd(source, mpdUrl);
    expect(mpd).toBeTruthy();
    expect(mpd.baseUrl.toString()).toBe(mpdUrl);
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.baseUrl.toString()).toBe(mpdUrl);
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.baseUrl.toString()).toBe(mpdUrl);
    expect(as.representations.length).toBe(1);

    var r = as.representations[0];
    expect(r.baseUrl.toString()).toBe('http://example.com/dash/1.webm');
  });

  it('parses namespaced elements', function() {
    var source = [
      '<MPD>',
      '  <Period id="1" duration="PT0H3M1.63S" start="PT0S">',
      '    <AdaptationSet id="1" lang="fr" contentType="audio">',
      '      <ContentProtection schemeIdUri="com.bogus">',
      '        <prefix:TagName keyid="0" key="1"/>',
      '      </ContentProtection>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd).toBeTruthy();
  });

  it('defaults startNumber to 1', function() {
    var source = [
      '<MPD>',
      '  <Period id="1" duration="PT0H1M0.00S">',
      '    <AdaptationSet id="1" lang="en" contentType="audio">',
      '      <SegmentTemplate startNumber="0" />',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    var period = mpd.periods[0];
    var adaptationSet = period.adaptationSets[0];
    var segmentTemplate = adaptationSet.segmentTemplate;
    expect(segmentTemplate.startNumber).toBe(1);
  });
});

