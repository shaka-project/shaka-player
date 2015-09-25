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

    describe('creates StreamSetInfos from multiple AdaptationSets', function() {
      var m;
      var p;
      var as1;
      var as2;
      var r1;
      var r2;
      var st1;
      var st2;

      beforeEach(function() {
        m = new mpd.Mpd();
        p = new mpd.Period();
        as1 = new mpd.AdaptationSet();
        as2 = new mpd.AdaptationSet();
        r1 = new mpd.Representation();
        r2 = new mpd.Representation();
        st1 = new mpd.SegmentTemplate();
        st2 = new mpd.SegmentTemplate();

        r1.segmentTemplate = st1;
        r1.baseUrl = [new goog.Uri('http://example.com')];
        r1.bandwidth = 250000;

        r2.segmentTemplate = st2;
        r2.baseUrl = [new goog.Uri('http://example.com')];
        r2.bandwidth = 500000;

        as1.representations.push(r1);
        as2.representations.push(r2);

        p.start = 0;
        p.adaptationSets.push(as1);
        p.adaptationSets.push(as2);

        m.periods.push(p);
        m.url = [new goog.Uri('http://example.com/mpd')];
      });

      it('by merging ones with the same type, group, and language', function() {
        as1.contentType = 'video';
        as2.contentType = 'video';
        as1.group = 1;
        as2.group = 1;
        as1.lang = 'en-US';
        as2.lang = 'en-US';

        r1.mimeType = 'video/mp4';
        r2.mimeType = 'video/mp4';

        var periodInfo = processor.process(m).periodInfos[0];
        expect(periodInfo.streamSetInfos.length).toBe(1);
        expect(periodInfo.streamSetInfos[0].contentType).toBe('video');
        expect(periodInfo.streamSetInfos[0].lang).toBe('en-US');
      });

      it('by separating ones with different types', function() {
        as1.contentType = 'audio';
        as2.contentType = 'video';
        as1.group = 1;
        as2.group = 1;
        as1.lang = 'en-US';
        as2.lang = 'en-US';

        r1.mimeType = 'audio/mp4';
        r2.mimeType = 'video/mp4';

        var periodInfo = processor.process(m).periodInfos[0];
        expect(periodInfo.streamSetInfos.length).toBe(2);

        expect(periodInfo.streamSetInfos[0].contentType).toBe('audio');
        expect(periodInfo.streamSetInfos[0].lang).toBe('en-US');

        expect(periodInfo.streamSetInfos[1].contentType).toBe('video');
        expect(periodInfo.streamSetInfos[1].lang).toBe('en-US');
      });

      it('by separating ones with different groups', function() {
        as1.contentType = 'audio';
        as2.contentType = 'audio';
        as1.group = 1;
        as2.group = 2;
        as1.lang = 'en-US';
        as2.lang = 'en-US';

        r1.mimeType = 'audio/mp4';
        r2.mimeType = 'audio/mp4';

        var periodInfo = processor.process(m).periodInfos[0];
        expect(periodInfo.streamSetInfos.length).toBe(2);

        expect(periodInfo.streamSetInfos[0].contentType).toBe('audio');
        expect(periodInfo.streamSetInfos[0].lang).toBe('en-US');

        expect(periodInfo.streamSetInfos[1].contentType).toBe('audio');
        expect(periodInfo.streamSetInfos[1].lang).toBe('en-US');
      });

      it('by separating ones with different languages', function() {
        as1.contentType = 'audio';
        as2.contentType = 'audio';
        as1.group = 1;
        as2.group = 1;
        as1.lang = 'en-US';
        as2.lang = 'fr';

        r1.mimeType = 'audio/mp4';
        r2.mimeType = 'audio/mp4';

        var periodInfo = processor.process(m).periodInfos[0];
        expect(periodInfo.streamSetInfos.length).toBe(2);

        expect(periodInfo.streamSetInfos[0].contentType).toBe('audio');
        expect(periodInfo.streamSetInfos[0].lang).toBe('en-US');

        expect(periodInfo.streamSetInfos[1].contentType).toBe('audio');
        expect(periodInfo.streamSetInfos[1].lang).toBe('fr');
      });
    });

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
        r.baseUrl = [new goog.Uri('http://example.com')];
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

