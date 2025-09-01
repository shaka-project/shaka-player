/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.H265');

goog.require('shaka.util.ExpGolomb');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * H.265 utils
 */
shaka.transmuxer.H265 = class {
  /**
   * Read a sequence parameter set and return some interesting video
   * properties. A sequence parameter set is the H265 metadata that
   * describes the properties of upcoming video frames.
   *
   * @param {!Array<shaka.extern.VideoNalu>} nalus
   * @return {?{
   *   height: number,
   *   width: number,
   *   videoConfig: !Uint8Array,
   *   hSpacing: number,
   *   vSpacing: number,
   * }}
   */
  static parseInfo(nalus) {
    const H265 = shaka.transmuxer.H265;
    if (!nalus.length) {
      return null;
    }
    const vpsNalu = nalus.find((nalu) => {
      return nalu.type == H265.NALU_TYPE_VPS_;
    });
    const spsNalu = nalus.find((nalu) => {
      return nalu.type == H265.NALU_TYPE_SPS_;
    });
    const ppsNalu = nalus.find((nalu) => {
      return nalu.type == H265.NALU_TYPE_PPS_;
    });
    if (!vpsNalu || !spsNalu || !ppsNalu) {
      return null;
    }

    const vpsConfiguration = H265.parseVPS_(vpsNalu.fullData);
    const spsConfiguration = H265.parseSPS_(spsNalu.fullData);
    const ppsConfiguration = H265.parsePPS_(ppsNalu.fullData);

    /** @type {shaka.transmuxer.H265.DecoderConfigurationRecordType} */
    const detail = {
      numTemporalLayers: vpsConfiguration.numTemporalLayers,
      temporalIdNested: vpsConfiguration.temporalIdNested,
      generalProfileSpace: spsConfiguration.generalProfileSpace,
      generalTierFlag: spsConfiguration.generalTierFlag,
      generalLevelIdc: spsConfiguration.generalLevelIdc,
      generalProfileIdc: spsConfiguration.generalProfileIdc,
      generalProfileCompatibilityFlags1:
          spsConfiguration.generalProfileCompatibilityFlags1,
      generalProfileCompatibilityFlags2:
          spsConfiguration.generalProfileCompatibilityFlags2,
      generalProfileCompatibilityFlags3:
          spsConfiguration.generalProfileCompatibilityFlags3,
      generalProfileCompatibilityFlags4:
          spsConfiguration.generalProfileCompatibilityFlags4,
      generalConstraintIndicatorFlags1:
          spsConfiguration.generalConstraintIndicatorFlags1,
      generalConstraintIndicatorFlags2:
          spsConfiguration.generalConstraintIndicatorFlags2,
      generalConstraintIndicatorFlags3:
          spsConfiguration.generalConstraintIndicatorFlags3,
      generalConstraintIndicatorFlags4:
          spsConfiguration.generalConstraintIndicatorFlags4,
      generalConstraintIndicatorFlags5:
          spsConfiguration.generalConstraintIndicatorFlags5,
      generalConstraintIndicatorFlags6:
          spsConfiguration.generalConstraintIndicatorFlags6,
      minSpatialSegmentationIdc: spsConfiguration.minSpatialSegmentationIdc,
      chromaFormatIdc: spsConfiguration.chromaFormatIdc,
      bitDepthLumaMinus8: spsConfiguration.bitDepthLumaMinus8,
      bitDepthChromaMinus8: spsConfiguration.bitDepthChromaMinus8,
      parallelismType: ppsConfiguration.parallelismType,
      frameRateFps: spsConfiguration.frameRateFps,
      frameRateFixed: spsConfiguration.frameRateFixed,
    };

    const videoConfig = H265.getVideoConfiguration_(
        vpsNalu.fullData, spsNalu.fullData, ppsNalu.fullData, detail);

    return {
      height: spsConfiguration.height,
      width: spsConfiguration.width,
      videoConfig,
      hSpacing: spsConfiguration.sarWidth,
      vSpacing: spsConfiguration.sarHeight,
    };
  }

  /**
   * @param {!Uint8Array} data
   * @return {shaka.transmuxer.H265.VPSConfiguration}
   * @private
   */
  static parseVPS_(data) {
    const gb = new shaka.util.ExpGolomb(data, /* convertEbsp2rbsp= */ true);

    // remove NALu Header
    gb.readUnsignedByte();
    gb.readUnsignedByte();

    // VPS
    gb.readBits(4); // video_parameter_set_id
    gb.readBits(2);
    gb.readBits(6); // max_layers_minus1
    const maxSubLayersMinus1 = gb.readBits(3);
    const temporalIdNestingFlag = gb.readBoolean();

    return {
      numTemporalLayers: maxSubLayersMinus1 + 1,
      temporalIdNested: temporalIdNestingFlag,
    };
  }

  /**
   * The code is based on mpegts.js
   * https://github.com/xqq/mpegts.js/blob/master/src/demux/h265-parser.js#L65
   *
   * @param {!Uint8Array} data
   * @return {shaka.transmuxer.H265.SPSConfiguration}
   * @private
   */
  static parseSPS_(data) {
    const gb = new shaka.util.ExpGolomb(data, /* convertEbsp2rbsp= */ true);

    // remove NALu Header
    gb.readUnsignedByte();
    gb.readUnsignedByte();

    let leftOffset = 0;
    let rightOffset = 0;
    let topOffset = 0;
    let bottomOffset = 0;

    // SPS
    gb.readBits(4); // video_parameter_set_id
    const maxSubLayersMinus1 = gb.readBits(3);
    gb.readBoolean(); // temporal_id_nesting_flag

    // profile_tier_level begin
    const generalProfileSpace = gb.readBits(2);
    const generalTierFlag = gb.readBits(1);
    const generalProfileIdc = gb.readBits(5);
    const generalProfileCompatibilityFlags1 = gb.readUnsignedByte();
    const generalProfileCompatibilityFlags2 = gb.readUnsignedByte();
    const generalProfileCompatibilityFlags3 = gb.readUnsignedByte();
    const generalProfileCompatibilityFlags4 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags1 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags2 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags3 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags4 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags5 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags6 = gb.readUnsignedByte();
    const generalLevelIdc = gb.readUnsignedByte();
    const subLayerProfilePresentFlag = [];
    const subLayerLevelPresentFlag = [];
    for (let i = 0; i < maxSubLayersMinus1; i++) {
      subLayerProfilePresentFlag.push(gb.readBoolean());
      subLayerLevelPresentFlag.push(gb.readBoolean());
    }
    if (maxSubLayersMinus1 > 0) {
      for (let i = maxSubLayersMinus1; i < 8; i++) {
        gb.readBits(2);
      }
    }
    for (let i = 0; i < maxSubLayersMinus1; i++) {
      if (subLayerProfilePresentFlag[i]) {
        gb.readBits(88);
      }
      if (subLayerLevelPresentFlag[i]) {
        gb.readUnsignedByte();
      }
    }
    // profile_tier_level end

    gb.readUnsignedExpGolomb(); // seq_parameter_set_id
    const chromaFormatIdc = gb.readUnsignedExpGolomb();
    if (chromaFormatIdc == 3) {
      gb.readBits(1); // separate_colour_plane_flag
    }
    const picWidthInLumaSamples = gb.readUnsignedExpGolomb();
    const picHeightInLumaSamples = gb.readUnsignedExpGolomb();
    const conformanceWindowFlag = gb.readBoolean();
    if (conformanceWindowFlag) {
      leftOffset += gb.readUnsignedExpGolomb();
      rightOffset += gb.readUnsignedExpGolomb();
      topOffset += gb.readUnsignedExpGolomb();
      bottomOffset += gb.readUnsignedExpGolomb();
    }
    const bitDepthLumaMinus8 = gb.readUnsignedExpGolomb();
    const bitDepthChromaMinus8 = gb.readUnsignedExpGolomb();
    const log2MaxPicOrderCntLsbMinus4 = gb.readUnsignedExpGolomb();
    const subLayerOrderingInfoPresentFlag = gb.readBoolean();
    if (subLayerOrderingInfoPresentFlag) {
      // Skip each layer
      for (let i = 0; i <= maxSubLayersMinus1; i++) {
        gb.readUnsignedExpGolomb(); // max_dec_pic_buffering_minus1[i]
        gb.readUnsignedExpGolomb(); // max_num_reorder_pics[i]
        gb.readUnsignedExpGolomb(); // max_latency_increase_plus1[i]
      }
    } else {
      // Skip one layer
      gb.readUnsignedExpGolomb(); // max_dec_pic_buffering_minus1[i]
      gb.readUnsignedExpGolomb(); // max_num_reorder_pics[i]
      gb.readUnsignedExpGolomb(); // max_latency_increase_plus1[i]
    }
    gb.readUnsignedExpGolomb(); // log2_min_luma_coding_block_size_minus3
    gb.readUnsignedExpGolomb(); // log2_diff_max_min_luma_coding_block_size
    gb.readUnsignedExpGolomb(); // log2_min_transform_block_size_minus2
    gb.readUnsignedExpGolomb(); // log2_diff_max_min_transform_block_size
    gb.readUnsignedExpGolomb(); // max_transform_hierarchy_depth_inter
    gb.readUnsignedExpGolomb(); // max_transform_hierarchy_depth_intra
    const scalingListEnabledFlag = gb.readBoolean();
    if (scalingListEnabledFlag) {
      const spsScalingListDataPresentFlag = gb.readBoolean();
      if (spsScalingListDataPresentFlag) {
        for (let sizeId = 0; sizeId < 4; sizeId++) {
          for (
            let matrixId = 0;
            matrixId < (sizeId === 3 ? 2 : 6);
            matrixId++
          ) {
            const scalingListPredModeFlag = gb.readBoolean();
            if (!scalingListPredModeFlag) {
              gb.readUnsignedExpGolomb(); // scaling_list_pred_matrix_id_delta
            } else {
              const coefNum = Math.min(64, 1 << (4 + (sizeId << 1)));
              if (sizeId > 1) {
                gb.readExpGolomb();
              }
              for (let i = 0; i < coefNum; i++) {
                gb.readExpGolomb();
              }
            }
          }
        }
      }
    }
    gb.readBoolean(); // amp_enabled_flag
    gb.readBoolean(); // sample_adaptive_offset_enabled_flag
    const pcmEnabledFlag = gb.readBoolean();
    if (pcmEnabledFlag) {
      gb.readUnsignedByte();
      gb.readUnsignedExpGolomb();
      gb.readUnsignedExpGolomb();
      gb.readBoolean();
    }
    const numShortTermRefPicSets = gb.readUnsignedExpGolomb();
    let numDeltaPocs = 0;
    for (let i = 0; i < numShortTermRefPicSets; i++) {
      let interRefPicSetPredictionFlag = false;
      if (i !== 0) {
        interRefPicSetPredictionFlag = gb.readBoolean();
      }
      if (interRefPicSetPredictionFlag) {
        if (i === numShortTermRefPicSets) {
          gb.readUnsignedExpGolomb();
        }
        gb.readBoolean();
        gb.readUnsignedExpGolomb();
        let nextNumDeltaPocs = 0;
        for (let j = 0; j <= numDeltaPocs; j++) {
          const usedByCurrPicFlag = gb.readBoolean();
          let useDeltaFlag = false;
          if (!usedByCurrPicFlag) {
            useDeltaFlag = gb.readBoolean();
          }
          if (usedByCurrPicFlag || useDeltaFlag) {
            nextNumDeltaPocs++;
          }
        }
        numDeltaPocs = nextNumDeltaPocs;
      } else {
        const numNegativePics = gb.readUnsignedExpGolomb();
        const numPositivePics = gb.readUnsignedExpGolomb();
        numDeltaPocs = numNegativePics + numPositivePics;
        for (let j = 0; j < numNegativePics; j++) {
          gb.readUnsignedExpGolomb();
          gb.readBoolean();
        }
        for (let j = 0; j < numPositivePics; j++) {
          gb.readUnsignedExpGolomb();
          gb.readBoolean();
        }
      }
    }
    const longTermRefPicsPresentFlag = gb.readBoolean();
    if (longTermRefPicsPresentFlag) {
      const numLongTermRefPicsSps = gb.readUnsignedExpGolomb();
      for (let i = 0; i < numLongTermRefPicsSps; i++) {
        for (let j = 0; j < log2MaxPicOrderCntLsbMinus4 + 4; j++) {
          gb.readBits(1);
        }
        gb.readBits(1);
      }
    }
    let defaultDisplayWindowFlag = false; // for calc offset
    let sarWidth = 1;
    let sarHeight = 1;
    let fixedPicRateGeneralFlag = true;
    let fpsDen = 1;
    let fpsNum = 0;
    let minSpatialSegmentationIdc = 0; // for hvcC
    gb.readBoolean(); // sps_temporal_mvp_enabled_flag
    gb.readBoolean(); // strong_intra_smoothing_enabled_flag
    const vuiParametersPresentFlag = gb.readBoolean();
    if (vuiParametersPresentFlag) {
      const aspectRatioInfoPresentFlag = gb.readBoolean();
      if (aspectRatioInfoPresentFlag) {
        const aspectRatioIdc = gb.readUnsignedByte();
        const sarWidthTable = [
          1, 12, 10, 16, 40, 24, 20, 32, 80, 18, 15, 64, 160, 4, 3, 2,
        ];
        const sarHeightTable = [
          1, 11, 11, 11, 33, 11, 11, 11, 33, 11, 11, 33, 99, 3, 2, 1,
        ];
        if (aspectRatioIdc > 0 && aspectRatioIdc <= 16) {
          sarWidth = sarWidthTable[aspectRatioIdc - 1];
          sarHeight = sarHeightTable[aspectRatioIdc - 1];
        } else if (aspectRatioIdc === 255) {
          sarWidth = gb.readBits(16);
          sarHeight = gb.readBits(16);
        }
      }
      const overscanInfoPresentFlag = gb.readBoolean();
      if (overscanInfoPresentFlag) {
        gb.readBoolean();
      }
      const videoSignalTypePresentFlag = gb.readBoolean();
      if (videoSignalTypePresentFlag) {
        gb.readBits(3);
        gb.readBoolean();
        const colourDescriptionPresentFlag = gb.readBoolean();
        if (colourDescriptionPresentFlag) {
          gb.readUnsignedByte();
          gb.readUnsignedByte();
          gb.readUnsignedByte();
        }
      }
      const chromaLocInfoPresentFlag = gb.readBoolean();
      if (chromaLocInfoPresentFlag) {
        gb.readUnsignedExpGolomb();
        gb.readUnsignedExpGolomb();
      }
      gb.readBoolean(); // neutral_chroma_indication_flag
      gb.readBoolean(); // field_seq_flag
      gb.readBoolean(); // frame_field_info_present_flag
      defaultDisplayWindowFlag = gb.readBoolean();
      if (defaultDisplayWindowFlag) {
        // We ignore these 4 offsets since they are not necessary for
        // calculating the width and height.
        gb.skipExpGolomb();
        gb.skipExpGolomb();
        gb.skipExpGolomb();
        gb.skipExpGolomb();
      }
      const vuiTimingInfoPresentFlag = gb.readBoolean();
      if (vuiTimingInfoPresentFlag) {
        fpsDen = gb.readBits(32);
        fpsNum = gb.readBits(32);
        const vuiPocProportionalToTimingFlag = gb.readBoolean();
        if (vuiPocProportionalToTimingFlag) {
          gb.readUnsignedExpGolomb();
        }
        const vuiHrdParametersPresentFlag = gb.readBoolean();
        if (vuiHrdParametersPresentFlag) {
          const commonInfPresentFlag = 1;
          let nalHrdParametersPresentFlag = false;
          let vclHrdParametersPresentFlag = false;
          let subPicHrdParamsPresentFlag = false;
          if (commonInfPresentFlag) {
            nalHrdParametersPresentFlag = gb.readBoolean();
            vclHrdParametersPresentFlag = gb.readBoolean();
            if (nalHrdParametersPresentFlag || vclHrdParametersPresentFlag) {
              subPicHrdParamsPresentFlag = gb.readBoolean();
              if (subPicHrdParamsPresentFlag) {
                gb.readUnsignedByte();
                gb.readBits(5);
                gb.readBoolean();
                gb.readBits(5);
              }
              gb.readBits(4); // bit_rate_scale
              gb.readBits(4); // cpb_size_scale
              if (subPicHrdParamsPresentFlag) {
                gb.readBits(4);
              }
              gb.readBits(5);
              gb.readBits(5);
              gb.readBits(5);
            }
          }
          for (let i = 0; i <= maxSubLayersMinus1; i++) {
            fixedPicRateGeneralFlag = gb.readBoolean();
            let fixedPicRateWithinCvsFlag = true;
            let cpbCnt = 1;
            if (!fixedPicRateGeneralFlag) {
              fixedPicRateWithinCvsFlag = gb.readBoolean();
            }
            let lowDelayHrdFlag = false;
            if (fixedPicRateWithinCvsFlag) {
              gb.readUnsignedExpGolomb();
            } else {
              lowDelayHrdFlag = gb.readBoolean();
            }
            if (!lowDelayHrdFlag) {
              cpbCnt = gb.readUnsignedExpGolomb() + 1;
            }
            if (nalHrdParametersPresentFlag) {
              for (let j = 0; j < cpbCnt; j++) {
                gb.readUnsignedExpGolomb();
                gb.readUnsignedExpGolomb();
                if (subPicHrdParamsPresentFlag) {
                  gb.readUnsignedExpGolomb();
                  gb.readUnsignedExpGolomb();
                }
              }
              gb.readBoolean();
            }
            if (vclHrdParametersPresentFlag) {
              for (let j = 0; j < cpbCnt; j++) {
                gb.readUnsignedExpGolomb();
                gb.readUnsignedExpGolomb();
                if (subPicHrdParamsPresentFlag) {
                  gb.readUnsignedExpGolomb();
                  gb.readUnsignedExpGolomb();
                }
              }
              gb.readBoolean();
            }
          }
        }
      }
      const bitstreamRestrictionFlag = gb.readBoolean();
      if (bitstreamRestrictionFlag) {
        gb.readBoolean(); // tiles_fixed_structure_flag
        gb.readBoolean(); // motion_vectors_over_pic_boundaries_flag
        gb.readBoolean(); // restricted_ref_pic_lists_flag
        minSpatialSegmentationIdc = gb.readUnsignedExpGolomb();
        gb.readUnsignedExpGolomb(); // max_bytes_per_pic_denom
        gb.readUnsignedExpGolomb(); // max_bits_per_min_cu_denom
        gb.readUnsignedExpGolomb(); // log2_max_mv_length_horizontal
        gb.readUnsignedExpGolomb(); // log2_max_mv_length_vertical
      }
    }

    const subWc = chromaFormatIdc === 1 || chromaFormatIdc === 2 ? 2 : 1;
    const subHc = chromaFormatIdc === 1 ? 2 : 1;
    const codecWidth =
        picWidthInLumaSamples - (leftOffset + rightOffset) * subWc;
    const codecHeight =
        picHeightInLumaSamples - (topOffset + bottomOffset) * subHc;

    return {
      generalLevelIdc,
      generalProfileSpace,
      generalTierFlag,
      generalProfileIdc,
      generalProfileCompatibilityFlags1,
      generalProfileCompatibilityFlags2,
      generalProfileCompatibilityFlags3,
      generalProfileCompatibilityFlags4,
      generalConstraintIndicatorFlags1,
      generalConstraintIndicatorFlags2,
      generalConstraintIndicatorFlags3,
      generalConstraintIndicatorFlags4,
      generalConstraintIndicatorFlags5,
      generalConstraintIndicatorFlags6,
      minSpatialSegmentationIdc,
      chromaFormatIdc,
      bitDepthLumaMinus8,
      bitDepthChromaMinus8,
      width: codecWidth,
      height: codecHeight,
      sarWidth: sarWidth,
      sarHeight: sarHeight,
      frameRateFps: fpsNum / fpsDen,
      frameRateFixed: fixedPicRateGeneralFlag,
    };
  }

  /**
   * @param {!Uint8Array} data
   * @return {shaka.transmuxer.H265.PPSConfiguration}
   * @private
   */
  static parsePPS_(data) {
    const gb = new shaka.util.ExpGolomb(data, /* convertEbsp2rbsp= */ true);

    // remove NALu Header
    gb.readUnsignedByte();
    gb.readUnsignedByte();

    // PPS
    gb.readUnsignedExpGolomb(); // pic_parameter_set_id
    gb.readUnsignedExpGolomb(); // seq_parameter_set_id
    gb.readBoolean(); // dependent_slice_segments_enabled_flag
    gb.readBoolean(); // output_flag_present_flag
    gb.readBits(3); // num_extra_slice_header_bits
    gb.readBoolean(); // sign_data_hiding_enabled_flag
    gb.readBoolean(); // cabac_init_present_flag
    gb.readUnsignedExpGolomb(); // num_ref_idx_l0_default_active_minus1
    gb.readUnsignedExpGolomb(); // num_ref_idx_l1_default_active_minus1
    gb.readExpGolomb(); // init_qp_minus26
    gb.readBoolean(); // constrained_intra_pred_flag
    gb.readBoolean(); // transform_skip_enabled_flag
    const cuQpDeltaEnabledFlag = gb.readBoolean();
    if (cuQpDeltaEnabledFlag) {
      gb.readUnsignedExpGolomb(); // diff_cu_qp_delta_depth
    }
    gb.readExpGolomb(); // cb_qp_offset
    gb.readExpGolomb(); // cr_qp_offset
    gb.readBoolean(); // pps_slice_chroma_qp_offsets_present_flag
    gb.readBoolean(); // weighted_pred_flag
    gb.readBoolean(); // weighted_bipred_flag
    gb.readBoolean(); // transquant_bypass_enabled_flag
    const tilesEnabledFlag = gb.readBoolean();
    const entropyCodingSyncEnabledFlag = gb.readBoolean();

    // needs hvcC
    let parallelismType = 1; // slice-based parallel decoding
    if (entropyCodingSyncEnabledFlag && tilesEnabledFlag) {
      parallelismType = 0; // mixed-type parallel decoding
    } else if (entropyCodingSyncEnabledFlag) {
      parallelismType = 3; // wavefront-based parallel decoding
    } else if (tilesEnabledFlag) {
      parallelismType = 2; // tile-based parallel decoding
    }

    return {
      parallelismType,
    };
  }

  /**
   * @param {!Uint8Array} vps
   * @param {!Uint8Array} sps
   * @param {!Uint8Array} pps
   * @param {shaka.transmuxer.H265.DecoderConfigurationRecordType} detail
   * @return {!Uint8Array}
   * @private
   */
  static getVideoConfiguration_(vps, sps, pps, detail) {
    const length = 23 + (3 + 2 + vps.byteLength) +
        (3 + 2 + sps.byteLength) + (3 + 2 + pps.byteLength);
    const data = new Uint8Array(length);

    data[0] = 0x01; // configurationVersion
    data[1] = ((detail.generalProfileSpace & 0x03) << 6) |
        ((detail.generalTierFlag ? 1 : 0) << 5) |
        ((detail.generalProfileIdc & 0x1F));
    data[2] = detail.generalProfileCompatibilityFlags1;
    data[3] = detail.generalProfileCompatibilityFlags2;
    data[4] = detail.generalProfileCompatibilityFlags3;
    data[5] = detail.generalProfileCompatibilityFlags4;
    data[6] = detail.generalConstraintIndicatorFlags1;
    data[7] = detail.generalConstraintIndicatorFlags2;
    data[8] = detail.generalConstraintIndicatorFlags3;
    data[9] = detail.generalConstraintIndicatorFlags4;
    data[10] = detail.generalConstraintIndicatorFlags5;
    data[11] = detail.generalConstraintIndicatorFlags6;
    data[12] = detail.generalLevelIdc;
    data[13] = 0xF0 |
        ((detail.minSpatialSegmentationIdc & 0x0F00) >> 8);
    data[14] = (detail.minSpatialSegmentationIdc & 0xFF);
    data[15] = 0xFC | (detail.parallelismType & 0x03);
    data[16] = 0xFC | (detail.chromaFormatIdc & 0x03);
    data[17] = 0xF8 | (detail.bitDepthLumaMinus8 & 0x07);
    data[18] = 0xF8 | (detail.bitDepthChromaMinus8 & 0x07);
    data[19] = 0;
    data[20] = parseInt(detail.frameRateFps, 10);
    data[21] = (((detail.frameRateFixed ? 1 : 0) & 0x03) << 6) |
        ((detail.numTemporalLayers & 0x07) << 3) |
        ((detail.temporalIdNested ? 1 : 0) << 2) | 3;
    data[22] = 3;

    const units = [vps, sps, pps];
    let offset = 23;
    const iMax = units.length - 1;
    for (let i = 0; i < units.length; i += 1) {
      data.set(
          new Uint8Array([
            (32 + i) | (i === iMax ? 128 : 0),
            0x00,
            0x01,
          ]),
          offset,
      );
      offset += 3;
      data.set(
          new Uint8Array([units[i].byteLength >> 8, units[i].byteLength & 255]),
          offset,
      );
      offset += 2;
      data.set(units[i], offset);
      offset += units[i].byteLength;
    }

    return data;
  }

  /**
   * @param {!Array<shaka.extern.VideoNalu>} nalus
   * @return {?{data: !Uint8Array, isKeyframe: boolean}}
   */
  static parseFrame(nalus) {
    const H265 = shaka.transmuxer.H265;
    let isKeyframe = false;
    const nalusData = [];
    let hvcSample = false;
    for (const nalu of nalus) {
      let push = false;
      switch (nalu.type) {
        case H265.NALU_TYPE_TRAIL_N_:
        case H265.NALU_TYPE_TRAIL_R_: {
          hvcSample = true;
          push = true;
          break;
        }
        case H265.NALU_TYPE_IDR_W_RADL_:
        case H265.NALU_TYPE_IDR_N_LP_:
        case H265.NALU_TYPE_CRA_NUT_:
          hvcSample = true;
          push = true;
          isKeyframe = true;
          break;
        case H265.NALU_TYPE_VPS_:
          push = true;
          break;
        case H265.NALU_TYPE_SPS_:
          push = true;
          break;
        case H265.NALU_TYPE_PPS_:
          push = true;
          break;
        case H265.NALU_TYPE_AUD_:
          push = true;
          hvcSample = true;
          break;
        case H265.NALU_TYPE_SEI_PREFIX_:
        case H265.NALU_TYPE_SEI_SUFFIX_:
          push = true;
          break;
        default:
          push = false;
          break;
      }
      if (hvcSample && push) {
        const size = nalu.fullData.byteLength;
        const naluLength = new Uint8Array(4);
        naluLength[0] = (size >> 24) & 0xff;
        naluLength[1] = (size >> 16) & 0xff;
        naluLength[2] = (size >> 8) & 0xff;
        naluLength[3] = size & 0xff;
        nalusData.push(naluLength);
        nalusData.push(nalu.fullData);
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
 * NALU type for non-reference trailing picture for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_TRAIL_N_ = 0x01;


/**
 * NALU type for reference trailing picture for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_TRAIL_R_ = 0x00;


/**
 * NALU type for Instantaneous Decoder Refresh (IDR) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_IDR_W_RADL_ = 0x13;


/**
 * NALU type for Instantaneous Decoder Refresh (IDR) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_IDR_N_LP_ = 0x14;

/**
 * NALU type for Clean Random Access (CRA) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_CRA_NUT_ = 0x15;


/**
 * NALU type for Video Parameter Set (VPS) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_VPS_ = 0x20;


/**
 * NALU type for Sequence Parameter Set (SPS) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_SPS_ = 0x21;


/**
 * NALU type for Picture Parameter Set (PPS) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_PPS_ = 0x22;


/**
 * NALU type for Access Unit Delimiter (AUD) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_AUD_ = 0x23;


/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_SEI_PREFIX_ = 0x27;


/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.265.
 * @const {number}
 * @private
 */
shaka.transmuxer.H265.NALU_TYPE_SEI_SUFFIX_ = 0x28;


/**
 * @typedef {{
 *   numTemporalLayers: number,
 *   temporalIdNested: boolean,
 * }}
 *
 * @property {number} numTemporalLayers
 * @property {boolean} temporalIdNested
 */
shaka.transmuxer.H265.VPSConfiguration;


/**
 * @typedef {{
 *   generalProfileSpace: number,
 *   generalTierFlag: number,
 *   generalLevelIdc: number,
 *   generalProfileIdc: number,
 *   generalProfileCompatibilityFlags1: number,
 *   generalProfileCompatibilityFlags2: number,
 *   generalProfileCompatibilityFlags3: number,
 *   generalProfileCompatibilityFlags4: number,
 *   generalConstraintIndicatorFlags1: number,
 *   generalConstraintIndicatorFlags2: number,
 *   generalConstraintIndicatorFlags3: number,
 *   generalConstraintIndicatorFlags4: number,
 *   generalConstraintIndicatorFlags5: number,
 *   generalConstraintIndicatorFlags6: number,
 *   minSpatialSegmentationIdc: number,
 *   chromaFormatIdc: number,
 *   bitDepthLumaMinus8: number,
 *   bitDepthChromaMinus8: number,
 *   width: number,
 *   height: number,
 *   sarWidth: number,
 *   sarHeight: number,
 *   frameRateFps: number,
 *   frameRateFixed: boolean,
 * }}
 *
 * @property {number} generalProfileSpace
 * @property {number} generalTierFlag
 * @property {number} generalLevelIdc
 * @property {number} generalProfileIdc
 * @property {number} generalProfileCompatibilityFlags1
 * @property {number} generalProfileCompatibilityFlags2
 * @property {number} generalProfileCompatibilityFlags3
 * @property {number} generalProfileCompatibilityFlags4
 * @property {number} generalConstraintIndicatorFlags1
 * @property {number} generalConstraintIndicatorFlags2
 * @property {number} generalConstraintIndicatorFlags3
 * @property {number} generalConstraintIndicatorFlags4
 * @property {number} generalConstraintIndicatorFlags5
 * @property {number} generalConstraintIndicatorFlags6
 * @property {number} minSpatialSegmentationIdc
 * @property {number} chromaFormatIdc
 * @property {number} bitDepthLumaMinus8
 * @property {number} bitDepthChromaMinus8
 * @property {number} width
 * @property {number} height
 * @property {number} sarWidth
 * @property {number} sarHeight
 * @property {number} frameRateFps
 * @property {boolean} frameRateFixed
 */
shaka.transmuxer.H265.SPSConfiguration;


/**
 * @typedef {{
 *   parallelismType: number,
 * }}
 *
 * @property {number} parallelismType
 */
shaka.transmuxer.H265.PPSConfiguration;


/**
 * @typedef {{
 *   numTemporalLayers: number,
 *   temporalIdNested: boolean,
 *   generalProfileSpace: number,
 *   generalTierFlag: number,
 *   generalLevelIdc: number,
 *   generalProfileIdc: number,
 *   generalProfileCompatibilityFlags1: number,
 *   generalProfileCompatibilityFlags2: number,
 *   generalProfileCompatibilityFlags3: number,
 *   generalProfileCompatibilityFlags4: number,
 *   generalConstraintIndicatorFlags1: number,
 *   generalConstraintIndicatorFlags2: number,
 *   generalConstraintIndicatorFlags3: number,
 *   generalConstraintIndicatorFlags4: number,
 *   generalConstraintIndicatorFlags5: number,
 *   generalConstraintIndicatorFlags6: number,
 *   minSpatialSegmentationIdc: number,
 *   chromaFormatIdc: number,
 *   bitDepthLumaMinus8: number,
 *   bitDepthChromaMinus8: number,
 *   parallelismType: number,
 *   frameRateFps: number,
 *   frameRateFixed: boolean,
 * }}
 *
 * @property {number} numTemporalLayers
 * @property {boolean} temporalIdNested
 * @property {number} generalProfileSpace
 * @property {number} generalTierFlag
 * @property {number} generalLevelIdc
 * @property {number} generalProfileIdc
 * @property {number} generalProfileCompatibilityFlags1
 * @property {number} generalProfileCompatibilityFlags2
 * @property {number} generalProfileCompatibilityFlags3
 * @property {number} generalProfileCompatibilityFlags4
 * @property {number} generalConstraintIndicatorFlags1
 * @property {number} generalConstraintIndicatorFlags2
 * @property {number} generalConstraintIndicatorFlags3
 * @property {number} generalConstraintIndicatorFlags4
 * @property {number} generalConstraintIndicatorFlags5
 * @property {number} generalConstraintIndicatorFlags6
 * @property {number} minSpatialSegmentationIdc
 * @property {number} chromaFormatIdc
 * @property {number} bitDepthLumaMinus8
 * @property {number} bitDepthChromaMinus8
 * @property {number} parallelismType
 * @property {number} frameRateFps
 * @property {boolean} frameRateFixed
 */
shaka.transmuxer.H265.DecoderConfigurationRecordType;
