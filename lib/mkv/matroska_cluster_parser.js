/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mkv.MatroskaClusterParser');

goog.require('shaka.mkv.BlockFlag');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.Lacing');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.EbmlParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Uint8ArrayUtils');
goog.requireType('shaka.mkv.MatroskaIndexParser');
goog.requireType('shaka.util.EbmlElement');


/**
 * Extracts the frames of one track from a range of Clusters.
 */
shaka.mkv.MatroskaClusterParser = class {
  /**
   * @param {BufferSource} data Whole Clusters, starting on a Cluster boundary.
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @param {number} timecodeScale Nanoseconds per timecode tick.
   * @param {boolean=} allowPartial When true the data may end in the middle of
   *   an element, and whatever complete blocks precede that point are
   *   returned.  Used to probe the start of a file.
   * @return {!Array<shaka.mkv.MatroskaClusterParser.Frame>}
   */
  static parseFrames(data, track, timecodeScale, allowPartial = false) {
    const bytes = shaka.util.BufferUtils.toUint8(data);
    /** @type {!Array<shaka.mkv.MatroskaClusterParser.Frame>} */
    const frames = [];
    const context = {track, timecodeScale, allowPartial, frames, blocks: 0};
    shaka.mkv.MatroskaClusterParser.parseElements_(
        new shaka.util.EbmlParser(bytes), context);
    return frames;
  }

  /**
   * Walks a sequence of Level-1 elements.
   *
   * @param {!shaka.util.EbmlParser} parser
   * @param {shaka.mkv.MatroskaClusterParser.Context} context
   * @private
   */
  static parseElements_(parser, context) {
    const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
    while (parser.hasMoreData()) {
      let element;
      try {
        element = parser.parseElement();
      } catch (error) {
        if (context.allowPartial &&
            error.code == shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS) {
          return;
        }
        throw MatroskaClusterParser.invalid_();
      }
      // Anything other than a Cluster (Cues, Tags...) can trail the last range.
      if (element.id != shaka.mkv.ElementId.CLUSTER) {
        continue;
      }
      if (element.isPartial() && !context.allowPartial) {
        throw MatroskaClusterParser.invalid_();
      }
      MatroskaClusterParser.parseCluster_(element, context);
      if (element.getDeclaredSize() == Infinity) {
        // A Cluster of unknown size (written by a live muxer) swallowed
        // everything that followed it, and parseCluster_() has read those
        // elements, including any following Cluster.
        return;
      }
    }
  }

  /**
   * @param {!shaka.util.EbmlElement} cluster
   * @param {shaka.mkv.MatroskaClusterParser.Context} context
   * @private
   */
  static parseCluster_(cluster, context) {
    const ElementId = shaka.mkv.ElementId;
    const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
    const isUnknownSize = cluster.getDeclaredSize() == Infinity;

    let clusterTicks = 0;
    // Blocks are read once the Cluster's timecode is known, because the
    // timecode is not guaranteed to come first.
    const blocks = [];
    const children = cluster.createParser();
    while (children.hasMoreData()) {
      let child;
      try {
        child = children.parseElement();
      } catch (error) {
        if (context.allowPartial) {
          break;
        }
        throw MatroskaClusterParser.invalid_();
      }
      if (isUnknownSize &&
          shaka.mkv.MatroskaConstants.LEVEL_1_IDS.has(child.id)) {
        // The next top-level element: this Cluster ends here.
        if (child.id == ElementId.CLUSTER) {
          MatroskaClusterParser.flushBlocks_(clusterTicks, blocks, context);
          blocks.length = 0;
          MatroskaClusterParser.parseCluster_(child, context);
          return;
        }
        continue;
      }
      if (child.isPartial()) {
        if (context.allowPartial) {
          break;
        }
        throw MatroskaClusterParser.invalid_();
      }
      switch (child.id) {
        case ElementId.CLUSTER_TIMECODE:
          clusterTicks = child.getUint();
          break;
        case ElementId.SIMPLE_BLOCK:
          blocks.push({element: child, keyframe: null, ticks: null});
          break;
        case ElementId.BLOCK_GROUP: {
          const group = MatroskaClusterParser.parseBlockGroup_(child);
          if (group) {
            blocks.push(group);
          }
          break;
        }
      }
    }
    MatroskaClusterParser.flushBlocks_(clusterTicks, blocks, context);
  }

  /**
   * @param {!shaka.util.EbmlElement} group
   * @return {?shaka.mkv.MatroskaClusterParser.PendingBlock}
   * @private
   */
  static parseBlockGroup_(group) {
    const ElementId = shaka.mkv.ElementId;
    let block = null;
    // A block that references no other block can be decoded on its own.
    let keyframe = true;
    let durationTicks = null;
    const fields = group.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      if (field.id == ElementId.BLOCK) {
        block = field;
      } else if (field.id == ElementId.REFERENCE_BLOCK) {
        keyframe = false;
      } else if (field.id == ElementId.BLOCK_DURATION) {
        durationTicks = field.getUint();
      }
    }
    return block ? {element: block, keyframe, ticks: durationTicks} : null;
  }

  /**
   * @param {number} clusterTicks
   * @param {!Array<shaka.mkv.MatroskaClusterParser.PendingBlock>} blocks
   * @param {shaka.mkv.MatroskaClusterParser.Context} context
   * @private
   */
  static flushBlocks_(clusterTicks, blocks, context) {
    for (const block of blocks) {
      shaka.mkv.MatroskaClusterParser.parseBlock_(
          clusterTicks, block, context);
    }
  }

  /**
   * Reads a (Simple)Block: track number, relative timecode, flags, optional
   * lacing header and the frames.
   *
   * @param {number} clusterTicks
   * @param {shaka.mkv.MatroskaClusterParser.PendingBlock} block
   * @param {shaka.mkv.MatroskaClusterParser.Context} context
   * @private
   */
  static parseBlock_(clusterTicks, block, context) {
    const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
    const {track, timecodeScale, frames} = context;
    const nanosecondsPerSecond =
        shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
    const bytes = block.element.getBytes();

    const trackNumber = MatroskaClusterParser.readVint_(bytes, 0);
    if (trackNumber.value != track.number) {
      return;
    }

    // The timecode (2 bytes) and the flags (1 byte) follow the track number.
    let offset = trackNumber.length;
    if (offset + 3 > bytes.length) {
      throw MatroskaClusterParser.invalid_();
    }
    // A signed 16-bit integer: a block can start before its Cluster.
    const relativeTicks = (((bytes[offset] << 8) | bytes[offset + 1]) << 16) >>
        16;
    const flags = bytes[offset + 2];
    offset += 3;

    const lacing = flags & shaka.mkv.BlockFlag.LACING_MASK;
    const sizes = MatroskaClusterParser.readFrameSizes_(
        bytes, offset, lacing);
    offset = sizes.dataStart;

    const startSeconds = (clusterTicks + relativeTicks) * timecodeScale /
        nanosecondsPerSecond;
    const isSimpleBlock =
        block.element.id == shaka.mkv.ElementId.SIMPLE_BLOCK;
    const keyframe = isSimpleBlock ?
        !!(flags & shaka.mkv.BlockFlag.KEYFRAME) : !!block.keyframe;
    // The duration of the block is shared by the frames it laces.
    const blockDuration = block.ticks == null ? null :
        block.ticks * timecodeScale / nanosecondsPerSecond;
    const frameDuration = blockDuration == null ? null :
        blockDuration / sizes.sizes.length;

    context.blocks++;
    for (let i = 0; i < sizes.sizes.length; i++) {
      const size = sizes.sizes[i];
      let data = bytes.subarray(offset, offset + size);
      if (track.strippedHeader && track.strippedHeader.length) {
        data = shaka.util.Uint8ArrayUtils.concat(track.strippedHeader, data);
      }
      frames.push({
        time: startSeconds + (frameDuration == null ? 0 : i * frameDuration),
        duration: frameDuration,
        data,
        keyframe,
        block: context.blocks,
        laceIndex: i,
      });
      offset += size;
    }
  }

  /**
   * Reads the sizes of the frames of a block, which depend on its lacing.
   *
   * @param {!Uint8Array} bytes The block.
   * @param {number} start Offset of the first byte after the block flags.
   * @param {number} lacing
   * @return {{sizes: !Array<number>, dataStart: number}}
   * @private
   */
  static readFrameSizes_(bytes, start, lacing) {
    const Lacing = shaka.mkv.Lacing;
    const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
    const sizes = [];
    let offset = start;

    if (lacing == Lacing.NONE) {
      sizes.push(bytes.length - offset);
    } else {
      if (offset >= bytes.length) {
        throw MatroskaClusterParser.invalid_();
      }
      // The number of frames, minus one.
      const count = bytes[offset++] + 1;
      if (lacing == Lacing.XIPH) {
        // Every size but the last is a run of bytes that are summed until one
        // is smaller than 255.
        const runContinues = 255;
        for (let i = 0; i < count - 1; i++) {
          let size = 0;
          let part;
          do {
            if (offset >= bytes.length) {
              throw MatroskaClusterParser.invalid_();
            }
            part = bytes[offset++];
            size += part;
          } while (part == runContinues);
          sizes.push(size);
        }
      } else if (lacing == Lacing.EBML) {
        // The first size is a variable-length integer; each following one is
        // a signed difference to its predecessor.
        for (let i = 0; i < count - 1; i++) {
          const vint = MatroskaClusterParser.readVint_(bytes, offset);
          offset += vint.length;
          if (i == 0) {
            sizes.push(vint.value);
          } else {
            // The difference is stored with a bias that makes it unsigned:
            // half of the range of a vint of this length.
            const bias = Math.pow(2, 7 * vint.length - 1) - 1;
            sizes.push(sizes[i - 1] + vint.value - bias);
          }
        }
      }
      if (lacing == Lacing.FIXED_SIZE) {
        const total = bytes.length - offset;
        if (total % count) {
          throw MatroskaClusterParser.invalid_();
        }
        for (let i = 0; i < count; i++) {
          sizes.push(total / count);
        }
      } else {
        // The last frame takes whatever is left.
        const used = sizes.reduce((sum, size) => sum + size, 0);
        sizes.push(bytes.length - offset - used);
      }
    }

    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (sizes.some((size) => size < 0) || offset + total > bytes.length) {
      throw MatroskaClusterParser.invalid_();
    }
    return {sizes, dataStart: offset};
  }

  /**
   * Reads an EBML variable-length integer, as used for the track number and
   * the lace sizes of a block.  Unlike an element ID, its length marker is not
   * part of its value.
   *
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @return {{value: number, length: number}}
   * @private
   */
  static readVint_(bytes, offset) {
    const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
    if (offset >= bytes.length || bytes[offset] == 0) {
      throw MatroskaClusterParser.invalid_();
    }
    // The number of leading zero bits, plus one, is the length in bytes.
    const length = Math.clz32(bytes[offset]) - 23;
    if (offset + length > bytes.length) {
      throw MatroskaClusterParser.invalid_();
    }
    let value = bytes[offset] & ((1 << (8 - length)) - 1);
    for (let i = 1; i < length; i++) {
      // Not a shift: the value can exceed 32 bits.
      value = value * 256 + bytes[offset + i];
    }
    return {value, length};
  }

  /** @return {!shaka.util.Error} @private */
  static invalid_() {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MKV_INVALID_FILE);
  }
};


/**
 * @typedef {{
 *   time: number,
 *   duration: ?number,
 *   data: !Uint8Array,
 *   keyframe: boolean,
 *   block: number,
 *   laceIndex: number,
 * }}
 *
 * @property {number} time
 *   Presentation time in seconds.  Frames laced into one block are spread over
 *   the block's duration when it has one, and share its time otherwise.
 * @property {?number} duration
 *   The duration in seconds, when the block writes one (BlockDuration).
 * @property {!Uint8Array} data
 *   The frame, as a view of the input.
 * @property {boolean} keyframe
 * @property {number} block
 *   The number of the block the frame comes from, which frames laced together
 *   share.
 * @property {number} laceIndex
 *   The position of the frame among those of its block.
 */
shaka.mkv.MatroskaClusterParser.Frame;


/**
 * @typedef {{
 *   track: !shaka.mkv.MatroskaIndexParser.Track,
 *   timecodeScale: number,
 *   allowPartial: boolean,
 *   frames: !Array<shaka.mkv.MatroskaClusterParser.Frame>,
 *   blocks: number,
 * }}
 */
shaka.mkv.MatroskaClusterParser.Context;


/**
 * @typedef {{
 *   element: !shaka.util.EbmlElement,
 *   keyframe: ?boolean,
 *   ticks: ?number,
 * }}
 */
shaka.mkv.MatroskaClusterParser.PendingBlock;
