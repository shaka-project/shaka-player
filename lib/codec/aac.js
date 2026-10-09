/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.AAC');

goog.require('goog.asserts');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * AAC utils, for when the codec configuration comes as an AudioSpecificConfig.
 *
 * @see ISO/IEC 14496-3 (AudioSpecificConfig)
 * @see ISO/IEC 14496-1 (descriptors)
 */
shaka.codec.AAC = class {
  /**
   * Gets the RFC 6381 codec string of an AAC stream.
   *
   * @param {!Uint8Array} audioSpecificConfig
   * @param {?number=} sampleRate The sample rate of the AAC core.
   * @param {?number=} outputSampleRate The sample rate of the output, which
   *   is twice the core's when HE-AAC is signaled implicitly.
   * @return {string}
   */
  static getCodecs(audioSpecificConfig, sampleRate, outputSampleRate) {
    const AAC = shaka.codec.AAC;
    // The first 5 bits of the AudioSpecificConfig are the audio object type;
    // 31 announces an escape to 6 more bits.
    let objectType = audioSpecificConfig[0] >> 3;
    if (objectType == AAC.OBJECT_TYPE_ESCAPE_ &&
        audioSpecificConfig.length > 1) {
      objectType = 32 + (((audioSpecificConfig[0] & 0x07) << 3) |
          (audioSpecificConfig[1] >> 5));
    }
    const isImplicitSbr = objectType == AAC.OBJECT_TYPE_LC_ &&
        !!sampleRate && !!outputSampleRate &&
        outputSampleRate >= 2 * sampleRate;
    if (isImplicitSbr) {
      objectType = AAC.OBJECT_TYPE_SBR_;
    }
    return 'mp4a.40.' + objectType;
  }

  /**
   * Builds the payload of the esds box around an AudioSpecificConfig.
   *
   * @param {!Uint8Array} audioSpecificConfig
   * @return {!Uint8Array}
   */
  static buildEsds(audioSpecificConfig) {
    const AAC = shaka.codec.AAC;
    const decoderSpecificInfo = AAC.descriptor_(
        AAC.TAG_DECODER_SPECIFIC_INFO_, audioSpecificConfig);
    const decoderConfig = AAC.descriptor_(
        AAC.TAG_DECODER_CONFIG_,
        new Uint8Array([
          AAC.OBJECT_TYPE_MPEG4_AUDIO_,
          AAC.STREAM_TYPE_AUDIO_,
          // bufferSizeDB (3 bytes), maxBitrate and avgBitrate (4 bytes each)
          // are informative and 0 means "unknown".
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
        decoderSpecificInfo);
    const slConfig = AAC.descriptor_(
        AAC.TAG_SL_CONFIG_, new Uint8Array([AAC.SL_PREDEFINED_MP4_]));
    const esDescriptor = AAC.descriptor_(
        AAC.TAG_ES_,
        // ES_ID (2 bytes, 0: the sample entry refers to the track) and the
        // stream dependence, URL and OCR flags (1 byte, none set).
        new Uint8Array([0, 0, 0]),
        decoderConfig,
        slConfig);
    // esds is a full box: version and flags, all zero.
    return shaka.util.Uint8ArrayUtils.concat(new Uint8Array(4), esDescriptor);
  }

  /**
   * Builds an MPEG-4 descriptor: a tag, a length and the payload.
   *
   * @param {number} tag
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   * @private
   */
  static descriptor_(tag, ...payload) {
    const body = shaka.util.Uint8ArrayUtils.concat(...payload);
    // Descriptor lengths are variable-length, but ours never reach 128 bytes
    // (an AudioSpecificConfig is a handful of bytes), so one byte is enough.
    goog.asserts.assert(body.length < 0x80, 'Descriptor is too long');
    return shaka.util.Uint8ArrayUtils.concat(
        new Uint8Array([tag, body.length]), body);
  }
};


/**
 * Audio object types of MPEG-4 Audio: AAC LC and HE-AAC (with SBR); 31 is the
 * escape value.
 * @private @const {number}
 */
shaka.codec.AAC.OBJECT_TYPE_LC_ = 2;

/** @private @const {number} */
shaka.codec.AAC.OBJECT_TYPE_SBR_ = 5;

/** @private @const {number} */
shaka.codec.AAC.OBJECT_TYPE_ESCAPE_ = 31;

/**
 * Tags of the MPEG-4 descriptors that make up an esds box.
 * @private @const {number}
 */
shaka.codec.AAC.TAG_ES_ = 0x03;

/** @private @const {number} */
shaka.codec.AAC.TAG_DECODER_CONFIG_ = 0x04;

/** @private @const {number} */
shaka.codec.AAC.TAG_DECODER_SPECIFIC_INFO_ = 0x05;

/** @private @const {number} */
shaka.codec.AAC.TAG_SL_CONFIG_ = 0x06;

/**
 * objectTypeIndication of MPEG-4 Audio (ISO/IEC 14496-3).
 * @private @const {number}
 */
shaka.codec.AAC.OBJECT_TYPE_MPEG4_AUDIO_ = 0x40;

/**
 * streamType 5 (audio) shifted into the top six bits, plus the reserved bit
 * that is always set.
 * @private @const {number}
 */
shaka.codec.AAC.STREAM_TYPE_AUDIO_ = (0x05 << 2) | 0x01;

/**
 * The SL config predefined value reserved for use in MP4 files.
 * @private @const {number}
 */
shaka.codec.AAC.SL_PREDEFINED_MP4_ = 0x02;
