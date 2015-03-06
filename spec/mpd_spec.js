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
 * @fileoverview mpd_parser.js unit tests.
 */

goog.require('shaka.dash.mpd');

describe('mpd', function() {
  beforeEach(function() {
    jasmine.addMatchers(customMatchers);
  });

  it('parses an MPD duration string', function() {
    var parseDuration = shaka.dash.mpd.parseDuration_;

    // Years only. 1 year has 365 or 366 days.
    expect(parseDuration('P3Y')).toBeLessThan(3 * (60 * 60 * 24 * 366) + 1);
    expect(parseDuration('P3Y')).toBeGreaterThan(3 * (60 * 60 * 24 * 365) - 1);

    // Months only. 1 month has 28 to 31 days.
    expect(parseDuration('P2M')).toBeLessThan(2 * (60 * 60 * 24 * 31) + 1);
    expect(parseDuration('P2M')).toBeGreaterThan(2 * (60 * 60 * 24 * 28) - 1);

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

    // Months, hours, minutes, and seconds.
    expect(parseDuration('P1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 31) + 90123 + 1);
    expect(parseDuration('P1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 28) + 90123 - 1);

    // Years, Months, hours, minutes, and seconds.
    expect(parseDuration('P1Y1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 366) + (60 * 60 * 24 * 31) + 90123 + 1);
    expect(parseDuration('P1Y1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 365) + (60 * 60 * 24 * 28) + 90123 - 1);

    expect(parseDuration('PT')).toBe(0);
    expect(parseDuration('P')).toBe(0);

    // Error cases.
    expect(parseDuration('-PT3S')).toBeNull();
    expect(parseDuration('PT-3S')).toBeNull();
    expect(parseDuration('P1Sasdf')).toBeNull();
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

  it('inherits mimeType attribute from AdaptationSet', function() {
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

  it('overrides mimeType attribute from AdaptationSet', function() {
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
   * Checks that the first Representation in |source| has |mimeType|.
   * @param {string} source
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

  it('infers contentType attribute from mimeType attribute', function() {
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

  it('infers mimeType attribute from Representation', function() {
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

  it('inherits codecs attribute from AdaptationSet', function() {
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

  it('overrides codecs attribute from AdaptationSet', function() {
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
   * Checks that the first Representation in |source| has |codecs|.
   * @param {string} source
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

  it('does not override valid zeros with defaults', function() {
    var source = [
      '<MPD minBufferTime="PT0S">',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, '');
    expect(mpd.minBufferTime).toBe(0);
  });
});

