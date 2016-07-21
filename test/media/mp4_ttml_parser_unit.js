/**
 * @license
 * Copyright 2016 Google Inc.
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

goog.require('shaka.test.Util');

describe('Mp4TtmlParser', function() {
  var ttmlInitSegmentUri = '/base/test/test/assets/ttml-init.mp4';
  var ttmlSegmentUri = '/base/test/test/assets/ttml-segment.mp4';
  var audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  var ttmlInitSegment;
  var ttmlSegment;
  var audioInitSegment;

  beforeAll(function(done) {
    Promise.all([
      shaka.test.Util.fetch(ttmlInitSegmentUri),
      shaka.test.Util.fetch(ttmlSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri)
    ]).then(function(responses) {
      ttmlInitSegment = responses[0];
      ttmlSegment = responses[1];
      audioInitSegment = responses[2];
    }).catch(fail).then(done);
  });

  it('parses init segment', function() {
    // two last parameters are only used by mp4 vtt parser,
    // so passing arbitrary values
    var ret = shaka.media.Mp4TtmlParser(ttmlInitSegment, null, null);
    // init segment doesn't have the subtitles. The code should verify
    // their declaration and proceed to the next segment.
    expect(ret).toEqual([]);
  });

  it('parses media segment', function() {
    var ret = shaka.media.Mp4TtmlParser(ttmlSegment, null, null);
    expect(ret.length).toBeGreaterThan(0);
  });

  it('rejects init segment with no ttml', function() {
    var error = new shaka.util.Error(shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML);
    try {
      shaka.media.Mp4TtmlParser(audioInitSegment, null, null);
      fail('Mp4 file with no ttml supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  });
});
