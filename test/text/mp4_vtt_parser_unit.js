/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4VttParser', () => {
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

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(vttInitSegmentUri),
      shaka.test.Util.fetch(vttSegmentUri),
      shaka.test.Util.fetch(vttSegmentMultiPayloadUri),
      shaka.test.Util.fetch(vttSegSettingsUri),
      shaka.test.Util.fetch(vttSegNoDurationUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
    ]);
    vttInitSegment = shaka.util.BufferUtils.toUint8(responses[0]);
    vttSegment = shaka.util.BufferUtils.toUint8(responses[1]);
    vttSegmentMultiPayload = shaka.util.BufferUtils.toUint8(responses[2]);
    vttSegSettings = shaka.util.BufferUtils.toUint8(responses[3]);
    vttSegNoDuration = shaka.util.BufferUtils.toUint8(responses[4]);
    audioInitSegment = shaka.util.BufferUtils.toUint8(responses[5]);
  });

  it('parses init segment', () => {
    new shaka.text.Mp4VttParser().parseInit(vttInitSegment);
  });

  it('parses media segment', () => {
    const cues = [
      {
        startTime: 111.8,
        endTime: 115.8,
        payload: 'It has shed much innocent blood.\n',
      },
      {
        startTime: 118,
        endTime: 120,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('plays multiple payloads at one time if specified by size', () => {
    const cues = [
      {
        startTime: 110,
        endTime: 113,
        payload: 'Hello',
      },
      // This cue is part of the same presentation as the previous one, so it
      // shares the same start time and duration.
      {
        startTime: 110,
        endTime: 113,
        payload: 'and',
      },
      {
        startTime: 113,
        endTime: 116.276,
        payload: 'goodbye',
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const result = parser.parseMedia(vttSegmentMultiPayload, time);
    verifyHelper(cues, result);
  });

  it('parses media segment containing settings', () => {
    const Cue = shaka.text.Cue;
    const cues = [
      {
        startTime: 111.8,
        endTime: 115.8,
        payload: 'It has shed much innocent blood.\n',
        textAlign: 'right',
        size: 50,
        position: 10,
      },
      {
        startTime: 118,
        endTime: 120,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
        writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
        line: 1,
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const result = parser.parseMedia(vttSegSettings, time);
    verifyHelper(cues, result);
  });

  it('parses media segments without a sample duration', () => {
    // Regression test for https://github.com/google/shaka-player/issues/919
    const cues = [
      {startTime: 10, endTime: 11, payload: 'cue 10'},
      {startTime: 11, endTime: 12, payload: 'cue 11'},
      {startTime: 12, endTime: 13, payload: 'cue 12'},
      {startTime: 13, endTime: 14, payload: 'cue 13'},
      {startTime: 14, endTime: 15, payload: 'cue 14'},
      {startTime: 15, endTime: 16, payload: 'cue 15'},
      {startTime: 16, endTime: 17, payload: 'cue 16'},
      {startTime: 17, endTime: 18, payload: 'cue 17'},
      {startTime: 18, endTime: 19, payload: 'cue 18'},
      {startTime: 19, endTime: 20, payload: 'cue 19'},
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const result = parser.parseMedia(vttSegNoDuration, time);
    verifyHelper(cues, result);
  });

  it('accounts for offset', () => {
    const cues = [
      {
        startTime: 121.8,
        endTime: 125.8,
        payload: 'It has shed much innocent blood.\n',
      },
      {
        startTime: 128,
        endTime: 130,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {periodStart: 10, segmentStart: 0, segmentEnd: 0};
    const result = parser.parseMedia(vttSegment, time);
    verifyHelper(cues, result);
  });

  it('rejects init segment with no vtt', () => {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT));

    expect(() => new shaka.text.Mp4VttParser().parseInit(audioInitSegment))
        .toThrow(error);
  });

  function verifyHelper(/** !Array */ expected, /** !Array */ actual) {
    expect(actual).toEqual(expected.map((c) => jasmine.objectContaining(c)));
  }
});
