/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.TsParser');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.log');
goog.require('shaka.util.ExpGolomb');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @see https://en.wikipedia.org/wiki/MPEG_transport_stream
 * @export
 */
shaka.util.TsParser = class {
  constructor() {
    /** @private {?number} */
    this.pmtId_ = null;

    /** @private {boolean} */
    this.pmtParsed_ = false;

    /** @private {?number} */
    this.videoPid_ = null;

    /** @private {?string} */
    this.videoCodec_ = null;

    /** @private {!Array<!Array<Uint8Array>>} */
    this.videoData_ = [];

    /** @private {!Array<shaka.extern.MPEG_PES>} */
    this.videoPes_ = [];

    /** @private {?number} */
    this.audioPid_ = null;

    /** @private {?string} */
    this.audioCodec_ = null;

    /** @private {!Array<!Array<Uint8Array>>} */
    this.audioData_ = [];

    /** @private {!Array<shaka.extern.MPEG_PES>} */
    this.audioPes_ = [];

    /** @private {?number} */
    this.id3Pid_ = null;

    /** @private {!Array<!Array<Uint8Array>>} */
    this.id3Data_ = [];

    /** @private {?number} */
    this.referencePts_ = null;

    /** @private {?number} */
    this.referenceDts_ = null;

    /** @private {?shaka.util.TsParser.OpusMetadata} */
    this.opusMetadata_ = null;

    /** @private {?number} */
    this.discontinuitySequence_ = null;
  }

  /**
   * Clear previous data
   *
   * @export
   */
  clearData() {
    this.videoData_ = [];
    this.videoPes_ = [];
    this.audioData_ = [];
    this.audioPes_ = [];
    this.id3Data_ = [];
  }

  /**
   * Set the current discontinuity sequence number.
   *
   * @param {number} discontinuitySequence
   * @export
   */
  setDiscontinuitySequence(discontinuitySequence) {
    if (this.discontinuitySequence_ != null &&
        this.discontinuitySequence_ != discontinuitySequence) {
      this.referencePts_ = null;
      this.referenceDts_ = null;
    }
    this.discontinuitySequence_ = discontinuitySequence;
  }

  /**
   * Parse the given data
   *
   * @param {Uint8Array} data
   * @return {!shaka.util.TsParser}
   * @export
   */
  parse(data) {
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
      if (data[start] == 0x47) {
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
          if (offset == start + packetLength) {
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

            const parsedPIDs = this.parsePMT_(data, offset);

            // only update track id if track PID found while parsing PMT
            // this is to avoid resetting the PID to -1 in case
            // track PID transiently disappears from the stream
            // this could happen in case of transient missing audio samples
            // for example
            // NOTE this is only the PID of the track as found in TS,
            // but we are not using this for MP4 track IDs.
            if (parsedPIDs.video != -1) {
              this.videoPid_ = parsedPIDs.video;
              this.videoCodec_ = parsedPIDs.videoCodec;
            }
            if (parsedPIDs.audio != -1) {
              this.audioPid_ = parsedPIDs.audio;
              this.audioCodec_ = parsedPIDs.audioCodec;
            }
            if (parsedPIDs.id3 != -1) {
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
            if (payloadUnitStartIndicator) {
              this.videoData_.push([videoData]);
            } else if (this.videoData_.length) {
              const prevVideoData = this.videoData_[this.videoData_.length - 1];
              if (prevVideoData) {
                this.videoData_[this.videoData_.length - 1].push(videoData);
              }
            }
            break;
          }
          case this.audioPid_: {
            const audioData = data.subarray(offset, start + packetLength);
            if (payloadUnitStartIndicator) {
              this.audioData_.push([audioData]);
            } else if (this.audioData_.length) {
              const prevAudioData = this.audioData_[this.audioData_.length - 1];
              if (prevAudioData) {
                this.audioData_[this.audioData_.length - 1].push(audioData);
              }
            }
            break;
          }
          case this.id3Pid_: {
            const id3Data = data.subarray(offset, start + packetLength);
            if (payloadUnitStartIndicator) {
              this.id3Data_.push([id3Data]);
            } else if (this.id3Data_.length) {
              const prevId3Data = this.id3Data_[this.id3Data_.length - 1];
              if (prevId3Data) {
                this.id3Data_[this.id3Data_.length - 1].push(id3Data);
              }
            }
            break;
          }
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
   * @private
   */
  parsePMT_(data, offset) {
    const StringUtils = shaka.util.StringUtils;
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
      const esInfoLength = ((data[offset + 3] & 0x0f) << 8) | data[offset + 4];
      switch (data[offset]) {
        case 0x06:
          // stream_type 6 can mean a lot of different things in case of DVB.
          // We need to look at the descriptors. Right now, we're only
          // interested in a few audio and video formats,.
          if (esInfoLength > 0) {
            let parsePos = offset + 5;
            let remaining = esInfoLength;
            // Descriptor info: https://www.streamguru.de/mpeg-analyzer/supported-descriptor-list/
            while (remaining > 2) {
              const descriptorId = data[parsePos];
              const descriptorLen = data[parsePos + 1] + 2;
              switch (descriptorId) {
                // Registration descriptor
                case 0x05: {
                  const registrationData =
                      data.subarray(parsePos + 2, parsePos + descriptorLen);
                  const registration =
                      StringUtils.fromCharCode(registrationData);
                  if (result.audio == -1 && registration === 'Opus') {
                    result.audio = pid;
                    result.audioCodec = 'opus';
                  } else if (result.video == -1 && registration === 'AV01') {
                    result.video = pid;
                    result.videoCodec = 'av1';
                  }
                  break;
                }
                // DVB Descriptor for AC-3
                case 0x6a:
                  if (result.audio == -1) {
                    result.audio = pid;
                    result.audioCodec = 'ac3';
                  }
                  break;
                // DVB Descriptor for EC-3
                case 0x7a:
                  if (result.audio == -1) {
                    result.audio = pid;
                    result.audioCodec = 'ec3';
                  }
                  break;
                // DVB Descriptor for AAC
                case 0x7c:
                  if (result.audio == -1) {
                    result.audio = pid;
                    result.audioCodec = 'aac';
                  }
                  break;
                // DVB extension descriptor
                case 0x7f:
                  if (result.audioCodec == 'opus') {
                    const extensionDescriptorId = data[parsePos + 2];
                    let channelConfigCode = null;
                    // User defined (provisional Opus)
                    if (extensionDescriptorId === 0x80) {
                      channelConfigCode = data[parsePos + 3];
                    }

                    if (channelConfigCode == null) {
                      // Not Supported Opus channel count.
                      break;
                    }
                    const channelCount = (channelConfigCode & 0x0F) === 0 ?
                        2 : (channelConfigCode & 0x0F);
                    this.opusMetadata_ = {
                      channelCount,
                      channelConfigCode,
                      sampleRate: 48000,
                    };
                  }
                  break;
              }
              parsePos += descriptorLen;
              remaining -= descriptorLen;
            }
          }
          break;
        // SAMPLE-AES AAC
        case 0xcf:
          break;
        // ISO/IEC 13818-7 ADTS AAC (MPEG-2 lower bit-rate audio)
        case 0x0f:
          if (result.audio == -1) {
            result.audio = pid;
            result.audioCodec = 'aac';
          }
          break;
        // LOAS/LATM AAC
        case 0x11:
          if (result.audio == -1) {
            result.audio = pid;
            result.audioCodec = 'aac-loas';
          }
          break;
        // Packetized metadata (ID3)
        case 0x15:
          if (result.id3 == -1) {
            result.id3 = pid;
          }
          break;
        // SAMPLE-AES AVC
        case 0xdb:
          break;
        // ITU-T Rec. H.264 and ISO/IEC 14496-10 (lower bit-rate video)
        case 0x1b:
          if (result.video == -1) {
            result.video = pid;
            result.videoCodec = 'avc';
          }
          break;
        // ISO/IEC 11172-3 (MPEG-1 audio)
        // or ISO/IEC 13818-3 (MPEG-2 halved sample rate audio)
        case 0x03:
        case 0x04:
          if (result.audio == -1) {
            result.audio = pid;
            result.audioCodec = 'mp3';
          }
          break;
        // HEVC
        case 0x24:
          if (result.video == -1) {
            result.video = pid;
            result.videoCodec = 'hvc';
          }
          break;
        // AC-3
        case 0x81:
          if (result.audio == -1) {
            result.audio = pid;
            result.audioCodec = 'ac3';
          }
          break;
        // EC-3
        case 0x84:
        case 0x87:
          if (result.audio == -1) {
            result.audio = pid;
            result.audioCodec = 'ec3';
          }
          break;
        default:
          // shaka.log.warning('Unknown stream type:', data[offset]);
          break;
      }
      // move to the next table entry
      // skip past the elementary stream descriptors, if present
      offset += esInfoLength + 5;
    }
    return result;
  }

  /**
   * Parse PES
   *
   * @param {Uint8Array} data
   * @return {?shaka.extern.MPEG_PES}
   * @private
   */
  parsePES_(data) {
    const startPrefix = (data[0] << 16) | (data[1] << 8) | data[2];
    // In certain live streams, the start of a TS fragment has ts packets
    // that are frame data that is continuing from the previous fragment. This
    // is to check that the pes data is the start of a new pes data
    if (startPrefix !== 1) {
      return null;
    }
    /** @type {shaka.extern.MPEG_PES} */
    const pes = {
      data: new Uint8Array(0),
      // get the packet length, this will be 0 for video
      packetLength: ((data[4] << 8) | data[5]),
      pts: null,
      dts: null,
      nalus: [],
    };

    // if PES parsed length is not zero and greater than total received length,
    // stop parsing. PES might be truncated. minus 6 : PES header size
    if (pes.packetLength && pes.packetLength > data.byteLength - 6) {
      return null;
    }

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
      const pts =
        (data[9] & 0x0e) * 536870912 + // 1 << 29
        (data[10] & 0xff) * 4194304 + // 1 << 22
        (data[11] & 0xfe) * 16384 + // 1 << 14
        (data[12] & 0xff) * 128 + // 1 << 7
        (data[13] & 0xfe) / 2;

      if (this.referencePts_ == null) {
        this.referencePts_ = pts;
      }

      pes.pts = this.handleRollover_(pts, this.referencePts_);
      this.referencePts_ = pes.pts;

      pes.dts = pes.pts;
      if (ptsDtsFlags & 0x40) {
        const dts =
          (data[14] & 0x0e) * 536870912 + // 1 << 29
          (data[15] & 0xff) * 4194304 + // 1 << 22
          (data[16] & 0xfe) * 16384 + // 1 << 14
          (data[17] & 0xff) * 128 + // 1 << 7
          (data[18] & 0xfe) / 2;

        if (this.referenceDts_ == null) {
          this.referenceDts_ = dts;
        }

        if (pes.pts != pts) {
          pes.dts = this.handleRollover_(dts, this.referenceDts_);
        } else {
          pes.dts = dts;
        }
      }
      this.referenceDts_ = pes.dts;
    }

    const pesHdrLen = data[8];
    // 9 bytes : 6 bytes for PES header + 3 bytes for PES extension
    const payloadStartOffset = pesHdrLen + 9;
    if (data.byteLength <= payloadStartOffset) {
      return null;
    }

    pes.data = data.subarray(payloadStartOffset);

    return pes;
  }

  /**
   * Parse AVC Nalus
   *
   * The code is based on hls.js
   * Credit to https://github.com/video-dev/hls.js/blob/master/src/demux/tsdemuxer.ts
   *
   * @param {shaka.extern.MPEG_PES} pes
   * @param {?shaka.extern.MPEG_PES=} nextPes
   * @return {!Array<shaka.extern.VideoNalu>}
   * @export
   */
  parseAvcNalus(pes, nextPes) {
    shaka.Deprecate.deprecateFeature(5,
        'TsParser.parseAvcNalus',
        'Please use parseNalus function instead.');
    const lastInfo = {
      nalu: null,
      state: null,
    };
    return this.parseNalus(pes, lastInfo);
  }

  /**
   * Parse AVC and HVC Nalus
   *
   * The code is based on hls.js
   * Credit to https://github.com/video-dev/hls.js/blob/master/src/demux/tsdemuxer.ts
   *
   * @param {shaka.extern.MPEG_PES} pes
   * @param {{nalu: ?shaka.extern.VideoNalu, state: ?number}} lastInfo
   * @return {!Array<shaka.extern.VideoNalu>}
   * @export
   */
  parseNalus(pes, lastInfo) {
    const timescale = shaka.util.TsParser.Timescale;
    const time = pes.pts ? pes.pts / timescale : null;
    const data = pes.data;
    const len = data.byteLength;

    let naluHeaderSize = 1;
    if (this.videoCodec_ == 'hvc') {
      naluHeaderSize = 2;
    }

    // A NALU does not contain is its size.
    // The Annex B specification solves this by requiring ‘Start Codes’ to
    // precede each NALU. A start code is 2 or 3 0x00 bytes followed with a
    // 0x01 byte. e.g. 0x000001 or 0x00000001.
    // More info in: https://stackoverflow.com/questions/24884827/possible-locations-for-sequence-picture-parameter-sets-for-h-264-stream/24890903#24890903
    let numZeros = lastInfo.state || 0;

    const initialNumZeros = numZeros;

    /** @type {number} */
    let i = 0;

    /** @type {!Array<shaka.extern.VideoNalu>} */
    const nalus = [];

    // Start position includes the first byte where we read the type.
    // The data we extract begins at the next byte.
    let lastNaluStart = -1;
    // Extracted from the first byte.
    let lastNaluType = 0;

    const getNaluType = (offset) => {
      if (this.videoCodec_ == 'hvc') {
        return (data[offset] >> 1) & 0x3f;
      } else {
        return data[offset] & 0x1f;
      }
    };

    const getLastNalu = () => {
      if (nalus.length) {
        return nalus[nalus.length - 1];
      }
      return lastInfo.nalu;
    };

    if (numZeros == -1) {
      // special use case where we found 3 or 4-byte start codes exactly at the
      // end of previous PES packet
      lastNaluStart = 0;
      // NALu type is value read from offset 0
      lastNaluType = getNaluType(0);
      numZeros = 0;
      i = 1;
    }

    while (i < len) {
      const value = data[i++];
      // Optimization. numZeros 0 and 1 are the predominant case.
      if (!numZeros) {
        numZeros = value ? 0 : 1;
        continue;
      }
      if (numZeros === 1) {
        numZeros = value ? 0 : 2;
        continue;
      }
      if (!value) {
        numZeros = 3;
      } else if (value == 1) {
        const overflow = i - numZeros - 1;
        if (lastNaluStart >= 0) {
          /** @type {shaka.extern.VideoNalu} */
          const nalu = {
            data: data.subarray(lastNaluStart + naluHeaderSize, overflow),
            fullData: data.subarray(lastNaluStart, overflow),
            type: lastNaluType,
            time: time,
            state: null,
          };
          nalus.push(nalu);
        } else {
          const lastNalu = getLastNalu();
          if (lastNalu) {
            if (initialNumZeros && i <= 4 - initialNumZeros) {
              // Start delimiter overlapping between PES packets
              // strip start delimiter bytes from the end of last NAL unit
              // check if lastNalu had a state different from zero
              if (lastNalu.state) {
                // strip last bytes
                lastNalu.data = lastNalu.data.subarray(
                    0, lastNalu.data.byteLength - initialNumZeros);
                lastNalu.fullData = lastNalu.fullData.subarray(
                    0, lastNalu.fullData.byteLength - initialNumZeros);
              }
            }
            // If NAL units are not starting right at the beginning of the PES
            // packet, push preceding data into previous NAL unit.
            if (overflow > 0) {
              const prevData = data.subarray(0, overflow);
              lastNalu.data = shaka.util.Uint8ArrayUtils.concat(
                  lastNalu.data, prevData);
              lastNalu.fullData = shaka.util.Uint8ArrayUtils.concat(
                  lastNalu.fullData, prevData);
              lastNalu.state = 0;
            }
          }
        }

        // Check if we can read unit type
        if (i < len) {
          lastNaluType = getNaluType(i);
          lastNaluStart = i;
          numZeros = 0;
        } else {
          // Not enough byte to read unit type.
          // Let's read it on next PES parsing.
          numZeros = -1;
        }
      } else {
        numZeros = 0;
      }
    }

    if (lastNaluStart >= 0 && numZeros >= 0) {
      const nalu = {
        data: data.subarray(lastNaluStart + naluHeaderSize, len),
        fullData: data.subarray(lastNaluStart, len),
        type: lastNaluType,
        time: time,
        state: numZeros,
      };
      nalus.push(nalu);
    }
    if (!nalus.length && lastInfo.nalu) {
      const lastNalu = getLastNalu();
      if (lastNalu) {
        lastNalu.data = shaka.util.Uint8ArrayUtils.concat(
            lastNalu.data, data);
        lastNalu.fullData = shaka.util.Uint8ArrayUtils.concat(
            lastNalu.fullData, data);
      }
    }
    lastInfo.state = numZeros;
    return nalus;
  }

  /**
   * Return the ID3 metadata
   *
   * @return {!Array<shaka.extern.ID3Metadata>}
   * @export
   */
  getMetadata() {
    const timescale = shaka.util.TsParser.Timescale;
    const metadata = [];
    for (const id3DataArray of this.id3Data_) {
      const id3Data = shaka.util.Uint8ArrayUtils.concat(...id3DataArray);
      const pes = this.parsePES_(id3Data);
      if (pes) {
        metadata.push({
          cueTime: pes.pts ? pes.pts / timescale : null,
          data: pes.data,
          frames: shaka.util.Id3Utils.getID3Frames(pes.data),
          dts: pes.dts,
          pts: pes.pts,
        });
      }
    }
    return metadata;
  }

  /**
   * Return the audio data
   *
   * @return {!Array<shaka.extern.MPEG_PES>}
   * @export
   */
  getAudioData() {
    if (this.audioData_.length && !this.audioPes_.length) {
      for (const audioDataArray of this.audioData_) {
        const audioData = shaka.util.Uint8ArrayUtils.concat(...audioDataArray);
        const pes = this.parsePES_(audioData);
        let previousPes = this.audioPes_.length ?
            this.audioPes_[this.audioPes_.length - 1] : null;
        if (pes && pes.pts != null && pes.dts != null && (!previousPes ||
            (previousPes.pts != pes.pts && previousPes.dts != pes.dts))) {
          this.audioPes_.push(pes);
        } else if (this.audioPes_.length) {
          const data = pes ? pes.data : audioData;
          if (!data) {
            continue;
          }
          previousPes = this.audioPes_.pop();
          previousPes.data =
              shaka.util.Uint8ArrayUtils.concat(previousPes.data, data);
          this.audioPes_.push(previousPes);
        }
      }
    }
    return this.audioPes_;
  }

  /**
   * Return the video data
   *
   * @param {boolean=} naluProcessing
   * @return {!Array<shaka.extern.MPEG_PES>}
   * @export
   */
  getVideoData(naluProcessing = true) {
    if (this.videoData_.length && !this.videoPes_.length) {
      for (const videoDataArray of this.videoData_) {
        const videoData = shaka.util.Uint8ArrayUtils.concat(...videoDataArray);
        const pes = this.parsePES_(videoData);
        let previousPes = this.videoPes_.length ?
            this.videoPes_[this.videoPes_.length - 1] : null;
        if (pes && pes.pts != null && pes.dts != null && (!previousPes ||
            (previousPes.pts != pes.pts && previousPes.dts != pes.dts))) {
          this.videoPes_.push(pes);
        } else if (this.videoPes_.length) {
          const data = pes ? pes.data : videoData;
          if (!data) {
            continue;
          }
          previousPes = this.videoPes_.pop();
          previousPes.data =
              shaka.util.Uint8ArrayUtils.concat(previousPes.data, data);
          this.videoPes_.push(previousPes);
        }
      }
      if (naluProcessing) {
        const lastInfo = {
          nalu: null,
          state: null,
        };
        const pesWithLength = [];
        for (const pes of this.videoPes_) {
          pes.nalus = this.parseNalus(pes, lastInfo);
          if (pes.nalus.length) {
            pesWithLength.push(pes);
            lastInfo.nalu = pes.nalus[pes.nalus.length - 1];
          }
        }
        this.videoPes_ = pesWithLength;
      }
    }
    if (!naluProcessing) {
      const prevVideoPes = this.videoPes_;
      this.videoPes_ = [];
      return prevVideoPes;
    }
    return this.videoPes_;
  }

  /**
   * Return the start time for the audio and video
   *
   * @param {string} contentType
   * @return {?number}
   * @export
   */
  getStartTime(contentType) {
    const timescale = shaka.util.TsParser.Timescale;
    if (contentType == 'audio') {
      let audioStartTime = null;
      const audioData = this.getAudioData();
      if (audioData.length) {
        const pes = audioData[0];
        audioStartTime = Math.min(pes.dts, pes.pts) / timescale;
      }
      return audioStartTime;
    } else if (contentType == 'video') {
      let videoStartTime = null;
      const videoData = this.getVideoData(/* naluProcessing= */ false);
      if (videoData.length) {
        const pes = videoData[0];
        videoStartTime = Math.min(pes.dts, pes.pts) / timescale;
      }
      return videoStartTime;
    }
    return null;
  }

  /**
   * Return the audio and video codecs
   *
   * @return {{audio: ?string, video: ?string}}
   * @export
   */
  getCodecs() {
    return {
      audio: this.audioCodec_,
      video: this.videoCodec_,
    };
  }

  /**
   * Return the video data
   *
   * @return {!Array<shaka.extern.VideoNalu>}
   * @export
   */
  getVideoNalus() {
    const nalus = [];
    for (const pes of this.getVideoData()) {
      nalus.push(...pes.nalus);
    }
    return nalus;
  }

  /**
   * Return the video resolution
   *
   * @return {{height: ?string, width: ?string}}
   * @export
   */
  getVideoResolution() {
    shaka.Deprecate.deprecateFeature(5,
        'TsParser.getVideoResolution',
        'Please use getVideoInfo function instead.');
    const videoInfo = this.getVideoInfo();
    return {
      height: videoInfo.height,
      width: videoInfo.width,
    };
  }

  /**
   * Return the video information
   *
   * @return {{
   *   height: ?string,
   *   width: ?string,
   *   codec: ?string,
   *   frameRate: ?string,
   * }}
   * @export
   */
  getVideoInfo() {
    if (this.videoCodec_ == 'hvc') {
      return this.getHvcInfo_();
    }
    return this.getAvcInfo_();
  }

  /**
   * @return {?string}
   * @private
   */
  getFrameRate_() {
    const timescale = shaka.util.TsParser.Timescale;
    const videoData = this.getVideoData();
    if (videoData.length > 1) {
      const firstPts = videoData[0].pts;
      goog.asserts.assert(typeof(firstPts) == 'number',
          'Should be an number!');
      const secondPts = videoData[1].pts;
      goog.asserts.assert(typeof(secondPts) == 'number',
          'Should be an number!');
      if (!isNaN(secondPts - firstPts)) {
        return String(1 / (secondPts - firstPts) * timescale);
      }
    }
    return null;
  }

  /**
   * Return the video information for AVC
   *
   * @return {{
   *   height: ?string,
   *   width: ?string,
   *   codec: ?string,
   *   frameRate: ?string,
   * }}
   * @private
   */
  getAvcInfo_() {
    const TsParser = shaka.util.TsParser;
    const videoInfo = {
      height: null,
      width: null,
      codec: null,
      frameRate: null,
    };
    const videoNalus = this.getVideoNalus();
    if (!videoNalus.length) {
      return videoInfo;
    }
    const spsNalu = videoNalus.find((nalu) => {
      return nalu.type == TsParser.H264_NALU_TYPE_SPS_;
    });
    if (!spsNalu) {
      return videoInfo;
    }

    const expGolombDecoder = new shaka.util.ExpGolomb(spsNalu.data);
    // profile_idc
    const profileIdc = expGolombDecoder.readUnsignedByte();
    // constraint_set[0-5]_flag
    const profileCompatibility = expGolombDecoder.readUnsignedByte();
    // level_idc u(8)
    const levelIdc = expGolombDecoder.readUnsignedByte();
    // seq_parameter_set_id
    expGolombDecoder.skipExpGolomb();

    // some profiles have more optional data we don't need
    if (TsParser.PROFILES_WITH_OPTIONAL_SPS_DATA_.includes(profileIdc)) {
      const chromaFormatIdc = expGolombDecoder.readUnsignedExpGolomb();
      if (chromaFormatIdc === 3) {
        // separate_colour_plane_flag
        expGolombDecoder.skipBits(1);
      }
      // bit_depth_luma_minus8
      expGolombDecoder.skipExpGolomb();
      // bit_depth_chroma_minus8
      expGolombDecoder.skipExpGolomb();
      // qpprime_y_zero_transform_bypass_flag
      expGolombDecoder.skipBits(1);
      // seq_scaling_matrix_present_flag
      if (expGolombDecoder.readBoolean()) {
        const scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
        for (let i = 0; i < scalingListCount; i++) {
          // seq_scaling_list_present_flag[ i ]
          if (expGolombDecoder.readBoolean()) {
            if (i < 6) {
              expGolombDecoder.skipScalingList(16);
            } else {
              expGolombDecoder.skipScalingList(64);
            }
          }
        }
      }
    }

    // log2_max_frame_num_minus4
    expGolombDecoder.skipExpGolomb();
    const picOrderCntType = expGolombDecoder.readUnsignedExpGolomb();

    if (picOrderCntType === 0) {
      // log2_max_pic_order_cnt_lsb_minus4
      expGolombDecoder.readUnsignedExpGolomb();
    } else if (picOrderCntType === 1) {
      // delta_pic_order_always_zero_flag
      expGolombDecoder.skipBits(1);
      // offset_for_non_ref_pic
      expGolombDecoder.skipExpGolomb();
      // offset_for_top_to_bottom_field
      expGolombDecoder.skipExpGolomb();
      const numRefFramesInPicOrderCntCycle =
          expGolombDecoder.readUnsignedExpGolomb();
      for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
        // offset_for_ref_frame[ i ]
        expGolombDecoder.skipExpGolomb();
      }
    }

    // max_num_ref_frames
    expGolombDecoder.skipExpGolomb();
    // gaps_in_frame_num_value_allowed_flag
    expGolombDecoder.skipBits(1);

    const picWidthInMbsMinus1 =
        expGolombDecoder.readUnsignedExpGolomb();
    const picHeightInMapUnitsMinus1 =
        expGolombDecoder.readUnsignedExpGolomb();

    const frameMbsOnlyFlag = expGolombDecoder.readBits(1);
    if (frameMbsOnlyFlag === 0) {
      // mb_adaptive_frame_field_flag
      expGolombDecoder.skipBits(1);
    }
    // direct_8x8_inference_flag
    expGolombDecoder.skipBits(1);

    let frameCropLeftOffset = 0;
    let frameCropRightOffset = 0;
    let frameCropTopOffset = 0;
    let frameCropBottomOffset = 0;

    // frame_cropping_flag
    if (expGolombDecoder.readBoolean()) {
      frameCropLeftOffset = expGolombDecoder.readUnsignedExpGolomb();
      frameCropRightOffset = expGolombDecoder.readUnsignedExpGolomb();
      frameCropTopOffset = expGolombDecoder.readUnsignedExpGolomb();
      frameCropBottomOffset = expGolombDecoder.readUnsignedExpGolomb();
    }

    videoInfo.height = String(((2 - frameMbsOnlyFlag) *
        (picHeightInMapUnitsMinus1 + 1) * 16) - (frameCropTopOffset * 2) -
        (frameCropBottomOffset * 2));
    videoInfo.width = String(((picWidthInMbsMinus1 + 1) * 16) -
        frameCropLeftOffset * 2 - frameCropRightOffset * 2);
    videoInfo.codec = 'avc1.' + this.byteToHex_(profileIdc) +
        this.byteToHex_(profileCompatibility) + this.byteToHex_(levelIdc);
    videoInfo.frameRate = this.getFrameRate_();

    return videoInfo;
  }

  /**
   * Return the video information for HVC
   *
   * @return {{
   *   height: ?string,
   *   width: ?string,
   *   codec: ?string,
   *   frameRate: ?string,
   * }}
   * @private
   */
  getHvcInfo_() {
    const TsParser = shaka.util.TsParser;
    const videoInfo = {
      height: null,
      width: null,
      codec: null,
      frameRate: null,
    };
    const videoNalus = this.getVideoNalus();
    if (!videoNalus.length) {
      return videoInfo;
    }
    const spsNalu = videoNalus.find((nalu) => {
      return nalu.type == TsParser.H265_NALU_TYPE_SPS_;
    });
    if (!spsNalu) {
      return videoInfo;
    }

    const gb = new shaka.util.ExpGolomb(
        spsNalu.fullData, /* convertEbsp2rbsp= */ true);

    // remove NALu Header
    gb.readUnsignedByte();
    gb.readUnsignedByte();

    // SPS
    gb.readBits(4); // video_parameter_set_id
    const maxSubLayersMinus1 = gb.readBits(3);
    gb.readBoolean(); // temporal_id_nesting_flag

    // profile_tier_level begin
    const generalProfileSpace = gb.readBits(2);
    const generalTierFlag = gb.readBits(1);
    const generalProfileIdc = gb.readBits(5);
    const generalProfileCompatibilityFlags = gb.readBits(32);
    const generalConstraintIndicatorFlags1 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags2 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags3 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags4 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags5 = gb.readUnsignedByte();
    const generalConstraintIndicatorFlags6 = gb.readUnsignedByte();
    const generalLevelIdc = gb.readUnsignedByte();
    const subLayerProfilePresentFlag = [];
    const subLayerLevelPresentFlag = [];
    for (let i = 0; i < maxSubLayersMinus1; i++) {
      subLayerProfilePresentFlag.push(gb.readBoolean());
      subLayerLevelPresentFlag.push(gb.readBoolean());
    }
    if (maxSubLayersMinus1 > 0) {
      for (let i = maxSubLayersMinus1; i < 8; i++) {
        gb.readBits(2);
      }
    }
    for (let i = 0; i < maxSubLayersMinus1; i++) {
      if (subLayerProfilePresentFlag[i]) {
        gb.readBits(88);
      }
      if (subLayerLevelPresentFlag[i]) {
        gb.readUnsignedByte();
      }
    }
    // profile_tier_level end

    gb.readUnsignedExpGolomb(); // seq_parameter_set_id
    const chromaFormatIdc = gb.readUnsignedExpGolomb();
    if (chromaFormatIdc == 3) {
      gb.readBits(1); // separate_colour_plane_flag
    }
    const picWidthInLumaSamples = gb.readUnsignedExpGolomb();
    const picHeightInLumaSamples = gb.readUnsignedExpGolomb();
    let leftOffset = 0;
    let rightOffset = 0;
    let topOffset = 0;
    let bottomOffset = 0;
    const conformanceWindowFlag = gb.readBoolean();
    if (conformanceWindowFlag) {
      leftOffset += gb.readUnsignedExpGolomb();
      rightOffset += gb.readUnsignedExpGolomb();
      topOffset += gb.readUnsignedExpGolomb();
      bottomOffset += gb.readUnsignedExpGolomb();
    }

    const subWc = chromaFormatIdc === 1 || chromaFormatIdc === 2 ? 2 : 1;
    const subHc = chromaFormatIdc === 1 ? 2 : 1;
    videoInfo.width =
        String(picWidthInLumaSamples - (leftOffset + rightOffset) * subWc);
    videoInfo.height =
        String(picHeightInLumaSamples - (topOffset + bottomOffset) * subHc);

    const reverseBits = (integer) => {
      let result = 0;
      for (let i = 0; i < 32; i++) {
        result |= ((integer >> i) & 1) << (31 - i);
      }
      return result >>> 0;
    };

    const profileSpace = ['', 'A', 'B', 'C'][generalProfileSpace];
    const profileCompatibility = reverseBits(generalProfileCompatibilityFlags);
    const tierFlag = generalTierFlag == 1 ? 'H' : 'L';

    let codec = 'hvc1';
    codec += '.' + profileSpace + generalProfileIdc;
    codec += '.' + profileCompatibility.toString(16).toUpperCase();
    codec += '.' + tierFlag + generalLevelIdc;
    if (generalConstraintIndicatorFlags6) {
      codec += '.' +
          generalConstraintIndicatorFlags6.toString(16).toUpperCase();
    }
    if (generalConstraintIndicatorFlags5) {
      codec += '.' +
          generalConstraintIndicatorFlags5.toString(16).toUpperCase();
    }
    if (generalConstraintIndicatorFlags4) {
      codec += '.' +
          generalConstraintIndicatorFlags4.toString(16).toUpperCase();
    }
    if (generalConstraintIndicatorFlags3) {
      codec += '.' +
          generalConstraintIndicatorFlags3.toString(16).toUpperCase();
    }
    if (generalConstraintIndicatorFlags2) {
      codec += '.' +
          generalConstraintIndicatorFlags2.toString(16).toUpperCase();
    }
    if (generalConstraintIndicatorFlags1) {
      codec += '.' +
          generalConstraintIndicatorFlags1.toString(16).toUpperCase();
    }
    videoInfo.codec = codec;
    videoInfo.frameRate = this.getFrameRate_();

    return videoInfo;
  }

  /**
   * Return the Opus metadata
   *
   * @return {?shaka.util.TsParser.OpusMetadata}
   */
  getOpusMetadata() {
    return this.opusMetadata_;
  }

  /**
   * Convert a byte to 2 digits of hex.  (Only handles values 0-255.)
   *
   * @param {number} x
   * @return {string}
   * @private
   */
  byteToHex_(x) {
    return ('0' + x.toString(16).toUpperCase()).slice(-2);
  }

  /**
   * @param {number} value
   * @param {number} reference
   * @return {number}
   * @private
   */
  handleRollover_(value, reference) {
    const MAX_TS = 8589934592;
    const RO_THRESH = 4294967296;

    let direction = 1;

    if (value > reference) {
      // If the current timestamp value is greater than our reference timestamp
      // and we detect a timestamp rollover, this means the roll over is
      // happening in the opposite direction.
      // Example scenario: Enter a long stream/video just after a rollover
      // occurred. The reference point will be set to a small number, e.g. 1.
      // The user then seeks backwards over the rollover point. In loading this
      // segment, the timestamp values will be very large, e.g. 2^33 - 1. Since
      // this comes before the data we loaded previously, we want to adjust the
      // time stamp to be `value - 2^33`.
      direction = -1;
    }

    // Note: A seek forwards or back that is greater than the RO_THRESH
    // (2^32, ~13 hours) will cause an incorrect adjustment.
    while (Math.abs(reference - value) > RO_THRESH) {
      value += (direction * MAX_TS);
    }

    return value;
  }

  /**
   * Check if the passed data corresponds to an MPEG2-TS
   *
   * @param {Uint8Array} data
   * @return {boolean}
   * @export
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
   * @export
   */
  static syncOffset(data) {
    const packetLength = shaka.util.TsParser.PacketLength_;
    // scan 1000 first bytes
    const scanWindow = Math.min(1000, data.length - 3 * packetLength);
    let i = 0;
    while (i < scanWindow) {
      // a TS fragment should contain at least 3 TS packets, a PAT, a PMT, and
      // one PID, each starting with 0x47
      if (data[i] == 0x47 &&
          data[i + packetLength] == 0x47 &&
          data[i + 2 * packetLength] == 0x47) {
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
 * @export
 */
shaka.util.TsParser.Timescale = 90000;


/**
 * @const {number}
 * @private
 */
shaka.util.TsParser.PacketLength_ = 188;


/**
 * NALU type for Sequence Parameter Set (SPS) for H.264.
 * @const {number}
 * @private
 */
shaka.util.TsParser.H264_NALU_TYPE_SPS_ = 0x07;


/**
 * NALU type for Sequence Parameter Set (SPS) for H.265.
 * @const {number}
 * @private
 */
shaka.util.TsParser.H265_NALU_TYPE_SPS_ = 0x21;


/**
 * Values of profile_idc that indicate additional fields are included in the
 * SPS.
 * see Recommendation ITU-T H.264 (4/2013)
 * 7.3.2.1.1 Sequence parameter set data syntax
 *
 * @const {!Array<number>}
 * @private
 */
shaka.util.TsParser.PROFILES_WITH_OPTIONAL_SPS_DATA_ =
    [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134];


/**
 * @typedef {{
 *   audio: number,
 *   video: number,
 *   id3: number,
 *   audioCodec: string,
 *   videoCodec: string,
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
 *   channelCount: number,
 *   channelConfigCode: number,
 *   sampleRate: number,
 * }}
 *
 * @summary PMT.
 * @property {number} channelCount
 * @property {number} channelConfigCode
 * @property {number} sampleRate
 */
shaka.util.TsParser.OpusMetadata;

