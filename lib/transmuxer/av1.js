/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.AV1');

goog.require('shaka.util.ExpGolomb');


/**
 * AV1 utils.
 *
 * An AV1 access unit is a "temporal unit": a flat sequence of Open Bitstream
 * Units (OBUs), each self-delimiting through its own header. There are no
 * start codes and no length prefixes, and — unlike H.264/H.265 — no emulation
 * prevention bytes, so an OBU payload can be read as a raw bit stream.
 *
 * @see https://aomediacodec.github.io/av1-spec/av1-spec.pdf
 * @see https://aomediacodec.github.io/av1-isobmff/ (av1C)
 */
shaka.transmuxer.AV1 = class {
  /**
   * Splits a temporal unit into its OBUs.
   *
   * @param {!Uint8Array} data
   * @return {!Array<shaka.transmuxer.AV1.Obu>}
   */
  static parseObus(data) {
    const AV1 = shaka.transmuxer.AV1;

    /** @type {!Array<shaka.transmuxer.AV1.Obu>} */
    const obus = [];
    let offset = 0;

    while (offset < data.byteLength) {
      const start = offset;
      const headerByte = data[offset++];

      // obu_forbidden_bit must be 0. Anything else means we have lost sync,
      // and continuing would emit garbage OBUs.
      if (headerByte & 0x80) {
        break;
      }

      const type = (headerByte & 0x78) >> 3;
      const hasExtension = (headerByte & 0x04) != 0;
      const hasSizeField = (headerByte & 0x02) != 0;

      if (hasExtension) {
        if (offset >= data.byteLength) {
          break;
        }
        offset++;
      }

      let payloadSize;
      if (hasSizeField) {
        const leb128 = AV1.readLeb128_(data, offset);
        if (!leb128) {
          break;
        }
        payloadSize = leb128.value;
        offset = leb128.offset;
      } else {
        // Only the last OBU of a temporal unit may omit its size field, in
        // which case it runs to the end of the unit.
        payloadSize = data.byteLength - offset;
      }

      const payloadEnd = offset + payloadSize;
      if (payloadEnd > data.byteLength) {
        // Malformed: the declared size runs past the temporal unit.
        break;
      }

      obus.push({
        type,
        data: data.subarray(offset, payloadEnd),
        fullData: data.subarray(start, payloadEnd),
      });
      offset = payloadEnd;
    }

    return obus;
  }

  /**
   * Reads the sequence header of a temporal unit and returns the properties
   * needed to describe the stream, or null when the unit carries none.
   *
   * Only key frames carry a sequence header, so callers must cache the result
   * and reuse it for the inter frames that follow.
   *
   * @param {!Array<shaka.transmuxer.AV1.Obu>} obus
   * @return {?shaka.transmuxer.AV1.Info}
   */
  static parseInfo(obus) {
    const AV1 = shaka.transmuxer.AV1;
    if (!obus.length) {
      return null;
    }
    const sequenceHeader = obus.find((obu) => {
      return obu.type == AV1.OBU_TYPE_SEQUENCE_HEADER_;
    });
    if (!sequenceHeader) {
      return null;
    }

    const parsed = AV1.parseSequenceHeader_(sequenceHeader.data);
    if (!parsed) {
      return null;
    }

    return {
      width: parsed.width,
      height: parsed.height,
      reducedStillPicture: parsed.reducedStillPicture,
      videoConfig: AV1.buildAv1C_(parsed, sequenceHeader.fullData),
    };
  }

  /**
   * Returns whether a temporal unit codes a shown key frame.
   *
   * `uncompressed_header()` (AV1 §5.9.2) puts `show_existing_frame` and
   * `frame_type` in the first three bits of a frame header, so this needs no
   * state from the sequence header beyond `reduced_still_picture_header` —
   * which suppresses both fields and makes every frame a key frame.
   *
   * @param {!Array<shaka.transmuxer.AV1.Obu>} obus
   * @param {boolean} reducedStillPicture
   * @return {boolean}
   */
  static isKeyframe(obus, reducedStillPicture) {
    const AV1 = shaka.transmuxer.AV1;

    for (const obu of obus) {
      if (obu.type != AV1.OBU_TYPE_FRAME_ &&
          obu.type != AV1.OBU_TYPE_FRAME_HEADER_) {
        continue;
      }
      if (reducedStillPicture) {
        return true;
      }
      if (!obu.data.byteLength) {
        return false;
      }
      const firstByte = obu.data[0];
      // show_existing_frame f(1) — a repeat of an already decoded frame, which
      // codes no picture of its own and is never a key frame here.
      if (firstByte & 0x80) {
        return false;
      }
      // frame_type f(2), where 0 is KEY_FRAME.
      return ((firstByte & 0x60) >> 5) == AV1.FRAME_TYPE_KEY_;
    }

    return false;
  }

  /**
   * Builds an AV1CodecConfigurationRecord (the payload of an `av1C` box).
   *
   * The record is four fixed bytes describing the decoder requirements,
   * followed by `configOBUs` — the sequence header itself. The OBU bytes are
   * copied verbatim rather than re-serialised from the parsed fields, because
   * a sequence header carries data this parser does not model (operating
   * points, timing info, trailing bits), and the decoder is configured from
   * these bytes.
   *
   * @param {shaka.transmuxer.AV1.SequenceHeader} header
   * @param {!Uint8Array} sequenceHeaderObu
   * @return {!Uint8Array}
   * @private
   */
  static buildAv1C_(header, sequenceHeaderObu) {
    const record = new Uint8Array(4 + sequenceHeaderObu.byteLength);
    // marker f(1) = 1, version f(7) = 1
    record[0] = 0x81;
    // seq_profile f(3), seq_level_idx_0 f(5)
    record[1] = ((header.seqProfile & 0x07) << 5) | (header.seqLevelIdx & 0x1f);
    // seq_tier_0 f(1), high_bitdepth f(1), twelve_bit f(1), monochrome f(1),
    // chroma_subsampling_x f(1), chroma_subsampling_y f(1),
    // chroma_sample_position f(2)
    record[2] =
        (header.seqTier << 7) |
        (header.highBitdepth << 6) |
        (header.twelveBit << 5) |
        (header.monochrome << 4) |
        (header.subsamplingX << 3) |
        (header.subsamplingY << 2) |
        (header.chromaSamplePosition & 0x03);
    // reserved f(3) = 0, initial_presentation_delay_present f(1) = 0,
    // reserved f(4) = 0.  We do not signal a presentation delay: it is
    // optional, and the frames arrive one per LOC object in decode order.
    record[3] = 0x00;
    record.set(sequenceHeaderObu, 4);
    return record;
  }

  /**
   * Parses `sequence_header_obu()` (AV1 §5.5.1).
   *
   * @param {!Uint8Array} data  The OBU payload, without its header.
   * @return {?shaka.transmuxer.AV1.SequenceHeader}
   * @private
   */
  static parseSequenceHeader_(data) {
    const AV1 = shaka.transmuxer.AV1;
    if (!data.byteLength) {
      return null;
    }
    const reader = AV1.makeReader_(data);

    const seqProfile = AV1.readBits_(reader, 3);
    AV1.readBits_(reader, 1); // still_picture
    const reducedStillPicture = AV1.readBits_(reader, 1) == 1;

    let seqLevelIdx = 0;
    let seqTier = 0;

    if (reducedStillPicture) {
      seqLevelIdx = AV1.readBits_(reader, 5);
    } else {
      let decoderModelInfoPresent = false;
      let bufferDelayLength = 0;
      const timingInfoPresent = AV1.readBits_(reader, 1) == 1;
      if (timingInfoPresent) {
        // timing_info(): num_units_in_display_tick f(32), time_scale f(32)
        AV1.skipBits_(reader, 64);
        const equalPictureInterval = AV1.readBits_(reader, 1) == 1;
        if (equalPictureInterval) {
          AV1.skipUvlc_(reader); // num_ticks_per_picture_minus_1
        }
        decoderModelInfoPresent = AV1.readBits_(reader, 1) == 1;
        if (decoderModelInfoPresent) {
          bufferDelayLength = AV1.readBits_(reader, 5) + 1;
          AV1.skipBits_(reader, 32); // num_units_in_decoding_tick
          // buffer_removal_time_length_minus_1 f(5),
          // frame_presentation_time_length_minus_1 f(5)
          AV1.skipBits_(reader, 10);
        }
      }
      const initialDisplayDelayPresent = AV1.readBits_(reader, 1) == 1;
      const operatingPointsCnt = AV1.readBits_(reader, 5) + 1;
      for (let i = 0; i < operatingPointsCnt; i++) {
        AV1.skipBits_(reader, 12); // operating_point_idc[i]
        const levelIdx = AV1.readBits_(reader, 5);
        // Levels above 7 (i.e. 4.0 and up) are the only ones that define a
        // tier; below that the tier is implicitly Main.
        const tier = levelIdx > 7 ? AV1.readBits_(reader, 1) : 0;
        if (i == 0) {
          seqLevelIdx = levelIdx;
          seqTier = tier;
        }
        if (decoderModelInfoPresent) {
          // decoder_model_present_for_this_op[i]
          if (AV1.readBits_(reader, 1) == 1) {
            // operating_parameters_info(i): decoder_buffer_delay f(n),
            // encoder_buffer_delay f(n), low_delay_mode_flag f(1)
            AV1.skipBits_(reader, 2 * bufferDelayLength + 1);
          }
        }
        if (initialDisplayDelayPresent) {
          if (AV1.readBits_(reader, 1) == 1) {
            AV1.readBits_(reader, 4); // initial_display_delay_minus_1[i]
          }
        }
      }
    }

    const frameWidthBits = AV1.readBits_(reader, 4) + 1;
    const frameHeightBits = AV1.readBits_(reader, 4) + 1;
    const width = AV1.readBits_(reader, frameWidthBits) + 1;
    const height = AV1.readBits_(reader, frameHeightBits) + 1;

    if (!reducedStillPicture) {
      if (AV1.readBits_(reader, 1) == 1) { // frame_id_numbers_present_flag
        // delta_frame_id_length_minus_2 f(4),
        // additional_frame_id_length_minus_1 f(3)
        AV1.skipBits_(reader, 7);
      }
    }

    // use_128x128_superblock, enable_filter_intra, enable_intra_edge_filter
    AV1.skipBits_(reader, 3);

    if (!reducedStillPicture) {
      // enable_interintra_compound, enable_masked_compound,
      // enable_warped_motion, enable_dual_filter
      AV1.skipBits_(reader, 4);
      const enableOrderHint = AV1.readBits_(reader, 1) == 1;
      if (enableOrderHint) {
        // enable_jnt_comp, enable_ref_frame_mvs
        AV1.skipBits_(reader, 2);
      }
      let seqForceScreenContentTools = AV1.SELECT_SCREEN_CONTENT_TOOLS_;
      if (AV1.readBits_(reader, 1) == 0) { // seq_choose_screen_content_tools
        seqForceScreenContentTools = AV1.readBits_(reader, 1);
      }
      if (seqForceScreenContentTools > 0) {
        if (AV1.readBits_(reader, 1) == 0) { // seq_choose_integer_mv
          AV1.readBits_(reader, 1); // seq_force_integer_mv
        }
      }
      if (enableOrderHint) {
        AV1.readBits_(reader, 3); // order_hint_bits_minus_1
      }
    }

    // enable_superres, enable_cdef, enable_restoration
    AV1.skipBits_(reader, 3);

    // ── color_config() (AV1 §5.5.2) ──────────────────────────────────────
    const highBitdepth = AV1.readBits_(reader, 1);
    let twelveBit = 0;
    let bitDepth = highBitdepth ? 10 : 8;
    if (seqProfile == 2 && highBitdepth) {
      twelveBit = AV1.readBits_(reader, 1);
      bitDepth = twelveBit ? 12 : 10;
    }
    const monochrome = seqProfile == 1 ? 0 : AV1.readBits_(reader, 1);

    let colorPrimaries = AV1.CP_UNSPECIFIED_;
    let transferCharacteristics = AV1.TC_UNSPECIFIED_;
    let matrixCoefficients = AV1.MC_UNSPECIFIED_;
    if (AV1.readBits_(reader, 1) == 1) { // color_description_present_flag
      colorPrimaries = AV1.readBits_(reader, 8);
      transferCharacteristics = AV1.readBits_(reader, 8);
      matrixCoefficients = AV1.readBits_(reader, 8);
    }

    let subsamplingX = 1;
    let subsamplingY = 1;
    let chromaSamplePosition = AV1.CSP_UNKNOWN_;

    if (monochrome) {
      AV1.readBits_(reader, 1); // color_range
    } else if (colorPrimaries == AV1.CP_BT_709_ &&
        transferCharacteristics == AV1.TC_SRGB_ &&
        matrixCoefficients == AV1.MC_IDENTITY_) {
      // Lossless sRGB: 4:4:4 with an implied full color range.
      subsamplingX = 0;
      subsamplingY = 0;
    } else {
      AV1.readBits_(reader, 1); // color_range
      if (seqProfile == 0) {
        // Main profile is 4:2:0 only.
        subsamplingX = 1;
        subsamplingY = 1;
      } else if (seqProfile == 1) {
        // High profile is 4:4:4 only.
        subsamplingX = 0;
        subsamplingY = 0;
      } else if (bitDepth == 12) {
        subsamplingX = AV1.readBits_(reader, 1);
        subsamplingY = subsamplingX ? AV1.readBits_(reader, 1) : 0;
      } else {
        // Professional profile below 12 bits is 4:2:2 only.
        subsamplingX = 1;
        subsamplingY = 0;
      }
      if (subsamplingX && subsamplingY) {
        chromaSamplePosition = AV1.readBits_(reader, 2);
      }
    }

    // A header that ran past the end of the OBU was truncated, or was never a
    // sequence header at all. Either way the fields above are meaningless, and
    // an av1C built from them would misconfigure the decoder.
    if (reader.overrun || width <= 1 || height <= 1) {
      return null;
    }

    return {
      seqProfile,
      seqLevelIdx,
      seqTier,
      highBitdepth,
      twelveBit,
      monochrome,
      subsamplingX,
      subsamplingY,
      chromaSamplePosition,
      width,
      height,
      reducedStillPicture,
    };
  }

  /**
   * Reads an unsigned LEB128 value (AV1 §4.10.5).
   *
   * @param {!Uint8Array} data
   * @param {number} offset
   * @return {?{value: number, offset: number}}
   * @private
   */
  static readLeb128_(data, offset) {
    let value = 0;
    for (let i = 0; i < 8; i++) {
      if (offset >= data.byteLength) {
        return null;
      }
      const byte = data[offset++];
      // Multiply rather than shift: the spec allows up to 56 significant bits,
      // and JavaScript's bitwise operators would truncate to 32.
      value += (byte & 0x7f) * Math.pow(2, i * 7);
      if (!(byte & 0x80)) {
        return {value, offset};
      }
    }
    // More than 8 bytes is malformed.
    return null;
  }

  /**
   * Wraps an ExpGolomb in a bit budget.
   *
   * A sequence header is a chain of conditionally present fields, so a
   * truncated one is not detected by any single read — the parser simply keeps
   * asking for bits that are not there. ExpGolomb answers those by recursing
   * on itself until the stack gives out, so the budget is tracked here, and
   * once it is spent every read returns 0 and `overrun` stays set for the
   * caller to reject the whole header.
   *
   * @param {!Uint8Array} data
   * @return {shaka.transmuxer.AV1.Reader}
   * @private
   */
  static makeReader_(data) {
    return {
      gb: new shaka.util.ExpGolomb(data),
      bitsLeft: data.byteLength * 8,
      overrun: false,
    };
  }

  /**
   * Reads `count` bits, at most 16 at a time so the result of a read can never
   * be interpreted as a negative 32-bit integer.
   *
   * @param {shaka.transmuxer.AV1.Reader} reader
   * @param {number} count
   * @return {number}
   * @private
   */
  static readBits_(reader, count) {
    if (count > reader.bitsLeft) {
      reader.overrun = true;
      reader.bitsLeft = 0;
      return 0;
    }
    reader.bitsLeft -= count;

    let value = 0;
    while (count > 0) {
      const chunk = Math.min(count, 16);
      value = (value * Math.pow(2, chunk)) + reader.gb.readBits(chunk);
      count -= chunk;
    }
    return value;
  }

  /**
   * Skips `count` bits.
   *
   * @param {shaka.transmuxer.AV1.Reader} reader
   * @param {number} count
   * @private
   */
  static skipBits_(reader, count) {
    shaka.transmuxer.AV1.readBits_(reader, count);
  }

  /**
   * Skips a variable length unsigned integer (AV1 §4.10.3).
   *
   * @param {shaka.transmuxer.AV1.Reader} reader
   * @private
   */
  static skipUvlc_(reader) {
    const AV1 = shaka.transmuxer.AV1;
    let leadingZeros = 0;
    while (leadingZeros < 32 && AV1.readBits_(reader, 1) == 0) {
      if (reader.overrun) {
        return;
      }
      leadingZeros++;
    }
    if (leadingZeros < 32) {
      AV1.skipBits_(reader, leadingZeros);
    }
  }
};


/**
 * One Open Bitstream Unit.
 *
 * `data` is the OBU payload alone; `fullData` also covers the header and the
 * size field, which is what an `av1C` configOBUs entry needs.
 *
 * @typedef {{
 *   type: number,
 *   data: !Uint8Array,
 *   fullData: !Uint8Array,
 * }}
 */
shaka.transmuxer.AV1.Obu;


/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   reducedStillPicture: boolean,
 *   videoConfig: !Uint8Array,
 * }}
 */
shaka.transmuxer.AV1.Info;


/**
 * A bit reader with a budget. `overrun` latches once a read has asked for more
 * bits than the buffer holds.
 *
 * @typedef {{
 *   gb: !shaka.util.ExpGolomb,
 *   bitsLeft: number,
 *   overrun: boolean,
 * }}
 */
shaka.transmuxer.AV1.Reader;


/**
 * @typedef {{
 *   seqProfile: number,
 *   seqLevelIdx: number,
 *   seqTier: number,
 *   highBitdepth: number,
 *   twelveBit: number,
 *   monochrome: number,
 *   subsamplingX: number,
 *   subsamplingY: number,
 *   chromaSamplePosition: number,
 *   width: number,
 *   height: number,
 *   reducedStillPicture: boolean,
 * }}
 */
shaka.transmuxer.AV1.SequenceHeader;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.OBU_TYPE_SEQUENCE_HEADER_ = 1;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.OBU_TYPE_FRAME_HEADER_ = 3;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.OBU_TYPE_FRAME_ = 6;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.FRAME_TYPE_KEY_ = 0;


/**
 * Sentinel meaning "decide per frame" for seq_force_screen_content_tools.
 *
 * @private @const {number}
 */
shaka.transmuxer.AV1.SELECT_SCREEN_CONTENT_TOOLS_ = 2;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.CP_BT_709_ = 1;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.CP_UNSPECIFIED_ = 2;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.TC_UNSPECIFIED_ = 2;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.TC_SRGB_ = 13;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.MC_IDENTITY_ = 0;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.MC_UNSPECIFIED_ = 2;


/**
 * @private @const {number}
 */
shaka.transmuxer.AV1.CSP_UNKNOWN_ = 0;
