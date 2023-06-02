/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4Generator');

goog.require('goog.asserts');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Uint8ArrayUtils');


shaka.util.Mp4Generator = class {
  /**
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   */
  constructor(streamInfo) {
    shaka.util.Mp4Generator.initStaticProperties_();

    /** @private {!shaka.extern.Stream} */
    this.stream_ = streamInfo.stream;

    /** @private {number} */
    this.timescale_ = streamInfo.timescale;

    /** @private {number} */
    this.duration_ = streamInfo.duration;
    if (this.duration_ === Infinity) {
      this.duration_ = 0xffffffff;
    }

    /** @private {!Array.<string>} */
    this.videoNalus_ = streamInfo.videoNalus;

    /** @private {number} */
    this.sequenceNumber_ = 0;

    /** @private {number} */
    this.baseMediaDecodeTime_ = 0;

    /** @private {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    this.samples_ = [];

    const data = streamInfo.data;
    if (data) {
      this.sequenceNumber_ = data.sequenceNumber;
      this.baseMediaDecodeTime_ = data.baseMediaDecodeTime;
      this.samples_ = data.samples;
    }
  }

  /**
   * Generate a Init Segment (MP4).
   *
   * @return {!Uint8Array}
   */
  initSegment() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const movie = this.moov_();
    const length = Mp4Generator.FTYP_.byteLength + movie.byteLength;
    const result = new Uint8Array(length);
    result.set(Mp4Generator.FTYP_);
    result.set(movie, Mp4Generator.FTYP_.byteLength);
    return result;
  }

  /**
   * Generate a MOOV box
   *
   * @return {!Uint8Array}
   * @private
   */
  moov_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('moov',
        this.mvhd_(), this.trak_(), this.mvex_(), this.pssh_());
  }

  /**
   * Generate a MVHD box
   *
   * @return {!Uint8Array}
   * @private
   */
  mvhd_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const duration = this.duration_ * this.timescale_;
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
      ...this.breakNumberIntoBytes_(this.timescale_, 4), // timescale
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
   * @return {!Uint8Array}
   * @private
   */
  trak_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('trak', this.tkhd_(), this.mdia_());
  }

  /**
   * Generate a TKHD box
   *
   * @return {!Uint8Array}
   * @private
   */
  tkhd_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const id = this.stream_.id + 1;
    const width = this.stream_.width || 0;
    const height = this.stream_.height || 0;
    const duration = this.duration_ * this.timescale_;
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
   * @return {!Uint8Array}
   * @private
   */
  mdia_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box(
        'mdia', this.mdhd_(), this.hdlr_(), this.minf_());
  }

  /**
   * Generate a MDHD box
   *
   * @return {!Uint8Array}
   * @private
   */
  mdhd_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const duration = this.duration_ * this.timescale_;
    const upperWordDuration =
        Math.floor(duration / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordDuration =
        Math.floor(duration % (Mp4Generator.UINT32_MAX_ + 1));
    const language = this.stream_.language;
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
      ...this.breakNumberIntoBytes_(this.timescale_, 4), // timescale
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
   * @return {!Uint8Array}
   * @private
   */
  hdlr_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    let bytes = new Uint8Array([]);
    switch (this.stream_.type) {
      case ContentType.VIDEO:
        bytes = Mp4Generator.HDLR_TYPES_.video;
        break;
      case ContentType.AUDIO:
        bytes = Mp4Generator.HDLR_TYPES_.audio;
        break;
    }
    return Mp4Generator.box('hdlr', bytes);
  }

  /**
   * Generate a MINF box
   *
   * @return {!Uint8Array}
   * @private
   */
  minf_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    switch (this.stream_.type) {
      case ContentType.VIDEO:
        return Mp4Generator.box(
            'minf', Mp4Generator.box('vmhd', Mp4Generator.VMHD_),
            Mp4Generator.DINF_, this.stbl_());
      case ContentType.AUDIO:
        return Mp4Generator.box(
            'minf', Mp4Generator.box('smhd', Mp4Generator.SMHD_),
            Mp4Generator.DINF_, this.stbl_());
    }
    return new Uint8Array([]);
  }

  /**
   * Generate a STBL box
   *
   * @return {!Uint8Array}
   * @private
   */
  stbl_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box(
        'stbl',
        this.stsd_(),
        Mp4Generator.box('stts', Mp4Generator.STTS_),
        Mp4Generator.box('stsc', Mp4Generator.STSC_),
        Mp4Generator.box('stsz', Mp4Generator.STSZ_),
        Mp4Generator.box('stco', Mp4Generator.STCO_));
  }

  /**
   * Generate a STSD box
   *
   * @return {!Uint8Array}
   * @private
   */
  stsd_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    let bytes = new Uint8Array([]);
    switch (this.stream_.type) {
      case ContentType.VIDEO:
        bytes = this.avc1_();
        break;
      case ContentType.AUDIO:
        if (this.stream_.mimeType === 'audio/mpeg' ||
        this.stream_.codecs.includes('mp3') ||
        this.stream_.codecs.includes('mp4a.40.34')) {
          bytes = this.mp3_();
        } else {
          bytes = this.mp4a_();
        }
        break;
    }
    return Mp4Generator.box('stsd', Mp4Generator.STSD_, bytes);
  }

  /**
   * Generate a AVC1 box
   *
   * @return {!Uint8Array}
   * @private
   */
  avc1_() {
    const Mp4Generator = shaka.util.Mp4Generator;

    const NALUTYPE_SPS = 7;
    const NALUTYPE_PPS = 8;

    const width = this.stream_.width || 0;
    const height = this.stream_.height || 0;

    // length = 7 by default (0 SPS and 0 PPS)
    let avcCLength = 7;

    // First get all SPS and PPS from nalus
    const sps = [];
    const pps = [];
    let AVCProfileIndication = 0;
    let AVCLevelIndication = 0;
    let profileCompatibility = 0;
    for (let i = 0; i < this.videoNalus_.length; i++) {
      const naluBytes = this.hexStringToBuffer_(this.videoNalus_[i]);
      const naluType = naluBytes[0] & 0x1F;
      switch (naluType) {
        case NALUTYPE_SPS:
          sps.push(naluBytes);
          // 2 = sequenceParameterSetLength field length
          avcCLength += naluBytes.length + 2;
          break;
        case NALUTYPE_PPS:
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
    const avcCBox = Mp4Generator.box('avcC', avcCBytes);

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
      0x00, 0x48, 0x00, 0x00, // horizresolution
      0x00, 0x48, 0x00, 0x00, // vertresolution
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
      0x00, 0x00, 0x00, // compressorname
      0x00, 0x18, // depth = 24
      0x11, 0x11, // pre_defined = -1
    ]);

    let sinfBox = new Uint8Array([]);
    if (this.stream_.encrypted) {
      sinfBox = this.sinf_();
    }

    let boxName = 'avc1';
    if (this.stream_.encrypted) {
      boxName = 'encv';
    }
    return Mp4Generator.box(boxName, avc1Bytes, avcCBox, sinfBox);
  }

  /**
   * Generate STSD bytes
   *
   * @return {!Uint8Array}
   * @private
   */
  audioStsd_() {
    const channelsCount = this.stream_.channelsCount || 2;
    const audioSamplingRate = this.stream_.audioSamplingRate || 44100;
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, // reserved
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00,
      channelsCount, // channelcount
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
   * @return {!Uint8Array}
   * @private
   */
  mp3_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('.mp3', this.audioStsd_());
  }

  /**
   * Generate a MP4A box
   *
   * @return {!Uint8Array}
   * @private
   */
  mp4a_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const esdsBox = Mp4Generator.box('esds', this.esds_());

    let sinfBox = new Uint8Array([]);
    if (this.stream_.encrypted) {
      sinfBox = this.sinf_();
    }

    let boxName = 'mp4a';
    if (this.stream_.encrypted) {
      boxName = 'enca';
    }
    return Mp4Generator.box(boxName, this.audioStsd_(), esdsBox, sinfBox);
  }

  /**
   * Generate a ESDS box
   *
   * @return {!Uint8Array}
   * @private
   */
  esds_() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const id = this.stream_.id + 1;
    const bandwidth = this.stream_.bandwidth || 0;
    const channelsCount = this.stream_.channelsCount || 2;
    const audioSamplingRate = this.stream_.audioSamplingRate || 44100;

    const audioCodec = shaka.util.ManifestParserUtils.guessCodecs(
        ContentType.AUDIO, this.stream_.codecs.split(','));

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
      0x03, // tag, ES_DescrTag
      0x19, // length
      ...this.breakNumberIntoBytes_(id, 2), // ES_ID
      0x00, // streamDependenceFlag, URL_flag, reserved, streamPriority

      // DecoderConfigDescriptor
      0x04, // tag, DecoderConfigDescrTag
      0x11, // length
      0x40, // object type
      0x15,  // streamType
      0x00, 0x06, 0x00, // bufferSizeDB
      ...this.breakNumberIntoBytes_(bandwidth, 4), // maxBitrate
      ...this.breakNumberIntoBytes_(bandwidth, 4), // avgBitrate
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
    return Mp4Generator.box('mvex', this.trex_());
  }

  /**
   * Generate a TREX box
   *
   * @return {!Uint8Array}
   * @private
   */
  trex_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const id = this.stream_.id + 1;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      ...this.breakNumberIntoBytes_(id, 4), // track_ID
      0x00, 0x00, 0x00, 0x01, // default_sample_description_index
      0x00, 0x00, 0x00, 0x00, // default_sample_duration
      0x00, 0x00, 0x00, 0x00, // default_sample_size
      0x00, 0x01, 0x00, 0x01, // default_sample_flags
    ]);
    return Mp4Generator.box('trex', bytes);
  }

  /**
   * Generate a PSSH box
   *
   * @return {!Uint8Array}
   * @private
   */
  pssh_() {
    let boxes = new Uint8Array([]);
    if (!this.stream_.encrypted) {
      return boxes;
    }

    for (const drmInfo of this.stream_.drmInfos) {
      if (!drmInfo.initData) {
        continue;
      }
      for (const initData of drmInfo.initData) {
        boxes = shaka.util.Uint8ArrayUtils.concat(boxes, initData.initData);
      }
    }
    return boxes;
  }

  /**
   * Generate a SINF box
   *
   * @return {!Uint8Array}
   * @private
   */
  sinf_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('sinf',
        this.frma_(), this.schm_(), this.schi_());
  }

  /**
   * Generate a FRMA box
   *
   * @return {!Uint8Array}
   * @private
   */
  frma_() {
    const codec = this.stream_.codecs.substring(
        0, this.stream_.codecs.indexOf('.'));
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
   * @return {!Uint8Array}
   * @private
   */
  schm_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      0x63, 0x65, 0x6e, 0x63, // Scheme: cenc
      0x00, 0x01, 0x00, 0x00, // Scheme version: 1.0
    ]);
    return Mp4Generator.box('schm', bytes);
  }

  /**
   * Generate a SCHI box
   *
   * @return {!Uint8Array}
   * @private
   */
  schi_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('schi', this.tenc_());
  }

  /**
   * Generate a TENC box
   *
   * @return {!Uint8Array}
   * @private
   */
  tenc_() {
    // Default key ID: all zeros (dummy)
    let defaultKeyId = new Uint8Array([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    for (const drmInfo of this.stream_.drmInfos) {
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
    const movie = this.moof_();
    const mdat = this.mdat_();
    const length = movie.byteLength + mdat.byteLength;
    const result = new Uint8Array(length);
    result.set(movie);
    result.set(mdat, movie.byteLength);
    return result;
  }

  /**
   * Generate a MOOF box
   *
   * @return {!Uint8Array}
   * @private
   */
  moof_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    return Mp4Generator.box('moof', this.mfhd_(), this.traf_());
  }

  /**
   * Generate a MOOF box
   *
   * @return {!Uint8Array}
   * @private
   */
  mfhd_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const bytes = new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      ...this.breakNumberIntoBytes_(this.sequenceNumber_, 4),
    ]);
    return Mp4Generator.box('mfhd', bytes);
  }

  /**
   * Generate a TRAF box
   *
   * @return {!Uint8Array}
   * @private
   */
  traf_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const sampleDependencyTable = this.sdtp_();
    const offset = sampleDependencyTable.length +
          32 + // tfhd
          20 + // tfdt
          8 + // traf header
          16 + // mfhd
          8 + // moof header
          8; // mdat header;
    return Mp4Generator.box('traf', this.tfhd_(), this.tfdt_(),
        this.trun_(offset), sampleDependencyTable);
  }

  /**
   * Generate a SDTP box
   *
   * @return {!Uint8Array}
   * @private
   */
  sdtp_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const bytes = new Uint8Array(4 + this.samples_.length);
    // leave the full box header (4 bytes) all zero
    // write the sample table
    for (let i = 0; i < this.samples_.length; i++) {
      const flags = this.samples_[i].flags;
      bytes[i + 4] = (flags.dependsOn << 4) |
          (flags.isDependedOn << 2) |
          flags.hasRedundancy;
    }
    return Mp4Generator.box('sdtp', bytes);
  }

  /**
   * Generate a TFHD box
   *
   * @return {!Uint8Array}
   * @private
   */
  tfhd_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const id = this.stream_.id + 1;
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
   * @return {!Uint8Array}
   * @private
   */
  tfdt_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    const upperWordBaseMediaDecodeTime =
      Math.floor(this.baseMediaDecodeTime_ / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordBaseMediaDecodeTime =
      Math.floor(this.baseMediaDecodeTime_ % (Mp4Generator.UINT32_MAX_ + 1));
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
   * @return {!Uint8Array}
   * @private
   */
  trun_(offset) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const Mp4Generator = shaka.util.Mp4Generator;

    const samplesLength = this.samples_.length;
    const byteslen = 12 + 16 * samplesLength;
    const bytes = new Uint8Array(byteslen);
    offset += 8 + byteslen;
    const isVideo = this.stream_.type === ContentType.VIDEO;
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
      const sample = this.samples_[i];
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
   * @return {!Uint8Array}
   * @private
   */
  mdat_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    let bytes = new Uint8Array(0);
    for (const sample of this.samples_) {
      bytes = shaka.util.Uint8ArrayUtils.concat(bytes, sample.data);
    }
    return Mp4Generator.box('mdat', bytes);
  }


  /**
   * @param {number} number
   * @param {number} numBytes
   * @return {!Array.<number>}
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
   * @private
   */
  static initStaticProperties_() {
    const Mp4Generator = shaka.util.Mp4Generator;
    if (Mp4Generator.initializated_) {
      return;
    }

    Mp4Generator.initializated_ = true;

    const majorBrand = new Uint8Array([105, 115, 111, 109]); // isom
    const avc1Brand = new Uint8Array([97, 118, 99, 49]); // avc1
    const minorVersion = new Uint8Array([0, 0, 0, 1]);

    Mp4Generator.FTYP_ = Mp4Generator.box(
        'ftyp', majorBrand, minorVersion, majorBrand, avc1Brand);
    const drefBox = Mp4Generator.box('dref', Mp4Generator.DREF_);
    Mp4Generator.DINF_ = Mp4Generator.box('dinf', drefBox);
  }

  /**
   * Generate a box
   *
   * @param {string} boxName
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  static box(boxName, ...payload) {
    let type = shaka.util.Mp4Generator.BOX_TYPES_[boxName];
    if (!type) {
      type = [
        boxName.charCodeAt(0),
        boxName.charCodeAt(1),
        boxName.charCodeAt(2),
        boxName.charCodeAt(3),
      ];
      shaka.util.Mp4Generator.BOX_TYPES_[boxName] = type;
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
 * @private {boolean}
 */
shaka.util.Mp4Generator.initializated_ = false;


/**
 * @private {number}
 */
shaka.util.Mp4Generator.UINT32_MAX_ = Math.pow(2, 32) - 1;

/**
 * @private {!Object.<string, !Array.<number>>}
 */
shaka.util.Mp4Generator.BOX_TYPES_ = {};

/**
 * @private {{video: !Uint8Array, audio: !Uint8Array}}
 */
shaka.util.Mp4Generator.HDLR_TYPES_ = {
  video: new Uint8Array([
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
  ]),
  audio: new Uint8Array([
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
  ]),
};

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.STTS_ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // entry_count
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.STSC_ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // entry_count
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.STCO_ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // entry_count
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.STSZ_ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // sample_size
  0x00, 0x00, 0x00, 0x00, // sample_count
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.VMHD_ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x01, // flags
  0x00, 0x00, // graphicsmode
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00, // opcolor
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.SMHD_ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, // balance, 0 means centered
  0x00, 0x00, // reserved
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.STSD_ = new Uint8Array([
  0x00, // version 0
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x01, // entry_count
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.FTYP_ = new Uint8Array([]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.DREF_ = new Uint8Array([
  0x00, // version 0
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x01, // entry_count
  0x00, 0x00, 0x00, 0x0c, // entry_size
  0x75, 0x72, 0x6c, 0x20, // 'url' type
  0x00, // version 0
  0x00, 0x00, 0x01, // entry_flags
]);

/**
 * @private {!Uint8Array}
 */
shaka.util.Mp4Generator.DINF_ = new Uint8Array([]);

/**
 * @typedef {{
 *    timescale: number,
 *    duration: number,
 *    videoNalus: !Array.<string>,
 *    data: ?shaka.util.Mp4Generator.Data,
 *    stream: !shaka.extern.Stream
 * }}
 *
 * @property {number} timescale
 *   The Stream's timescale.
 * @property {number} duration
 *   The Stream's duration.
 * @property {!Array.<string>} videoNalus
 *   The stream's video nalus.
 * @property {?shaka.util.Mp4Generator.Data} data
 *   The stream's data.
 * @property {!shaka.extern.Stream} stream
 *   The Stream.
 */
shaka.util.Mp4Generator.StreamInfo;

/**
 * @typedef {{
 *    sequenceNumber: number,
 *    baseMediaDecodeTime: number,
 *    samples: !Array.<shaka.util.Mp4Generator.Mp4Sample>
 * }}
 *
 * @property {number} sequenceNumber
 *   The sequence number.
 * @property {number} baseMediaDecodeTime
 *   The base media decode time.
 * @property {!Array.<shaka.util.Mp4Generator.Mp4Sample>} samples
 *   The data samples.
 */
shaka.util.Mp4Generator.Data;

/**
 * @typedef {{
 *    data: !Uint8Array,
 *    size: number,
 *    duration: number,
 *    cts: number,
 *    flags: !shaka.util.Mp4Generator.Mp4SampleFlags
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
 *    isLeading: number,
 *    isDependedOn: number,
 *    hasRedundancy: number,
 *    degradPrio: number,
 *    dependsOn: number,
 *    isNonSync: number
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
