/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.codec.Opus');

goog.require('shaka.util.BufferUtils');

goog.requireType('shaka.util.TsParser');


/**
 * Opus utils
 */
shaka.codec.Opus = class {
  /**
   * Converts an OpusHead (Ogg and Matroska) to the payload of the dOps box
   * (MP4).  Both carry the same fields, but OpusHead is little endian and dOps
   * is big endian.
   *
   * @param {!Uint8Array} head
   * @return {!Uint8Array}
   */
  static getDops(head) {
    const Opus = shaka.codec.Opus;
    const input = shaka.util.BufferUtils.toDataView(head);
    // The bytes that follow the gain are the channel mapping, which is the
    // same in both boxes.
    const mapping = head.subarray(Opus.HEAD_MAPPING_FAMILY_);
    const output = new Uint8Array(Opus.DOPS_MAPPING_FAMILY_ + mapping.length);
    const view = shaka.util.BufferUtils.toDataView(output);
    // The version of dOps is 0, whereas the one of OpusHead is 1.
    view.setUint8(0, 0);
    view.setUint8(1, input.getUint8(9));
    view.setUint16(2, input.getUint16(10, true));
    view.setUint32(4, input.getUint32(12, true));
    view.setInt16(8, input.getInt16(16, true));
    output.set(mapping, Opus.DOPS_MAPPING_FAMILY_);
    return output;
  }

  /**
   * Makes the OpusHead of a plain mono or stereo stream.
   *
   * @param {number} channelCount
   * @param {number} preSkip In samples at 48 kHz.
   * @return {!Uint8Array}
   */
  static makeHead(channelCount, preSkip) {
    const Opus = shaka.codec.Opus;
    const head = new Uint8Array(Opus.HEAD_SIZE_);
    const view = shaka.util.BufferUtils.toDataView(head);
    head.set(Opus.HEAD_MAGIC_);
    view.setUint8(8, 1);
    view.setUint8(9, channelCount);
    view.setUint16(10, preSkip, /* littleEndian= */ true);
    view.setUint32(12, Opus.SAMPLE_RATE, true);
    return head;
  }

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
      return shaka.codec.Opus.OPUS_AUDIO_SAMPLE_PER_FRAME;
    }
    const toc = packet[0];
    const config = (toc >> 3) & 0x1F;
    const code = toc & 0x03;
    const spf = shaka.codec.Opus.SAMPLES_PER_FRAME_BY_CONFIG_[config];
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
shaka.codec.Opus.SAMPLES_PER_FRAME_BY_CONFIG_ = [
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
shaka.codec.Opus.OPUS_AUDIO_SAMPLE_PER_FRAME = 960;


/**
 * Opus always decodes at 48 kHz (RFC 6716); the input rate an OpusHead
 * announces is informational.
 *
 * @const {number}
 */
shaka.codec.Opus.SAMPLE_RATE = 48000;

/**
 * The 8 ASCII bytes 'OpusHead' that start the identification header.
 *
 * @private @const {!Uint8Array}
 */
shaka.codec.Opus.HEAD_MAGIC_ =
    new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]);

/**
 * The size of an OpusHead without a channel mapping table.
 *
 * @private @const {number}
 */
shaka.codec.Opus.HEAD_SIZE_ = 19;

/**
 * Offset of the channel mapping family byte in OpusHead (after the 8-byte
 * magic, the version, the channel count, the pre-skip, the input rate and the
 * gain) and in dOps (which lacks the magic).  Everything from there on is the
 * same in both.
 *
 * @private @const {number}
 */
shaka.codec.Opus.HEAD_MAPPING_FAMILY_ = 18;

/** @private @const {number} */
shaka.codec.Opus.DOPS_MAPPING_FAMILY_ = 10;
