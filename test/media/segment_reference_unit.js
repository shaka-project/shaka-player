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

describe('SegmentReference', () => {
  it('returns in getters values from constructor parameters', () => {
    const initSegmentReference = new shaka.media.InitSegmentReference(
        /* getUris */ () => ['a', 'b'],
        /* startByte */ 0,
        /* endBytes */ null);

    const reference = new shaka.media.SegmentReference(
        /* position */ 1,
        /* startTime */ 2,
        /* endTime */ 3,
        /* getUris */ () => ['x', 'y'],
        /* startByte */ 4,
        /* endByte */ 5,
        initSegmentReference,
        /* presentationTimeOffset */ 6);

    expect(reference.getPosition()).toBe(1);
    expect(reference.getStartTime()).toBe(2);
    expect(reference.getEndTime()).toBe(3);
    expect(reference.getUris()).toEqual(['x', 'y']);
    expect(reference.getStartByte()).toBe(4);
    expect(reference.getEndByte()).toBe(5);
    expect(reference.initSegmentReference).toBe(initSegmentReference);
    expect(reference.presentationTimeOffset).toBe(6);
  });
});

describe('InitSegmentReference', () => {
  it('returns in getters values from constructor parameters', () => {
    const reference = new shaka.media.InitSegmentReference(
        /* getUris */ () => ['x', 'y'],
        /* startByte */ 4,
        /* endByte */ 5);

    expect(reference.getUris()).toEqual(['x', 'y']);
    expect(reference.getStartByte()).toBe(4);
    expect(reference.getEndByte()).toBe(5);
  });
});
