/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.Flac');

goog.require('shaka.util.BufferUtils');


/**
 * FLAC utils.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9639.html
 */
shaka.codec.Flac = class {
  /**
   * Reads the STREAMINFO block of a FLAC stream.
   *
   * @param {!Uint8Array} metadata The metadata blocks, i.e. the STREAMINFO
   *   block, which comes first, and the ones that follow.  A leading "fLaC"
   *   marker, as Matroska stores it, is accepted.
   * @return {?shaka.codec.Flac.StreamInfo}
   */
  static parseStreamInfo(metadata) {
    const Flac = shaka.codec.Flac;
    let offset = Flac.hasMarker_(metadata) ? Flac.MARKER_.length : 0;
    // The block header: the type (0 for STREAMINFO) with a flag that marks the
    // last block, and the 24-bit length of the block.
    if (metadata.length < offset + Flac.BLOCK_HEADER_SIZE_ +
        Flac.STREAM_INFO_SIZE_ ||
        (metadata[offset] & Flac.BLOCK_TYPE_MASK_) !=
        Flac.BLOCK_TYPE_STREAM_INFO_) {
      return null;
    }
    offset += Flac.BLOCK_HEADER_SIZE_;
    const view = shaka.util.BufferUtils.toDataView(
        metadata, offset, Flac.STREAM_INFO_SIZE_);
    const minBlockSize = view.getUint16(0);
    const maxBlockSize = view.getUint16(2);
    // Sample rate (20 bits), channels minus one (3), bits per sample minus
    // one (5) and the total samples (36), packed in 8 bytes.  The first 32
    // bits hold all but the last 4 bits of the total.
    const packed = view.getUint32(10);
    const sampleRate = packed >>> 12;
    const channelCount = ((packed >>> 9) & 0x07) + 1;
    const bitsPerSample = ((packed >>> 4) & 0x1f) + 1;
    if (!sampleRate || !maxBlockSize) {
      return null;
    }
    return {minBlockSize, maxBlockSize, sampleRate, channelCount,
      bitsPerSample};
  }

  /**
   * Gets the payload of the dfLa box (FLAC specific box): a full box that
   * holds the metadata blocks.  Only the STREAMINFO block, which is all a
   * decoder needs, is written, and it is marked as the last block.  The
   * metadata of a Matroska track has it with the flag cleared, when the muxer
   * left the blocks that follow it out, and a decoder that follows the
   * specification to the letter then looks for a block that is not there.
   *
   * @param {!Uint8Array} metadata The metadata blocks, with or without the
   *   "fLaC" marker.
   * @return {!Uint8Array}
   */
  static buildDfLa(metadata) {
    const Flac = shaka.codec.Flac;
    const offset = Flac.hasMarker_(metadata) ? Flac.MARKER_.length : 0;
    const block = metadata.slice(offset,
        offset + Flac.BLOCK_HEADER_SIZE_ + Flac.STREAM_INFO_SIZE_);
    block[0] |= Flac.LAST_BLOCK_FLAG_;
    // Version and flags come first.
    const result = new Uint8Array(4 + block.length);
    result.set(block, 4);
    return result;
  }

  /**
   * Gets the number of samples of a FLAC frame from its header.
   *
   * @param {!Uint8Array} frame
   * @param {shaka.codec.Flac.StreamInfo} streamInfo
   * @return {number}
   */
  static getBlockSize(frame, streamInfo) {
    const Flac = shaka.codec.Flac;
    // A stream that always uses the same size has no need to be read.
    if (streamInfo.minBlockSize == streamInfo.maxBlockSize) {
      return streamInfo.maxBlockSize;
    }
    // The sync code is 14 bits (0xFFF8, with the last bit being the blocking
    // strategy); then the block size code (4 bits) and the sample rate code.
    if (frame.length < Flac.FRAME_HEADER_MIN_SIZE_ || frame[0] != 0xff ||
        (frame[1] & 0xfe) != 0xf8) {
      return streamInfo.maxBlockSize;
    }
    const code = frame[2] >> 4;
    if (code == Flac.BLOCK_SIZE_CODE_192_) {
      return 192;
    }
    if (code >= Flac.BLOCK_SIZE_CODE_576_FIRST_ &&
        code <= Flac.BLOCK_SIZE_CODE_576_LAST_) {
      return 576 << (code - Flac.BLOCK_SIZE_CODE_576_FIRST_);
    }
    if (code >= Flac.BLOCK_SIZE_CODE_256_FIRST_) {
      return 256 << (code - Flac.BLOCK_SIZE_CODE_256_FIRST_);
    }
    if (code == Flac.BLOCK_SIZE_CODE_8_BITS_ ||
        code == Flac.BLOCK_SIZE_CODE_16_BITS_) {
      // The size, minus one, is at the end of the header, after the number of
      // the frame or of the sample, which is UTF-8 coded: the leading ones of
      // its first byte give its length.
      const offset = Flac.FRAME_HEADER_MIN_SIZE_ +
          Math.max(1, Math.clz32(~(frame[4] << 24)));
      if (code == Flac.BLOCK_SIZE_CODE_8_BITS_ && offset < frame.length) {
        return frame[offset] + 1;
      }
      if (code == Flac.BLOCK_SIZE_CODE_16_BITS_ && offset + 1 < frame.length) {
        return ((frame[offset] << 8) | frame[offset + 1]) + 1;
      }
    }
    return streamInfo.maxBlockSize;
  }

  /**
   * @param {!Uint8Array} metadata
   * @return {boolean}
   * @private
   */
  static hasMarker_(metadata) {
    const marker = shaka.codec.Flac.MARKER_;
    return metadata.length >= marker.length &&
        marker.every((byte, i) => metadata[i] == byte);
  }
};


/**
 * @typedef {{
 *   minBlockSize: number,
 *   maxBlockSize: number,
 *   sampleRate: number,
 *   channelCount: number,
 *   bitsPerSample: number,
 * }}
 */
shaka.codec.Flac.StreamInfo;


/**
 * The "fLaC" marker that starts a FLAC stream.
 * @private @const {!Array<number>}
 */
shaka.codec.Flac.MARKER_ = [0x66, 0x4c, 0x61, 0x43];

/**
 * The header of a metadata block: type and last-block flag (1 byte) and length
 * (3 bytes).
 * @private @const {number}
 */
shaka.codec.Flac.BLOCK_HEADER_SIZE_ = 4;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_TYPE_MASK_ = 0x7f;

/**
 * The bit of the first byte of a metadata block header that marks the last one.
 * @private @const {number}
 */
shaka.codec.Flac.LAST_BLOCK_FLAG_ = 0x80;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_TYPE_STREAM_INFO_ = 0;

/** @private @const {number} */
shaka.codec.Flac.STREAM_INFO_SIZE_ = 34;

/**
 * The bytes of a frame header before the coded number: sync code, sizes and
 * channel assignment.
 * @private @const {number}
 */
shaka.codec.Flac.FRAME_HEADER_MIN_SIZE_ = 4;

/**
 * The block size codes of the frame header.  Code 1 is 192 samples; 2 to 5 are
 * 576 doubled each time; 6 and 7 write the size after the header, with 8 and
 * 16 bits; 8 to 15 are 256 doubled each time.
 * @private @const {number}
 */
shaka.codec.Flac.BLOCK_SIZE_CODE_192_ = 1;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_SIZE_CODE_576_FIRST_ = 2;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_SIZE_CODE_576_LAST_ = 5;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_SIZE_CODE_8_BITS_ = 6;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_SIZE_CODE_16_BITS_ = 7;

/** @private @const {number} */
shaka.codec.Flac.BLOCK_SIZE_CODE_256_FIRST_ = 8;
