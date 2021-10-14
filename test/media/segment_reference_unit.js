/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentReference');

describe('SegmentReference', () => {
  it('returns in getters values from constructor parameters', () => {
    const initSegmentReference = new shaka.media.InitSegmentReference(
        /* getUris= */ () => ['a', 'b'],
        /* startByte= */ 0,
        /* endBytes= */ null,
        null);

    const reference = new shaka.media.SegmentReference(
        /* startTime= */ 2,
        /* endTime= */ 3,
        /* getUris= */ () => ['x', 'y'],
        /* startByte= */ 4,
        /* endByte= */ 5,
        initSegmentReference,
        /* timestampOffset= */ 6,
        /* appendWindowStart= */ 7,
        /* appendWindowEnd= */ 8);

    expect(reference.getStartTime()).toBe(2);
    expect(reference.getEndTime()).toBe(3);
    expect(reference.getUris()).toEqual(['x', 'y']);
    expect(reference.getStartByte()).toBe(4);
    expect(reference.getEndByte()).toBe(5);
    expect(reference.initSegmentReference).toBe(initSegmentReference);
    expect(reference.timestampOffset).toBe(6);
    expect(reference.appendWindowStart).toBe(7);
    expect(reference.appendWindowEnd).toBe(8);
  });
});

describe('InitSegmentReference', () => {
  it('returns in getters values from constructor parameters', () => {
    const reference = new shaka.media.InitSegmentReference(
        /* getUris= */ () => ['x', 'y'],
        /* startByte= */ 4,
        /* endByte= */ 5,
        null);

    expect(reference.getUris()).toEqual(['x', 'y']);
    expect(reference.getStartByte()).toBe(4);
    expect(reference.getEndByte()).toBe(5);
  });
});
