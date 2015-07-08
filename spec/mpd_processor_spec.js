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
  });  // describe validateSegmentInfo_

  describe('createStreamInfoFromSegmentTemplate_', function() {
    var m;
    var p;
    var as;
    var r1;
    var r2;
    var st;
    var manifestInfo;

    beforeEach(function() {
      m = new mpd.Mpd();
      p = new mpd.Period();
      as = new mpd.AdaptationSet();
      r1 = new mpd.Representation();
      r2 = new mpd.Representation();
      st = new mpd.SegmentTemplate();

      r1.segmentTemplate = st;
      r2.segmentTemplate = st;

      as.group = 1;
      as.segmentTemplate = st;
      as.representations.push(r1);
      as.representations.push(r2);

      p.start = 0;
      p.adaptationSets.push(as);

      m.periods.push(p);
    });

    afterEach(function() {
      if (manifestInfo) {
        manifestInfo.destroy();
        manifestInfo = null;
      }
    });

    it('index URL template', function() {
      st.mediaUrlTemplate = 'http://example.com/$Bandwidth$-media.mp4';
      st.indexUrlTemplate = 'http://example.com/$Bandwidth$-index.sidx';
      st.initializationUrlTemplate = 'http://example.com/$Bandwidth$-init.mp4';

      r1.baseUrl = new goog.Uri('http://example.com/');
      r1.bandwidth = 250000;
      r1.mimeType = 'video/mp4';

      r2.baseUrl = new goog.Uri('http://example.com/');
      r2.bandwidth = 500000;
      r2.mimeType = 'video/mp4';

      manifestInfo = processor.createManifestInfo_(m, 1000);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      expect(si1.bandwidth).toBe(250000);

      var indexMetadata1 = si1.segmentIndexSource.indexMetadata_;
      expect(indexMetadata1).toBeTruthy();
      expect(indexMetadata1.url).toBeTruthy();
      expect(indexMetadata1.url.toString())
          .toBe('http://example.com/250000-index.sidx');
      expect(indexMetadata1.startByte).toBe(0);
      expect(indexMetadata1.endByte).toBeNull();

      var initMetadata1 = si1.segmentInitSource.metadata_;
      expect(initMetadata1.url).toBeTruthy();
      expect(initMetadata1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initMetadata1.startByte).toBe(0);
      expect(initMetadata1.endByte).toBeNull();

      // Check the second StreamInfo.
      var si2 = periodInfo.streamSetInfos[0].streamInfos[1];
      expect(si2).toBeTruthy();

      expect(si2.bandwidth).toBe(500000);

      var indexMetadata2 = si2.segmentIndexSource.indexMetadata_;
      expect(indexMetadata2).toBeTruthy();
      expect(indexMetadata2.url).toBeTruthy();
      expect(indexMetadata2.url.toString())
          .toBe('http://example.com/500000-index.sidx');
      expect(indexMetadata2.startByte).toBe(0);
      expect(indexMetadata2.endByte).toBeNull();

      var initMetadata2 = si2.segmentInitSource.metadata_;
      expect(initMetadata2.url).toBeTruthy();
      expect(initMetadata2.url.toString())
          .toBe('http://example.com/500000-init.mp4');
      expect(initMetadata2.startByte).toBe(0);
      expect(initMetadata2.endByte).toBeNull();
    });

    it('SegmentTimeline w/o start times', function(done) {
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

      manifestInfo = processor.createManifestInfo_(m, 1000);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var initMetadata1 = si1.segmentInitSource.metadata_;
      expect(initMetadata1).toBeTruthy();
      expect(initMetadata1.url).toBeTruthy();
      expect(initMetadata1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initMetadata1.startByte).toBe(0);
      expect(initMetadata1.endByte).toBe(null);

      si1.segmentIndexSource.create().then(function(segmentIndex1) {
        var references1 = segmentIndex1.references;
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

        var initMetadata2 = si2.segmentInitSource.metadata_;
        expect(initMetadata2).toBeTruthy();
        expect(initMetadata2.url).toBeTruthy();
        expect(initMetadata2.url.toString())
            .toBe('http://example.com/500000-init.mp4');
        expect(initMetadata2.startByte).toBe(0);
        expect(initMetadata2.endByte).toBe(null);

        return si2.segmentIndexSource.create();
      }).then(function(segmentIndex2) {
        var references2 = segmentIndex2.references;
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

        done();
      });
    });

    it('SegmentTimeline w/ start times', function(done) {
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

      manifestInfo = processor.createManifestInfo_(m, 1000);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var initMetadata1 = si1.segmentInitSource.metadata_;
      expect(initMetadata1).toBeTruthy();
      expect(initMetadata1.url).toBeTruthy();
      expect(initMetadata1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initMetadata1.startByte).toBe(0);
      expect(initMetadata1.endByte).toBe(null);

      si1.segmentIndexSource.create().then(function(segmentIndex1) {
        var references1 = segmentIndex1.references;
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

        done();
      });
    });

    it('segment duration w/o AST', function(done) {
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

      manifestInfo = processor.createManifestInfo_(m, 1000);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      var initMetadata1 = si1.segmentInitSource.metadata_;
      expect(initMetadata1).toBeTruthy();
      expect(initMetadata1.url).toBeTruthy();
      expect(initMetadata1.url.toString())
          .toBe('http://example.com/250000-init.mp4');
      expect(initMetadata1.startByte).toBe(0);
      expect(initMetadata1.endByte).toBe(null);

      si1.segmentIndexSource.create().then(function(segmentIndex1) {
        var references1 = segmentIndex1.references;
        expect(references1).toBeTruthy();
        expect(references1.length).toBe(3);

        checkReference(
            references1[0],
            'http://example.com/5-0-250000-media.mp4',
            0, 10);

        checkReference(
            references1[1],
            'http://example.com/6-90000-250000-media.mp4',
            10, 20);

        checkReference(
            references1[2],
            'http://example.com/7-180000-250000-media.mp4',
            20, 30);

        // Check the second StreamInfo.
        var si2 = periodInfo.streamSetInfos[0].streamInfos[1];
        expect(si2).toBeTruthy();

        var initMetadata2 = si2.segmentInitSource.metadata_;
        expect(initMetadata2).toBeTruthy();
        expect(initMetadata2.url).toBeTruthy();
        expect(initMetadata2.url.toString())
            .toBe('http://example.com/500000-init.mp4');
        expect(initMetadata2.startByte).toBe(0);
        expect(initMetadata2.endByte).toBe(null);

        return si2.segmentIndexSource.create();
      }).then(function(segmentIndex2) {
        var references2 = segmentIndex2.references;
        expect(references2).toBeTruthy();
        expect(references2.length).toBe(3);

        checkReference(
            references2[0],
            'http://example.com/5-0-500000-media.mp4',
            0, 10);

        checkReference(
            references2[1],
            'http://example.com/6-90000-500000-media.mp4',
            10, 20);

        checkReference(
            references2[2],
            'http://example.com/7-180000-500000-media.mp4',
            20, 30);

        done();
      });
    });

    it('segment duration w/ AST', function(done) {
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
      var manifestCreationTime = Math.round(originalNow() / 1000.0);
      shaka.util.Clock.now = function() {
        return 1000.0 * manifestCreationTime;
      };

      var secondsSinceStart = 60 * 60;

      m.type = 'dynamic';
      m.availabilityStartTime = manifestCreationTime - secondsSinceStart;
      m.suggestedPresentationDelay =
          shaka.dash.mpd.DEFAULT_SUGGESTED_PRESENTATION_DELAY_;
      m.timeShiftBufferDepth = 60;
      m.minBufferTime = 0;

      manifestInfo = processor.createManifestInfo_(m, manifestCreationTime);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      var scaledSegmentDuration = st.segmentDuration / st.timescale;

      // The first segment is the earliest available one.
      var earliestSegmentNumber =
          Math.ceil((secondsSinceStart -
                     (2 * scaledSegmentDuration) -
                     m.timeShiftBufferDepth) / scaledSegmentDuration) + 1;

      var latestAvailableTimestamp = secondsSinceStart - scaledSegmentDuration;
      var latestAvailableSegmentStartTime =
          Math.floor(latestAvailableTimestamp / scaledSegmentDuration) *
          scaledSegmentDuration;
      var currentSegmentNumber =
          Math.floor((latestAvailableSegmentStartTime -
                      m.suggestedPresentationDelay) /
                     scaledSegmentDuration) + 1;

      var expectedNumSegments =
          currentSegmentNumber - earliestSegmentNumber + 1;

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      si1.segmentIndexSource.create().then(function(segmentIndex) {
        var references = segmentIndex.references;
        expect(references).toBeTruthy();
        expect(references.length).toBe(expectedNumSegments);

        for (var segmentNumber = earliestSegmentNumber;
             segmentNumber - earliestSegmentNumber < expectedNumSegments;
             ++segmentNumber) {
          var expectedNumberReplacement = (segmentNumber - 1) + st.startNumber;
          var expectedTimeReplacement =
              (segmentNumber - 1) * st.segmentDuration;
          var expectedUrl = 'http://example.com/' +
              expectedNumberReplacement + '-' +
              expectedTimeReplacement + '-250000-media.mp4';

          var expectedStartTime = (segmentNumber - 1) * st.segmentDuration;
          var expectedScaledStartTime = expectedStartTime / st.timescale;

          checkReference(
              references[segmentNumber - earliestSegmentNumber],
              expectedUrl,
              expectedScaledStartTime, expectedScaledStartTime + 10);
        }

        // Replace fake now().
        shaka.util.Clock.now = originalNow;

        done();
      });
    });

    it('SegmentTimeline w/ gaps', function(done) {
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

      manifestInfo = processor.createManifestInfo_(m, 1000);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      si1.segmentIndexSource.create().then(function(segmentIndex) {
        var references = segmentIndex.references;
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

        done();
      });
    });

    it('SegmentTimeline w/ overlaps', function(done) {
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

      manifestInfo = processor.createManifestInfo_(m, 1000);

      var periodInfo = manifestInfo.periodInfos[0];
      expect(periodInfo).toBeTruthy();

      // Check the first StreamInfo.
      var si1 = periodInfo.streamSetInfos[0].streamInfos[0];
      expect(si1).toBeTruthy();

      si1.segmentIndexSource.create().then(function(segmentIndex) {
        var references = segmentIndex.references;
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

        done();
      });
    });
  });  // describe createStreamInfoFromSegmentTemplate_

  describe('process', function() {
    var originalIsTypeSupported;
    var manifestInfo;

    beforeAll(function() {
      // For the purposes of these tests, we will avoid querying the browser's
      // format and codec support and pretend we support everything.  This way,
      // we will do all processing other than removal of unsupported formats.
      originalIsTypeSupported = shaka.player.Player.isTypeSupported;
      shaka.player.Player.isTypeSupported = function() { return true; };
    });

    afterEach(function() {
      if (manifestInfo) {
        manifestInfo.destroy();
        manifestInfo = null;
      }
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
        r.baseUrl = new goog.Uri('http://example.com');
        r.bandwidth = 250000;
        r.mimeType = 'video/mp4';

        as.group = 1;
        as.representations.push(r);

        p.adaptationSets.push(as);
        m.periods.push(p);
        m.url = new goog.Uri('http://example.com/mpd');
      });

      it('allows MPD and segment duration', function(done) {
        st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
        st.timescale = 9000;
        st.segmentDuration = 90000;

        p.start = 0;
        m.mediaPresentationDuration = 100;

        manifestInfo = processor.process(m);

        var periodInfo = manifestInfo.periodInfos[0];
        var si1 = periodInfo.streamSetInfos[0].streamInfos[0];

        si1.segmentIndexSource.create().then(function(segmentIndex) {
          var references = segmentIndex.references;
          expect(references.length).toBe(10);
          done();
        });
      });

      it('allows Period and segment duration', function(done) {
        st.mediaUrlTemplate = '$Number$-$Bandwidth$-media.mp4';
        st.timescale = 9000;
        st.segmentDuration = 90000;

        p.start = 0;
        p.duration = 100;

        manifestInfo = processor.process(m);

        var periodInfo = manifestInfo.periodInfos[0];
        var si1 = periodInfo.streamSetInfos[0].streamInfos[0];

        si1.segmentIndexSource.create().then(function(segmentIndex) {
          var references = segmentIndex.references;
          expect(references.length).toBe(10);
          done();
        });
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

      // Live content is not dependent on using SegmentTemplate but it is the
      // most common use case.
      it('creates live manifest w/ Location element', function() {
        m.type = 'dynamic';
        m.minUpdatePeriod = 10;
        m.updateLocation = new goog.Uri('http://example.com/updated_mpd');

        manifestInfo = processor.process(m);

        expect(manifestInfo.live).toBe(true);
        expect(manifestInfo.updatePeriod).toBe(10);
        expect(manifestInfo.updateUrl.toString()).toBe(
            'http://example.com/updated_mpd');
      });

      it('creates live manifest w/o Location element', function() {
        m.type = 'dynamic';
        m.minUpdatePeriod = 10;

        manifestInfo = processor.process(m);

        expect(manifestInfo.live).toBe(true);
        expect(manifestInfo.updatePeriod).toBe(10);
        expect(manifestInfo.updateUrl.toString()).toBe(
            'http://example.com/mpd');
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

        p.duration = 100;

        r.segmentList = sl;
        r.baseUrl = new goog.Uri('http://example.com');
        r.bandwidth = 250000;
        r.mimeType = 'video/mp4';

        as.group = 1;
        as.representations.push(r);

        p.adaptationSets.push(as);
        m.periods.push(p);
      });

      it('allows no segment duration with one segment', function(done) {
        sl.timescale = 9000;

        // Add just one SegmentUrl.
        var segmentUrl = new shaka.dash.mpd.SegmentUrl();
        segmentUrl.mediaUrl = 'http://example.com/video.mp4';
        sl.segmentUrls.push(segmentUrl);

        p.start = 0;

        manifestInfo = processor.process(m);

        var periodInfo = manifestInfo.periodInfos[0];
        var si1 = periodInfo.streamSetInfos[0].streamInfos[0];

        si1.segmentIndexSource.create().then(function(segmentIndex) {
          var references = segmentIndex.references;
          expect(references.length).toBe(1);

          checkReference(
              references[0],
              'http://example.com/video.mp4',
              0, 100);

          done();
        });
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

        manifestInfo = processor.process(m);

        var periodInfo = manifestInfo.periodInfos[0];
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
        r.baseUrl = new goog.Uri('http://example.com');
        r.bandwidth = 250000;
        r.mimeType = 'video/mp4';

        as.group = 1;
        as.representations.push(r);

        p.adaptationSets.push(as);
        m.periods.push(p);
      });

      it('disallows no segment metadata', function() {
        p.start = 0;

        manifestInfo = processor.process(m);

        var periodInfo = manifestInfo.periodInfos[0];
        expect(periodInfo.streamSetInfos[0].streamInfos.length).toBe(0);
      });

      it('disallows no base URL', function() {
        r.baseUrl = null;
        p.start = 0;

        manifestInfo = processor.process(m);

        var periodInfo = manifestInfo.periodInfos[0];
        expect(periodInfo.streamSetInfos[0].streamInfos.length).toBe(0);
      });
    });  // describe SegmentBase
  });  // describe process
});

