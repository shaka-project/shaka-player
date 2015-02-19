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

goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.mpd');
goog.require('shaka.player.Player');

describe('MpdProcessor', function() {
  var mpd;
  var processor;

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();
  });

  afterAll(function() {
    assertsToFailures.uninstall();
  });

  beforeEach(function() {
    mpd = shaka.dash.mpd;
    processor = new shaka.dash.MpdProcessor(null);
  });

  describe('validateSegmentInfo_', function() {
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

    it('handles a single SegmentBase', function() {
      r.segmentBase = sb;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('handles a single SegmentList', function() {
      r.segmentList = sl;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).toBeNull();
      expect(r.segmentList).not.toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('handles a single SegmentTemplate', function() {
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).not.toBeNull();
    });

    it('handles a SegmentBase and a SegmentList', function() {
      r.segmentBase = sb;
      r.segmentList = sl;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentList should be removed.
      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('handles a SegmentBase and a SegmentTemplate', function() {
      r.segmentBase = sb;
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentTemplate should be removed.
      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('handles a SegmentList and a SegmentTemplate', function() {
      r.segmentList = sl;
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentTemplate should be removed.
      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).toBeNull();
      expect(r.segmentList).not.toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('handles SegmentBase, SegmentList, and SegmentTemplate', function() {
      r.segmentBase = sb;
      r.segmentList = sl;
      r.segmentTemplate = st;
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // SegmentList and SegmentTemplate should be removed.
      processor.validateSegmentInfo_(m);
      expect(r.segmentBase).not.toBeNull();
      expect(r.segmentList).toBeNull();
      expect(r.segmentTemplate).toBeNull();
    });

    it('handles no SegmentBase, SegmentList, or SegmentTemplate', function() {
      as.representations.push(r);
      p.adaptationSets.push(as);
      m.periods.push(p);

      // The Representation should be removed.
      processor.validateSegmentInfo_(m);
      expect(as.representations.length).toBe(0);
    });
  });

  describe('processSegmentTemplates_', function() {
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

      p.start = 0;
      p.adaptationSets.push(as);

      m.periods.push(p);
    });

    it('creates SegmentBase', function() {
      st.mediaUrlTemplate = 'http://example.com/$Bandwidth$-media.mp4';
      st.indexUrlTemplate = 'http://example.com/$Bandwidth$-index.sidx';
      st.initializationUrlTemplate = 'http://example.com/$Bandwidth$-init.mp4';

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      r2.bandwidth = 500000;
      r2.baseUrl = new goog.Uri('http://example.com/');

      processor.processSegmentTemplates_(m);

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

    it('creates SegmentList from SegmentTimeline w/o start times', function() {
      var tp1 = new mpd.SegmentTimePoint();
      tp1.duration = 9000 * 10;
      tp1.repeat = 1;

      var tp2 = new mpd.SegmentTimePoint();
      tp2.duration = 9000 * 20;
      tp2.repeat = 0;

      var timeline = new mpd.SegmentTimeline();
      timeline.timePoints.push(tp1);
      timeline.timePoints.push(tp2);

      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = null;
      st.startNumber = 1;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      st.timeline = timeline;

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      r2.bandwidth = 500000;
      r2.baseUrl = new goog.Uri('http://example.com/');

      processor.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentBase).toBeNull();
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.timescale).toBe(9000);
      expect(sl1.presentationTimeOffset).toBe(0);
      expect(sl1.segmentDuration).toBe(null);
      expect(sl1.startNumber).toBe(1);

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
      expect(sl1.segmentUrls[0].duration).toBe(9000 * 10);

      expect(sl1.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/2-90000-250000-media.mp4');
      expect(sl1.segmentUrls[1].mediaRange).toBeNull();
      expect(sl1.segmentUrls[1].startTime).toBe(9000 * 10);
      expect(sl1.segmentUrls[1].duration).toBe(9000 * 10);

      expect(sl1.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/3-180000-250000-media.mp4');
      expect(sl1.segmentUrls[2].mediaRange).toBeNull();
      expect(sl1.segmentUrls[2].startTime).toBe(9000 * 20);
      expect(sl1.segmentUrls[2].duration).toBe(9000 * 20);

      // Check |r2|.
      expect(r2.segmentBase).toBeNull();
      expect(r2.segmentList).toBeTruthy();

      var sl2 = r2.segmentList;
      expect(sl2.timescale).toBe(9000);
      expect(sl2.presentationTimeOffset).toBe(0);
      expect(sl2.segmentDuration).toBe(null);
      expect(sl2.startNumber).toBe(1);

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
      expect(sl2.segmentUrls[0].duration).toBe(9000 * 10);

      expect(sl2.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/2-90000-500000-media.mp4');
      expect(sl2.segmentUrls[1].mediaRange).toBeNull();
      expect(sl2.segmentUrls[1].startTime).toBe(9000 * 10);
      expect(sl2.segmentUrls[1].duration).toBe(9000 * 10);

      expect(sl2.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/3-180000-500000-media.mp4');
      expect(sl2.segmentUrls[2].mediaRange).toBeNull();
      expect(sl2.segmentUrls[2].startTime).toBe(9000 * 20);
      expect(sl2.segmentUrls[2].duration).toBe(9000 * 20);
    });

    it('creates SegmentList from SegmentTimeline w/ start times', function() {
      var tp1 = new mpd.SegmentTimePoint();
      tp1.startTime = 9000 * 100;
      tp1.duration = 9000 * 10;
      tp1.repeat = 1;

      var tp2 = new mpd.SegmentTimePoint();
      tp2.startTime = (9000 * 100) + (9000 * 20);
      tp2.duration = 9000 * 20;
      tp2.repeat = 0;

      var timeline = new mpd.SegmentTimeline();
      timeline.timePoints.push(tp1);
      timeline.timePoints.push(tp2);

      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = null;
      st.startNumber = 10;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      st.timeline = timeline;

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      processor.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentBase).toBeNull();
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.segmentUrls.length).toBe(3);

      expect(sl1.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/10-900000-250000-media.mp4');
      expect(sl1.segmentUrls[0].mediaRange).toBeNull();
      expect(sl1.segmentUrls[0].startTime).toBe(9000 * 100);
      expect(sl1.segmentUrls[0].duration).toBe(9000 * 10);

      expect(sl1.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/11-990000-250000-media.mp4');
      expect(sl1.segmentUrls[1].mediaRange).toBeNull();
      expect(sl1.segmentUrls[1].startTime).toBe((9000 * 100) + (9000 * 10));
      expect(sl1.segmentUrls[1].duration).toBe(9000 * 10);

      expect(sl1.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/12-1080000-250000-media.mp4');
      expect(sl1.segmentUrls[2].mediaRange).toBeNull();
      expect(sl1.segmentUrls[2].startTime).toBe((9000 * 100) + (9000 * 20));
      expect(sl1.segmentUrls[2].duration).toBe(9000 * 20);
    });

    it('creates SegmentList from segment duration', function() {
      p.duration = 30;

      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = 9000 * 10;
      st.startNumber = 5;  // Ensure startNumber > 1 works.
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      r2.bandwidth = 500000;
      r2.baseUrl = new goog.Uri('http://example.com/');

      processor.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentBase).toBeNull();
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.timescale).toBe(9000);
      expect(sl1.presentationTimeOffset).toBe(0);
      expect(sl1.segmentDuration).toBe(9000 * 10);
      expect(sl1.startNumber).toBe(5);

      expect(sl1.initialization).toBeTruthy();
      expect(sl1.initialization.url).toBeTruthy();
      expect(sl1.initialization.url.toString())
          .toBe('http://example.com/250000-init.mp4');

      expect(sl1.segmentUrls.length).toBe(3);

      expect(sl1.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/5-360000-250000-media.mp4');
      expect(sl1.segmentUrls[0].mediaRange).toBeNull();
      expect(sl1.segmentUrls[0].startTime).toBe(0);
      expect(sl1.segmentUrls[0].duration).toBe(9000 * 10);

      expect(sl1.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/6-450000-250000-media.mp4');
      expect(sl1.segmentUrls[1].mediaRange).toBeNull();
      expect(sl1.segmentUrls[1].startTime).toBe(9000 * 10);
      expect(sl1.segmentUrls[1].duration).toBe(9000 * 10);

      expect(sl1.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/7-540000-250000-media.mp4');
      expect(sl1.segmentUrls[2].mediaRange).toBeNull();
      expect(sl1.segmentUrls[2].startTime).toBe(9000 * 20);
      expect(sl1.segmentUrls[2].duration).toBe(9000 * 10);

      // Check |r2|.
      expect(r2.segmentBase).toBeNull();
      expect(r2.segmentList).toBeTruthy();

      var sl2 = r2.segmentList;
      expect(sl2.timescale).toBe(9000);
      expect(sl2.presentationTimeOffset).toBe(0);
      expect(sl2.segmentDuration).toBe(9000 * 10);
      expect(sl2.startNumber).toBe(5);

      expect(sl2.initialization).toBeTruthy();
      expect(sl2.initialization.url).toBeTruthy();
      expect(sl2.initialization.url.toString())
          .toBe('http://example.com/500000-init.mp4');

      expect(sl2.segmentUrls.length).toBe(3);

      expect(sl2.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/5-360000-500000-media.mp4');
      expect(sl2.segmentUrls[0].mediaRange).toBeNull();
      expect(sl2.segmentUrls[0].startTime).toBe(0);
      expect(sl2.segmentUrls[0].duration).toBe(9000 * 10);

      expect(sl2.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/6-450000-500000-media.mp4');
      expect(sl2.segmentUrls[1].mediaRange).toBeNull();
      expect(sl2.segmentUrls[1].startTime).toBe(9000 * 10);
      expect(sl2.segmentUrls[1].duration).toBe(9000 * 10);

      expect(sl2.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl2.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/7-540000-500000-media.mp4');
      expect(sl2.segmentUrls[2].mediaRange).toBeNull();
      expect(sl2.segmentUrls[2].startTime).toBe(9000 * 20);
      expect(sl2.segmentUrls[2].duration).toBe(9000 * 10);
    });

    it('creates SegmentList from segment duration with AST', function() {
      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = 9000 * 10;
      st.startNumber = 5;  // Ensure startNumber > 1 works.
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      var currentTime = Date.now() / 1000.0;
      m.availabilityStartTime = currentTime - (60 * 60);
      m.minUpdatePeriod = 30;
      m.suggestedPresentationDelay = 0;

      processor.processSegmentTemplates_(m);

      var scaledSegmentDuration = st.segmentDuration / st.timescale;

      // This is a specific implementation detail, see MpdProcessor.
      var extraPresentationDelay = 5;

      // Note that @timeShiftBufferDepth and @minBufferTime are both zero.
      var lastSegmentNumber =
          Math.floor((currentTime -
                      m.availabilityStartTime -
                      scaledSegmentDuration -
                      extraPresentationDelay) /
                     scaledSegmentDuration) + 1;

      // At least @minimumUpdatePeriod worth of segments should be generated.
      var expectedNumSegments =
          Math.floor((m.minUpdatePeriod) / scaledSegmentDuration);

      // Check |r1|.
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.segmentUrls.length).toBeGreaterThan(expectedNumSegments - 1);

      for (var i = 0; i < expectedNumSegments; ++i) {
        var expectedNumberReplacement =
            (lastSegmentNumber + i - 1) + st.startNumber;
        var expectedTimeReplacement =
            ((lastSegmentNumber + i - 1) + (st.startNumber - 1)) *
            st.segmentDuration;
        var expectedUrl = 'http://example.com/' +
            expectedNumberReplacement + '-' +
            expectedTimeReplacement + '-250000-media.mp4';

        var expectedSegmentNumber = lastSegmentNumber + i;
        var expectedStartTime =
            (lastSegmentNumber + i - 1) * st.segmentDuration;

        expect(sl1.segmentUrls[i].mediaUrl).toBeTruthy();
        expect(sl1.segmentUrls[i].mediaUrl.toString()).toBe(expectedUrl);
        expect(sl1.segmentUrls[i].mediaRange).toBeNull();
        expect(sl1.segmentUrls[i].segmentNumber).toBe(expectedSegmentNumber);
        expect(sl1.segmentUrls[i].startTime).toBe(expectedStartTime);
        expect(sl1.segmentUrls[i].duration).toBe(9000 * 10);
      }
    });

    it('handles gaps within SegmentTimeline', function() {
      var tp1 = new mpd.SegmentTimePoint();
      tp1.startTime = 10;
      tp1.duration = 10;

      var tp2 = new mpd.SegmentTimePoint();
      tp2.startTime = 21;
      tp2.duration = 10;

      var tp3 = new mpd.SegmentTimePoint();
      tp3.startTime = 32;
      tp3.duration = 10;

      var timeline = new mpd.SegmentTimeline();
      timeline.timePoints.push(tp1);
      timeline.timePoints.push(tp2);
      timeline.timePoints.push(tp3);

      st.timescale = 1;
      st.presentationTimeOffset = 0;
      st.segmentDuration = null;
      st.startNumber = 1;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';

      st.timeline = timeline;

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      processor.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.segmentUrls.length).toBe(3);

      expect(sl1.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/1-10-250000-media.mp4');
      expect(sl1.segmentUrls[0].startTime).toBe(10);
      // Duration should stretch to the beginning of the next segment.
      expect(sl1.segmentUrls[0].duration).toBe(11);

      expect(sl1.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/2-21-250000-media.mp4');
      expect(sl1.segmentUrls[1].startTime).toBe(21);
      // Duration should stretch to the beginning of the next segment.
      expect(sl1.segmentUrls[1].duration).toBe(11);

      expect(sl1.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/3-32-250000-media.mp4');
      expect(sl1.segmentUrls[2].startTime).toBe(32);
      expect(sl1.segmentUrls[2].duration).toBe(10);
    });

    it('handles overlaps within SegmentTimeline', function() {
      var tp1 = new mpd.SegmentTimePoint();
      tp1.startTime = 10;
      tp1.duration = 11;

      var tp2 = new mpd.SegmentTimePoint();
      tp2.startTime = 20;
      tp2.duration = 10;

      var tp3 = new mpd.SegmentTimePoint();
      tp3.startTime = 29;
      tp3.duration = 10;

      var timeline = new mpd.SegmentTimeline();
      timeline.timePoints.push(tp1);
      timeline.timePoints.push(tp2);
      timeline.timePoints.push(tp3);

      st.timescale = 1;
      st.presentationTimeOffset = 0;
      st.segmentDuration = null;
      st.startNumber = 1;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';

      st.timeline = timeline;

      r1.bandwidth = 250000;
      r1.baseUrl = new goog.Uri('http://example.com/');

      processor.processSegmentTemplates_(m);

      // Check |r1|.
      expect(r1.segmentList).toBeTruthy();

      var sl1 = r1.segmentList;
      expect(sl1.segmentUrls.length).toBe(3);

      expect(sl1.segmentUrls[0].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[0].mediaUrl.toString())
          .toBe('http://example.com/1-10-250000-media.mp4');
      expect(sl1.segmentUrls[0].startTime).toBe(10);
      // Duration should compress to the beginning of the next segment.
      expect(sl1.segmentUrls[0].duration).toBe(10);

      expect(sl1.segmentUrls[1].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[1].mediaUrl.toString())
          .toBe('http://example.com/2-20-250000-media.mp4');
      expect(sl1.segmentUrls[1].startTime).toBe(20);
      // Duration should compress to the beginning of the next segment.
      expect(sl1.segmentUrls[1].duration).toBe(9);

      expect(sl1.segmentUrls[2].mediaUrl).toBeTruthy();
      expect(sl1.segmentUrls[2].mediaUrl.toString())
          .toBe('http://example.com/3-29-250000-media.mp4');
      expect(sl1.segmentUrls[2].startTime).toBe(29);
      expect(sl1.segmentUrls[2].duration).toBe(10);
    });
  });

  describe('fillUrlTemplate_', function() {
    it('handles a single RepresentationID identifier', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$RepresentationID$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      // RepresentationID cannot use a width specifier.
      expect(
          processor.fillUrlTemplate_(
              '/example/$RepresentationID%01d$.mp4',
              100, null, null, null).toString()).toBe('/example/100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$RepresentationID$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$RepresentationID$.mp4');
    });

    it('handles a single Number identifier', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$Number$.mp4',
              null, 100, null, null).toString()).toBe('/example/100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Number%05d$.mp4',
              null, 100, null, null).toString()).toBe('/example/00100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Number$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Number$.mp4');
    });

    it('handles a single Bandwidth identifier', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$Bandwidth$.mp4',
              null, null, 100, null).toString()).toBe('/example/100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Bandwidth%05d$.mp4',
              null, null, 100, null).toString()).toBe('/example/00100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Bandwidth$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Bandwidth$.mp4');
    });

    it('handles a single Time identifier', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$Time$.mp4',
              null, null, null, 100).toString()).toBe('/example/100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Time%05d$.mp4',
              null, null, null, 100).toString()).toBe('/example/00100.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Time$.mp4',
              null, null, null, null).toString())
                  .toBe('/example/$Time$.mp4');
    });

    it('handles multiple identifiers', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$RepresentationID$_$Number$_$Bandwidth$_$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1_2_3_4.mp4');

      // No spaces.
      expect(
          processor.fillUrlTemplate_(
              '/example/$RepresentationID$$Number$$Bandwidth$$Time$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/1234.mp4');

      // Different order.
      expect(
          processor.fillUrlTemplate_(
              '/example/$Bandwidth$_$Time$_$RepresentationID$_$Number$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/3_4_1_2.mp4');

      // Single width.
      expect(
          processor.fillUrlTemplate_(
              '$RepresentationID$_$Number%01d$_$Bandwidth%01d$_$Time%01d$',
              1, 2, 3, 400).toString()).toBe('1_2_3_400');

      // Different widths.
      expect(
          processor.fillUrlTemplate_(
              '$RepresentationID$_$Number%02d$_$Bandwidth%02d$_$Time%02d$',
              1, 2, 3, 4).toString()).toBe('1_02_03_04');

      // Double $$.
      expect(
          processor.fillUrlTemplate_(
              '$$/$RepresentationID$$$$Number$$$$Bandwidth$$$$Time$$$.$$',
              1, 2, 3, 4).toString()).toBe('$/1$2$3$4$.$');
    });

    it('handles invalid identifiers', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$Garbage$.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Garbage$.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$RepresentationID%$',
              1, 2, 3, 4)).toBeNull();
    });

    it('handles partial identifiers', function() {
      expect(
          processor.fillUrlTemplate_(
              '/example/$Time.mp4',
              1, 2, 3, 4).toString()).toBe('/example/$Time.mp4');

      expect(
          processor.fillUrlTemplate_(
              '/example/$Time%.mp4',
              1, 2, 3, 4)).toBeNull();
    });
  });

  describe('process', function() {
    var m;
    var p;
    var as;
    var r;
    var st;

    var originalIsTypeSupported;

    beforeAll(function() {
      // For the purposes of these tests, we will avoid querying the browser's
      // format and codec support and pretend we support everything.  This way,
      // we will do all processing other than removal of unsupported formats.
      originalIsTypeSupported = shaka.player.Player.isTypeSupported;
      shaka.player.Player.isTypeSupported = function() { return true; };
    });

    afterAll(function() {
      // Restore isTypeSupported.
      shaka.player.Player.isTypeSupported = originalIsTypeSupported;
    });

    beforeEach(function() {
      m = new mpd.Mpd();
      p = new mpd.Period();
      as = new mpd.AdaptationSet();
      r = new mpd.Representation();
      st = new mpd.SegmentTemplate();

      r.segmentTemplate = st;
      r.bandwidth = 250000;
      r.baseUrl = new goog.Uri('http://example.com');

      as.representations.push(r);

      p.adaptationSets.push(as);

      m.periods.push(p);
    });

    it('generates a SegmentList with MPD and segment durations', function() {
      st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
      st.timescale = 9000;
      st.segmentDuration = 90000;

      p.start = 0;
      m.mediaPresentationDuration = 100;

      processor.process(m);

      expect(r.segmentList).not.toBe(null);
      // The representation has not been removed as invalid.
      expect(as.representations.length).toBe(1);
    });

    it('generates a SegmentList with period and segment durations', function() {
      st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
      st.timescale = 9000;
      st.segmentDuration = 90000;

      p.start = 0;
      p.duration = 100;

      processor.process(m);

      expect(r.segmentList).not.toBe(null);
      // The representation has not been removed as invalid.
      expect(as.representations.length).toBe(1);
    });

    it('derives period duration from MPD', function() {
      st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
      st.segmentDuration = 90000;

      p.start = 0;
      m.mediaPresentationDuration = 100;

      processor.process(m);

      expect(p.duration).toBe(100);
    });

    it('derives period start from MPD type', function() {
      st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
      st.segmentDuration = 90000;

      m.mediaPresentationDuration = 100;
      m.type = 'static';

      processor.process(m);

      // Period start has been derived.
      expect(p.start).not.toBe(null);
    });
  });
});

