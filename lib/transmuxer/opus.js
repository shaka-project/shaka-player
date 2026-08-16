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

  /**
   * Returns the number of 48 kHz samples represented by an opus packet,
   * derived from its TOC byte and (for code 3) the frame-count byte.
   * See RFC 6716 §3.1.
   *
   * One PES packet in an MPEG-TS opus stream can carry a multi-frame opus
   * packet (e.g. browser MediaRecorder emits code-3 packets with 3x 20ms
   * CELT frames = 60ms per packet). Treating one PES packet as one frame's
   * worth of samples under-counts duration and breaks timeline alignment
   * in the resulting mp4.
   *
   * Returned counts are at 48 kHz. This assumes the caller writes the opus
   * track with a 48 kHz mp4 timescale, which TsParser hardcodes for opus
   * (RFC 6716: opus always decodes internally at 48 kHz; OpusHead's input
   * sample rate is informational). If that hardcode ever becomes variable,
   * scale the return value by (timescale / 48000).
   *
   * @param {!Uint8Array} packet  Opus packet starting at the TOC byte.
   * @return {number}  Sample count at 48 kHz.
   */
  static getPacketSampleCount(packet) {
    if (packet.length < 1) {
      return shaka.transmuxer.Opus.OPUS_AUDIO_SAMPLE_PER_FRAME;
    }
    const toc = packet[0];
    const config = (toc >> 3) & 0x1F;
    const code = toc & 0x03;
    const spf = shaka.transmuxer.Opus.SAMPLES_PER_FRAME_BY_CONFIG_[config];
    let frames;
    if (code === 0) {
      frames = 1;
    } else if (code === 1 || code === 2) {
      frames = 2;
    } else {
      // Code 3: number of frames is in bits 0-5 of the second byte.
      if (packet.length < 2) {
        return spf;
      }
      frames = packet[1] & 0x3F;
      if (frames === 0) {
        return spf;
      }
    }
    return spf * frames;
  }
};

/**
 * Samples per opus frame at 48 kHz, indexed by the 5-bit config field from
 * the TOC byte. See RFC 6716 §3.1, Table 2.
 *
 * @private @const {!Array<number>}
 */
shaka.transmuxer.Opus.SAMPLES_PER_FRAME_BY_CONFIG_ = [
  480, 960, 1920, 2880,    // SILK NB     10/20/40/60 ms
  480, 960, 1920, 2880,    // SILK MB     10/20/40/60 ms
  480, 960, 1920, 2880,    // SILK WB     10/20/40/60 ms
  480, 960,                // Hybrid SWB  10/20 ms
  480, 960,                // Hybrid FB   10/20 ms
  120, 240, 480, 960,      // CELT NB     2.5/5/10/20 ms
  120, 240, 480, 960,      // CELT WB
  120, 240, 480, 960,      // CELT SWB
  120, 240, 480, 960,      // CELT FB
];

/**
 * Retained for backward compatibility. Prefer getPacketSampleCount(), which
 * handles multi-frame opus packets correctly.
 *
 * @const {number}
 */
shaka.transmuxer.Opus.OPUS_AUDIO_SAMPLE_PER_FRAME = 960;
