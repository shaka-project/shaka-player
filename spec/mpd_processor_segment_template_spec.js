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

goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.mpd');
goog.require('shaka.player.Player');

describe('MpdProcessor.SegmentTemplate', function() {
  var mpd;
  var processor;
  var originalIsTypeSupported;
  var manifestInfo;

  beforeAll(function() {
    mpd = shaka.dash.mpd;
    processor = new shaka.dash.MpdProcessor(null);

    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();
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
    assertsToFailures.uninstall();
    // Restore isTypeSupported.
    shaka.player.Player.isTypeSupported = originalIsTypeSupported;
  });

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

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;
      r1.mimeType = 'video/mp4';

      r2.baseUrl = [new goog.Uri('http://example.com/')];
      r2.bandwidth = 500000;
      r2.mimeType = 'video/mp4';

      manifestInfo = processor.createManifestInfo_(m, 1000);
      validateManifest(manifestInfo, null, [
        {
          'bandwidth': 250000,
          'index': {
            'url': 'http://example.com/250000-index.sidx',
            'start': 0,
            'end': null
          },
          'init': {
            'url': 'http://example.com/250000-init.mp4',
            'start': 0,
            'end': null
          }
        },
        {
          'bandwidth': 500000,
          'index': {
            'url': 'http://example.com/500000-index.sidx',
            'start': 0,
            'end': null
          },
          'init': {
            'url': 'http://example.com/500000-init.mp4',
            'start': 0,
            'end': null
          }
        }
      ]);
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

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;

      r2.baseUrl = [new goog.Uri('http://example.com/')];
      r2.bandwidth = 500000;

      manifestInfo = processor.createManifestInfo_(m, 1000);
      validateManifest(manifestInfo, done, [
        {
          'bandwidth': 250000,
          'init': {
            'url': 'http://example.com/250000-init.mp4',
            'start': 0,
            'end': null
          },
          'references': [
            {
              'url': 'http://example.com/1-0-250000-media.mp4',
              'start': 0,
              'end': 10
            },
            {
              'url': 'http://example.com/2-90000-250000-media.mp4',
              'start': 10,
              'end': 20
            },
            {
              'url': 'http://example.com/3-180000-250000-media.mp4',
              'start': 20,
              'end': 40
            }
          ]
        },
        {
          'bandwidth': 500000,
          'init': {
            'url': 'http://example.com/500000-init.mp4',
            'start': 0,
            'end': null
          },
          'references': [
            {
              'url': 'http://example.com/1-0-500000-media.mp4',
              'start': 0,
              'end': 10
            },
            {
              'url': 'http://example.com/2-90000-500000-media.mp4',
              'start': 10,
              'end': 20
            },
            {
              'url': 'http://example.com/3-180000-500000-media.mp4',
              'start': 20,
              'end': 40
            }
          ]
        }
      ]);
    });

    it('SegmentTimeline w/ start times', function(done) {
      // A non-zero PTO should affect the segment URLs but not the segments'
      // start and end times.
      var pto = 9000;

      var tp1 = new mpd.SegmentTimePoint();
      tp1.startTime = 9000 * 100 + pto;
      tp1.duration = 9000 * 10;
      tp1.repeat = 1;

      var tp2 = new mpd.SegmentTimePoint();
      tp2.startTime = (9000 * 100) + (9000 * 20) + pto;
      tp2.duration = 9000 * 20;
      tp2.repeat = 0;

      var timeline = new mpd.SegmentTimeline();
      timeline.timePoints.push(tp1);
      timeline.timePoints.push(tp2);

      st.timescale = 9000;
      st.presentationTimeOffset = pto;
      st.segmentDuration = null;
      st.startNumber = 10;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      st.timeline = timeline;

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      manifestInfo = processor.createManifestInfo_(m, 1000);
      validateManifest(manifestInfo, done, [
        {
          'bandwidth': 250000,
          'init': {
            'url': 'http://example.com/250000-init.mp4',
            'start': 0,
            'end': null
          },
          'references': [
            {
              'url': 'http://example.com/10-909000-250000-media.mp4',
              'start': 100,
              'end': 110
            },
            {
              'url': 'http://example.com/11-999000-250000-media.mp4',
              'start': 110,
              'end': 120
            },
            {
              'url': 'http://example.com/12-1089000-250000-media.mp4',
              'start': 120,
              'end': 140
            }
          ]
        }
      ]);
    });

    it('segment duration w/o AST', function(done) {
      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = 9000 * 10;
      st.startNumber = 5;
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;

      r2.baseUrl = [new goog.Uri('http://example.com/')];
      r2.bandwidth = 500000;

      // If the MPD is static and uses segment duration then there must be
      // an explicit Period duration.
      p.duration = 30;

      manifestInfo = processor.createManifestInfo_(m, 1000);
      validateManifest(manifestInfo, done, [
        {
          'bandwidth': 250000,
          'init': {
            'url': 'http://example.com/250000-init.mp4',
            'start': 0,
            'end': null
          },
          'references': [
            {
              'url': 'http://example.com/5-0-250000-media.mp4',
              'start': 0,
              'end': 10
            },
            {
              'url': 'http://example.com/6-90000-250000-media.mp4',
              'start': 10,
              'end': 20
            },
            {
              'url': 'http://example.com/7-180000-250000-media.mp4',
              'start': 20,
              'end': 30
            }
          ]
        },
        {
          'bandwidth': 500000,
          'init': {
            'url': 'http://example.com/500000-init.mp4',
            'start': 0,
            'end': null
          },
          'references': [
            {
              'url': 'http://example.com/5-0-500000-media.mp4',
              'start': 0,
              'end': 10
            },
            {
              'url': 'http://example.com/6-90000-500000-media.mp4',
              'start': 10,
              'end': 20
            },
            {
              'url': 'http://example.com/7-180000-500000-media.mp4',
              'start': 20,
              'end': 30
            }
          ]
        }
      ]);
    });

    it('segment duration w/ AST', function(done) {
      st.timescale = 9000;
      st.presentationTimeOffset = 0;
      st.segmentDuration = 9000 * 10;
      st.startNumber = 5;  // Ensure startNumber > 1 works.
      st.mediaUrlTemplate = '$Number$-$Time$-$Bandwidth$-media.mp4';
      st.initializationUrlTemplate = '$Bandwidth$-init.mp4';

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      // Hijack shaka.util.Clock.now()
      var originalNow = shaka.util.Clock.now;
      var manifestCreationTime = Math.round(originalNow() / 1000.0);
      shaka.util.Clock.now = function() {
        return 1000.0 * manifestCreationTime;
      };

      var secondsSinceStart = 60 * 60;  // 1 hour.

      m.type = 'dynamic';
      m.url = [new goog.Uri('http://example.com/')];
      m.availabilityStartTime = manifestCreationTime - secondsSinceStart;
      m.suggestedPresentationDelay = 11;
      m.timeShiftBufferDepth = 60;
      m.minBufferTime = 0;

      // The start time of the earliest available segment is given by
      // T0 = CurrentPresentationTime - 2*SegmentDuration - TimeShiftBufferDepth
      //    = (60 * 60) - 2*10 - 60
      //    = 3520 (or 31680000 unscaled)
      //
      // The segment index of this segment is
      // I0 = CEIL(T0 / SegmentDuration)
      //    = CEIL(3520 / 10)
      //    = 352
      //
      // and the segment number is thus
      // N0 = I0 + StartNumber
      //    = 352 + 5
      //    = 357
      //
      // The start time of the latest available segment is given by
      // T1 = CurrentPresentationTime - SegmentDuration -
      //      SuggestedPresentationDelay
      //    = (60 * 60) - 10 - 11
      //    = 3579
      //
      // The segment index of this segment is
      // I1 = FLOOR(T1 / SegmentDuration) =
      //    = FLOOR(3589 / 10)
      //    = 357
      //
      // and the segment number is thus
      // N1 = I1 + StartNumber
      //    = 357 + 5
      //    = 362

      manifestInfo = processor.createManifestInfo_(m, manifestCreationTime);
      validateManifest(manifestInfo, done, [
        {
          'bandwidth': 250000,
          'init': {
            'url': 'http://example.com/250000-init.mp4',
            'start': 0,
            'end': null
          },
          'references': [
            {
              'url': 'http://example.com/357-31680000-250000-media.mp4',
              'start': 3520,
              'end': 3530
            },
            {
              'url': 'http://example.com/358-31770000-250000-media.mp4',
              'start': 3530,
              'end': 3540
            },
            {
              'url': 'http://example.com/359-31860000-250000-media.mp4',
              'start': 3540,
              'end': 3550
            },
            {
              'url': 'http://example.com/360-31950000-250000-media.mp4',
              'start': 3550,
              'end': 3560
            },
            {
              'url': 'http://example.com/361-32040000-250000-media.mp4',
              'start': 3560,
              'end': 3570
            },
            {
              'url': 'http://example.com/362-32130000-250000-media.mp4',
              'start': 3570,
              'end': 3580
            }
          ]
        }
      ]);

      // Replace fake now().
      shaka.util.Clock.now = originalNow;
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

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      manifestInfo = processor.createManifestInfo_(m, 1000);
      validateManifest(manifestInfo, done, [
        {
          'bandwidth': 250000,
          'references': [
            {
              'url': 'http://example.com/1-10-250000-media.mp4',
              'start': 10,
              'end': 21
            },
            {
              'url': 'http://example.com/2-21-250000-media.mp4',
              'start': 21,
              'end': 32
            },
            {
              'url': 'http://example.com/3-32-250000-media.mp4',
              'start': 32,
              'end': 42
            }
          ]
        }
      ]);
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

      r1.baseUrl = [new goog.Uri('http://example.com/')];
      r1.bandwidth = 250000;

      // Only process the first Representation.
      as.representations.splice(1, 1);

      manifestInfo = processor.createManifestInfo_(m, 1000);
      validateManifest(manifestInfo, done, [
        {
          'bandwidth': 250000,
          'references': [
            {
              'url': 'http://example.com/1-10-250000-media.mp4',
              'start': 10,
              'end': 20
            },
            {
              'url': 'http://example.com/2-20-250000-media.mp4',
              'start': 20,
              'end': 29
            },
            {
              'url': 'http://example.com/3-29-250000-media.mp4',
              'start': 29,
              'end': 39
            }
          ]
        }
      ]);
    });

    /**
     * Validates that the manifest contains the correct data.
     *
     * @param {shaka.media.ManifestInfo} manifest
     * @param {!Array.<!Object.<string, *>>} data
     */
    function validateManifest(manifest, done, data) {
      expect(manifest).toBeTruthy();

      expect(manifest.periodInfos).toBeTruthy();
      expect(manifest.periodInfos.length).toBe(1);
      var period = manifest.periodInfos[0];
      expect(period).toBeTruthy();

      expect(period.streamSetInfos).toBeTruthy();
      expect(period.streamSetInfos.length).toBe(1);
      var set = period.streamSetInfos[0];
      expect(set).toBeTruthy();

      var p = Promise.resolve();

      // Check the StreamInfos.
      expect(set.streamInfos).toBeTruthy();
      expect(set.streamInfos.length).toBe(data.length);
      for (var i = 0; i < data.length; i++) {
        var info = set.streamInfos[i];
        expect(info).toBeTruthy();

        if (data[i].bandwidth) {
          expect(info.bandwidth).toBe(data[i].bandwidth);
        }

        // Check the index metadata.
        if (data[i].index) {
          var index = info.segmentIndexSource.indexMetadata_;
          expect(index).toBeTruthy();
          expect(index.urls).toBeTruthy();
          expect(index.urls[0].toString()).toBe(data[i].index.url);
          expect(index.startByte).toBe(data[i].index.start);
          expect(index.endByte).toBe(data[i].index.end);
        }

        // Check the init metadata.
        if (data[i].init) {
          var init = info.segmentInitSource.metadata_;
          expect(init).toBeTruthy();
          expect(init.urls).toBeTruthy();
          expect(init.urls[0].toString()).toBe(data[i].init.url);
          expect(init.startByte).toBe(data[i].init.start);
          expect(init.endByte).toBe(data[i].init.end);
        }

        // Check the references.
        if (data[i].references) {
          shaka.asserts.assert(done != null);
          p = p.then(function(info) {
            return info.segmentIndexSource.create();
          }.bind(null, info)).then(function(i, segmentIndex) {
            expect(segmentIndex).toBeTruthy();
            var references = segmentIndex.references;
            expect(references).toBeTruthy();
            expect(references.length).toBe(data[i].references.length);

            for (var x = 0; x < references.length; x++) {
              checkReference(
                  references[x],
                  data[i].references[x].url,
                  data[i].references[x].start,
                  data[i].references[x].end);
            }
            return Promise.resolve();
          }.bind(null, i));
        }
      }

      if (done) {
        p = p.then(function() {
          done();
        }).catch(function(e) {
          fail(e);
        });
      }
    }
  });  // describe createStreamInfoFromSegmentTemplate_

  describe('process', function() {
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
      r.baseUrl = [new goog.Uri('http://example.com')];
      r.bandwidth = 250000;
      r.mimeType = 'video/mp4';

      as.group = 1;
      as.representations.push(r);

      p.adaptationSets.push(as);
      m.periods.push(p);
      m.url = [new goog.Uri('http://example.com/mpd')];
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
      m.updateLocation = [new goog.Uri('http://example.com/updated_mpd')];

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
  });  // describe process
});

