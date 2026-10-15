/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.VP9');


/**
 * VP9 utils.
 *
 * @see https://www.webmproject.org/vp9/
 * @see https://www.webmproject.org/vp9/mp4/
 */
shaka.codec.VP9 = class {
  /**
   * Reads what the codec string of a stream needs from a key frame, for the
   * containers that do not carry it apart from the frames.
   *
   * @param {!Uint8Array} frame A VP9 frame; only key frames are usable.
   * @return {?{profile: number, bitDepth: number, chroma: number,
   *   width: number, height: number}}
   * @see https://www.webmproject.org/vp9/ (uncompressed_header)
   */
  static parseKeyFrame(frame) {
    const VP9 = shaka.codec.VP9;
    if (frame.length < VP9.MIN_KEYFRAME_SIZE_) {
      return null;
    }
    let bit = 0;
    const read = (count) => {
      let value = 0;
      for (let i = 0; i < count; i++) {
        const byte = frame[bit >> 3];
        value = (value << 1) | ((byte >> (7 - (bit & 7))) & 1);
        bit++;
      }
      return value;
    };
    if (read(2) != VP9.FRAME_MARKER_) {
      return null;
    }
    const profileLow = read(1);
    const profileHigh = read(1);
    const profile = (profileHigh << 1) + profileLow;
    if (profile == VP9.PROFILE_WITH_RESERVED_BIT_) {
      read(1);
    }
    const showExistingFrame = read(1);
    if (showExistingFrame) {
      return null;
    }
    const frameType = read(1);
    // show_frame and error_resilient_mode.
    read(2);
    if (frameType != VP9.KEY_FRAME_) {
      return null;
    }
    if (read(24) != VP9.SYNC_CODE_) {
      return null;
    }

    let bitDepth = 8;
    if (profile >= 2) {
      bitDepth = read(1) ? 12 : 10;
    }
    const colorSpace = read(3);
    let subsamplingX = 1;
    let subsamplingY = 1;
    if (colorSpace != VP9.COLOR_SPACE_RGB_) {
      // color_range.
      read(1);
      if (profile == 1 || profile == 3) {
        subsamplingX = read(1);
        subsamplingY = read(1);
        // reserved_zero.
        read(1);
      }
    } else if (profile == 1 || profile == 3) {
      subsamplingX = 0;
      subsamplingY = 0;
    }
    const width = read(16) + 1;
    const height = read(16) + 1;

    let chroma = VP9.CHROMA_420_COLOCATED;
    if (subsamplingX && !subsamplingY) {
      chroma = VP9.CHROMA_422;
    } else if (!subsamplingX && !subsamplingY) {
      chroma = VP9.CHROMA_444;
    }
    return {profile, bitDepth, chroma, width, height};
  }

  /**
   * Builds the codec string of a VP9 stream.
   *
   * @param {{profile: number, bitDepth: number, chroma: number}} info
   * @param {number} width
   * @param {number} height
   * @param {?number} frameDuration Seconds per frame, if known.
   * @return {string}
   */
  static getCodecs(info, width, height, frameDuration) {
    const VP9 = shaka.codec.VP9;
    const pad = (value) => String(value).padStart(2, '0');
    const level = VP9.getLevel_(width, height, frameDuration);
    return 'vp09.' + pad(info.profile) + '.' + pad(level) + '.' +
        pad(info.bitDepth) + '.' + pad(info.chroma);
  }

  /**
   * Builds the payload of the vpcC box (VP Codec Configuration) from a VP9
   * codec string.
   *
   * @param {string} codecs 'vp09.PP.LL.DD', optionally followed by
   *   '.CC.cp.tc.mc.FF'.
   * @return {!Uint8Array}
   * @see https://www.webmproject.org/vp9/mp4/#vp-codec-configuration-box
   */
  static buildVpcC(codecs) {
    const VP9 = shaka.codec.VP9;
    // Skip the 'vp09' sample entry name and read the numeric fields.
    const fields = codecs.split('.').slice(1).map((value) => {
      return parseInt(value, 10);
    });
    const [profile = 0, level = 0, bitDepth = 8,
      chroma = VP9.CHROMA_420_COLOCATED,
      primaries = VP9.UNSPECIFIED_,
      transfer = VP9.UNSPECIFIED_,
      matrix = VP9.UNSPECIFIED_,
      fullRange = 0] = fields;
    return new Uint8Array([
      // A full box: version 1, no flags.
      1, 0, 0, 0,
      profile,
      level,
      (bitDepth << 4) | (chroma << 1) | fullRange,
      primaries,
      transfer,
      matrix,
      // codecInitializationDataSize (2 bytes): VP9 has none.
      0, 0,
    ]);
  }

  /**
   * Picks the lowest VP9 level whose limits hold the picture size and the
   * sample rate.
   *
   * @param {number} width
   * @param {number} height
   * @param {?number} frameDuration
   * @return {number}
   * @private
   */
  static getLevel_(width, height, frameDuration) {
    const VP9 = shaka.codec.VP9;
    const pictureSize = width * height;
    const frameRate = frameDuration ? 1 / frameDuration :
        VP9.DEFAULT_FRAME_RATE_;
    const sampleRate = pictureSize * frameRate;
    for (const [level, maxSampleRate, maxPictureSize] of VP9.LEVELS_) {
      if (pictureSize <= maxPictureSize && sampleRate <= maxSampleRate) {
        return level;
      }
    }
    return VP9.LEVELS_[VP9.LEVELS_.length - 1][0];
  }
};


/**
 * Values of the chroma subsampling field of the VP9 codec string.
 * @const {number}
 */
shaka.codec.VP9.CHROMA_420_COLOCATED = 1;

/** @const {number} */
shaka.codec.VP9.CHROMA_422 = 2;

/** @const {number} */
shaka.codec.VP9.CHROMA_444 = 3;

/**
 * The value of the color primaries, transfer and matrix fields when the stream
 * does not say (H.273 "unspecified").
 * @private @const {number}
 */
shaka.codec.VP9.UNSPECIFIED_ = 2;

/**
 * Frame rate assumed to pick a level when the stream does not say.
 * @private @const {number}
 */
shaka.codec.VP9.DEFAULT_FRAME_RATE_ = 30;

/**
 * Fields of the uncompressed header of a VP9 frame: the marker every frame
 * starts with, the profile whose header has one reserved bit, the value of
 * frame_type for a key frame, the sync code of key frames and RGB's color
 * space.
 * @private @const {number}
 */
shaka.codec.VP9.FRAME_MARKER_ = 2;

/** @private @const {number} */
shaka.codec.VP9.PROFILE_WITH_RESERVED_BIT_ = 3;

/** @private @const {number} */
shaka.codec.VP9.KEY_FRAME_ = 0;

/** @private @const {number} */
shaka.codec.VP9.SYNC_CODE_ = 0x498342;

/** @private @const {number} */
shaka.codec.VP9.COLOR_SPACE_RGB_ = 7;

/**
 * The bytes needed to read the uncompressed header of a key frame up to the
 * frame size: marker, profile and flags, sync code, color config and size.
 * @private @const {number}
 */
shaka.codec.VP9.MIN_KEYFRAME_SIZE_ = 12;

/**
 * VP9 levels: [level, MaxLumaSampleRate, MaxLumaPictureSize], from Annex A of
 * the VP9 bitstream specification.  Levels 4/4.1 and 5/5.1/5.2 differ only in
 * the bitrate and the sample rate limits.
 * @private @const {!Array<!Array<number>>}
 */
shaka.codec.VP9.LEVELS_ = [
  [10, 829440, 36864],
  [11, 2764800, 73728],
  [20, 4608000, 122880],
  [21, 9216000, 245760],
  [30, 20736000, 552960],
  [31, 36864000, 983040],
  [40, 83558400, 2228224],
  [41, 160432128, 2228224],
  [50, 311951360, 8912896],
  [51, 588251136, 8912896],
  [52, 1176502272, 8912896],
  [60, 1176502272, 35651584],
  [61, 2353004544, 35651584],
  [62, 4706009088, 35651584],
];
