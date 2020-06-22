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
   * @param {number} pts The presentation timestamp of media.
   * @param {function(!BufferSource, number)} onCaptionPackets
   */
  process(naluData, pts, onCaptionPackets) {
    const emuCount = this.removeEmu_(naluData);

    // The following is an implementation of section 7.3.2.3.1
    // in Rec. ITU-T H.264 (06/2019), the H.264 spec.
    let offset = 0;

    while (offset + emuCount < naluData.length) {
      let payloadType = 0; // SEI payload type as defined by H.264 spec
      while (naluData[offset] == 0xFF) {
        payloadType += 255;
        offset++;
      }
      payloadType += naluData[offset++];

      let payloadSize = 0; // SEI payload size as defined by H.264 spec
      while (naluData[offset] == 0xFF) {
        payloadSize += 255;
        offset++;
      }
      payloadSize += naluData[offset++];

      // Payload type 4 is user_data_registered_itu_t_t35, as per the H.264
      // spec. This payload type contains caption data.
      if (payloadType == 0x04) {
        onCaptionPackets(naluData.subarray(offset, offset + payloadSize), pts);
      }
      offset += payloadSize;
    }
  }


  /**
   * Removes H.264 emulation prevention bytes from the byte array.
   * @param {!Uint8Array} naluData NALU from which EMUs should be removed.
   * @return {number} The number of removed emulation prevention bytes.
   * @private
   */
  removeEmu_(naluData) {
    let zeroCount = 0;
    let src = 0;
    let dst = 0;
    while (src < naluData.length) {
      if (zeroCount == 2 && naluData[src] == 0x03) {
        zeroCount = 0;
      } else {
        if (naluData[src] == 0x00) {
          zeroCount++;
        } else {
          zeroCount = 0;
        }
        naluData[dst] = naluData[src];
        dst++;
      }
      src++;
    }
    return (src - dst);
  }
};
