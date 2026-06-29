/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.SeiProcessor');

goog.require('shaka.util.Uint8ArrayUtils');


/**
 * SEI NALU parser used for extracting closed caption packets. The SEI message
 * syntax is identical across H.264, H.265 and H.266, so the same parser handles
 * all three.
 */
shaka.cea.SeiProcessor = class {
  /**
   * Processes supplemental enhancement information data.
   * @param {!Uint8Array} naluData NALU from which SEI data is to be processed.
   * @return {!Array<!Uint8Array>}
   */
  process(naluData) {
    const seiPayloads = [];
    const naluClone =
        shaka.util.Uint8ArrayUtils.removeEmulationPreventionBytes(naluData);

    // The following parses the SEI message syntax, which is identical across
    // H.264 (Rec. ITU-T H.264 (06/2019), section 7.3.2.3.1), H.265 and H.266.
    let offset = 0;

    while (offset < naluClone.length) {
      let payloadType = 0; // SEI payload type as defined by the spec.
      while (naluClone[offset] == 0xFF) {
        payloadType += 255;
        offset++;
      }
      payloadType += naluClone[offset++];

      let payloadSize = 0; // SEI payload size as defined by the spec.
      while (naluClone[offset] == 0xFF) {
        payloadSize += 255;
        offset++;
      }
      payloadSize += naluClone[offset++];

      // Payload type 4 is user_data_registered_itu_t_t35, as per the spec.
      // This payload type contains caption data.
      if (payloadType == 0x04) {
        seiPayloads.push(naluClone.subarray(offset, offset + payloadSize));
      }
      offset += payloadSize;
    }

    return seiPayloads;
  }
};
