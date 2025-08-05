/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4Generator');

goog.require('goog.asserts');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.util.Lazy');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Uint8ArrayUtils');


shaka.util.Mp4Generator = class {
  /**
   * @param {!Array<shaka.util.Mp4Generator.StreamInfo>} streamInfos
   */
  constructor(streamInfos) {
    /** @private {!Array<shaka.util.Mp4Generator.StreamInfo>} */
    this.streamInfos_ = streamInfos;
  }

  /**
   * Generate a Init Segment (MP4).
   *
   * @return {!Uint8Array}
   */
  initSegment() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const movie = this.moov_();
    const ftyp = Mp4Generator.FTYP_.value();
    const length = ftyp.byteLength + movie.byteLength;
    const result = new Uint8Array(length);
    result.set(ftyp);
    result.set(movie, ftyp.byteLength);
    return result;
  }

  /**
   * Generate a MOOV box
   *
   * @return {!Uint8Array}
   * @private
   */
  moov_() {
    goog.asserts.assert(this.streamInfos_.length > 0,
        'StreamInfos must have elements');
    const Mp4Generator = shaka.util.Mp4Generator;
    const trakArrays = [];
    for (const streamInfo of this.streamInfos_) {
      trakArrays.push(this.trak_(streamInfo));
    }
    const traks = shaka.util.Uint8ArrayUtils.concat(...trakArrays);
    const firstStreamInfo = this.streamInfos_[0];
    return Mp4Generator.box('moov',
        this.mvhd_(firstStreamInfo),
        traks,
        this.mvex_(),
        this.pssh_(firstStreamInfo));
  }

  /**
   * Generate a MVHD box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mvhd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const duration = streamInfo.duration * streamInfo.timescale;
    const upperWordDuration =
        Math.floor(duration / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordDuration =
        Math.floor(duration % (Mp4Generator.UINT32_MAX_ + 1));
    const bytes = new Uint8Array([
      0x01, // version 1
      0x00, 0x00, 0x00, // flags
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, // creation_time
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, // modification_time
      ...this.breakNumberIntoBytes_(streamInfo.timescale, 4), // timescale
      ...this.breakNumberIntoBytes_(upperWordDuration, 4),
      ...this.breakNumberIntoBytes_(lowerWordDuration, 4), // duration
      0x00, 0x01, 0x00, 0x00, // 1.0 rate
      0x01, 0x00, // 1.0 volume
      0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // pre_defined
      0xff, 0xff, 0xff, 0xff, // next_track_ID
    ]);
    return Mp4Generator.box('mvhd', bytes);
  }

  /**
   * Generate a TRAK box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  trak_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('trak',
        this.tkhd_(streamInfo), this.mdia_(streamInfo));
  }

  /**
   * Generate a TKHD box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  tkhd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const id = streamInfo.id + 1;
    let width = streamInfo.stream.width || 0;
    let height = streamInfo.stream.height || 0;
    if (streamInfo.type == ContentType.AUDIO) {
      width = 0;
      height = 0;
    }
    const duration = streamInfo.duration * streamInfo.timescale;
    const upperWordDuration =
        Math.floor(duration / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordDuration =
        Math.floor(duration % (Mp4Generator.UINT32_MAX_ + 1));
    const bytes = new Uint8Array([
      0x01, // version 1
      0x00, 0x00, 0x07, // flags
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, // creation_time
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, // modification_time
      ...this.breakNumberIntoBytes_(id, 4), // track_ID
      0x00, 0x00, 0x00, 0x00, // reserved
      ...this.breakNumberIntoBytes_(upperWordDuration, 4),
      ...this.breakNumberIntoBytes_(lowerWordDuration, 4), // duration
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x00, // layer
      0x00, 0x00, // alternate_group
      0x00, 0x00, // non-audio track volume
      0x00, 0x00, // reserved
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
      ...this.breakNumberIntoBytes_(width, 2),
      0x00, 0x00, // width
      ...this.breakNumberIntoBytes_(height, 2),
      0x00, 0x00, // height
    ]);
    return Mp4Generator.box('tkhd', bytes);
  }

  /**
   * Generate a MDIA box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mdia_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('mdia', this.mdhd_(streamInfo),
        this.hdlr_(streamInfo), this.minf_(streamInfo));
  }

  /**
   * Generate a MDHD box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mdhd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const duration = streamInfo.duration * streamInfo.timescale;
    const upperWordDuration =
        Math.floor(duration / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordDuration =
        Math.floor(duration % (Mp4Generator.UINT32_MAX_ + 1));
    const language = streamInfo.stream.language;
    const languageNumber = ((language.charCodeAt(0) - 0x60) << 10) |
                ((language.charCodeAt(1) - 0x60) << 5) |
                ((language.charCodeAt(2) - 0x60));
    const bytes = new Uint8Array([
      0x01, // version 1
      0x00, 0x00, 0x00, // flags
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, // creation_time
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, // modification_time
      ...this.breakNumberIntoBytes_(streamInfo.timescale, 4), // timescale
      ...this.breakNumberIntoBytes_(upperWordDuration, 4),
      ...this.breakNumberIntoBytes_(lowerWordDuration, 4), // duration
      ...this.breakNumberIntoBytes_(languageNumber, 2), // language
      0x00, 0x00,
    ]);
    return Mp4Generator.box('mdhd', bytes);
  }

  /**
   * Generate a HDLR box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  hdlr_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    let bytes = new Uint8Array([]);
    switch (streamInfo.type) {
      case ContentType.VIDEO:
        bytes = Mp4Generator.HDLR_TYPES_.video.value();
        break;
      case ContentType.AUDIO:
        bytes = Mp4Generator.HDLR_TYPES_.audio.value();
        break;
    }
    return Mp4Generator.box('hdlr', bytes);
  }

  /**
   * Generate a MINF box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  minf_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    switch (streamInfo.type) {
      case ContentType.VIDEO:
        return Mp4Generator.box(
            'minf', Mp4Generator.box('vmhd', Mp4Generator.VMHD_.value()),
            Mp4Generator.DINF_.value(), this.stbl_(streamInfo));
      case ContentType.AUDIO:
        return Mp4Generator.box(
            'minf', Mp4Generator.box('smhd', Mp4Generator.SMHD_.value()),
            Mp4Generator.DINF_.value(), this.stbl_(streamInfo));
    }
    return new Uint8Array([]);
  }

  /**
   * Generate a STBL box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  stbl_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box(
        'stbl',
        this.stsd_(streamInfo),
        Mp4Generator.box('stts', Mp4Generator.STTS_.value()),
        Mp4Generator.box('stsc', Mp4Generator.STSC_.value()),
        Mp4Generator.box('stsz', Mp4Generator.STSZ_.value()),
        Mp4Generator.box('stco', Mp4Generator.STCO_.value()));
  }

  /**
   * Generate a STSD box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  stsd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    let audioCodec = 'aac';
    if (streamInfo.codecs.includes('mp3')) {
      audioCodec = 'mp3';
    } else if (streamInfo.codecs.includes('ac-3')) {
      const device = shaka.device.DeviceFactory.getDevice();
      if (device.requiresEC3InitSegments()) {
        audioCodec = 'ec-3';
      } else {
        audioCodec = 'ac-3';
      }
    } else if (streamInfo.codecs.includes('ec-3')) {
      audioCodec = 'ec-3';
    } else if (streamInfo.codecs.includes('opus')) {
      audioCodec = 'opus';
    }
    let bytes = new Uint8Array([]);
    switch (streamInfo.type) {
      case ContentType.VIDEO:
        if (streamInfo.codecs.includes('avc1')) {
          bytes = this.avc1_(streamInfo);
        } else if (streamInfo.codecs.includes('hvc1')) {
          bytes = this.hvc1_(streamInfo);
        }
        break;
      case ContentType.AUDIO:
        if (audioCodec == 'mp3') {
          bytes = this.mp3_(streamInfo);
        } else if (audioCodec == 'ac-3') {
          bytes = this.ac3_(streamInfo);
        } else if (audioCodec == 'ec-3') {
          bytes = this.ec3_(streamInfo);
        } else if (audioCodec == 'opus') {
          bytes = this.opus_(streamInfo);
        } else {
          bytes = this.mp4a_(streamInfo);
        }
        break;
    }
    return Mp4Generator.box('stsd', Mp4Generator.STSD_.value(), bytes);
  }

  /**
   * Generate a AVC1 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  avc1_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;

    const width = streamInfo.stream.width || 0;
    const height = streamInfo.stream.height || 0;

    let avcCBox;
    if (streamInfo.videoConfig.byteLength > 0) {
      avcCBox = Mp4Generator.box('avcC', streamInfo.videoConfig);
    } else {
      avcCBox = Mp4Generator.box('avcC', this.avcC_(streamInfo));
    }

    const avc1Bytes = new Uint8Array([
      0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, // pre_defined
      0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // pre_defined
      ...this.breakNumberIntoBytes_(width, 2), // width
      ...this.breakNumberIntoBytes_(height, 2), // height
      0x00, 0x48, 0x00, 0x00, // horizontal resolution
      0x00, 0x48, 0x00, 0x00, // vertical resolution
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // frame_count
      0x13,
      0x76, 0x69, 0x64, 0x65,
      0x6f, 0x6a, 0x73, 0x2d,
      0x63, 0x6f, 0x6e, 0x74,
      0x72, 0x69, 0x62, 0x2d,
      0x68, 0x6c, 0x73, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // compressor name
      0x00, 0x18, // depth = 24
      0x11, 0x11, // pre_defined = -1
    ]);

    let boxName = 'avc1';
    const paspBox = this.pasp_(streamInfo);
    let sinfBox = new Uint8Array([]);
    if (streamInfo.encrypted) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      boxName = 'encv';
    }
    return Mp4Generator.box(boxName, avc1Bytes, avcCBox, paspBox, sinfBox);
  }

  /**
   * Generate a AVCC box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  avcC_(streamInfo) {
    const NALU_TYPE_SPS = 7;
    const NALU_TYPE_PPS = 8;

    // length = 7 by default (0 SPS and 0 PPS)
    let avcCLength = 7;

    // First get all SPS and PPS from nalus
    const sps = [];
    const pps = [];
    let AVCProfileIndication = 0;
    let AVCLevelIndication = 0;
    let profileCompatibility = 0;
    for (let i = 0; i < streamInfo.videoNalus.length; i++) {
      const naluBytes = this.hexStringToBuffer_(streamInfo.videoNalus[i]);
      const naluType = naluBytes[0] & 0x1F;
      switch (naluType) {
        case NALU_TYPE_SPS:
          sps.push(naluBytes);
          // 2 = sequenceParameterSetLength field length
          avcCLength += naluBytes.length + 2;
          break;
        case NALU_TYPE_PPS:
          pps.push(naluBytes);
          // 2 = pictureParameterSetLength field length
          avcCLength += naluBytes.length + 2;
          break;
        default:
          break;
      }
    }
    // Get profile and level from SPS
    if (sps.length > 0) {
      AVCProfileIndication = sps[0][1];
      profileCompatibility = sps[0][2];
      AVCLevelIndication = sps[0][3];
    }

    // Generate avcC buffer
    const avcCBytes = new Uint8Array(avcCLength);
    let i = 0;
    // configurationVersion = 1
    avcCBytes[i++] = 1;
    avcCBytes[i++] = AVCProfileIndication;
    avcCBytes[i++] = profileCompatibility;
    avcCBytes[i++] = AVCLevelIndication;
    // '11111' + lengthSizeMinusOne = 3
    avcCBytes[i++] = 0xFF;
    // '111' + numOfSequenceParameterSets
    avcCBytes[i++] = 0xE0 | sps.length;
    for (let n = 0; n < sps.length; n++) {
      avcCBytes[i++] = (sps[n].length & 0xFF00) >> 8;
      avcCBytes[i++] = (sps[n].length & 0x00FF);
      avcCBytes.set(sps[n], i);
      i += sps[n].length;
    }
    // numOfPictureParameterSets
    avcCBytes[i++] = pps.length;
    for (let n = 0; n < pps.length; n++) {
      avcCBytes[i++] = (pps[n].length & 0xFF00) >> 8;
      avcCBytes[i++] = (pps[n].length & 0x00FF);
      avcCBytes.set(pps[n], i);
      i += pps[n].length;
    }
    return avcCBytes;
  }

  /**
   * Generate a HVC1 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  hvc1_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;

    const width = streamInfo.stream.width || 0;
    const height = streamInfo.stream.height || 0;

    let hvcCBox = new Uint8Array([]);
    if (streamInfo.videoConfig.byteLength > 0) {
      hvcCBox = Mp4Generator.box('hvcC', streamInfo.videoConfig);
    }

    const hvc1Bytes = new Uint8Array([
      0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, // pre_defined
      0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // pre_defined
      ...this.breakNumberIntoBytes_(width, 2), // width
      ...this.breakNumberIntoBytes_(height, 2), // height
      0x00, 0x48, 0x00, 0x00, // horizontal resolution
      0x00, 0x48, 0x00, 0x00, // vertical resolution
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // frame_count
      0x13,
      0x76, 0x69, 0x64, 0x65,
      0x6f, 0x6a, 0x73, 0x2d,
      0x63, 0x6f, 0x6e, 0x74,
      0x72, 0x69, 0x62, 0x2d,
      0x68, 0x6c, 0x73, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // compressor name
      0x00, 0x18, // depth = 24
      0x11, 0x11, // pre_defined = -1
    ]);

    let boxName = 'hvc1';
    const paspBox = this.pasp_(streamInfo);
    let sinfBox = new Uint8Array([]);
    if (streamInfo.encrypted) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      boxName = 'encv';
    }
    return Mp4Generator.box(boxName, hvc1Bytes, hvcCBox, paspBox, sinfBox);
  }

  /**
   * Generate a PASP box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  pasp_(streamInfo) {
    if (!streamInfo.hSpacing && !streamInfo.vSpacing) {
      return new Uint8Array([]);
    }
    const Mp4Generator = shaka.util.Mp4Generator;
    const hSpacing = streamInfo.hSpacing;
    const vSpacing = streamInfo.vSpacing;
    const bytes = new Uint8Array([
      ...this.breakNumberIntoBytes_(hSpacing, 4), // hSpacing
      ...this.breakNumberIntoBytes_(vSpacing, 4), // vSpacing
    ]);
    return Mp4Generator.box('pasp', bytes);
  }

  /**
   * Generate STSD bytes
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  audioStsd_(streamInfo) {
    const channelsCount = streamInfo.stream.channelsCount || 2;
    const audioSamplingRate = streamInfo.stream.audioSamplingRate || 44100;
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, // reserved
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00,
      channelsCount, // channel count
      0x00, 0x10, // sampleSize:16bits
      0x00, 0x00, 0x00, 0x00, // reserved2
      ...this.breakNumberIntoBytes_(audioSamplingRate, 2), // Sample Rate
      0x00, 0x00,
    ]);
    return bytes;
  }

  /**
   * Generate a .MP3 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mp3_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('.mp3', this.audioStsd_(streamInfo));
  }

  /**
   * Generate a AC-3 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  ac3_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const dac3Box = Mp4Generator.box('dac3', streamInfo.audioConfig);

    let boxName = 'ac-3';
    let sinfBox = new Uint8Array([]);
    if (streamInfo.encrypted) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      boxName = 'enca';
    }
    return Mp4Generator.box(boxName,
        this.audioStsd_(streamInfo), dac3Box, sinfBox);
  }

  /**
   * Generate a EC-3 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  ec3_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const dec3Box = Mp4Generator.box('dec3', streamInfo.audioConfig);

    let boxName = 'ec-3';
    let sinfBox = new Uint8Array([]);
    if (streamInfo.encrypted) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      boxName = 'enca';
    }
    return Mp4Generator.box(boxName,
        this.audioStsd_(streamInfo), dec3Box, sinfBox);
  }

  /**
   * Generate a Opus box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  opus_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const dopsBox = Mp4Generator.box('dOps', streamInfo.audioConfig);

    let boxName = 'Opus';
    let sinfBox = new Uint8Array([]);
    if (streamInfo.encrypted) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      boxName = 'enca';
    }
    return Mp4Generator.box(boxName,
        this.audioStsd_(streamInfo), dopsBox, sinfBox);
  }

  /**
   * Generate a MP4A box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mp4a_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    let esdsBox;
    if (streamInfo.audioConfig.byteLength > 0) {
      esdsBox = Mp4Generator.box('esds', streamInfo.audioConfig);
    } else {
      esdsBox = Mp4Generator.box('esds', this.esds_(streamInfo));
    }

    let boxName = 'mp4a';
    let sinfBox = new Uint8Array([]);
    if (streamInfo.encrypted) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      boxName = 'enca';
    }
    return Mp4Generator.box(boxName,
        this.audioStsd_(streamInfo), esdsBox, sinfBox);
  }

  /**
   * Generate a ESDS box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  esds_(streamInfo) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const id = streamInfo.id + 1;
    const channelsCount = streamInfo.stream.channelsCount || 2;
    const audioSamplingRate = streamInfo.stream.audioSamplingRate || 44100;

    const audioCodec = shaka.util.ManifestParserUtils.guessCodecs(
        ContentType.AUDIO, streamInfo.codecs.split(','));

    const samplingFrequencyIndex = {
      96000: 0x0,
      88200: 0x1,
      64000: 0x2,
      48000: 0x3,
      44100: 0x4,
      32000: 0x5,
      24000: 0x6,
      22050: 0x7,
      16000: 0x8,
      12000: 0x9,
      11025: 0xA,
      8000: 0xB,
      7350: 0xC,
    };

    let indexFreq = samplingFrequencyIndex[audioSamplingRate];
    // In HE AAC Sampling frequence equals to SamplingRate * 2
    if (audioCodec === 'mp4a.40.5' || audioCodec === 'mp4a.40.29') {
      indexFreq = samplingFrequencyIndex[audioSamplingRate * 2];
    }

    const audioObjectType = parseInt(audioCodec.split('.').pop(), 10);

    return new Uint8Array([
      0x00, // version
      0x00, 0x00, 0x00, // flags

      // ES_Descriptor
      0x03, // tag, ES_DescriptionTag
      0x19, // length
      ...this.breakNumberIntoBytes_(id, 2), // ES_ID
      0x00, // streamDependenceFlag, URL_flag, reserved, streamPriority

      // DecoderConfigDescriptor
      0x04, // tag, DecoderConfigDescriptionTag
      0x11, // length
      0x40, // object type
      0x15,  // streamType
      0x00, 0x00, 0x00, // bufferSizeDB
      0x00, 0x00, 0x00, 0x00, // maxBitrate
      0x00, 0x00, 0x00, 0x00, // avgBitrate

      // DecoderSpecificInfo
      0x05, // tag, DecoderSpecificInfoTag
      0x02, // length
      // ISO/IEC 14496-3, AudioSpecificConfig
      // for samplingFrequencyIndex see
      // ISO/IEC 13818-7:2006, 8.1.3.2.2, Table 35
      (audioObjectType << 3) | (indexFreq >>> 1),
      (indexFreq << 7) | (channelsCount << 3),
      0x06, 0x01, 0x02, // GASpecificConfig
    ]);
  }

  /**
   * Generate a MVEX box
   *
   * @return {!Uint8Array}
   * @private
   */
  mvex_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const trexArrays = [];
    for (const streamInfo of this.streamInfos_) {
      trexArrays.push(this.trex_(streamInfo));
    }
    const trexs = shaka.util.Uint8ArrayUtils.concat(...trexArrays);
    return Mp4Generator.box('mvex', trexs);
  }

  /**
   * Generate a TREX box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  trex_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const id = streamInfo.id + 1;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      ...this.breakNumberIntoBytes_(id, 4), // track_ID
      0x00, 0x00, 0x00, 0x01, // default_sample_description_index
      0x00, 0x00, 0x00, 0x00, // default_sample_duration
      0x00, 0x00, 0x00, 0x00, // default_sample_size
      0x00, 0x00, 0x00, 0x00, // default_sample_flags
    ]);
    return Mp4Generator.box('trex', bytes);
  }

  /**
   * Generate a PSSH box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  pssh_(streamInfo) {
    const initDatas = [];
    if (!streamInfo.encrypted) {
      return new Uint8Array([]);
    }

    for (const drmInfo of streamInfo.stream.drmInfos) {
      if (!drmInfo.initData) {
        continue;
      }
      for (const initData of drmInfo.initData) {
        initDatas.push(initData.initData);
      }
    }
    const boxes = shaka.util.Uint8ArrayUtils.concat(...initDatas);
    return boxes;
  }

  /**
   * Generate a SINF box
   *
   * @param {!shaka.extern.Stream} stream
   * @param {string} codecs
   * @return {!Uint8Array}
   */
  sinf(stream, codecs) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('sinf',
        this.frma_(codecs),
        this.schm_(stream),
        this.schi_(stream));
  }

  /**
   * Generate a FRMA box
   *
   * @param {string} codecs
   * @return {!Uint8Array}
   * @private
   */
  frma_(codecs) {
    const codec = codecs.split('.')[0];
    const Mp4Generator = shaka.util.Mp4Generator;
    const codecNumber = this.stringToCharCode_(codec);
    const bytes = new Uint8Array([
      ...this.breakNumberIntoBytes_(codecNumber, 4),
    ]);
    return Mp4Generator.box('frma', bytes);
  }

  /**
   * Generate a SCHM box
   *
   * @param {!shaka.extern.Stream} stream
   * @return {!Uint8Array}
   * @private
   */
  schm_(stream) {
    let encryptionScheme = 'cenc';
    const drmInfo = stream.drmInfos[0];
    if (drmInfo && drmInfo.encryptionScheme) {
      encryptionScheme = drmInfo.encryptionScheme;
    }
    const Mp4Generator = shaka.util.Mp4Generator;
    const schemeNumber = this.stringToCharCode_(encryptionScheme);
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      ...this.breakNumberIntoBytes_(schemeNumber, 4), // Scheme
      0x00, 0x01, 0x00, 0x00, // Scheme version: 1.0
    ]);
    return Mp4Generator.box('schm', bytes);
  }

  /**
   * Generate a SCHI box
   *
   * @param {!shaka.extern.Stream} stream
   * @return {!Uint8Array}
   * @private
   */
  schi_(stream) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('schi', this.tenc_(stream));
  }

  /**
   * Generate a TENC box
   *
   * @param {!shaka.extern.Stream} stream
   * @return {!Uint8Array}
   * @private
   */
  tenc_(stream) {
    // Default key ID: all zeros (dummy)
    let defaultKeyId = new Uint8Array([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    for (const drmInfo of stream.drmInfos) {
      if (drmInfo && drmInfo.keyIds && drmInfo.keyIds.size) {
        for (const keyId of drmInfo.keyIds) {
          defaultKeyId = this.hexStringToBuffer_(keyId);
        }
      }
    }

    const Mp4Generator = shaka.util.Mp4Generator;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      0x00, 0x00, // Reserved fields
      0x01, // Default protected: true
      0x08, // Default per-sample IV size: 8
    ]);
    goog.asserts.assert(defaultKeyId, 'Default KID should be non-null');
    return Mp4Generator.box('tenc', bytes, defaultKeyId);
  }

  /**
   * Generate a Segment Data (MP4).
   *
   * @return {!Uint8Array}
   */
  segmentData() {
    const segmentDataArray = [];
    for (const streamInfo of this.streamInfos_) {
      segmentDataArray.push(
          ...[this.moof_(streamInfo), this.mdat_(streamInfo)]);
    }
    const result = shaka.util.Uint8ArrayUtils.concat(...segmentDataArray);
    return result;
  }

  /**
   * Generate a MOOF box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  moof_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('moof',
        this.mfhd_(streamInfo), this.traf_(streamInfo));
  }

  /**
   * Generate a MOOF box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mfhd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const sequenceNumber =
        streamInfo.data ? streamInfo.data.sequenceNumber : 0;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      ...this.breakNumberIntoBytes_(sequenceNumber, 4),
    ]);
    return Mp4Generator.box('mfhd', bytes);
  }

  /**
   * Generate a TRAF box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  traf_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const sampleDependencyTable = this.sdtp_(streamInfo);
    const offset = sampleDependencyTable.length +
          32 + // tfhd
          20 + // tfdt
          8 + // traf header
          16 + // mfhd
          8 + // moof header
          8; // mdat header;
    return Mp4Generator.box('traf',
        this.tfhd_(streamInfo),
        this.tfdt_(streamInfo),
        this.trun_(streamInfo, offset),
        sampleDependencyTable);
  }

  /**
   * Generate a SDTP box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  sdtp_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const samples = streamInfo.data ? streamInfo.data.samples : [];
    const bytes = new Uint8Array(4 + samples.length);
    // leave the full box header (4 bytes) all zero
    // write the sample table
    for (let i = 0; i < samples.length; i++) {
      const flags = samples[i].flags;
      bytes[i + 4] = (flags.dependsOn << 4) |
          (flags.isDependedOn << 2) |
          flags.hasRedundancy;
    }
    return Mp4Generator.box('sdtp', bytes);
  }

  /**
   * Generate a TFHD box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  tfhd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const id = streamInfo.id + 1;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x3a, // flags
      ...this.breakNumberIntoBytes_(id, 4), // track_ID
      0x00, 0x00, 0x00, 0x01, // sample_description_index
      0x00, 0x00, 0x00, 0x00, // default_sample_duration
      0x00, 0x00, 0x00, 0x00, // default_sample_size
      0x00, 0x00, 0x00, 0x00,  // default_sample_flags
    ]);
    return Mp4Generator.box('tfhd', bytes);
  }

  /**
   * Generate a TFDT box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  tfdt_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const baseMediaDecodeTime =
        streamInfo.data ? streamInfo.data.baseMediaDecodeTime : 0;
    const upperWordBaseMediaDecodeTime =
      Math.floor(baseMediaDecodeTime / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordBaseMediaDecodeTime =
      Math.floor(baseMediaDecodeTime % (Mp4Generator.UINT32_MAX_ + 1));
    const bytes = new Uint8Array([
      0x01, // version 1
      0x00, 0x00, 0x00, // flags
      ...this.breakNumberIntoBytes_(upperWordBaseMediaDecodeTime, 4),
      ...this.breakNumberIntoBytes_(lowerWordBaseMediaDecodeTime, 4),
    ]);
    return Mp4Generator.box('tfdt', bytes);
  }

  /**
   * Generate a TRUN box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @param {number} offset
   * @return {!Uint8Array}
   * @private
   */
  trun_(streamInfo, offset) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const Mp4Generator = shaka.util.Mp4Generator;

    const samples = streamInfo.data ? streamInfo.data.samples : [];
    const samplesLength = samples.length;
    const bytesLen = 12 + 16 * samplesLength;
    const bytes = new Uint8Array(bytesLen);
    offset += 8 + bytesLen;
    const isVideo = streamInfo.type === ContentType.VIDEO;
    bytes.set(
        [
        // version 1 for video with signed-int sample_composition_time_offset
        isVideo ? 0x01 : 0x00,
        0x00, 0x0f, 0x01, // flags
        ...this.breakNumberIntoBytes_(samplesLength, 4), // sample_count
        ...this.breakNumberIntoBytes_(offset, 4), // data_offset
        ],
        0,
    );
    for (let i = 0; i < samplesLength; i++) {
      const sample = samples[i];
      const duration = this.breakNumberIntoBytes_(sample.duration, 4);
      const size = this.breakNumberIntoBytes_(sample.size, 4);
      const flags = sample.flags;
      const cts = this.breakNumberIntoBytes_(sample.cts, 4);
      bytes.set(
          [
            ...duration, // sample_duration
            ...size, // sample_size
            (flags.isLeading << 2) | flags.dependsOn,
            (flags.isDependedOn << 6) | (flags.hasRedundancy << 4) |
              flags.isNonSync,
            flags.degradPrio & (0xf0 << 8),
            flags.degradPrio & 0x0f, // sample_flags
            ...cts, // sample_composition_time_offset
          ],
          12 + 16 * i,
      );
    }
    return Mp4Generator.box('trun', bytes);
  }

  /**
   * Generate a MDAT box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mdat_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const samples = streamInfo.data ? streamInfo.data.samples : [];
    const allData = samples.map((sample) => sample.data);
    const bytes = shaka.util.Uint8ArrayUtils.concat(...allData);
    return Mp4Generator.box('mdat', bytes);
  }


  /**
   * @param {number} number
   * @param {number} numBytes
   * @return {!Array<number>}
   * @private
   */
  breakNumberIntoBytes_(number, numBytes) {
    const bytes = [];
    for (let byte = numBytes - 1; byte >= 0; byte--) {
      bytes.push((number >> (8 * byte)) & 0xff);
    }
    return bytes;
  }

  /**
   * Convert a hex string to buffer.
   *
   * @param {string} str
   * @return {Uint8Array}
   * @private
   */
  hexStringToBuffer_(str) {
    const buf = new Uint8Array(str.length / 2);
    for (let i = 0; i < str.length / 2; i += 1) {
      buf[i] = parseInt(String(str[i * 2] + str[i * 2 + 1]), 16);
    }
    return buf;
  }

  /**
   * Convert a string to char code.
   *
   * @param {string} str
   * @return {number}
   * @private
   */
  stringToCharCode_(str) {
    let code = 0;
    for (let i = 0; i < str.length; i += 1) {
      code |= str.charCodeAt(i) << ((str.length - i - 1) * 8);
    }
    return code;
  }

  /**
   * Generate a box
   *
   * @param {string} boxName
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  static box(boxName, ...payload) {
    let type = shaka.util.Mp4Generator.BOX_TYPES_.get(boxName);
    if (!type) {
      type = [
        boxName.charCodeAt(0),
        boxName.charCodeAt(1),
        boxName.charCodeAt(2),
        boxName.charCodeAt(3),
      ];
      shaka.util.Mp4Generator.BOX_TYPES_.set(boxName, type);
    }
    // make the header for the box
    let size = 8;
    // calculate the total size we need to allocate
    for (let i = payload.length - 1; i >= 0; i--) {
      size += payload[i].byteLength;
    }
    const result = new Uint8Array(size);
    result[0] = (size >> 24) & 0xff;
    result[1] = (size >> 16) & 0xff;
    result[2] = (size >> 8) & 0xff;
    result[3] = size & 0xff;
    result.set(type, 4);

    // copy the payload into the result
    for (let i = 0, pointer = 8; i < payload.length; i++) {
      // copy payload[i] array @ offset pointer
      result.set(payload[i], pointer);
      pointer += payload[i].byteLength;
    }
    return result;
  }
};

/**
 * @private {number}
 */
shaka.util.Mp4Generator.UINT32_MAX_ = Math.pow(2, 32) - 1;

/**
 * @private {!Map<string, !Array<number>>}
 */
shaka.util.Mp4Generator.BOX_TYPES_ = new Map();

/**
 * @private {{
 *   video: !shaka.util.Lazy<!Uint8Array>,
 *   audio: !shaka.util.Lazy<!Uint8Array>,
 * }}
 */
shaka.util.Mp4Generator.HDLR_TYPES_ = {
  video: new shaka.util.Lazy(() => new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x00, // flags
    0x00, 0x00, 0x00, 0x00, // pre_defined
    0x76, 0x69, 0x64, 0x65, // handler_type: 'vide'
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x56, 0x69, 0x64, 0x65,
    0x6f, 0x48, 0x61, 0x6e,
    0x64, 0x6c, 0x65, 0x72, 0x00, // name: 'VideoHandler'
  ])),
  audio: new shaka.util.Lazy(() => new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x00, // flags
    0x00, 0x00, 0x00, 0x00, // pre_defined
    0x73, 0x6f, 0x75, 0x6e, // handler_type: 'soun'
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x53, 0x6f, 0x75, 0x6e,
    0x64, 0x48, 0x61, 0x6e,
    0x64, 0x6c, 0x65, 0x72, 0x00, // name: 'SoundHandler'
  ])),
};

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STTS_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // entry_count
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STSC_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // entry_count
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STCO_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // entry_count
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STSZ_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // sample_size
  0x00, 0x00, 0x00, 0x00, // sample_count
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.VMHD_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x01, // flags
  0x00, 0x00, // graphics mode
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00, // op color
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.SMHD_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, // balance, 0 means centered
  0x00, 0x00, // reserved
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STSD_ = new shaka.util.Lazy(() => new Uint8Array([
  0x00, // version 0
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x01, // entry_count
]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.FTYP_ = new shaka.util.Lazy(() => {
  const majorBrand = new Uint8Array([105, 115, 111, 109]); // isom
  const avc1Brand = new Uint8Array([97, 118, 99, 49]); // avc1
  const minorVersion = new Uint8Array([0, 0, 0, 1]);
  return shaka.util.Mp4Generator.box(
      'ftyp', majorBrand, minorVersion, majorBrand, avc1Brand);
});

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.DINF_ = new shaka.util.Lazy(() => {
  const dref = new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x00, // flags
    0x00, 0x00, 0x00, 0x01, // entry_count
    0x00, 0x00, 0x00, 0x0c, // entry_size
    0x75, 0x72, 0x6c, 0x20, // 'url' type
    0x00, // version 0
    0x00, 0x00, 0x01, // entry_flags
  ]);
  const drefBox = shaka.util.Mp4Generator.box('dref', dref);
  return shaka.util.Mp4Generator.box('dinf', drefBox);
});

/**
 * @typedef {{
 *   id: number,
 *   type: string,
 *   codecs: string,
 *   encrypted: boolean,
 *   timescale: number,
 *   duration: number,
 *   videoNalus: !Array<string>,
 *   audioConfig: !Uint8Array,
 *   videoConfig: !Uint8Array,
 *   hSpacing: number,
 *   vSpacing: number,
 *   data: ?shaka.util.Mp4Generator.Data,
 *   stream: !shaka.extern.Stream,
 * }}
 *
 * @property {number} id
 *   A unique ID
 * @property {string} type
 *   Indicate the content type: 'video' or 'audio'.
 * @property {string} codecs
 *   <i>Defaults to '' (i.e., unknown / not needed).</i> <br>
 *   The Stream's codecs, e.g., 'avc1.4d4015' or 'vp9'<br>
 *   See {@link https://tools.ietf.org/html/rfc6381}
 * @property {boolean} encrypted
 *   Indicate if the stream is encrypted.
 * @property {number} timescale
 *   The Stream's timescale.
 * @property {number} duration
 *   The Stream's duration.
 * @property {!Array<string>} videoNalus
 *   The stream's video nalus.
 * @property {!Uint8Array} audioConfig
 *   The stream's audio config.
 * @property {!Uint8Array} videoConfig
 *   The stream's video config.
 * @property {number} hSpacing
 *   The stream's video horizontal spacing of pixels.
 * @property {number} vSpacing
 *   The stream's video vertical spacing of pixels.
 * @property {?shaka.util.Mp4Generator.Data} data
 *   The stream's data.
 * @property {!shaka.extern.Stream} stream
 *   The Stream.
 */
shaka.util.Mp4Generator.StreamInfo;

/**
 * @typedef {{
 *   sequenceNumber: number,
 *   baseMediaDecodeTime: number,
 *   samples: !Array<shaka.util.Mp4Generator.Mp4Sample>,
 * }}
 *
 * @property {number} sequenceNumber
 *   The sequence number.
 * @property {number} baseMediaDecodeTime
 *   The base media decode time.
 * @property {!Array<shaka.util.Mp4Generator.Mp4Sample>} samples
 *   The data samples.
 */
shaka.util.Mp4Generator.Data;

/**
 * @typedef {{
 *   data: !Uint8Array,
 *   size: number,
 *   duration: number,
 *   cts: number,
 *   flags: !shaka.util.Mp4Generator.Mp4SampleFlags,
 * }}
 *
 * @property {!Uint8Array} data
 *   The sample data.
 * @property {number} size
 *   The sample size.
 * @property {number} duration
 *   The sample duration.
 * @property {number} cts
 *   The sample composition time.
 * @property {!shaka.util.Mp4Generator.Mp4SampleFlags} flags
 *   The sample flags.
 */
shaka.util.Mp4Generator.Mp4Sample;

/**
 * @typedef {{
 *   isLeading: number,
 *   isDependedOn: number,
 *   hasRedundancy: number,
 *   degradPrio: number,
 *   dependsOn: number,
 *   isNonSync: number,
 * }}
 *
 * @property {number} isLeading
 * @property {number} isDependedOn
 * @property {number} hasRedundancy
 * @property {number} degradPrio
 * @property {number} dependsOn
 * @property {number} isNonSync
 */
shaka.util.Mp4Generator.Mp4SampleFlags;
