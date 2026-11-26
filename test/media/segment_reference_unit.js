/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SegmentReference', () => {
  it('returns in getters values from constructor parameters', () => {
    const initSegmentReference = new shaka.media.InitSegmentReference(
        /* getUris= */ () => ['a', 'b'],
        /* startByte= */ 0,
        /* endBytes= */ null);

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

  describe('isSameMedia', () => {
    /**
     * @param {number} startTime
     * @param {number} endTime
     * @param {!Array<string>} uris
     * @param {number=} startByte
     * @param {?number=} endByte
     * @return {!shaka.media.SegmentReference}
     */
    function makeReference(
        startTime, endTime, uris, startByte = 0, endByte = null) {
      return new shaka.media.SegmentReference(
          startTime, endTime, () => uris, startByte, endByte,
          /* initSegmentReference= */ null,
          /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ Infinity);
    }

    const SegmentReference = shaka.media.SegmentReference;
    const reference = makeReference(10, 12, ['a.mp4']);

    it('is true for the same media in different references', () => {
      expect(SegmentReference.isSameMedia(reference, reference)).toBe(true);
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10, 12, ['a.mp4']))).toBe(true);
      // The end time is not compared.
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10, 11, ['a.mp4']))).toBe(true);
      // Tiny rounding errors are tolerated.
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10.0004, 12, ['a.mp4']))).toBe(true);
    });

    it('is false for another start time, URI or byte range', () => {
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10.01, 12, ['a.mp4']))).toBe(false);
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10, 12, ['b.mp4']))).toBe(false);
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10, 12, ['a.mp4'], 0, 99))).toBe(false);
      expect(SegmentReference.isSameMedia(
          reference, makeReference(10, 12, ['a.mp4'], 100))).toBe(false);
    });
  });
});

describe('InitSegmentReference', () => {
  const mediaQuality = {
    bandwidth: 1,
    audioSamplingRate: 444000,
    codecs: 'my codec',
    contentType: 'video',
    frameRate: 30,
    height: 720,
    mimeType: 'mime type',
    label: null,
    roles: null,
    language: null,
    channelsCount: 2,
    pixelAspectRatio: '1:1',
    width: 1280,
  };

  it('returns in getters values from constructor parameters', () => {
    const reference = new shaka.media.InitSegmentReference(
        /* getUris= */ () => ['x', 'y'],
        /* startByte= */ 4,
        /* endByte= */ 5,
        mediaQuality);

    expect(reference.getUris()).toEqual(['x', 'y']);
    expect(reference.getStartByte()).toBe(4);
    expect(reference.getEndByte()).toBe(5);
    expect(reference.getMediaQuality()).toBe(mediaQuality);
  });
});
