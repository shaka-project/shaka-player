/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.mkv.BlockFlag');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.Lacing');
goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Uint8ArrayUtils');

describe('MatroskaClusterParser', () => {
  const ElementId = shaka.mkv.ElementId;
  const Lacing = shaka.mkv.Lacing;
  const BlockFlag = shaka.mkv.BlockFlag;
  const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
  const concat = (...arrays) => shaka.util.Uint8ArrayUtils.concat(...arrays);

  // One tick is one millisecond, the default.
  const TIMECODE_SCALE = 1000000;

  const Matroska = shaka.test.Matroska;

  /**
   * @param {number} id
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  const element = (id, ...payload) => Matroska.element(id, ...payload);

  /**
   * @param {number} id
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  const unknownSizeElement = (id, ...payload) => {
    return Matroska.unknownSizeElement(id, ...payload);
  };

  /**
   * @param {number} id
   * @param {number} value
   * @return {!Uint8Array}
   */
  const uint = (id, value) => Matroska.uint(id, value);

  /**
   * @param {number} track
   * @param {number} relativeTicks
   * @param {number} flags
   * @param {!Uint8Array} laceHeader
   * @param {...!Uint8Array} frames
   * @return {!Uint8Array}
   */
  const blockPayload = (track, relativeTicks, flags, laceHeader, ...frames) => {
    return Matroska.blockPayload(
        track, relativeTicks, flags, laceHeader, ...frames);
  };

  /**
   * @param {number} track
   * @param {number} relativeTicks
   * @param {number} flags
   * @param {...!Uint8Array} frames
   * @return {!Uint8Array}
   */
  const simpleBlock = (track, relativeTicks, flags, ...frames) => {
    return Matroska.simpleBlock(track, relativeTicks, flags, ...frames);
  };

  /**
   * @param {number} ticks
   * @param {...!Uint8Array} children
   * @return {!Uint8Array}
   */
  const cluster = (ticks, ...children) => Matroska.cluster(ticks, ...children);

  /**
   * @param {number} number
   * @return {!shaka.mkv.MatroskaIndexParser.Track}
   */
  const makeTrack = (number) => Matroska.makeTrack(number);

  const frameA = new Uint8Array([1, 2, 3]);
  const frameB = new Uint8Array([4, 5, 6, 7]);
  const frameC = new Uint8Array([8, 9]);

  it('reads the frames of a track with their times', () => {
    const data = cluster(1000,
        simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA),
        simpleBlock(1, 40, 0, frameB));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(1), TIMECODE_SCALE);
    expect(frames.length).toBe(2);
    expect(frames[0].time).toBeCloseTo(1, 6);
    expect(frames[0].keyframe).toBe(true);
    expect(Array.from(frames[0].data)).toEqual(Array.from(frameA));
    expect(frames[0].duration).toBe(null);
    expect(frames[1].time).toBeCloseTo(1.04, 6);
    expect(frames[1].keyframe).toBe(false);
  });

  it('applies the timecode scale', () => {
    // A tick of 100 microseconds.
    const data = cluster(10000,
        simpleBlock(1, 5, BlockFlag.KEYFRAME, frameA));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(1), 100000);
    expect(frames[0].time).toBeCloseTo(1.0005, 6);
  });

  it('does not depend on the timecode being the first element', () => {
    const data = element(ElementId.CLUSTER, concat(
        simpleBlock(1, 10, BlockFlag.KEYFRAME, frameA),
        uint(ElementId.CLUSTER_TIMECODE, 2000)));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(1), TIMECODE_SCALE);
    expect(frames[0].time).toBeCloseTo(2.01, 6);
  });

  it('ignores the frames of other tracks', () => {
    const data = cluster(0,
        simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA),
        simpleBlock(2, 0, BlockFlag.KEYFRAME, frameB),
        simpleBlock(1, 40, 0, frameC));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(2), TIMECODE_SCALE);
    expect(frames.length).toBe(1);
    expect(Array.from(frames[0].data)).toEqual(Array.from(frameB));
  });

  it('reads a block that starts before its cluster', () => {
    const data = cluster(1000,
        simpleBlock(1, -30, BlockFlag.KEYFRAME, frameA));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(1), TIMECODE_SCALE);
    expect(frames[0].time).toBeCloseTo(0.97, 6);
  });

  it('reads the frames of many clusters and skips other elements', () => {
    const data = concat(
        cluster(0, simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA)),
        // Something that is not a cluster, such as the Cues at the end.
        element(ElementId.CUES, new Uint8Array(3)),
        cluster(1000, simpleBlock(1, 0, BlockFlag.KEYFRAME, frameB)));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(1), TIMECODE_SCALE);
    expect(frames.map((frame) => frame.time)).toEqual([0, 1]);
  });

  describe('block groups', () => {
    /**
     * @param {...!Uint8Array} extra
     * @return {!Uint8Array}
     */
    const blockGroup = (...extra) => {
      return element(ElementId.BLOCK_GROUP, concat(
          element(ElementId.BLOCK, blockPayload(
              1, 20, 0, new Uint8Array(0), frameA)),
          ...extra));
    };

    it('reads the duration of a block', () => {
      const data = cluster(0,
          blockGroup(uint(ElementId.BLOCK_DURATION, 1500)));
      const frames = MatroskaClusterParser.parseFrames(
          data, makeTrack(1), TIMECODE_SCALE);
      expect(frames.length).toBe(1);
      expect(frames[0].time).toBeCloseTo(0.02, 6);
      expect(frames[0].duration).toBeCloseTo(1.5, 6);
    });

    it('takes a block that references no other as a keyframe', () => {
      const frames = MatroskaClusterParser.parseFrames(
          cluster(0, blockGroup()), makeTrack(1), TIMECODE_SCALE);
      expect(frames[0].keyframe).toBe(true);
    });

    it('takes a block that references another as not a keyframe', () => {
      const reference = element(ElementId.REFERENCE_BLOCK,
          new Uint8Array([0xff]));
      const frames = MatroskaClusterParser.parseFrames(
          cluster(0, blockGroup(reference)), makeTrack(1), TIMECODE_SCALE);
      expect(frames[0].keyframe).toBe(false);
    });
  });

  describe('lacing', () => {
    /**
     * @param {number} lacing
     * @param {!Uint8Array} laceHeader
     * @param {number=} blockDuration
     * @return {!Array<shaka.mkv.MatroskaClusterParser.Frame>}
     */
    const parseLaced = (lacing, laceHeader, blockDuration) => {
      const payload = blockPayload(
          1, 0, lacing, laceHeader, frameA, frameB, frameC);
      const block = blockDuration == null ?
          element(ElementId.SIMPLE_BLOCK, payload) :
          element(ElementId.BLOCK_GROUP, concat(
              element(ElementId.BLOCK, payload),
              uint(ElementId.BLOCK_DURATION, blockDuration)));
      return MatroskaClusterParser.parseFrames(
          cluster(0, block), makeTrack(1), TIMECODE_SCALE);
    };

    it('splits Xiph lacing', () => {
      // Three frames: the sizes of two are written (3, 4); the last is what
      // remains.
      const frames = parseLaced(Lacing.XIPH, new Uint8Array([2, 3, 4]));
      expect(frames.map((frame) => Array.from(frame.data))).toEqual([
        Array.from(frameA), Array.from(frameB), Array.from(frameC),
      ]);
    });

    it('splits Xiph lacing with a size over 255', () => {
      const big = new Uint8Array(300).fill(7);
      const payload = blockPayload(1, 0, Lacing.XIPH,
          // Two frames: the size of the first is 255 + 45.
          new Uint8Array([1, 255, 45]), big, frameA);
      const frames = MatroskaClusterParser.parseFrames(
          cluster(0, element(ElementId.SIMPLE_BLOCK, payload)),
          makeTrack(1), TIMECODE_SCALE);
      expect(frames.map((frame) => frame.data.length)).toEqual([300, 3]);
    });

    it('splits EBML lacing', () => {
      // Three frames.  The first size is 3.  The second differs by +1, which
      // is stored biased by 63 as 64.
      const frames = parseLaced(Lacing.EBML,
          new Uint8Array([2, 0x83, 0x80 | 64]));
      expect(frames.map((frame) => Array.from(frame.data))).toEqual([
        Array.from(frameA), Array.from(frameB), Array.from(frameC),
      ]);
    });

    it('splits EBML lacing where a size shrinks', () => {
      // 4, then 3 (a difference of -1, stored as 62), leaving 2.
      const payload = blockPayload(1, 0, Lacing.EBML,
          new Uint8Array([2, 0x84, 0x80 | 62]), frameB, frameA, frameC);
      const frames = MatroskaClusterParser.parseFrames(
          cluster(0, element(ElementId.SIMPLE_BLOCK, payload)),
          makeTrack(1), TIMECODE_SCALE);
      expect(frames.map((frame) => frame.data.length)).toEqual([4, 3, 2]);
    });

    it('splits fixed-size lacing', () => {
      const payload = blockPayload(1, 0, Lacing.FIXED_SIZE,
          new Uint8Array([1]), frameA, new Uint8Array([9, 9, 9]));
      const frames = MatroskaClusterParser.parseFrames(
          cluster(0, element(ElementId.SIMPLE_BLOCK, payload)),
          makeTrack(1), TIMECODE_SCALE);
      expect(frames.map((frame) => frame.data.length)).toEqual([3, 3]);
    });

    it('spreads the duration of a block over its frames', () => {
      const frames = parseLaced(Lacing.XIPH, new Uint8Array([2, 3, 4]), 90);
      expect(frames.map((frame) => frame.duration)).toEqual([
        jasmine.any(Number), jasmine.any(Number), jasmine.any(Number),
      ]);
      expect(frames[0].duration).toBeCloseTo(0.03, 6);
      expect(frames[1].time).toBeCloseTo(0.03, 6);
      expect(frames[2].time).toBeCloseTo(0.06, 6);
    });

    it('rejects sizes that do not fit the block', () => {
      const payload = blockPayload(1, 0, Lacing.XIPH,
          new Uint8Array([1, 200]), frameA);
      expect(() => MatroskaClusterParser.parseFrames(
          cluster(0, element(ElementId.SIMPLE_BLOCK, payload)),
          makeTrack(1), TIMECODE_SCALE)).toThrow();
    });

    it('rejects fixed-size lacing that does not divide the block', () => {
      const payload = blockPayload(1, 0, Lacing.FIXED_SIZE,
          new Uint8Array([1]), frameA, frameC);
      expect(() => MatroskaClusterParser.parseFrames(
          cluster(0, element(ElementId.SIMPLE_BLOCK, payload)),
          makeTrack(1), TIMECODE_SCALE)).toThrow();
    });
  });

  describe('clusters of unknown size', () => {
    it('ends them where the next cluster starts', () => {
      const data = concat(
          unknownSizeElement(ElementId.CLUSTER, concat(
              uint(ElementId.CLUSTER_TIMECODE, 0),
              simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA))),
          unknownSizeElement(ElementId.CLUSTER, concat(
              uint(ElementId.CLUSTER_TIMECODE, 1000),
              simpleBlock(1, 0, BlockFlag.KEYFRAME, frameB),
              simpleBlock(1, 40, 0, frameC))));
      const frames = MatroskaClusterParser.parseFrames(
          data, makeTrack(1), TIMECODE_SCALE);
      expect(frames.map((frame) => frame.time)).toEqual([0, 1, 1.04]);
    });

    it('ends them where another top-level element starts', () => {
      const data = concat(
          unknownSizeElement(ElementId.CLUSTER, concat(
              uint(ElementId.CLUSTER_TIMECODE, 0),
              simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA))),
          element(ElementId.CUES, new Uint8Array(4)));
      const frames = MatroskaClusterParser.parseFrames(
          data, makeTrack(1), TIMECODE_SCALE);
      expect(frames.length).toBe(1);
    });
  });

  describe('partial data', () => {
    const complete = cluster(0,
        simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA),
        simpleBlock(1, 40, 0, frameB));

    it('is an error by default', () => {
      const cut = complete.subarray(0, complete.length - 2);
      expect(() => MatroskaClusterParser.parseFrames(
          cut, makeTrack(1), TIMECODE_SCALE)).toThrow(jasmine.objectContaining({
        code: shaka.util.Error.Code.MKV_INVALID_FILE,
      }));
    });

    it('returns the frames before the cut when allowed', () => {
      const cut = complete.subarray(0, complete.length - 2);
      const frames = MatroskaClusterParser.parseFrames(
          cut, makeTrack(1), TIMECODE_SCALE, /* allowPartial= */ true);
      expect(frames.length).toBe(1);
      expect(Array.from(frames[0].data)).toEqual(Array.from(frameA));
    });

    it('returns nothing when the cut is in a header', () => {
      const frames = MatroskaClusterParser.parseFrames(
          complete.subarray(0, 3), makeTrack(1), TIMECODE_SCALE, true);
      expect(frames).toEqual([]);
    });
  });

  it('numbers the frames of a block together', () => {
    const laced = element(ElementId.SIMPLE_BLOCK, blockPayload(
        1, 0, Lacing.XIPH, new Uint8Array([1, 3]), frameA, frameB));
    const data = cluster(0,
        simpleBlock(1, 0, BlockFlag.KEYFRAME, frameC), laced,
        simpleBlock(1, 40, 0, frameC));
    const frames = MatroskaClusterParser.parseFrames(
        data, makeTrack(1), TIMECODE_SCALE);
    expect(frames.map((frame) => frame.block)).toEqual([1, 2, 2, 3]);
    expect(frames.map((frame) => frame.laceIndex)).toEqual([0, 0, 1, 0]);
  });

  it('puts back the header a track has stripped', () => {
    const track = makeTrack(1);
    track.strippedHeader = new Uint8Array([0xaa, 0xbb]);
    const frames = MatroskaClusterParser.parseFrames(
        cluster(0, simpleBlock(1, 0, BlockFlag.KEYFRAME, frameA)),
        track, TIMECODE_SCALE);
    expect(Array.from(frames[0].data)).toEqual([0xaa, 0xbb, 1, 2, 3]);
  });

  it('rejects a block that is too short to have a header', () => {
    const block = element(ElementId.SIMPLE_BLOCK,
        new Uint8Array([0x81, 0x00]));
    expect(() => MatroskaClusterParser.parseFrames(
        cluster(0, block), makeTrack(1), TIMECODE_SCALE)).toThrow();
  });
});
