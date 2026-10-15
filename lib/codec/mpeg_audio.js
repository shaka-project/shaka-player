/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.MpegAudio');

goog.require('shaka.codec.AAC');


/**
 *  MPEG parser utils
 *
 *  @see https://en.wikipedia.org/wiki/MP3
 */
shaka.codec.MpegAudio = class {
  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {?{
   *   sampleRate: number,
   *   channelCount: number,
   *   frameLength: number,
   *   samplesPerFrame: number,
   * }}
   */
  static parseHeader(data, offset) {
    const MpegAudio = shaka.codec.MpegAudio;

    if (!MpegAudio.isHeader(data, offset)) {
      return null;
    }

    const mpegVersion = (data[offset + 1] >> 3) & 3;
    const mpegLayer = (data[offset + 1] >> 1) & 3;
    const bitRateIndex = (data[offset + 2] >> 4) & 15;
    const sampleRateIndex = (data[offset + 2] >> 2) & 3;
    if (mpegVersion !== 1 && bitRateIndex !== 0 &&
      bitRateIndex !== 15 && sampleRateIndex !== 3) {
      const paddingBit = (data[offset + 2] >> 1) & 1;
      const channelMode = data[offset + 3] >> 6;
      let columnInBitrates = 0;
      if (mpegVersion === 3) {
        columnInBitrates = 3 - mpegLayer;
      } else {
        columnInBitrates = mpegLayer === 3 ? 3 : 4;
      }
      const bitRate = MpegAudio.BITRATES_MAP_[
          columnInBitrates * 14 + bitRateIndex - 1] * 1000;
      const columnInSampleRates =
        mpegVersion === 3 ? 0 : mpegVersion === 2 ? 1 : 2;
      const sampleRate = MpegAudio.SAMPLING_RATE_MAP_[
          columnInSampleRates * 3 + sampleRateIndex];
      // If bits of channel mode are `11` then it is a single channel (Mono)
      const channelCount = channelMode === 3 ? 1 : 2;
      const sampleCoefficient =
          MpegAudio.SAMPLES_COEFFICIENTS_[mpegVersion][mpegLayer];
      const bytesInSlot = MpegAudio.BYTES_IN_SLOT_[mpegLayer];
      const samplesPerFrame = sampleCoefficient * 8 * bytesInSlot;
      const frameLength =
        Math.floor((sampleCoefficient * bitRate) / sampleRate + paddingBit) *
        bytesInSlot;

      if (!frameLength || !samplesPerFrame || !sampleRate) {
        return null;
      }

      const userAgent = navigator.userAgent || '';
      // This affect to Tizen also for example.
      const result = userAgent.match(/Chrome\/(\d+)/i);
      const chromeVersion = result ? parseInt(result[1], 10) : 0;
      const needChromeFix = !!chromeVersion && chromeVersion <= 87;

      if (needChromeFix && mpegLayer === 2 &&
        bitRate >= 224000 && channelMode === 0) {
        // Work around bug in Chromium by setting channelMode
        // to dual-channel (01) instead of stereo (00)
        data[offset + 3] = data[offset + 3] | 0x80;
      }

      return {sampleRate, channelCount, frameLength, samplesPerFrame};
    }
    return null;
  }

  /**
   * Gets the RFC 6381 codec string with which MP4 carries MPEG audio: the
   * objectTypeIndication of MPEG-1 audio (MP3) or MPEG-2 audio (the lower
   * sample rates).  Some platforms (e.g. Chromecast) take MP3 in MP4 only
   * with these strings, and not with "mp3".
   *
   * @param {number} sampleRate
   * @return {string}
   */
  static getMp4Codec(sampleRate) {
    const MpegAudio = shaka.codec.MpegAudio;
    return sampleRate >= MpegAudio.MPEG1_MIN_SAMPLE_RATE_ ?
        MpegAudio.MP4_CODEC_MPEG1 : MpegAudio.MP4_CODEC_MPEG2;
  }

  /**
   * Builds the payload of the esds box of MPEG audio in MP4.
   *
   * @param {number} sampleRate
   * @return {!Uint8Array}
   */
  static buildEsds(sampleRate) {
    const MpegAudio = shaka.codec.MpegAudio;
    return shaka.codec.AAC.buildEsds(
        new Uint8Array(0),
        sampleRate >= MpegAudio.MPEG1_MIN_SAMPLE_RATE_ ?
            MpegAudio.OBJECT_TYPE_MPEG1_AUDIO_ :
            MpegAudio.OBJECT_TYPE_MPEG2_AUDIO_);
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static isHeaderPattern(data, offset) {
    return (
      data[offset] === 0xff &&
      (data[offset + 1] & 0xe0) === 0xe0 &&
      (data[offset + 1] & 0x06) !== 0x00
    );
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static isHeader(data, offset) {
    // Look for MPEG header | 1111 1111 | 111X XYZX | where X can be either
    // 0 or 1 and Y or Z should be 1
    // Layer bits (position 14 and 15) in header should be always different
    // from 0 (Layer I or Layer II or Layer III)
    // More info http://www.mp3-tech.org/programmer/frame_header.html
    return offset + 1 < data.length &&
      shaka.codec.MpegAudio.isHeaderPattern(data, offset);
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static probe(data, offset) {
    const MpegAudio = shaka.codec.MpegAudio;
    // same as isHeader but we also check that MPEG frame follows last
    // MPEG frame or end of data is reached
    if (offset + 1 < data.length &&
        MpegAudio.isHeaderPattern(data, offset)) {
      // MPEG header Length
      const headerLength = 4;
      // MPEG frame Length
      const header = MpegAudio.parseHeader(data, offset);
      let frameLength = headerLength;
      if (header && header.frameLength) {
        frameLength = header.frameLength;
      }

      const newOffset = offset + frameLength;
      return newOffset === data.length ||
          MpegAudio.isHeader(data, newOffset);
    }
    return false;
  }
};


/**
 * @private {!Array<number>}
 */
shaka.codec.MpegAudio.BITRATES_MAP_ = [
  32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 32, 48, 56,
  64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 32, 40, 48, 56, 64, 80,
  96, 112, 128, 160, 192, 224, 256, 320, 32, 48, 56, 64, 80, 96, 112, 128, 144,
  160, 176, 192, 224, 256, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144,
  160,
];

/**
 * @private {!Array<number>}
 */
shaka.codec.MpegAudio.SAMPLING_RATE_MAP_ = [
  44100, 48000, 32000, 22050, 24000, 16000, 11025, 12000, 8000,
];

/**
 * @private {!Array<!Array<number>>}
 */
shaka.codec.MpegAudio.SAMPLES_COEFFICIENTS_ = [
  // MPEG 2.5
  [
    0, // Reserved
    72, // Layer3
    144, // Layer2
    12, // Layer1
  ],
  // Reserved
  [
    0, // Reserved
    0, // Layer3
    0, // Layer2
    0, // Layer1
  ],
  // MPEG 2
  [
    0, // Reserved
    72, // Layer3
    144, // Layer2
    12, // Layer1
  ],
  // MPEG 1
  [
    0, // Reserved
    144, // Layer3
    144, // Layer2
    12, // Layer1
  ],
];


/**
 * @private {!Array<number>}
 */
shaka.codec.MpegAudio.BYTES_IN_SLOT_ = [
  0, // Reserved
  1, // Layer3
  1, // Layer2
  4, // Layer1
];

/**
 * @const {number}
 */
shaka.codec.MpegAudio.MPEG_AUDIO_SAMPLE_PER_FRAME = 1152;

/**
 * The codec strings of MPEG-1 and MPEG-2 audio in MP4, which are the
 * objectTypeIndication in hexadecimal (ISO/IEC 14496-1, table 5).
 * @const {string}
 */
shaka.codec.MpegAudio.MP4_CODEC_MPEG1 = 'mp4a.6B';

/** @const {string} */
shaka.codec.MpegAudio.MP4_CODEC_MPEG2 = 'mp4a.69';

/**
 * objectTypeIndication of MPEG-1 audio (0x6B) and MPEG-2 audio (0x69).
 * @private @const {number}
 */
shaka.codec.MpegAudio.OBJECT_TYPE_MPEG1_AUDIO_ = 0x6B;

/** @private @const {number} */
shaka.codec.MpegAudio.OBJECT_TYPE_MPEG2_AUDIO_ = 0x69;

/**
 * MPEG-1 audio has the sample rates 32000, 44100 and 48000 Hz; the lower ones
 * belong to MPEG-2 (and 2.5).
 * @private @const {number}
 */
shaka.codec.MpegAudio.MPEG1_MIN_SAMPLE_RATE_ = 32000;
