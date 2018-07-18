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

describe('WebmSegmentIndexParser', function() {
  const indexSegmentUri = '/base/test/test/assets/index-segment.webm';
  const initSegmentUri = '/base/test/test/assets/init-segment.webm';

  let indexSegment;
  let initSegment;
  let parser = new shaka.media.WebmSegmentIndexParser();

  beforeAll(async () => {
    let responses = await Promise.all([
      shaka.test.Util.fetch(indexSegmentUri),
      shaka.test.Util.fetch(initSegmentUri),
    ]);
    indexSegment = responses[0];
    initSegment = responses[1];
  });

  it('rejects a non-index segment ', function() {
    let error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_CUES_ELEMENT_MISSING);
    try {
      parser.parse(initSegment, initSegment, [], 0);
      fail('non-index segment is supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  });

  it('rejects an invalid init segment ', function() {
    let error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.WEBM_EBML_HEADER_ELEMENT_MISSING);
    try {
      parser.parse(indexSegment, indexSegment, [], 0);
      fail('invalid init segment is supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  });

  it('parses index segment ', function() {
    let result = parser.parse(indexSegment, initSegment, [], 0);
    let references =
        [
         {startTime: 0, endTime: 12, startByte: 281, endByte: 95911},
         {startTime: 12, endTime: 24, startByte: 95912, endByte: 209663},
         {startTime: 24, endTime: 36, startByte: 209664, endByte: 346545},
         {startTime: 36, endTime: 48, startByte: 346546, endByte: 458817},
         {startTime: 48, endTime: 60, startByte: 458818, endByte: null},
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
    let result = parser.parse(indexSegment, initSegment, [], 2);
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
