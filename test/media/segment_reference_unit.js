/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
