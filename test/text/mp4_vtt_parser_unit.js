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

describe('Mp4VttParser', function() {
  /** @const */
  var vttInitSegmentUri = '/base/test/test/assets/vtt-init.mp4';
  /** @const */
  var vttSegmentUri = '/base/test/test/assets/vtt-segment.mp4';
  /** @const */
  var vttSegSettingsUri = '/base/test/test/assets/vtt-segment-settings.mp4';
  /** @const */
  var vttSegNoDurationUri =
      '/base/test/test/assets/vtt-segment-no-duration.mp4';
  /** @const */
  var audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  /** @type {!ArrayBuffer} */
  var vttInitSegment;
  /** @type {!Uint8Array} */
  var vttSegment;
  /** @type {!Uint8Array} */
  var vttSegSettings;
  /** @type {!Uint8Array} */
  var vttSegNoDuration;
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
      shaka.test.Util.fetch(vttSegNoDurationUri),
      shaka.test.Util.fetch(audioInitSegmentUri)
    ]).then(function(responses) {
      vttInitSegment = responses[0];
      vttSegment = new Uint8Array(responses[1]);
      vttSegSettings = new Uint8Array(responses[2]);
      vttSegNoDuration = new Uint8Array(responses[3]);
      audioInitSegment = responses[4];
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
    var cues = [
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
    var time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    var result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('parses media segment containing settings', function() {
    var Cue = shaka.text.Cue;
    var cues = [
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
    var time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    var result = parser.parseMedia(vttSegSettings, time);
    verifyHelper(cues, result);
  });

  it('parses media segments without a sample duration', function() {
    // Regression test for https://github.com/google/shaka-player/issues/919
    var cues = [
      { start: 10, end: 11, payload: 'cue 10' },
      { start: 11, end: 12, payload: 'cue 11' },
      { start: 12, end: 13, payload: 'cue 12' },
      { start: 13, end: 14, payload: 'cue 13' },
      { start: 14, end: 15, payload: 'cue 14' },
      { start: 15, end: 16, payload: 'cue 15' },
      { start: 16, end: 17, payload: 'cue 16' },
      { start: 17, end: 18, payload: 'cue 17' },
      { start: 18, end: 19, payload: 'cue 18' },
      { start: 19, end: 20, payload: 'cue 19' }
    ];

    var parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    var time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    var result = parser.parseMedia(vttSegNoDuration, time);
    verifyHelper(cues, result);
  });

  it('accounts for offset', function() {
    var cues = [
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
    var time = {periodStart: 10, segmentStart: 0, segmentEnd: 0};
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

      if ('line' in expected[i])
        expect(actual[i].line).toBe(expected[i].line);
      if ('writingDirection' in expected[i])
        expect(actual[i].writingDirection).toBe(expected[i].writingDirection);
      if ('textAlign' in expected[i])
        expect(actual[i].textAlign).toBe(expected[i].textAlign);
      if ('size' in expected[i])
        expect(actual[i].size).toBe(expected[i].size);
      if ('position' in expected[i])
        expect(actual[i].position).toBe(expected[i].position);
    }
  }
});
