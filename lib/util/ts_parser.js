/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.TsParser');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @export
 */
shaka.util.TsParser = class {
  /** */
  constructor() {
    /** @private {?number} */
    this.pmtId = null;

    /** @private {boolean} */
    this.pmtParsed = false;

    /** @private {?number} */
    this.videoPid = null;

    /** @private {?string} */
    this.videoCodec = null;

    /** @private {!Array.<Uint8Array>} */
    this.videoData = [];

    /** @private {?number} */
    this.audioPid = null;

    /** @private {?string} */
    this.audioCodec = null;

    /** @private {!Array.<Uint8Array>} */
    this.audioData = [];

    /** @private {?number} */
    this.id3Pid = null;

    /** @private {!Array.<Uint8Array>} */
    this.id3Data = [];

    /** @private {?Uint8Array} */
    this.remainderData = null;
  }

  /**
   * Check if the passed data corresponds to an MPEG2-TS
   * @param {Uint8Array} data
   */
  parse(data) {
    let unknownPIDs = false;

    let len = data.length;
    if (this.remainderData) {
      data = shaka.util.Uint8ArrayUtils.concat(this.remainderData, data);
      len = data.length;
      this.remainderData = null;
    }

    if (len < 188) {
      this.remainderData = data;
      return;
    }

    const syncOffset = Math.max(0, shaka.util.TsParser.syncOffset(data));

    len -= (len + syncOffset) % 188;
    if (len < data.byteLength) {
      this.remainderData = shaka.util.BufferUtils.toUint8(data, len);
    }

    // loop through TS packets
    for (let start = syncOffset; start < len; start += 188) {
      if (data[start] === 0x47) {
        const stt = !!(data[start + 1] & 0x40);
        // pid is a 13-bit field starting at the last bit of TS[1]
        const pid = ((data[start + 1] & 0x1f) << 8) + data[start + 2];
        const atf = (data[start + 3] & 0x30) >> 4;

        // if an adaption field is present, its length is specified by the
        // fifth byte of the TS packet header.
        let offset;
        if (atf > 1) {
          offset = start + 5 + data[start + 4];
          // continue if there is only adaptation field
          if (offset === start + 188) {
            continue;
          }
        } else {
          offset = start + 4;
        }
        switch (pid) {
          case 0:
            if (stt) {
              offset += data[offset] + 1;
            }

            this.pmtId = this.parsePAT(data, offset);
            break;
          case 17:
          case 0x1fff:
            break;
          case this.pmtId: {
            if (stt) {
              offset += data[offset] + 1;
            }

            const parsedPIDs = this.parsePMT(data, offset);

            // only update track id if track PID found while parsing PMT
            // this is to avoid resetting the PID to -1 in case
            // track PID transiently disappears from the stream
            // this could happen in case of transient missing audio samples
            // for example
            // NOTE this is only the PID of the track as found in TS,
            // but we are not using this for MP4 track IDs.
            if (this.videoPid == null) {
              this.videoPid = parsedPIDs.video;
              this.videoCodec = parsedPIDs.videoCodec;
            }
            if (this.audioPid == null) {
              this.audioPid = parsedPIDs.audio;
              this.audioCodec = parsedPIDs.audioCodec;
            }
            if (this.id3Pid == null) {
              this.id3Pid = parsedPIDs.id3;
            }

            if (unknownPIDs && !this.pmtParsed) {
              shaka.log.debug('reparse from beginning');
              unknownPIDs = false;
              // we set it to -188, the += 188 in the for loop will reset
              // start to 0
              start = syncOffset - 188;
            }
            this.pmtParsed = true;
            break;
          }
          case this.videoPid:
            this.videoData.push(data.subarray(offset, start + 188));
            break;
          case this.audioPid:
            this.audioData.push(data.subarray(offset, start + 188));
            break;
          case this.id3Pid:
            this.id3Data.push(data.subarray(offset, start + 188));
            break;
          default:
            unknownPIDs = true;
            break;
        }
      } else {
        shaka.log.warning('Found TS packet that do not start with 0x47');
      }
    }
  }

  /**
   * Parse PAT
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {number}
   */
  parsePAT(data, offset) {
    // skip the PSI header and parse the first PMT entry
    return ((data[offset + 10] & 0x1f) << 8) | data[offset + 11];
  }

  /**
   * Parse PMT
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {!shaka.util.TsParser.PMT}
   */
  parsePMT(data, offset) {
    const result = {
      audio: -1,
      video: -1,
      id3: -1,
      audioCodec: 'aac',
      videoCodec: 'avc',
    };
    const sectionLength = ((data[offset + 1] & 0x0f) << 8) | data[offset + 2];
    const tableEnd = offset + 3 + sectionLength - 4;
    // to determine where the table is, we have to figure out how
    // long the program info descriptors are
    const programInfoLength =
      ((data[offset + 10] & 0x0f) << 8) | data[offset + 11];
    // advance the offset to the first entry in the mapping table
    offset += 12 + programInfoLength;
    while (offset < tableEnd) {
      const pid = ((data[offset + 1] & 0x1f) << 8) | data[offset + 2];
      switch (data[offset]) {
        // SAMPLE-AES AAC
        case 0xcf:
          break;
        // ISO/IEC 13818-7 ADTS AAC (MPEG-2 lower bit-rate audio)
        case 0x0f:
          if (result.audio === -1) {
            result.audio = pid;
          }
          break;
        // Packetized metadata (ID3)
        case 0x15:
          if (result.id3 === -1) {
            result.id3 = pid;
          }
          break;
        // SAMPLE-AES AVC
        case 0xdb:
          break;
        // ITU-T Rec. H.264 and ISO/IEC 14496-10 (lower bit-rate video)
        case 0x1b:
          if (result.video === -1) {
            result.video = pid;
          }
          break;
        // ISO/IEC 11172-3 (MPEG-1 audio)
        // or ISO/IEC 13818-3 (MPEG-2 halved sample rate audio)
        case 0x03:
        case 0x04:
          if (result.audio === -1) {
            result.audio = pid;
            result.audioCodec = 'mp3';
          }
          break;
        // HEVC
        case 0x24:
          if (result.video === -1) {
            result.video = pid;
            result.videoCodec = 'hvc';
          }
          break;
        default:
          // shaka.log.warning('Unknown stream type:', data[offset]);
          break;
      }
      // move to the next table entry
      // skip past the elementary stream descriptors, if present
      offset += (((data[offset + 3] & 0x0f) << 8) | data[offset + 4]) + 5;
    }
    return result;
  }

  /**
   * Check if the passed data corresponds to an MPEG2-TS
   * @param {Uint8Array} data
   * @return {boolean}
   */
  static probe(data) {
    const syncOffset = shaka.util.TsParser.syncOffset(data);
    if (syncOffset < 0) {
      return false;
    } else {
      if (syncOffset > 0) {
        shaka.log.warning('MPEG2-TS detected but first sync word found @ ' +
            'offset ' + syncOffset + ', junk ahead ?');
      }
      return true;
    }
  }

  /**
   * Returns the synchronization offset
   * @param {Uint8Array} data
   * @return {number}
   */
  static syncOffset(data) {
    // scan 1000 first bytes
    const scanwindow = Math.min(1000, data.length - 3 * 188);
    let i = 0;
    while (i < scanwindow) {
      // a TS fragment should contain at least 3 TS packets, a PAT, a PMT, and
      // one PID, each starting with 0x47
      if (data[i] === 0x47 &&
          data[i + 188] === 0x47 &&
          data[i + 2 * 188] === 0x47) {
        return i;
      } else {
        i++;
      }
    }
    return -1;
  }
};


/**
 * @typedef {{
 *   audio: number,
 *   video: number,
 *   id3: number,
 *   audioCodec: string,
 *   videoCodec: string
 * }}
 *
 * @summary PMT.
 * @property {number} audio
 *   Audio PID
 * @property {number} video
 *   Video PID
 * @property {number} id3
 *   ID3 PID
 * @property {string} audioCodec
 *   Audio codec
 * @property {string} videoCodec
 *   Video codec
 */
shaka.util.TsParser.PMT;

