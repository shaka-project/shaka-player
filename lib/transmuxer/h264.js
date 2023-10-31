/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.H264');

goog.require('shaka.util.ExpGolomb');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * H.264 utils
 */
shaka.transmuxer.H264 = class {
  /**
   * Read a sequence parameter set and return some interesting video
   * properties. A sequence parameter set is the H264 metadata that
   * describes the properties of upcoming video frames.
   *
   * @param {!Array.<shaka.extern.VideoNalu>} nalus
   * @return {?{height: number, width: number, videoConfig: !Uint8Array}}
   */
  static parseInfo(nalus) {
    const H264 = shaka.transmuxer.H264;
    if (!nalus.length) {
      return null;
    }
    const spsNalu = nalus.find((nalu) => {
      return nalu.type == H264.NALU_TYPE_SPS_;
    });
    const ppsNalu = nalus.find((nalu) => {
      return nalu.type == H264.NALU_TYPE_PPS_;
    });
    if (!spsNalu || !ppsNalu) {
      return null;
    }

    const expGolombDecoder = new shaka.util.ExpGolomb(spsNalu.data);
    // profile_idc
    const profileIdc = expGolombDecoder.readUnsignedByte();
    // constraint_set[0-5]_flag
    expGolombDecoder.readUnsignedByte();
    // level_idc u(8)
    expGolombDecoder.readUnsignedByte();
    // seq_parameter_set_id
    expGolombDecoder.skipExpGolomb();

    // some profiles have more optional data we don't need
    if (H264.PROFILES_WITH_OPTIONAL_SPS_DATA_.includes(profileIdc)) {
      const chromaFormatIdc = expGolombDecoder.readUnsignedExpGolomb();
      if (chromaFormatIdc === 3) {
        // separate_colour_plane_flag
        expGolombDecoder.skipBits(1);
      }
      // bit_depth_luma_minus8
      expGolombDecoder.skipExpGolomb();
      // bit_depth_chroma_minus8
      expGolombDecoder.skipExpGolomb();
      // qpprime_y_zero_transform_bypass_flag
      expGolombDecoder.skipBits(1);
      // seq_scaling_matrix_present_flag
      if (expGolombDecoder.readBoolean()) {
        const scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
        for (let i = 0; i < scalingListCount; i++) {
          // seq_scaling_list_present_flag[ i ]
          if (expGolombDecoder.readBoolean()) {
            if (i < 6) {
              expGolombDecoder.skipScalingList(16);
            } else {
              expGolombDecoder.skipScalingList(64);
            }
          }
        }
      }
    }

    // log2_max_frame_num_minus4
    expGolombDecoder.skipExpGolomb();
    const picOrderCntType = expGolombDecoder.readUnsignedExpGolomb();

    if (picOrderCntType === 0) {
      // log2_max_pic_order_cnt_lsb_minus4
      expGolombDecoder.readUnsignedExpGolomb();
    } else if (picOrderCntType === 1) {
      // delta_pic_order_always_zero_flag
      expGolombDecoder.skipBits(1);
      // offset_for_non_ref_pic
      expGolombDecoder.skipExpGolomb();
      // offset_for_top_to_bottom_field
      expGolombDecoder.skipExpGolomb();
      const numRefFramesInPicOrderCntCycle =
          expGolombDecoder.readUnsignedExpGolomb();
      for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
        // offset_for_ref_frame[ i ]
        expGolombDecoder.skipExpGolomb();
      }
    }

    // max_num_ref_frames
    expGolombDecoder.skipExpGolomb();
    // gaps_in_frame_num_value_allowed_flag
    expGolombDecoder.skipBits(1);

    const picWidthInMbsMinus1 =
        expGolombDecoder.readUnsignedExpGolomb();
    const picHeightInMapUnitsMinus1 =
        expGolombDecoder.readUnsignedExpGolomb();

    const frameMbsOnlyFlag = expGolombDecoder.readBits(1);
    if (frameMbsOnlyFlag === 0) {
      // mb_adaptive_frame_field_flag
      expGolombDecoder.skipBits(1);
    }
    // direct_8x8_inference_flag
    expGolombDecoder.skipBits(1);

    let frameCropLeftOffset = 0;
    let frameCropRightOffset = 0;
    let frameCropTopOffset = 0;
    let frameCropBottomOffset = 0;

    // frame_cropping_flag
    if (expGolombDecoder.readBoolean()) {
      frameCropLeftOffset = expGolombDecoder.readUnsignedExpGolomb();
      frameCropRightOffset = expGolombDecoder.readUnsignedExpGolomb();
      frameCropTopOffset = expGolombDecoder.readUnsignedExpGolomb();
      frameCropBottomOffset = expGolombDecoder.readUnsignedExpGolomb();
    }

    const height = ((2 - frameMbsOnlyFlag) *
        (picHeightInMapUnitsMinus1 + 1) * 16) - (frameCropTopOffset * 2) -
        (frameCropBottomOffset * 2);
    const width = ((picWidthInMbsMinus1 + 1) * 16) -
        frameCropLeftOffset * 2 - frameCropRightOffset * 2;

    // assemble the SPSs
    let sps = [];
    const spsData = spsNalu.fullData;
    sps.push((spsData.byteLength >>> 8) & 0xff);
    sps.push(spsData.byteLength & 0xff);
    sps = sps.concat(...spsData);

    // assemble the PPSs
    let pps = [];
    const ppsData = ppsNalu.fullData;
    pps.push((ppsData.byteLength >>> 8) & 0xff);
    pps.push(ppsData.byteLength & 0xff);
    pps = pps.concat(...ppsData);

    const videoConfig = new Uint8Array(
        [
          0x01, // version
          sps[3], // profile
          sps[4], // profile compat
          sps[5], // level
          0xfc | 3, // lengthSizeMinusOne, hard-coded to 4 bytes
          0xe0 | 1, // 3bit reserved (111) + numOfSequenceParameterSets
        ].concat(sps).concat([
          1, // numOfPictureParameterSets
        ]).concat(pps));

    return {
      height,
      width,
      videoConfig,
    };
  }

  /**
   * @param {!Array.<shaka.extern.VideoNalu>} nalus
   * @return {?{data: !Uint8Array, isKeyframe: boolean}}
   */
  static parseFrame(nalus) {
    const H264 = shaka.transmuxer.H264;
    let isKeyframe = false;
    const nalusData = [];
    const spsNalu = nalus.find((nalu) => {
      return nalu.type == H264.NALU_TYPE_SPS_;
    });
    let avcSample = false;
    for (const nalu of nalus) {
      let push = false;
      switch (nalu.type) {
        case H264.NALU_TYPE_NDR_: {
          avcSample = true;
          push = true;
          const data = nalu.data;
          // Only check slice type to detect KF in case SPS found in same packet
          // (any keyframe is preceded by SPS ...)
          if (spsNalu && data.length > 4) {
            // retrieve slice type by parsing beginning of NAL unit (follow
            // H264 spec,slice_header definition) to detect keyframe embedded
            // in NDR
            const sliceType = new shaka.util.ExpGolomb(data).readSliceType();
            // 2 : I slice, 4 : SI slice, 7 : I slice, 9: SI slice
            // SI slice : A slice that is coded using intra prediction only and
            // using quantisation of the prediction samples.
            // An SI slice can be coded such that its decoded samples can be
            // constructed identically to an SP slice.
            // I slice: A slice that is not an SI slice that is decoded using
            // intra prediction only.
            if (sliceType === 2 || sliceType === 4 ||
                sliceType === 7 || sliceType === 9) {
              isKeyframe = true;
            }
          }
          break;
        }
        case H264.NALU_TYPE_IDR_:
          avcSample = true;
          push = true;
          isKeyframe = true;
          break;
        case H264.NALU_TYPE_SEI_:
          push = true;
          break;
        case H264.NALU_TYPE_SPS_:
          push = true;
          break;
        case H264.NALU_TYPE_PPS_:
          push = true;
          break;
        case H264.NALU_TYPE_AUD_:
          push = true;
          avcSample = true;
          break;
        case H264.NALU_TYPE_FILLER_DATA_:
          push = true;
          break;
        default:
          push = false;
          break;
      }
      if (avcSample && push) {
        const size = nalu.fullData.byteLength;
        const naluLength = new Uint8Array(4);
        naluLength[0] = (size >> 24) & 0xff;
        naluLength[1] = (size >> 16) & 0xff;
        naluLength[2] = (size >> 8) & 0xff;
        naluLength[3] = size & 0xff;
        nalusData.push(shaka.util.Uint8ArrayUtils.concat(
            naluLength, nalu.fullData));
      }
    }
    if (!nalusData.length) {
      return null;
    }
    const data = shaka.util.Uint8ArrayUtils.concat(...nalusData);
    return {
      data,
      isKeyframe,
    };
  }
};


/**
 * NALU type for NDR for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_NDR_ = 0x01;


/**
 * NALU type for Instantaneous Decoder Refresh (IDR) for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_IDR_ = 0x05;


/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_SEI_ = 0x06;


/**
 * NALU type for Sequence Parameter Set (SPS) for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_SPS_ = 0x07;


/**
 * NALU type for Picture Parameter Set (PPS) for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_PPS_ = 0x08;


/**
 * NALU type for Access Unit Delimiter (AUD) for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_AUD_ = 0x09;


/**
 * NALU type for Filler Data for H.264.
 * @const {number}
 * @private
 */
shaka.transmuxer.H264.NALU_TYPE_FILLER_DATA_ = 0x0c;


/**
 * Values of profile_idc that indicate additional fields are included in the
 * SPS.
 * see Recommendation ITU-T H.264 (4/2013)
 * 7.3.2.1.1 Sequence parameter set data syntax
 *
 * @const {!Array.<number>}
 * @private
 */
shaka.transmuxer.H264.PROFILES_WITH_OPTIONAL_SPS_DATA_ =
    [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134];
