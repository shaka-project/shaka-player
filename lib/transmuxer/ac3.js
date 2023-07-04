/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Ac3');


/**
 * AC3 utils
 */
shaka.transmuxer.Ac3 = class {
  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {?{sampleRate: number, channelCount: number,
   *          audioConfig: !Uint8Array, frameLength: number}}
   */
  static parseFrame(data, offset) {
    if (offset + 8 > data.length) {
      // not enough bytes left
      return null;
    }

    if (data[offset] !== 0x0b || data[offset + 1] !== 0x77) {
      // invalid magic
      return null;
    }

    // get sample rate
    const samplingRateCode = data[offset + 4] >> 6;
    if (samplingRateCode >= 3) {
      // invalid sampling rate
      return null;
    }

    const samplingRateMap = [48000, 44100, 32000];

    // get frame size
    const frameSizeCode = data[offset + 4] & 0x3f;
    const frameSizeMap = [
      64, 69, 96, 64, 70, 96, 80, 87, 120, 80, 88, 120, 96, 104, 144, 96, 105,
      144, 112, 121, 168, 112, 122, 168, 128, 139, 192, 128, 140, 192, 160,
      174, 240, 160, 175, 240, 192, 208, 288, 192, 209, 288, 224, 243, 336,
      224, 244, 336, 256, 278, 384, 256, 279, 384, 320, 348, 480, 320, 349,
      480, 384, 417, 576, 384, 418, 576, 448, 487, 672, 448, 488, 672, 512,
      557, 768, 512, 558, 768, 640, 696, 960, 640, 697, 960, 768, 835, 1152,
      768, 836, 1152, 896, 975, 1344, 896, 976, 1344, 1024, 1114, 1536, 1024,
      1115, 1536, 1152, 1253, 1728, 1152, 1254, 1728, 1280, 1393, 1920, 1280,
      1394, 1920,
    ];

    const frameLength = frameSizeMap[frameSizeCode * 3 + samplingRateCode] * 2;
    if (offset + frameLength > data.length) {
      return null;
    }

    // get channel count
    const channelMode = data[offset + 6] >> 5;
    let skipCount = 0;
    if (channelMode === 2) {
      skipCount += 2;
    } else {
      if ((channelMode & 1) && channelMode !== 1) {
        skipCount += 2;
      }
      if (channelMode & 4) {
        skipCount += 2;
      }
    }

    const lowFrequencyEffectsChannelOn =
      (((data[offset + 6] << 8) | data[offset + 7]) >> (12 - skipCount)) & 1;

    const channelsMap = [2, 1, 2, 3, 3, 4, 4, 5];

    // Audio config for DAC3 box
    const bitStreamIdentification = data[offset + 5] >> 3;
    const bitStreamMode = data[offset + 5] & 7;

    const config = new Uint8Array([
      (samplingRateCode << 6) |
          (bitStreamIdentification << 1) |
          (bitStreamMode >> 2),
      ((bitStreamMode & 3) << 6) |
          (channelMode << 3) |
          (lowFrequencyEffectsChannelOn << 2) |
          (frameSizeCode >> 4),
      (frameSizeCode << 4) & 0xe0,
    ]);

    return {
      sampleRate: samplingRateMap[samplingRateCode],
      channelCount: channelsMap[channelMode] + lowFrequencyEffectsChannelOn,
      audioConfig: config,
      frameLength: frameLength,
    };
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static probe(data, offset) {
    // look for the ac-3 sync bytes
    if (data[offset] === 0x0b &&
      data[offset + 1] === 0x77) {
      // check the bsid (bitStreamIdentification) to confirm ac-3
      let bsid = 0;
      let numBits = 5;
      offset += numBits;
      /** @type {?number} */
      let temp = null;
      /** @type {?number} */
      let mask = null;
      /** @type {?number} */
      let byte = null;
      while (numBits > 0) {
        byte = data[offset];
        // read remaining bits, upto 8 bits at a time
        const bits = Math.min(numBits, 8);
        const shift = 8 - bits;
        mask = (0xff000000 >>> (24 + shift)) << shift;
        temp = (byte & mask) >> shift;
        bsid = !bsid ? temp : (bsid << bits) | temp;
        offset += 1;
        numBits -= bits;
      }
      if (bsid < 16) {
        return true;
      }
    }
    return false;
  }
};

/**
 * @const {number}
 */
shaka.transmuxer.Ac3.AC3_SAMPLES_PER_FRAME = 1536;
