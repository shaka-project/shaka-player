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
goog.require('shaka.util.Clock');

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

  describe('buildStreamInfoFrom*', function() {
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

    it('SegmentBase', function() {
      st.mediaUrlTemplate = 'http://example.com/$Bandwidth$-media.mp4';
      st.indexUrlTemplate = 'http://example.com/$Bandwidth$-index.sidx';
      st.initializationUrlTemplate = 'http://example.com/$Bandwidth$-init.mp4';

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      r2.baseUrl = new goog.Uri('http://example.com/');
      r2.bandwidth = 500000;

      processor.createManifestInfo_(m);

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      expect(si1.bandwidth).toBe(250000);

      expect(si1.mediaUrl).toBeTruthy();
      expect(si1.mediaUrl.toString())
          .toBe('http://example.com/250000-media.mp4');

      var indexInfo1 = si1.segmentIndexInfo;
      expect(indexInfo1).toBeTruthy();
      expect(indexInfo1.url).toBeTruthy();
      expect(indexInfo1.url.toString())
          .toBe('http://example.com/250000-index.sidx');
      expect(indexInfo1.startByte).toBe(0);
      expect(indexInfo1.endByte).toBeNull();

      var initInfo1 = si1.segmentInitializationInfo;
      expect(initInfo1.url).toBeTruthy();
      expect(initInfo1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initInfo1.startByte).toBe(0);
      expect(initInfo1.endByte).toBeNull();

      // Check the second StreamInfo.
      var si2 = periodInfo.streamSetInfos[0].streamInfos[1];
      expect(si2).toBeTruthy();

      expect(si2.bandwidth).toBe(500000);

      expect(si2.mediaUrl).toBeTruthy();
      expect(si2.mediaUrl.toString())
          .toBe('http://example.com/500000-media.mp4');

      var indexInfo2 = si2.segmentIndexInfo;
      expect(indexInfo2).toBeTruthy();
      expect(indexInfo2.url).toBeTruthy();
      expect(indexInfo2.url.toString())
          .toBe('http://example.com/500000-index.sidx');
      expect(indexInfo2.startByte).toBe(0);
      expect(indexInfo2.endByte).toBeNull();

      var initInfo2 = si2.segmentInitializationInfo;
      expect(initInfo2.url).toBeTruthy();
      expect(initInfo2.url.toString())
          .toBe('http://example.com/500000-init.mp4');
      expect(initInfo2.startByte).toBe(0);
      expect(initInfo2.endByte).toBeNull();
    });

    it('SegmentTimeline w/o start times', function() {
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

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      r2.baseUrl = new goog.Uri('http://example.com/');
      r2.bandwidth = 500000;

      processor.createManifestInfo_(m);

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var initInfo1 = si1.segmentInitializationInfo;
      expect(initInfo1).toBeTruthy();
      expect(initInfo1.url).toBeTruthy();
      expect(initInfo1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initInfo1.startByte).toBe(0);
      expect(initInfo1.endByte).toBe(null);

      var references1 = si1.segmentIndex.references_;
      expect(references1).toBeTruthy();
      expect(references1.length).toBe(3);

      checkReference(
          references1[0],
          'http://example.com/1-0-250000-media.mp4',
          0, 10);

      checkReference(
          references1[1],
          'http://example.com/2-90000-250000-media.mp4',
          10, 20);

      checkReference(
          references1[2],
          'http://example.com/3-180000-250000-media.mp4',
          20, 40);

      // Check the second StreamInfo.
      var si2 = periodInfo.streamSetInfos[0].streamInfos[1];
      expect(si2).toBeTruthy();

      var initInfo2 = si2.segmentInitializationInfo;
      expect(initInfo2).toBeTruthy();
      expect(initInfo2.url).toBeTruthy();
      expect(initInfo2.url.toString())
          .toBe('http://example.com/500000-init.mp4');
      expect(initInfo2.startByte).toBe(0);
      expect(initInfo2.endByte).toBe(null);

      var references2 = si2.segmentIndex.references_;
      expect(references2).toBeTruthy();
      expect(references2.length).toBe(3);

      checkReference(
          references2[0],
          'http://example.com/1-0-500000-media.mp4',
          0, 10);

      checkReference(
          references2[1],
          'http://example.com/2-90000-500000-media.mp4',
          10, 20);

      checkReference(
          references2[2],
          'http://example.com/3-180000-500000-media.mp4',
          20, 40);
    });

    it('SegmentTimeline w/ start times', function() {
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

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      processor.createManifestInfo_(m);

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var initInfo1 = si1.segmentInitializationInfo;
      expect(initInfo1).toBeTruthy();
      expect(initInfo1.url).toBeTruthy();
      expect(initInfo1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initInfo1.startByte).toBe(0);
      expect(initInfo1.endByte).toBe(null);

      var references1 = si1.segmentIndex.references_;
      expect(references1).toBeTruthy();
      expect(references1.length).toBe(3);

      checkReference(
          references1[0],
          'http://example.com/10-900000-250000-media.mp4',
          100, 110);

      checkReference(
          references1[1],
          'http://example.com/11-990000-250000-media.mp4',
          110, 120);

      checkReference(
          references1[2],
          'http://example.com/12-1080000-250000-media.mp4',
          120, 140);
    });

    it('segment duration w/o AST', function() {
      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = 9000 * 10;
      st.startNumber = 5;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      r2.baseUrl = new goog.Uri('http://example.com/');
      r2.bandwidth = 500000;

      // If the MPD is static and uses segment duration then there must be
      // an explicit Period duration.
      p.duration = 30;

      processor.createManifestInfo_(m);

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var initInfo1 = si1.segmentInitializationInfo;
      expect(initInfo1).toBeTruthy();
      expect(initInfo1.url).toBeTruthy();
      expect(initInfo1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initInfo1.startByte).toBe(0);
      expect(initInfo1.endByte).toBe(null);

      var references1 = si1.segmentIndex.references_;
      expect(references1).toBeTruthy();
      expect(references1.length).toBe(3);

      checkReference(
          references1[0],
          'http://example.com/5-360000-250000-media.mp4',
          0, 10);

      checkReference(
          references1[1],
          'http://example.com/6-450000-250000-media.mp4',
          10, 20);

      checkReference(
          references1[2],
          'http://example.com/7-540000-250000-media.mp4',
          20, 30);

      // Check the second StreamInfo.
      var si2 = periodInfo.streamSetInfos[0].streamInfos[1];
      expect(si2).toBeTruthy();

      var initInfo2 = si2.segmentInitializationInfo;
      expect(initInfo2).toBeTruthy();
      expect(initInfo2.url).toBeTruthy();
      expect(initInfo2.url.toString())
          .toBe('http://example.com/500000-init.mp4');
      expect(initInfo2.startByte).toBe(0);
      expect(initInfo2.endByte).toBe(null);

      var references2 = si2.segmentIndex.references_;
      expect(references2).toBeTruthy();
      expect(references2.length).toBe(3);

      checkReference(
          references2[0],
          'http://example.com/5-360000-500000-media.mp4',
          0, 10);

      checkReference(
          references2[1],
          'http://example.com/6-450000-500000-media.mp4',
          10, 20);

      checkReference(
          references2[2],
          'http://example.com/7-540000-500000-media.mp4',
          20, 30);
    });

    it('segment duration w/ AST', function() {
      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = 9000 * 10;
      st.startNumber = 5;  // Ensure startNumber > 1 works.
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      // Hijack shaka.util.Clock.now()
      var originalNow = shaka.util.Clock.now;
      var theTime = originalNow();
      shaka.util.Clock.now = function() {
        return theTime;
      };

      var secondsSinceStart = 60 * 60;

      m.availabilityStartTime = (theTime / 1000.0) - secondsSinceStart;
      m.suggestedPresentationDelay = 0;
      m.timeShiftBufferDepth = 0;
      m.minBufferTime = 0;

      // Set @minUpdatePeriod so that the MPD is treated as dynamic.
      m.minUpdatePeriod = 30;

      processor.createManifestInfo_(m);

      // Replace fake now().
      shaka.util.Clock.now = originalNow;

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      var scaledSegmentDuration = st.segmentDuration / st.timescale;

      // The fist segment is the earliest available one. Note that
      // @timeShiftBufferDepth is 0.
      var firstSegmentNumber =
          Math.floor((secondsSinceStart - (2 * scaledSegmentDuration)) /
                     scaledSegmentDuration) + 1;

      // At least @minimumUpdatePeriod worth of segments should be generated.
      var expectedNumSegments =
          Math.floor(m.minUpdatePeriod / scaledSegmentDuration);

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var references = si1.segmentIndex.references_;
      expect(references).toBeTruthy();
      expect(references.length).toBeGreaterThan(expectedNumSegments - 1);

      for (var segmentNumber = firstSegmentNumber;
           segmentNumber - firstSegmentNumber < expectedNumSegments;
           ++segmentNumber) {
        var expectedNumberReplacement =
            (segmentNumber - 1) + st.startNumber;
        var expectedTimeReplacement =
            ((segmentNumber - 1) + (st.startNumber - 1)) *
            st.segmentDuration;
        var expectedUrl = 'http://example.com/' +
            expectedNumberReplacement + '-' +
            expectedTimeReplacement + '-250000-media.mp4';

        var expectedStartTime =
            (segmentNumber - 1) * st.segmentDuration;
        var expectedScaledStartTime = expectedStartTime / st.timescale;

        checkReference(
            references[segmentNumber - firstSegmentNumber],
            expectedUrl,
            expectedScaledStartTime, expectedScaledStartTime + 10);
      }

      // Check |currentSegmentStartTime|.
      var currentSegmentNumber =
          Math.floor((secondsSinceStart - scaledSegmentDuration) /
                     scaledSegmentDuration) + 1;
      expect(si1.currentSegmentStartTime).toBe(
          (currentSegmentNumber - 1) * scaledSegmentDuration);
    });

    it('SegmentTimeline w/ gaps', function() {
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

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      processor.createManifestInfo_(m);

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var references = si1.segmentIndex.references_;
      expect(references).toBeTruthy();
      expect(references.length).toBe(3);

      // Duration should stretch to the beginning of the next segment.
      checkReference(
          references[0],
          'http://example.com/1-10-250000-media.mp4',
          10, 21);

      // Duration should stretch to the beginning of the next segment.
      checkReference(
          references[1],
          'http://example.com/2-21-250000-media.mp4',
          21, 32);

      checkReference(
          references[2],
          'http://example.com/3-32-250000-media.mp4',
          32, 42);
    });

    it('SegmentTimeline w/ overlaps', function() {
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

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      processor.createManifestInfo_(m);

      var periodInfo = processor.manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var references = si1.segmentIndex.references_;
      expect(references).toBeTruthy();
      expect(references.length).toBe(3);

      // Duration should compress to the beginning of the next segment.
      checkReference(
          references[0],
          'http://example.com/1-10-250000-media.mp4',
          10, 20);

      // Duration should compress to the beginning of the next segment.
      checkReference(
          references[1],
          'http://example.com/2-20-250000-media.mp4',
          20, 29);

      checkReference(
          references[2],
          'http://example.com/3-29-250000-media.mp4',
          29, 39);
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

    describe('SegmentTemplate', function() {
      var m;
      var p;
      var as;
      var r;
      var st;

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

      it('allows MPD and segment duration', function() {
        st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
        st.timescale = 9000;
        st.segmentDuration = 90000;

        p.start = 0;
        m.mediaPresentationDuration = 100;

        processor.process(m);

        var periodInfo = processor.manifestInfo.periodInfos[0];
        var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
        var references = si1.segmentIndex.references_;
        expect(references.length).toBe(10);
      });

      it('allows Period and segment duration', function() {
        st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
        st.timescale = 9000;
        st.segmentDuration = 90000;

        p.start = 0;
        p.duration = 100;

        processor.process(m);

        var periodInfo = processor.manifestInfo.periodInfos[0];
        var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
        var references = si1.segmentIndex.references_;
        expect(references.length).toBe(10);
      });

      it('derives period duration from MPD', function() {
        st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
        st.timescale = 9000;
        st.segmentDuration = 90000;

        p.start = 0;
        m.mediaPresentationDuration = 100;

        processor.process(m);

        expect(p.duration).toBe(100);
      });
    });  // describe SegmentTemplate

    describe('SegmentList', function() {
      var m;
      var p;
      var as;
      var r;
      var sl;

      beforeEach(function() {
        m = new mpd.Mpd();
        p = new mpd.Period();
        as = new mpd.AdaptationSet();
        r = new mpd.Representation();
        sl = new mpd.SegmentList();

        r.segmentList = sl;
        r.bandwidth = 250000;
        r.baseUrl = new goog.Uri('http://example.com');

        as.representations.push(r);
        p.adaptationSets.push(as);
        m.periods.push(p);
      });

      it('allows no segment duration with one segment', function() {
        sl.timescale = 9000;

        // Add just one SegmentUrl.
        var segmentUrl = new shaka.dash.mpd.SegmentUrl();
        segmentUrl.mediaUrl = 'http://example.com/video.mp4';
        sl.segmentUrls.push(segmentUrl);

        p.start = 0;

        processor.process(m);

        var periodInfo = processor.manifestInfo.periodInfos[0];
        var si1 = periodInfo.streamSetInfos[0].streamInfos[0];

        var references = si1.segmentIndex.references_;
        expect(references.length).toBe(1);

        checkReference(
            references[0],
            'http://example.com/video.mp4',
            0, null);
      });

      it('disallows no segment duration with multiple segments', function() {
        sl.timescale = 9000;

        // Add two SegmentUrls, which isn't allowed.
        var segmentUrl1 = new shaka.dash.mpd.SegmentUrl();
        segmentUrl1.mediaUrl = 'http://example.com/video-1.mp4';

        var segmentUrl2 = new shaka.dash.mpd.SegmentUrl();
        segmentUrl2.mediaUrl = 'http://example.com/video-2.mp4';

        sl.segmentUrls.push(segmentUrl1);
        sl.segmentUrls.push(segmentUrl2);

        p.start = 0;

        processor.process(m);

        var periodInfo = processor.manifestInfo.periodInfos[0];
        expect(periodInfo.streamSetInfos[0].streamInfos.length).toBe(0);
      });
    });  // describe SegmentList

    describe('SegmentBase', function() {
      var m;
      var p;
      var as;
      var r;
      var sb;

      beforeEach(function() {
        m = new mpd.Mpd();
        p = new mpd.Period();
        as = new mpd.AdaptationSet();
        r = new mpd.Representation();
        sb = new mpd.SegmentBase();

        r.segmentBase = sb;
        r.bandwidth = 250000;
        r.baseUrl = new goog.Uri('http://example.com');

        as.representations.push(r);
        p.adaptationSets.push(as);
        m.periods.push(p);
      });

      it('disallows no segment metadata', function() {
        p.start = 0;

        processor.process(m);

        var periodInfo = processor.manifestInfo.periodInfos[0];
        expect(periodInfo.streamSetInfos[0].streamInfos.length).toBe(0);
      });

      it('disallows no base URL', function() {
        r.baseUrl = null;
        p.start = 0;

        processor.process(m);

        var periodInfo = processor.manifestInfo.periodInfos[0];
        expect(periodInfo.streamSetInfos[0].streamInfos.length).toBe(0);
      });
    });  // describe SegmentBase
  });  // describe process
});

