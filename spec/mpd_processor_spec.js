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
 * @fileoverview mpd_processor.js unit tests.
 */

goog.require('shaka.dash.mpd');
goog.require('shaka.dash.MpdProcessor');

describe('MpdProcessor', function() {
  var parser;

  beforeEach(function() {
    parser = new shaka.dash.MpdProcessor(null);
  });

  describe('validateSegmentInfo_()', function() {
    var mpd = shaka.dash.mpd;
    var m;
    var p;
    var as;
    var r;
    var sb;
    var sl;
    var st;

    beforeEach(function() {
      m = new mpd.Mpd();
      p = new mpd.Period();
      as = new mpd.AdaptationSet();
      r = new mpd.Representation();
      sb = new mpd.SegmentBase();
      sl = new mpd.SegmentList();
      st = new mpd.SegmentTemplate();
    });

    it('can handle a single SegmentBase.', function() {
      r.segmentBase = sb;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('can handle a single SegmentList.', function() {
      r.segmentList = sl;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).toBeNull();
      expect(r.segmentList).not.toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('can handle a single SegmentTemplate.', function() {
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).not.toBeNull();
    });

    it('can handle a SegmentBase and a SegmentList.', function() {
      r.segmentBase = sb;
      r.segmentList = sl;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentList should be removed.
      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('can handle a SegmentBase and a SegmentTemplate.', function() {
      r.segmentBase = sb;
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentTemplate should be removed.
      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('can handle a SegmentList and a SegmentTemplate.', function() {
      r.segmentList = sl;
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentTemplate should be removed.
      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).toBeNull();
      expect(r.segmentList).not.toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('can handle a SegmentBase, a SegmentList, and a SegmentTemplate.',
       function() {
      r.segmentBase = sb;
      r.segmentList = sl;
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentList and SegmentTemplate should be removed.
      parser.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('can handle no SegmentBase, SegmentList, or SegmentTemplate.',
       function() {
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // The Representation should be removed.
      parser.validateSegmentInfo_(m);
      expect(as.representations.length).toBe(0);
    });
  });

  describe('processSegmentTemplates_()', function() {
    var mpd = shaka.dash.mpd;
    var m;
    var p;
    var as;
    var r1;
    var r2;
    var st;

    beforeEach(function() {
      m = new mpd.Mpd();
      p = new mpd.Period();
      as = new mpd.AdaptationSet();
      r1 = new mpd.Representation();
      r2 = new mpd.Representation();
      st = new mpd.SegmentTemplate();

      r1.segmentTemplate = st;
      r2.segmentTemplate = st;

      as.segmentTemplate = st;
      as.representations.push(r1);
      as.representations.push(r2);

      p.adaptationSets.push(as);

      m.periods.push(p);
    });

    it('can generate a SegmentBase from a SegmentTemplate.', function() {
      st.mediaUrlTemplate = 'http://example.com/$Bandwidth$-media.mp4';
      st.indexUrlTemplate = 'http://example.com/$Bandwidth$-index.sidx';
      st.initializationUrlTemplate = 'http://example.com/$Bandwidth$-init.mp4';

      r1.bandwidth = 250000;
      r1.baseUrl = new mpd.BaseUrl();
      r1.baseUrl = new goog.Uri('http://example.com/');

      r2.bandwidth = 500000;
      r2.baseUrl = new mpd.BaseUrl();
      r2.baseUrl = new goog.Uri('http://example.com/');

      parser.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentBase).toBeTruthy();
      expect(r1.segmentList).toBeNull();

      expect(r1.segmentBase.mediaUrl).toBeTruthy();
      expect(r1.segmentBase.mediaUrl.toString())
          .toBe('http://example.com/250000-media.mp4');

      var ri1 = r1.segmentBase.representationIndex;
      expect(ri1).toBeTruthy();

      expect(ri1.url).toBeTruthy();
      expect(ri1.url.toString()).toBe('http://example.com/250000-index.sidx');
      expect(ri1.range).toBeNull();

      var i1 = r1.segmentBase.initialization;
      expect(i1.url).toBeTruthy();
      expect(i1.url.toString()).toBe('http://example.com/250000-init.mp4');
      expect(i1.range).toBeNull();

      // Check |r2|.
      expect(r2.segmentBase).toBeTruthy();
      expect(r2.segmentList).toBeNull();

      expect(r2.segmentBase.mediaUrl).toBeTruthy();
      expect(r2.segmentBase.mediaUrl.toString())
          .toBe('http://example.com/500000-media.mp4');

      var ri2 = r2.segmentBase.representationIndex;
      expect(ri2).toBeTruthy();

      expect(ri2.url).toBeTruthy();
      expect(ri2.url.toString()).toBe('http://example.com/500000-index.sidx');
      expect(ri2.range).toBeNull();

      var i2 = r2.segmentBase.initialization;
      expect(i2.url).toBeTruthy();
      expect(i2.url.toString()).toBe('http://example.com/500000-init.mp4');
      expect(i2.range).toBeNull();
    });

    it('can generate a SegmentList from a SegmentTemplate.', function() {
      var tp1 = new mpd.SegmentTimePoint();
      tp1.duration = 10;
      tp1.repeat = 1;

      var tp2 = new mpd.SegmentTimePoint();
      tp2.duration = 20;
      tp2.repeat = 0;

      var timeline = new mpd.SegmentTimeline();
      timeline.timePoints.push(tp1);
      timeline.timePoints.push(tp2);

      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = null;
      st.firstSegmentNumber = 1;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      st.timeline = timeline;

      r1.bandwidth = 250000;
      r1.baseUrl = new mpd.BaseUrl();
      r1.baseUrl = new goog.Uri('http://example.com/');

      r2.bandwidth = 500000;
      r2.baseUrl = new mpd.BaseUrl();
      r2.baseUrl = new goog.Uri('http://example.com/');

      parser.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentBase).toBeNull();
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.timescale).toBe(9000);
      expect(sl1.presentationTimeOffset).toBe(0);
      expect(sl1.segmentDuration).toBe(null);
      expect(sl1.firstSegmentNumber).toBe(1);

      expect(sl1.initialization).toBeTruthy();
      expect(sl1.initialization.url).toBeTruthy();
      expect(sl1.initialization.url.toString())
          .toBe('http://example.com/250000-init.mp4');

      expect(sl1.segmentUrls.length).toBe(3);

      expect(sl1.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/1-0-250000-media.mp4');
      expect(sl1.segmentUrls[0].mediaRange).toBeNull();
      expect(sl1.segmentUrls[0].startTime).toBe(0);
      expect(sl1.segmentUrls[0].duration).toBe(10);

      expect(sl1.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/2-10-250000-media.mp4');
      expect(sl1.segmentUrls[1].mediaRange).toBeNull();
      expect(sl1.segmentUrls[1].startTime).toBe(10);
      expect(sl1.segmentUrls[1].duration).toBe(10);

      expect(sl1.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/3-20-250000-media.mp4');
      expect(sl1.segmentUrls[2].mediaRange).toBeNull();
      expect(sl1.segmentUrls[2].startTime).toBe(20);
      expect(sl1.segmentUrls[2].duration).toBe(20);

      // Check |r2|.
      expect(r2.segmentBase).toBeNull();
      expect(r2.segmentList).toBeTruthy();

      var sl2 = r2.segmentList;
      expect(sl2.timescale).toBe(9000);
      expect(sl2.presentationTimeOffset).toBe(0);
      expect(sl2.segmentDuration).toBe(null);
      expect(sl2.firstSegmentNumber).toBe(1);

      expect(sl2.initialization).toBeTruthy();
      expect(sl2.initialization.url).toBeTruthy();
      expect(sl2.initialization.url.toString())
          .toBe('http://example.com/500000-init.mp4');

      expect(sl2.segmentUrls.length).toBe(3);

      expect(sl2.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/1-0-500000-media.mp4');
      expect(sl2.segmentUrls[0].mediaRange).toBeNull();
      expect(sl2.segmentUrls[0].startTime).toBe(0);
      expect(sl2.segmentUrls[0].duration).toBe(10);

      expect(sl2.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/2-10-500000-media.mp4');
      expect(sl2.segmentUrls[1].mediaRange).toBeNull();
      expect(sl2.segmentUrls[1].startTime).toBe(10);
      expect(sl2.segmentUrls[1].duration).toBe(10);

      expect(sl2.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/3-20-500000-media.mp4');
      expect(sl2.segmentUrls[2].mediaRange).toBeNull();
      expect(sl2.segmentUrls[2].startTime).toBe(20);
      expect(sl2.segmentUrls[2].duration).toBe(20);
    });
  });

  describe('fillUrlTemplate_()', function() {
    it('can handle a single RepresentationID identifier.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$RepresentationID$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4')

      // RepresentationID cannot use a width specifier.
      expect(
          parser.fillUrlTemplate_(
              '/example/$RepresentationID%01d$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      expect(
          parser.fillUrlTemplate_(
              '/example/$RepresentationID$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$RepresentationID$.mp4');
    });

    it('can handle a single Number identifier.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$Number$.mp4',
              null, 100, null, null).toString()).toBe('/example/100.mp4')

      expect(
          parser.fillUrlTemplate_(
              '/example/$Number%05d$.mp4',
              null, 100, null, null).toString()).toBe('/example/00100.mp4');

      expect(
          parser.fillUrlTemplate_(
              '/example/$Number$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Number$.mp4');
    });

    it('can handle a single Bandwidth identifier.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$Bandwidth$.mp4',
              null, null, 100, null).toString()).toBe('/example/100.mp4')

      expect(
          parser.fillUrlTemplate_(
              '/example/$Bandwidth%05d$.mp4',
              null, null, 100, null).toString()).toBe('/example/00100.mp4');

      expect(
          parser.fillUrlTemplate_(
              '/example/$Bandwidth$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Bandwidth$.mp4');
    });

    it('can handle a single Time identifier.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$Time$.mp4',
              null, null, null, 100).toString()).toBe('/example/100.mp4')

      expect(
          parser.fillUrlTemplate_(
              '/example/$Time%05d$.mp4',
              null, null, null, 100).toString()).toBe('/example/00100.mp4');

      expect(
          parser.fillUrlTemplate_(
              '/example/$Time$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Time$.mp4');
    });

    it('can handle multiple identifiers.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$RepresentationID$_$Number$_$Bandwidth$_$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1_2_3_4.mp4')

      // No spaces.
      expect(
          parser.fillUrlTemplate_(
              '/example/$RepresentationID$$Number$$Bandwidth$$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1234.mp4')

      // Different order.
      expect(
          parser.fillUrlTemplate_(
              '/example/$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/3_4_1_2.mp4')

      // Single width.
      expect(
          parser.fillUrlTemplate_(
              '$RepresentationID$_$Number%01d$_$Bandwidth%01d$_$Time%01d$',
              1, 2, 3, 400).toString()).toBe('1_2_3_400')

      // Different widths.
      expect(
          parser.fillUrlTemplate_(
              '$RepresentationID$_$Number%02d$_$Bandwidth%02d$_$Time%02d$',
              1, 2, 3, 4).toString()).toBe('1_02_03_04')

      // Double $$.
      expect(
          parser.fillUrlTemplate_(
              '$$/$RepresentationID$$$$Number$$$$Bandwidth$$$$Time$$$.$$',
              1, 2, 3, 4).toString()).toBe('$/1$2$3$4$.$')
    });

    it('can handle invalid identifiers.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$Garbage$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          parser.fillUrlTemplate_(
              '/example/$RepresentationID%$',
              1, 2, 3, 4)).toBeNull();
    });

    it('can handle partial identifiers.', function() {
      expect(
          parser.fillUrlTemplate_(
              '/example/$Time.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Time.mp4');

      expect(
          parser.fillUrlTemplate_(
              '/example/$Time%.mp4',
              1, 2, 3, 4)).toBeNull();
    });
  });
});

