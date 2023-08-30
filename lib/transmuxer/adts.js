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

  /**
   * @param {string} codec
   * @param {number} channelCount
   * @return {?Uint8Array}
   */
  static getSilentFrame(codec, channelCount) {
    switch (codec) {
      case 'mp4a.40.2':
        if (channelCount === 1) {
          return new Uint8Array([0x00, 0xc8, 0x00, 0x80, 0x23, 0x80]);
        } else if (channelCount === 2) {
          return new Uint8Array([
            0x21, 0x00, 0x49, 0x90, 0x02, 0x19, 0x00, 0x23, 0x80,
          ]);
        } else if (channelCount === 3) {
          return new Uint8Array([
            0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64,
            0x00, 0x8e,
          ]);
        } else if (channelCount === 4) {
          return new Uint8Array([
            0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64,
            0x00, 0x80, 0x2c, 0x80, 0x08, 0x02, 0x38,
          ]);
        } else if (channelCount === 5) {
          return new Uint8Array([
            0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64,
            0x00, 0x82, 0x30, 0x04, 0x99, 0x00, 0x21, 0x90, 0x02, 0x38,
          ]);
        } else if (channelCount === 6) {
          return new Uint8Array([
            0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64,
            0x00, 0x82, 0x30, 0x04, 0x99, 0x00, 0x21, 0x90, 0x02, 0x00, 0xb2,
            0x00, 0x20, 0x08, 0xe0,
          ]);
        }
        break;
      // handle HE-AAC below (mp4a.40.5 / mp4a.40.29)
      default:
        if (channelCount === 1) {
          // eslint-disable-next-line max-len
          // ffmpeg -y -f lavfi -i "aevalsrc=0:d=0.05" -c:a libfdk_aac -profile:a aac_he -b:a 4k output.aac && hexdump -v -e '16/1 "0x%x," "\n"' -v output.aac
          return new Uint8Array([
            0x1, 0x40, 0x22, 0x80, 0xa3, 0x4e, 0xe6, 0x80, 0xba, 0x8, 0x0, 0x0,
            0x0, 0x1c, 0x6, 0xf1, 0xc1, 0xa, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5e,
          ]);
        } else if (channelCount === 2) {
          // eslint-disable-next-line max-len
          // ffmpeg -y -f lavfi -i "aevalsrc=0|0:d=0.05" -c:a libfdk_aac -profile:a aac_he_v2 -b:a 4k output.aac && hexdump -v -e '16/1 "0x%x," "\n"' -v output.aac
          return new Uint8Array([
            0x1, 0x40, 0x22, 0x80, 0xa3, 0x5e, 0xe6, 0x80, 0xba, 0x8, 0x0, 0x0,
            0x0, 0x0, 0x95, 0x0, 0x6, 0xf1, 0xa1, 0xa, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5e,
          ]);
        } else if (channelCount === 3) {
          // eslint-disable-next-line max-len
          // ffmpeg -y -f lavfi -i "aevalsrc=0|0|0:d=0.05" -c:a libfdk_aac -profile:a aac_he_v2 -b:a 4k output.aac && hexdump -v -e '16/1 "0x%x," "\n"' -v output.aac
          return new Uint8Array([
            0x1, 0x40, 0x22, 0x80, 0xa3, 0x5e, 0xe6, 0x80, 0xba, 0x8, 0x0, 0x0,
            0x0, 0x0, 0x95, 0x0, 0x6, 0xf1, 0xa1, 0xa, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
            0x5a, 0x5e,
          ]);
        }
        break;
    }
    return null;
  }
};

/**
 * @const {number}
 */
shaka.transmuxer.ADTS.AAC_SAMPLES_PER_FRAME = 1024;
