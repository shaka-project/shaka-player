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

describe('Mp4vttParser', function() {
  var vttInitSegmentUri = '/base/test/test/assets/vtt-init.mp4';
  var vttSegmentUri = '/base/test/test/assets/vtt-segment.mp4';
  var vttSegSettingsUri = '/base/test/test/assets/vtt-segment-settings.mp4';
  var audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  var vttInitSegment;
  var vttSegment;
  var vttSegSettings;
  var audioInitSegment;

  var mockCue = false;

  beforeAll(function(done) {
    // Mock out VTTCue if not supported.  These tests don't actually need
    // VTTCue to do anything, this simply verifies the value of its members.
    if (!window.VTTCue) {
      mockCue = true;
      window.VTTCue = function(start, end, text) {
        this.startTime = start;
        this.endTime = end;
        this.text = text;
      };
    }

    Promise.all([
      shaka.test.Util.fetch(vttInitSegmentUri),
      shaka.test.Util.fetch(vttSegmentUri),
      shaka.test.Util.fetch(vttSegSettingsUri),
      shaka.test.Util.fetch(audioInitSegmentUri)
    ]).then(function(responses) {
      vttInitSegment = responses[0];
      vttSegment = responses[1];
      vttSegSettings = responses[2];
      audioInitSegment = responses[3];
    }).catch(fail).then(done);
  });

  afterAll(function() {
    // Delete our mock.
    if (mockCue) {
      delete window.VTTCue;
    }
  });

  it('parses init segment', function() {
    // init segment doesn't have the subtitles. The code should verify
    // their declaration and proceed to the next segment.
    var ret = shaka.media.Mp4VttParser(vttInitSegment, 0, null, null, false);
    expect(ret).toEqual([]);
  });

  it('parses media segment', function() {
    var cues =
        [
         {start: 20, end: 40, text: 'It has shed much innocent blood.\n'},
         {start: 20, end: 40, text:
           'You\'re a fool for traveling alone,\nso completely unprepared.\n'}
        ];
    var result = shaka.media.Mp4VttParser(vttSegment, 0, 20, 40, false);
    verifyHelper(cues, result);
  });

  it('parses media segment containing settings', function() {
    var cues =
        [
         {start: 20, end: 40, text: 'It has shed much innocent blood.\n',
           align: 'right', size: 50, position: 10},
         {start: 20, end: 40, text:
           'You\'re a fool for traveling alone,\nso completely unprepared.\n',
           vertical: 'lr', line: 1}
        ];
    var result = shaka.media.Mp4VttParser(vttSegSettings, 0, 20, 40, false);
    verifyHelper(cues, result);
  });

  it('accounts for offset', function() {
    var cues =
        [
         {start: 27, end: 47, text: 'It has shed much innocent blood.\n'},
         {start: 27, end: 47, text:
           'You\'re a fool for traveling alone,\nso completely unprepared.\n'}
        ];
    var result = shaka.media.Mp4VttParser(vttSegment, 7, 20, 40, false);
    verifyHelper(cues, result);
  });

  it('rejects init segment with no vtt', function() {
    var error = new shaka.util.Error(shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
    try {
      shaka.media.Mp4VttParser(audioInitSegment, 0, 20, 40, false);
      fail('Mp4 file with no vtt supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  });


  function verifyHelper(expected, actual) {
    expect(actual).toBeTruthy();
    expect(actual.length).toBe(expected.length);
    for (var i = 0; i < actual.length; i++) {
      expect(actual[i].startTime).toBe(expected[i].start);
      expect(actual[i].endTime).toBe(expected[i].end);
      expect(actual[i].text).toBe(expected[i].text);

      if (expected[i].line)
        expect(actual[i].line).toBe(expected[i].line);
      if (expected[i].vertical)
        expect(actual[i].vertical).toBe(expected[i].vertical);
      if (expected[i].align)
        expect(actual[i].align).toBe(expected[i].align);
      if (expected[i].size)
        expect(actual[i].size).toBe(expected[i].size);
      if (expected[i].position)
        expect(actual[i].position).toBe(expected[i].position);
    }
  }
});
