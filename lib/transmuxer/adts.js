/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.ADTS');


/**
 * ADTS utils
 */
shaka.transmuxer.ADTS = class {
  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {?{headerLength: number, frameLength: number}}
   */
  static parseHeader(data, offset) {
    const ADTS = shaka.transmuxer.ADTS;
    // The protection skip bit tells us if we have 2 bytes of CRC data at the
    // end of the ADTS header
    const headerLength = ADTS.getHeaderLength(data, offset);
    if (offset + headerLength <= data.length) {
      // retrieve frame size
      const frameLength = ADTS.getFullFrameLength(data, offset) - headerLength;
      if (frameLength > 0) {
        return {
          headerLength,
          frameLength,
        };
      }
    }
    return null;
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {?{sampleRate: number, channelCount: number, codec: string}}
   */
  static parseInfo(data, offset) {
    const adtsSamplingRates = [
      96000,
      88200,
      64000,
      48000,
      44100,
      32000,
      24000,
      22050,
      16000,
      12000,
      11025,
      8000,
      7350,
    ];
    const adtsSamplingIndex = (data[offset + 2] & 0x3c) >>> 2;
    if (adtsSamplingIndex > adtsSamplingRates.length - 1) {
      return null;
    }
    const adtsObjectType = ((data[offset + 2] & 0xc0) >>> 6) + 1;
    let adtsChannelConfig = (data[offset + 2] & 0x01) << 2;
    adtsChannelConfig |= (data[offset + 3] & 0xc0) >>> 6;
    return {
      sampleRate: adtsSamplingRates[adtsSamplingIndex],
      channelCount: adtsChannelConfig,
      codec: 'mp4a.40.' + adtsObjectType,
    };
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static isHeaderPattern(data, offset) {
    return data[offset] === 0xff && (data[offset + 1] & 0xf6) === 0xf0;
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {number}
   */
  static getHeaderLength(data, offset) {
    return data[offset + 1] & 0x01 ? 7 : 9;
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {number}
   */
  static getFullFrameLength(data, offset) {
    return ((data[offset + 3] & 0x03) << 11) |
        (data[offset + 4] << 3) |
        ((data[offset + 5] & 0xe0) >>> 5);
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static isHeader(data, offset) {
    const ADTS = shaka.transmuxer.ADTS;
    // Look for ADTS header | 1111 1111 | 1111 X00X | where X can be
    // either 0 or 1
    // Layer bits (position 14 and 15) in header should be always 0 for ADTS
    // More info https://wiki.multimedia.cx/index.php?title=ADTS
    return offset + 1 < data.length && ADTS.isHeaderPattern(data, offset);
  }

  /**
   * @param {!Uint8Array} data
   * @param {!number} offset
   * @return {boolean}
   */
  static probe(data, offset) {
    const ADTS = shaka.transmuxer.ADTS;
    // same as isHeader but we also check that ADTS frame follows last ADTS
    // frame or end of data is reached
    if (ADTS.isHeader(data, offset)) {
      // ADTS header Length
      const headerLength = ADTS.getHeaderLength(data, offset);
      if (offset + headerLength >= data.length) {
        return false;
      }
      // ADTS frame Length
      const frameLength = ADTS.getFullFrameLength(data, offset);
      if (frameLength <= headerLength) {
        return false;
      }

      const newOffset = offset + frameLength;
      return newOffset === data.length || ADTS.isHeader(data, newOffset);
    }
    return false;
  }

  /**
   * @param {!number} samplerate
   * @return {number}
   */
  static getFrameDuration(samplerate) {
    return (shaka.transmuxer.ADTS.AAC_SAMPLES_PER_FRAME * 90000) / samplerate;
  }
};

/**
 * @const {number}
 */
shaka.transmuxer.ADTS.AAC_SAMPLES_PER_FRAME = 1024;
