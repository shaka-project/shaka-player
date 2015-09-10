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

goog.require('goog.Uri');
goog.require('shaka.dash.DurationSegmentIndexSource');
goog.require('shaka.dash.mpd');

describe('DurationSegmentIndexSource', function() {
  var mpd;
  var m;
  var p;
  var as;
  var r;
  var st;

  beforeEach(function() {
    mpd = shaka.dash.mpd;

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

  it('creates enough SegmentReferences', function(done) {
    st.mediaUrlTemplate = '$Number$-video.mp4';
    st.timescale = 10;
    st.segmentDuration = 100;

    p.start = 0;
    p.duration = 100;  // seconds.

    m.mediaPresentationDuration = 100;  // seconds.

    var source = new shaka.dash.DurationSegmentIndexSource(
        m, p, r, 0 /* manifestCreationTime */, null /* networkCallback */);

    source.create().then(function(index) {
      expect(index.references.length).toBe(10);
      expect(index.references[9].startTime).toBe(90);
      expect(index.references[9].endTime).toBe(100);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });

  it('compresses the last SegmentReference if needed', function(done) {
    st.mediaUrlTemplate = '$Number$-video.mp4';
    st.timescale = 10;
    st.segmentDuration = 100;

    p.start = 0;
    p.duration = 95;  // seconds.

    m.mediaPresentationDuration = 95;  // seconds.

    var source = new shaka.dash.DurationSegmentIndexSource(
        m, p, r, 0 /* manifestCreationTime */, null /* networkCallback */);

    source.create().then(function(index) {
      expect(index.references.length).toBe(10);
      expect(index.references[9].startTime).toBe(90);
      expect(index.references[9].endTime).toBe(95);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  });
});

