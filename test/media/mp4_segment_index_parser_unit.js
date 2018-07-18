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

describe('Mp4SegmentIndexParser', function() {
  const indexSegmentUri = '/base/test/test/assets/index-segment.mp4';
  const mediaSegmentUri = '/base/test/test/assets/sintel-audio-segment.mp4';

  let indexSegment;
  let mediaSegment;

  beforeAll(async () => {
    let responses = await Promise.all([
      shaka.test.Util.fetch(indexSegmentUri),
      shaka.test.Util.fetch(mediaSegmentUri),
    ]);
    indexSegment = responses[0];
    mediaSegment = responses[1];
  });

  it('rejects a non-index segment ', function() {
    let error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MP4_SIDX_WRONG_BOX_TYPE);
    try {
      // eslint-disable-next-line new-cap
      shaka.media.Mp4SegmentIndexParser(mediaSegment, 0, [], 0);
      fail('non-index segment is supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  });

  it('parses index segment ', function() {
    // eslint-disable-next-line new-cap
    let result = shaka.media.Mp4SegmentIndexParser(indexSegment, 0, [], 0);
    let references =
        [
         {startTime: 0, endTime: 12, startByte: 92, endByte: 194960},
         {startTime: 12, endTime: 24, startByte: 194961, endByte: 294059},
         {startTime: 24, endTime: 36, startByte: 294060, endByte: 466352},
         {startTime: 36, endTime: 48, startByte: 466353, endByte: 615511},
         {startTime: 48, endTime: 60, startByte: 615512, endByte: 743301},
        ];

    expect(result).toBeTruthy();
    expect(result.length).toBe(references.length);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].position).toBe(i);
      expect(result[i].startTime).toBe(references[i].startTime);
      expect(result[i].endTime).toBe(references[i].endTime);
      expect(result[i].startByte).toBe(references[i].startByte);
      expect(result[i].endByte).toBe(references[i].endByte);
    }
  });

  it('takes a scaled presentationTimeOffset in seconds', function() {
    // eslint-disable-next-line new-cap
    let result = shaka.media.Mp4SegmentIndexParser(indexSegment, 0, [], 2);
    let references =
        [
         {startTime: -2, endTime: 10},
         {startTime: 10, endTime: 22},
         {startTime: 22, endTime: 34},
         {startTime: 34, endTime: 46},
         {startTime: 46, endTime: 58},
        ];

    expect(result).toBeTruthy();
    expect(result.length).toBe(references.length);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].position).toBe(i);
      expect(result[i].startTime).toBe(references[i].startTime);
      expect(result[i].endTime).toBe(references[i].endTime);
    }
  });
});
