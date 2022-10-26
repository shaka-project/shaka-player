/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.TsParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @see https://en.wikipedia.org/wiki/MPEG_transport_stream
 * @export
 */
shaka.util.TsParser = class {
  /** */
  constructor() {
    /** @private {?number} */
    this.pmtId_ = null;

    /** @private {boolean} */
    this.pmtParsed_ = false;

    /** @private {?number} */
    this.videoStartTime_ = null;

    /** @private {?number} */
    this.videoPid_ = null;

    /** @private {?string} */
    this.videoCodec_ = null;

    /** @private {!Array.<Uint8Array>} */
    this.videoData_ = [];

    /** @private {?number} */
    this.audioStartTime_ = null;

    /** @private {?number} */
    this.audioPid_ = null;

    /** @private {?string} */
    this.audioCodec_ = null;

    /** @private {!Array.<Uint8Array>} */
    this.audioData_ = [];

    /** @private {?number} */
    this.id3Pid_ = null;

    /** @private {!Array.<Uint8Array>} */
    this.id3Data_ = [];
  }

  /**
   * Parse the given data
   *
   * @param {Uint8Array} data
   * @return {!shaka.util.TsParser}
   */
  parse(data) {
    const timescale = shaka.util.TsParser.Timescale_;
    const packetLength = shaka.util.TsParser.PacketLength_;

    // A TS fragment should contain at least 3 TS packets, a PAT, a PMT, and
    // one PID.
    if (data.length < 3 * packetLength) {
      return this;
    }
    const syncOffset = Math.max(0, shaka.util.TsParser.syncOffset(data));

    const length = data.length - (data.length + syncOffset) % packetLength;

    let unknownPIDs = false;

    // loop through TS packets
    for (let start = syncOffset; start < length; start += packetLength) {
      if (data[start] === 0x47) {
        const payloadUnitStartIndicator = !!(data[start + 1] & 0x40);
        // pid is a 13-bit field starting at the last 5 bits of TS[1]
        const pid = ((data[start + 1] & 0x1f) << 8) + data[start + 2];
        const adaptationFieldControl = (data[start + 3] & 0x30) >> 4;

        // if an adaption field is present, its length is specified by the
        // fifth byte of the TS packet header.
        let offset;
        if (adaptationFieldControl > 1) {
          offset = start + 5 + data[start + 4];
          // continue if there is only adaptation field
          if (offset === start + packetLength) {
            continue;
          }
        } else {
          offset = start + 4;
        }
        switch (pid) {
          case 0:
            if (payloadUnitStartIndicator) {
              offset += data[offset] + 1;
            }

            this.pmtId_ = this.getPmtId_(data, offset);
            break;
          case 17:
          case 0x1fff:
            break;
          case this.pmtId_: {
            if (payloadUnitStartIndicator) {
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
            if (this.videoPid_ == null) {
              this.videoPid_ = parsedPIDs.video;
              this.videoCodec_ = parsedPIDs.videoCodec;
            }
            if (this.audioPid_ == null) {
              this.audioPid_ = parsedPIDs.audio;
              this.audioCodec_ = parsedPIDs.audioCodec;
            }
            if (this.id3Pid_ == null) {
              this.id3Pid_ = parsedPIDs.id3;
            }

            if (unknownPIDs && !this.pmtParsed_) {
              shaka.log.debug('reparse from beginning');
              unknownPIDs = false;
              // we set it to -188, the += 188 in the for loop will reset
              // start to 0
              start = syncOffset - packetLength;
            }
            this.pmtParsed_ = true;
            break;
          }
          case this.videoPid_: {
            const videoData = data.subarray(offset, start + packetLength);
            if (this.videoStartTime_ == null) {
              const pes = this.parsePES(videoData);
              if (pes && pes.pts != null) {
                this.videoStartTime_ = pes.pts / timescale;
              }
            }
            this.videoData_.push(videoData);
            break;
          }
          case this.audioPid_: {
            const audioData = data.subarray(offset, start + packetLength);
            if (this.audioStartTime_ == null) {
              const pes = this.parsePES(audioData);
              if (pes && pes.pts != null) {
                this.audioStartTime_ = pes.pts / timescale;
              }
            }
            this.audioData_.push(audioData);
            break;
          }
          case this.id3Pid_:
            this.id3Data_.push(data.subarray(offset, start + packetLength));
            break;
          default:
            unknownPIDs = true;
            break;
        }
      } else {
        shaka.log.warning('Found TS packet that do not start with 0x47');
      }
    }
    return this;
  }

  /**
   * Get the PMT ID from the PAT
   *
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {number}
   * @private
   */
  getPmtId_(data, offset) {
    // skip the PSI header and parse the first PMT entry
    return ((data[offset + 10] & 0x1f) << 8) | data[offset + 11];
  }

  /**
   * Parse PMT
   *
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {!shaka.util.TsParser.PMT}
   */
  parsePMT(data, offset) {
    const result = {
      audio: -1,
      video: -1,
      id3: -1,
      audioCodec: '',
      videoCodec: '',
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
            result.audioCodec = 'aac';
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
            result.videoCodec = 'avc';
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
   * Parse PES
   *
   * @param {Uint8Array} data
   * @return {?shaka.util.TsParser.PES}
   */
  parsePES(data) {
    const startPrefix = (data[0] << 16) | (data[1] << 8) | data[2];
    // In certain live streams, the start of a TS fragment has ts packets
    // that are frame data that is continuing from the previous fragment. This
    // is to check that the pes data is the start of a new pes data
    if (startPrefix !== 1) {
      return null;
    }
    /** @type {shaka.util.TsParser.PES} */
    const pes = {
      data: new Uint8Array(0),
      // get the packet length, this will be 0 for video
      packetLength: 6 + ((data[4] << 8) | data[5]),
      pts: null,
      dts: null,
    };

    // PES packets may be annotated with a PTS value, or a PTS value
    // and a DTS value. Determine what combination of values is
    // available to work with.
    const ptsDtsFlags = data[7];

    // PTS and DTS are normally stored as a 33-bit number.  Javascript
    // performs all bitwise operations on 32-bit integers but javascript
    // supports a much greater range (52-bits) of integer using standard
    // mathematical operations.
    // We construct a 31-bit value using bitwise operators over the 31
    // most significant bits and then multiply by 4 (equal to a left-shift
    // of 2) before we add the final 2 least significant bits of the
    // timestamp (equal to an OR.)
    if (ptsDtsFlags & 0xC0) {
      // the PTS and DTS are not written out directly. For information
      // on how they are encoded, see
      // http://dvd.sourceforge.net/dvdinfo/pes-hdr.html
      pes.pts =
        (data[9] & 0x0e) * 536870912 + // 1 << 29
        (data[10] & 0xff) * 4194304 + // 1 << 22
        (data[11] & 0xfe) * 16384 + // 1 << 14
        (data[12] & 0xff) * 128 + // 1 << 7
        (data[13] & 0xfe) / 2;

      pes.dts = pes.pts;
      if (ptsDtsFlags & 0x40) {
        pes.dts =
          (data[14] & 0x0e) * 536870912 + // 1 << 29
          (data[15] & 0xff) * 4194304 + // 1 << 22
          (data[16] & 0xfe) * 16384 + // 1 << 14
          (data[17] & 0xff) * 128 + // 1 << 7
          (data[18] & 0xfe) / 2;
      }
    }
    // the data section starts immediately after the PES header.
    // pes_header_data_length specifies the number of header bytes
    // that follow the last byte of the field.
    pes.data = data.subarray(9 + data[8]);

    return pes;
  }

  /**
   * Return the ID3 metadata
   *
   * @return {!Array.<shaka.extern.ID3Metadata>}
   */
  getMetadata() {
    const timescale = shaka.util.TsParser.Timescale_;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const metadata = [];
    let prevId3Data = new Uint8Array(0);
    for (let i = this.id3Data_.length - 1; i >= 0; i--) {
      const data = Uint8ArrayUtils.concat(this.id3Data_[i], prevId3Data);
      goog.asserts.assert(data, 'We should have a data');
      const pes = this.parsePES(data);
      if (pes) {
        metadata.unshift({
          cueTime: pes.pts ? pes.pts / timescale : null,
          data: pes.data,
          frames: shaka.util.Id3Utils.getID3Frames(pes.data),
          dts: pes.dts,
          pts: pes.pts,
        });
        prevId3Data = new Uint8Array(0);
      } else {
        prevId3Data = data;
      }
    }
    return metadata;
  }

  /**
   * Return the start time for the audio and video
   *
   * @return {{audio: ?number, video: ?number}}
   */
  getStartTime() {
    return {
      audio: this.audioStartTime_,
      video: this.videoStartTime_,
    };
  }

  /**
   * Return the audio and video codecs
   *
   * @return {{audio: ?string, video: ?string}}
   */
  getCodecs() {
    return {
      audio: this.audioCodec_,
      video: this.videoCodec_,
    };
  }

  /**
   * Check if the passed data corresponds to an MPEG2-TS
   *
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
   *
   * @param {Uint8Array} data
   * @return {number}
   */
  static syncOffset(data) {
    const packetLength = shaka.util.TsParser.PacketLength_;
    // scan 1000 first bytes
    const scanwindow = Math.min(1000, data.length - 3 * packetLength);
    let i = 0;
    while (i < scanwindow) {
      // a TS fragment should contain at least 3 TS packets, a PAT, a PMT, and
      // one PID, each starting with 0x47
      if (data[i] === 0x47 &&
          data[i + packetLength] === 0x47 &&
          data[i + 2 * packetLength] === 0x47) {
        return i;
      } else {
        i++;
      }
    }
    return -1;
  }
};


/**
 * @const {number}
 * @private
 */
shaka.util.TsParser.PacketLength_ = 188;


/**
 * @const {number}
 * @private
 */
shaka.util.TsParser.Timescale_ = 90000;


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


/**
 * @typedef {{
 *   data: Uint8Array,
 *   packetLength: number,
 *   pts: ?number,
 *   dts: ?number
 * }}
 *
 * @summary PES.
 * @property {Uint8Array} data
 * @property {number} packetLength
 * @property {?number} pts
 * @property {?number} dts
 */
shaka.util.TsParser.PES;

