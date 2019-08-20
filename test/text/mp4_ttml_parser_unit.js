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

describe('Mp4TtmlParser', () => {
  const ttmlInitSegmentUri = '/base/test/test/assets/ttml-init.mp4';
  const ttmlSegmentUri = '/base/test/test/assets/ttml-segment.mp4';
  const ttmlSegmentMultipleMDATUri =
      '/base/test/test/assets/ttml-segment-multiplemdat.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  /** @type {!Uint8Array} */
  let ttmlInitSegment;
  /** @type {!Uint8Array} */
  let ttmlSegment;
  /** @type {!Uint8Array} */
  let ttmlSegmentMultipleMDAT;
  /** @type {!Uint8Array} */
  let audioInitSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(ttmlInitSegmentUri),
      shaka.test.Util.fetch(ttmlSegmentUri),
      shaka.test.Util.fetch(ttmlSegmentMultipleMDATUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
    ]);
    ttmlInitSegment = shaka.util.BufferUtils.toUint8(responses[0]);
    ttmlSegment = shaka.util.BufferUtils.toUint8(responses[1]);
    ttmlSegmentMultipleMDAT = shaka.util.BufferUtils.toUint8(responses[2]);
    audioInitSegment = shaka.util.BufferUtils.toUint8(responses[3]);
  });

  it('parses init segment', () => {
    new shaka.text.Mp4TtmlParser().parseInit(ttmlInitSegment);
  });

  it('parses media segment', () => {
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const ret = parser.parseMedia(ttmlSegment, time);
    expect(ret.length).toBe(10);
  });

  it('handles media segments with multiple mdats', () => {
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const ret = parser.parseMedia(ttmlSegmentMultipleMDAT, time);
    expect(ret.length).toBe(20);
  });

  it('accounts for offset', () => {
    const time1 = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    const time2 = {periodStart: 7, segmentStart: 0, segmentEnd: 0};

    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);

    const ret1 = parser.parseMedia(ttmlSegment, time1);
    expect(ret1.length).toBeGreaterThan(0);

    const ret2 = parser.parseMedia(ttmlSegment, time2);
    expect(ret2.length).toBeGreaterThan(0);

    expect(ret2[0].startTime).toBe(ret1[0].startTime + 7);
    expect(ret2[0].endTime).toBe(ret1[0].endTime + 7);
  });

  it('rejects init segment with no ttml', () => {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML));

    expect(() => new shaka.text.Mp4TtmlParser().parseInit(audioInitSegment))
        .toThrow(error);
  });

  it('can parse individual cues', () => {
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);
    const time = {periodStart: 0, segmentStart: 0, segmentEnd: 0};
    let segment = ttmlSegment;
    if (parser.supportsPartial()) {
      segment = segment.subarray(0, 1150);
    }
    const ret = parser.parseFirstCue(segment, time);
    expect(ret.startTime).toBe(23);
    expect(ret.endTime).toBe(24.5);
    expect(ret.payload).toBe('You\'re a jerk, Thom.');
  });
});
