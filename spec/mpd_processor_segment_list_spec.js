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

describe('MpdProcessor.SegmentList', function() {
  var mpd;
  var processor;
  var originalIsTypeSupported;
  var manifestInfo;
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
    r.baseUrl = [new goog.Uri('http://example.com')];
    r.bandwidth = 250000;
    r.mimeType = 'video/mp4';

    as.group = 1;
    as.representations.push(r);

    p.adaptationSets.push(as);
    m.periods.push(p);
  });

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

  it('allows no segment duration with one segment', function(done) {
    sl.timescale = 9000;

    // Add just one SegmentUrl.
    var segmentUrl = new shaka.dash.mpd.SegmentUrl();
    segmentUrl.mediaUrl = [new goog.Uri('http://example.com/video.mp4')];
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
    segmentUrl1.mediaUrl = [new goog.Uri('http://example.com/video-1.mp4')];

    var segmentUrl2 = new shaka.dash.mpd.SegmentUrl();
    segmentUrl2.mediaUrl = [new goog.Uri('http://example.com/video-2.mp4')];

    sl.segmentUrls.push(segmentUrl1);
    sl.segmentUrls.push(segmentUrl2);

    p.start = 0;

    manifestInfo = processor.process(m);

    var periodInfo = manifestInfo.periodInfos[0];
    expect(periodInfo.streamSetInfos[0].streamInfos.length).toBe(0);
  });
});

