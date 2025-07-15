/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Ec3');

goog.require('shaka.util.ExpGolomb');


/**
 * EC3 utils
 */
shaka.transmuxer.Ec3 = class {
  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {?{
   *   sampleRate: number,
   *   channelCount: number,
   *   audioConfig: !Uint8Array,
   *   frameLength: number,
   * }}
   */
  static parseFrame(data, offset) {
    if (offset + 8 > data.length) {
      // not enough bytes left
      return null;
    }

    if (!shaka.transmuxer.Ec3.probe(data, offset)) {
      return null;
    }

    const gb = new shaka.util.ExpGolomb(data.subarray(offset + 2));
    // Skip stream_type
    gb.skipBits(2);
    // Skip sub_stream_id
    gb.skipBits(3);
    const frameLength = (gb.readBits(11) + 1) << 1;
    let samplingRateCode = gb.readBits(2);
    let sampleRate = null;
    let numBlocksCode = null;
    if (samplingRateCode == 0x03) {
      samplingRateCode = gb.readBits(2);
      sampleRate = [24000, 22060, 16000][samplingRateCode];
      numBlocksCode = 3;
    } else {
      sampleRate = [48000, 44100, 32000][samplingRateCode];
      numBlocksCode = gb.readBits(2);
    }

    const channelMode = gb.readBits(3);
    const lowFrequencyEffectsChannelOn = gb.readBits(1);
    const bitStreamIdentification = gb.readBits(5);

    if (offset + frameLength > data.byteLength) {
      return null;
    }

    const channelsMap = [2, 1, 2, 3, 3, 4, 4, 5];

    const numBlocksMap = [1, 2, 3, 6];

    const numBlocks = numBlocksMap[numBlocksCode];

    const dataRateSub =
        Math.floor((frameLength * sampleRate) / (numBlocks * 16));

    const config = new Uint8Array([
      ((dataRateSub & 0x1FE0) >> 5),
      ((dataRateSub & 0x001F) << 3), // num_ind_sub = zero
      (sampleRate << 6) | (bitStreamIdentification << 1) | (0 << 0),
      (0 << 7) | (0 << 4) |
      (channelMode << 1) | (lowFrequencyEffectsChannelOn << 0),
      (0 << 5) | (0 << 1) | (0 << 0),
    ]);

    return {
      sampleRate,
      channelCount: channelsMap[channelMode] + lowFrequencyEffectsChannelOn,
      audioConfig: config,
      frameLength,
    };
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static probe(data, offset) {
    // search 16-bit 0x0B77 sync word
    const syncWord = (data[offset] << 8) | (data[offset + 1] << 0);
    if (syncWord === 0x0B77) {
      return true;
    } else {
      return false;
    }
  }
};

/**
 * @const {number}
 */
shaka.transmuxer.Ec3.EC3_SAMPLES_PER_FRAME = 1536;
