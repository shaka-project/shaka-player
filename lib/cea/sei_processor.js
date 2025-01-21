/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.SeiProcessor');


/**
 * H.264 SEI NALU Parser used for extracting 708 closed caption packets.
 */
shaka.cea.SeiProcessor = class {
  /**
   * Processes supplemental enhancement information data.
   * @param {!Uint8Array} naluData NALU from which SEI data is to be processed.
   * @return {!Array<!Uint8Array>}
   */
  process(naluData) {
    const seiPayloads = [];
    const naluClone = this.removeEmu(naluData);

    // The following is an implementation of section 7.3.2.3.1
    // in Rec. ITU-T H.264 (06/2019), the H.264 spec.
    let offset = 0;

    while (offset < naluClone.length) {
      let payloadType = 0; // SEI payload type as defined by H.264 spec
      while (naluClone[offset] == 0xFF) {
        payloadType += 255;
        offset++;
      }
      payloadType += naluClone[offset++];

      let payloadSize = 0; // SEI payload size as defined by H.264 spec
      while (naluClone[offset] == 0xFF) {
        payloadSize += 255;
        offset++;
      }
      payloadSize += naluClone[offset++];

      // Payload type 4 is user_data_registered_itu_t_t35, as per the H.264
      // spec. This payload type contains caption data.
      if (payloadType == 0x04) {
        seiPayloads.push(naluClone.subarray(offset, offset + payloadSize));
      }
      offset += payloadSize;
    }

    return seiPayloads;
  }


  /**
   * Removes H.264 emulation prevention bytes from the byte array.
   *
   * Note: Remove bytes by shifting will cause Chromium (VDA) to complain
   * about conformance. Recreating a new array solves it.
   *
   * @param {!Uint8Array} naluData NALU from which EMUs should be removed.
   * @return {!Uint8Array} The NALU with the emulation prevention byte removed.
   */
  removeEmu(naluData) {
    let naluClone = naluData;
    let zeroCount = 0;
    let src = 0;
    while (src < naluClone.length) {
      if (zeroCount == 2 && naluClone[src] == 0x03) {
        // 0x00, 0x00, 0x03 pattern detected
        zeroCount = 0;

        // Splice the array and recreate a new one, instead of shifting bytes
        const newArr = [...naluClone];
        newArr.splice(src, 1);
        naluClone = new Uint8Array(newArr);
      } else {
        if (naluClone[src] == 0x00) {
          zeroCount++;
        } else {
          zeroCount = 0;
        }
      }
      src++;
    }
    return naluClone;
  }
};
