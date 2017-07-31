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

describe('Mp4vttParser', function() {
  /** @const */
  var vttInitSegmentUri = '/base/test/test/assets/vtt-init.mp4';
  /** @const */
  var vttSegmentUri = '/base/test/test/assets/vtt-segment.mp4';
  /** @const */
  var vttSegSettingsUri = '/base/test/test/assets/vtt-segment-settings.mp4';
  /** @const */
  var audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  /** @type {!ArrayBuffer} */
  var vttInitSegment;
  /** @type {!ArrayBuffer} */
  var vttSegment;
  /** @type {!ArrayBuffer} */
  var vttSegSettings;
  /** @type {!ArrayBuffer} */
  var audioInitSegment;

  /** @type {boolean} */
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
    new shaka.text.Mp4VttParser().parseInit(vttInitSegment);
  });

  it('parses media segment', function() {
    var cues =
        [
         {
           start: 111.8,
           end: 115.8,
           payload: 'It has shed much innocent blood.\n'
         },
         {
           start: 118,
           end: 120,
           payload:
           'You\'re a fool for traveling alone,\nso completely unprepared.\n'
         }
        ];

    var parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    var time = {periodStart: 0, segmentStart: 0, segmentEnd: 0 };
    var result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('parses media segment containing settings', function() {
    var Cue = shaka.text.Cue;
    var cues =
        [
         {
           start: 111.8,
           end: 115.8,
           payload: 'It has shed much innocent blood.\n',
           align: 'right',
           size: 50,
           position: 10
         },
         {
           start: 118,
           end: 120,
           payload:
           'You\'re a fool for traveling alone,\nso completely unprepared.\n',
           writingDirection: Cue.writingDirection.VERTICAL_LEFT_TO_RIGHT,
           line: 1
         }
        ];

    var parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    var time = {periodStart: 0, segmentStart: 0, segmentEnd: 0 };
    var result = parser.parseMedia(vttSegSettings, time);
    verifyHelper(cues, result);
  });

  it('accounts for offset', function() {
    var cues =
        [
         {
           start: 121.8,
           end: 125.8,
           payload: 'It has shed much innocent blood.\n'
         },
         {
           start: 128,
           end: 130,
           payload:
           'You\'re a fool for traveling alone,\nso completely unprepared.\n'
         }
        ];

    var parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    var time = {periodStart: 10, segmentStart: 0, segmentEnd: 0 };
    var result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('rejects init segment with no vtt', function() {
    var error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
    try {
      new shaka.text.Mp4VttParser().parseInit(audioInitSegment);
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
      expect(actual[i].payload).toBe(expected[i].payload);

      if (expected[i].line)
        expect(actual[i].line).toBe(expected[i].line);
      if (expected[i].writingDirection)
        expect(actual[i].writingDirection).toBe(expected[i].writingDirection);
      if (expected[i].textAlign)
        expect(actual[i].textAlign).toBe(expected[i].textAlign);
      if (expected[i].size)
        expect(actual[i].size).toBe(expected[i].size);
      if (expected[i].position)
        expect(actual[i].position).toBe(expected[i].position);
    }
  }
});
