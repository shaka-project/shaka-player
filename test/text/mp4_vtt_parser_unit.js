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
  const vttInitSegmentUri = '/base/test/test/assets/vtt-init.mp4';
  const vttSegmentUri = '/base/test/test/assets/vtt-segment.mp4';
  const vttSegmentMultiPayloadUri =
      '/base/test/test/assets/vtt-segment-multi-payload.mp4';
  const vttSegSettingsUri = '/base/test/test/assets/vtt-segment-settings.mp4';
  const vttSegNoDurationUri =
      '/base/test/test/assets/vtt-segment-no-duration.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  /** @type {!Uint8Array} */
  let vttInitSegment;
  /** @type {!Uint8Array} */
  let vttSegment;
  /** @type {!Uint8Array} */
  let vttSegmentMultiPayload;
  /** @type {!Uint8Array} */
  let vttSegSettings;
  /** @type {!Uint8Array} */
  let vttSegNoDuration;
  /** @type {!Uint8Array} */
  let audioInitSegment;

  beforeAll(function(done) {
    Promise.all([
      shaka.test.Util.fetch(vttInitSegmentUri),
      shaka.test.Util.fetch(vttSegmentUri),
      shaka.test.Util.fetch(vttSegmentMultiPayloadUri),
      shaka.test.Util.fetch(vttSegSettingsUri),
      shaka.test.Util.fetch(vttSegNoDurationUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
    ]).then(function(responses) {
      vttInitSegment = new Uint8Array(responses[0]);
      vttSegment = new Uint8Array(responses[1]);
      vttSegmentMultiPayload = new Uint8Array(responses[2]);
      vttSegSettings = new Uint8Array(responses[3]);
      vttSegNoDuration = new Uint8Array(responses[4]);
      audioInitSegment = new Uint8Array(responses[5]);
    }).catch(fail).then(done);
  });

  it('parses init segment', function() {
    new shaka.text.Mp4VttParser().parseInit(vttInitSegment);
  });

  it('parses media segment', function() {
    let cues = [
      {
        start: 111.8,
        end: 115.8,
        payload: 'It has shed much innocent blood.\n',
      },
      {
        start: 118,
        end: 120,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
      },
    ];

    let parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    let time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    let result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('plays multiple payloads at one time if specified by size', () => {
    let cues = [
      {
        start: 110,
        end: 113,
        payload: 'Hello',
      },
      // This cue is part of the same presentation as the previous one, so it
      // shares the same start time and duration.
      {
        start: 110,
        end: 113,
        payload: 'and',
      },
      {
        start: 113,
        end: 116.276,
        payload: 'goodbye',
      },
    ];

    let parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    let time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    let result = parser.parseMedia(vttSegmentMultiPayload, time);
    verifyHelper(cues, result);
  });

  it('parses media segment containing settings', function() {
    const Cue = shaka.text.Cue;
    let cues = [
      {
        start: 111.8,
        end: 115.8,
        payload: 'It has shed much innocent blood.\n',
        align: 'right',
        size: 50,
        position: 10,
      },
      {
        start: 118,
        end: 120,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
        writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
        line: 1,
      },
    ];

    let parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    let time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    let result = parser.parseMedia(vttSegSettings, time);
    verifyHelper(cues, result);
  });

  it('parses media segments without a sample duration', function() {
    // Regression test for https://github.com/google/shaka-player/issues/919
    let cues = [
      {start: 10, end: 11, payload: 'cue 10'},
      {start: 11, end: 12, payload: 'cue 11'},
      {start: 12, end: 13, payload: 'cue 12'},
      {start: 13, end: 14, payload: 'cue 13'},
      {start: 14, end: 15, payload: 'cue 14'},
      {start: 15, end: 16, payload: 'cue 15'},
      {start: 16, end: 17, payload: 'cue 16'},
      {start: 17, end: 18, payload: 'cue 17'},
      {start: 18, end: 19, payload: 'cue 18'},
      {start: 19, end: 20, payload: 'cue 19'},
    ];

    let parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    let time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    let result = parser.parseMedia(vttSegNoDuration, time);
    verifyHelper(cues, result);
  });

  it('accounts for offset', function() {
    let cues = [
      {
        start: 121.8,
        end: 125.8,
        payload: 'It has shed much innocent blood.\n',
      },
      {
        start: 128,
        end: 130,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
      },
    ];

    let parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    let time = {periodStart: 10, segmentStart: 0, segmentEnd: 0};
    let result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('rejects init segment with no vtt', function() {
    let error = new shaka.util.Error(
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
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].startTime).toBe(expected[i].start);
      expect(actual[i].endTime).toBe(expected[i].end);
      expect(actual[i].payload).toBe(expected[i].payload);

      if ('line' in expected[i]) {
        expect(actual[i].line).toBe(expected[i].line);
      }
      if ('writingMode' in expected[i]) {
        expect(actual[i].writingMode).toBe(expected[i].writingMode);
      }
      if ('textAlign' in expected[i]) {
        expect(actual[i].textAlign).toBe(expected[i].textAlign);
      }
      if ('size' in expected[i]) {
        expect(actual[i].size).toBe(expected[i].size);
      }
      if ('position' in expected[i]) {
        expect(actual[i].position).toBe(expected[i].position);
      }
    }
  }
});
