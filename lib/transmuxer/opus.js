/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Opus');

goog.requireType('shaka.util.TsParser');


/**
 * Opus utils
 */
shaka.transmuxer.Opus = class {
  /**
   * @param {!shaka.util.TsParser.OpusMetadata} metadata
   * @return {!Uint8Array}
   */
  static getAudioConfig(metadata) {
    let mapping = [];
    switch (metadata.channelConfigCode) {
      case 0x01:
      case 0x02:
        mapping = [0x0];
        break;
      case 0x00: // dualmono
        mapping = [0xFF, 1, 1, 0, 1];
        break;
      case 0x80: // dualmono
        mapping = [0xFF, 2, 0, 0, 1];
        break;
      case 0x03:
        mapping = [0x01, 2, 1, 0, 2, 1];
        break;
      case 0x04:
        mapping = [0x01, 2, 2, 0, 1, 2, 3];
        break;
      case 0x05:
        mapping = [0x01, 3, 2, 0, 4, 1, 2, 3];
        break;
      case 0x06:
        mapping = [0x01, 4, 2, 0, 4, 1, 2, 3, 5];
        break;
      case 0x07:
        mapping = [0x01, 4, 2, 0, 4, 1, 2, 3, 5, 6];
        break;
      case 0x08:
        mapping = [0x01, 5, 3, 0, 6, 1, 2, 3, 4, 5, 7];
        break;
      case 0x82:
        mapping = [0x01, 1, 2, 0, 1];
        break;
      case 0x83:
        mapping = [0x01, 1, 3, 0, 1, 2];
        break;
      case 0x84:
        mapping = [0x01, 1, 4, 0, 1, 2, 3];
        break;
      case 0x85:
        mapping = [0x01, 1, 5, 0, 1, 2, 3, 4];
        break;
      case 0x86:
        mapping = [0x01, 1, 6, 0, 1, 2, 3, 4, 5];
        break;
      case 0x87:
        mapping = [0x01, 1, 7, 0, 1, 2, 3, 4, 5, 6];
        break;
      case 0x88:
        mapping = [0x01, 1, 8, 0, 1, 2, 3, 4, 5, 6, 7];
        break;
    }

    return new Uint8Array([
      0x00,         // Version (1)
      metadata.channelCount, // OutputChannelCount: 2
      0x00, 0x00,   // PreSkip: 2
      (metadata.sampleRate >>> 24) & 0xFF,  // Audio sample rate: 4
      (metadata.sampleRate >>> 17) & 0xFF,
      (metadata.sampleRate >>> 8) & 0xFF,
      (metadata.sampleRate >>> 0) & 0xFF,
      0x00, 0x00,  // Global Gain : 2
      ...mapping,
    ]);
  }
};

/**
 * @const {number}
 */
shaka.transmuxer.Opus.OPUS_AUDIO_SAMPLE_PER_FRAME = 960;
