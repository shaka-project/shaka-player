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
   * @param {!Array<shaka.util.Mp4Generator.StreamInfo>=} streamInfos
   */
  constructor(streamInfos = []) {
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
    if (this.streamInfos_.length === 0) {
      throw new Error('StreamInfos must have elements');
    }
    const Mp4Generator = shaka.util.Mp4Generator;
    const trakArrays = [];
    for (const streamInfo of this.streamInfos_) {
      trakArrays.push(this.trak_(streamInfo));
    }
    const firstStreamInfo = this.streamInfos_[0];
    return Mp4Generator.box('moov',
        this.mvhd_(firstStreamInfo),
        ...trakArrays,
        this.mvex_(),
        this.psshs(firstStreamInfo.stream));
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
    const bytes = Mp4Generator.MVHD_TEMPLATE_.value();
    this.writeUint32_(bytes, streamInfo.timescale, 20);
    this.writeUint32_(bytes, upperWordDuration, 24);
    this.writeUint32_(bytes, lowerWordDuration, 28);
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
    const bytes = Mp4Generator.TKHD_TEMPLATE_.value();
    this.writeUint32_(bytes, id, 20);
    this.writeUint32_(bytes, upperWordDuration, 28);
    this.writeUint32_(bytes, lowerWordDuration, 32);
    this.writeUint16_(bytes, width, 88);
    this.writeUint16_(bytes, height, 92);
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
    const bytes = Mp4Generator.MDHD_TEMPLATE_.value();
    this.writeUint32_(bytes, streamInfo.timescale, 20);
    this.writeUint32_(bytes, upperWordDuration, 24);
    this.writeUint32_(bytes, lowerWordDuration, 28);
    this.writeUint16_(bytes, languageNumber, 32);
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
        Mp4Generator.STTS_BOX_.value(),
        Mp4Generator.STSC_BOX_.value(),
        Mp4Generator.STSZ_BOX_.value(),
        Mp4Generator.STCO_BOX_.value());
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
   * Generate a video sample entry box (shared implementation for AVC1 / HVC1)
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @param {string} boxName  'avc1' | 'hvc1'
   * @param {string} configBoxName  'avcC' | 'hvcC'
   * @return {!Uint8Array}
   * @private
   */
  videoSampleEntry_(streamInfo, boxName, configBoxName) {
    const Mp4Generator = shaka.util.Mp4Generator;

    const width = streamInfo.stream.width || 0;
    const height = streamInfo.stream.height || 0;

    let configBox = new Uint8Array([]);
    if (streamInfo.mediaConfig.byteLength > 0) {
      configBox = Mp4Generator.box(configBoxName, streamInfo.mediaConfig);
    }

    const entryBytes = Mp4Generator.VIDEO_SAMPLE_ENTRY_TEMPLATE_.value();
    this.writeUint16_(entryBytes, width, 24);
    this.writeUint16_(entryBytes, height, 26);

    const paspBox = this.pasp_(streamInfo);
    let sinfBox = new Uint8Array([]);
    let entryBoxName = boxName;
    if (Mp4Generator.isStreamEncrypted_(streamInfo.stream)) {
      sinfBox = this.sinf(streamInfo.stream, streamInfo.codecs);
      entryBoxName = 'encv';
    }
    return Mp4Generator.box(
        entryBoxName, entryBytes, configBox, paspBox, sinfBox);
  }

  /**
   * Generate a AVC1 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  avc1_(streamInfo) {
    return this.videoSampleEntry_(streamInfo, 'avc1', 'avcC');
  }

  /**
   * Generate a HVC1 box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  hvc1_(streamInfo) {
    return this.videoSampleEntry_(streamInfo, 'hvc1', 'hvcC');
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
    const hSpacing = streamInfo.hSpacing || 0;
    const vSpacing = streamInfo.vSpacing || 0;
    const box = Mp4Generator.allocBox('pasp', 8);
    this.writeUint32_(box, hSpacing, Mp4Generator.BOX_HEADER_SIZE_);
    this.writeUint32_(box, vSpacing, Mp4Generator.BOX_HEADER_SIZE_ + 4);
    return box;
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
    const bytes = shaka.util.Mp4Generator.AUDIO_STSD_TEMPLATE_.value();
    bytes[17] = channelsCount;
    this.writeUint16_(bytes, audioSamplingRate, 24);
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
    const dac3Box = Mp4Generator.box('dac3', streamInfo.mediaConfig);

    let boxName = 'ac-3';
    let sinfBox = new Uint8Array([]);
    if (Mp4Generator.isStreamEncrypted_(streamInfo.stream)) {
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
    const dec3Box = Mp4Generator.box('dec3', streamInfo.mediaConfig);

    let boxName = 'ec-3';
    let sinfBox = new Uint8Array([]);
    if (Mp4Generator.isStreamEncrypted_(streamInfo.stream)) {
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
    const dopsBox = Mp4Generator.box('dOps', streamInfo.mediaConfig);

    let boxName = 'Opus';
    let sinfBox = new Uint8Array([]);
    if (Mp4Generator.isStreamEncrypted_(streamInfo.stream)) {
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
    if (streamInfo.mediaConfig.byteLength > 0) {
      esdsBox = Mp4Generator.box('esds', streamInfo.mediaConfig);
    } else {
      esdsBox = Mp4Generator.box('esds', this.esds_(streamInfo));
    }

    let boxName = 'mp4a';
    let sinfBox = new Uint8Array([]);
    if (Mp4Generator.isStreamEncrypted_(streamInfo.stream)) {
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

    const bytes = shaka.util.Mp4Generator.ESDS_TEMPLATE_.value();
    // ES_ID
    this.writeUint16_(bytes, id, 6);
    // ASC byte 1
    bytes[26] = (audioObjectType << 3) | (indexFreq >>> 1);
    // ASC byte 2
    bytes[27] = (indexFreq << 7) | (channelsCount << 3);
    return bytes;
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
    return Mp4Generator.box('mvex', ...trexArrays);
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
    const bytes = Mp4Generator.TREX_TEMPLATE_.value();
    this.writeUint32_(bytes, id, 4);
    return Mp4Generator.box('trex', bytes);
  }

  /**
   * Generate a PSSH box
   *
   * @param {!shaka.extern.Stream} stream
   * @return {!Uint8Array}
   */
  psshs(stream) {
    const initDatas = [];
    if (!shaka.util.Mp4Generator.isStreamEncrypted_(stream)) {
      return new Uint8Array([]);
    }

    for (const drmInfo of stream.drmInfos) {
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
    const BOX_HEADER_SIZE = Mp4Generator.BOX_HEADER_SIZE_;
    const box = Mp4Generator.allocBox('frma', 4);
    this.writeUint32_(box, this.stringToCharCode_(codec), BOX_HEADER_SIZE);
    return box;
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
    const bytes = Mp4Generator.SCHM_TEMPLATE_.value();
    this.writeUint32_(bytes, this.stringToCharCode_(encryptionScheme), 4);
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
    goog.asserts.assert(defaultKeyId, 'Default KID should be non-null');
    return Mp4Generator.box(
        'tenc', Mp4Generator.TENC_HEADER_.value(), defaultKeyId);
  }

  /**
   * Generate a Segment Data (MP4).
   *
   * @return {!Uint8Array}
   */
  segmentData() {
    const segmentDataArray = [];
    for (const streamInfo of this.streamInfos_) {
      segmentDataArray.push(this.moof_(streamInfo), this.mdat_(streamInfo));
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
   * Generate a MFHD box
   *
   * @param {shaka.util.Mp4Generator.StreamInfo} streamInfo
   * @return {!Uint8Array}
   * @private
   */
  mfhd_(streamInfo) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const sequenceNumber =
        streamInfo.data ? streamInfo.data.sequenceNumber : 0;
    const box = Mp4Generator.allocBox('mfhd', 8);
    // box[BOX_HEADER_SIZE_ + 0] = version 0
    // box[BOX_HEADER_SIZE_ + 1-3] = flags 0
    this.writeUint32_(box, sequenceNumber, Mp4Generator.BOX_HEADER_SIZE_ + 4);
    return box;
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
    const box = Mp4Generator.allocBox('sdtp', 4 + samples.length);
    // leave the full box header (4 bytes) all zero
    const offset = Mp4Generator.BOX_HEADER_SIZE_ + 4;
    // write the sample table
    for (let i = 0; i < samples.length; i++) {
      const flags = samples[i].flags;
      box[i + offset] = (flags.dependsOn << 4) |
          (flags.isDependedOn << 2) |
          flags.hasRedundancy;
    }
    return box;
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
    const bytes = Mp4Generator.TFHD_TEMPLATE_.value();
    this.writeUint32_(bytes, id, 4);
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
    const BOX_HEADER_SIZE = Mp4Generator.BOX_HEADER_SIZE_;
    const baseMediaDecodeTime =
        streamInfo.data ? streamInfo.data.baseMediaDecodeTime : 0;
    const upperWordBaseMediaDecodeTime =
      Math.floor(baseMediaDecodeTime / (Mp4Generator.UINT32_MAX_ + 1));
    const lowerWordBaseMediaDecodeTime =
      Math.floor(baseMediaDecodeTime % (Mp4Generator.UINT32_MAX_ + 1));
    const box = Mp4Generator.allocBox('tfdt', 12);
    box[BOX_HEADER_SIZE] = 0x01; // version 1
    // bytes[BOX_HEADER_SIZE + 1-3] = flags 0
    this.writeUint32_(box, upperWordBaseMediaDecodeTime, BOX_HEADER_SIZE + 4);
    this.writeUint32_(box, lowerWordBaseMediaDecodeTime, BOX_HEADER_SIZE + 8);
    return box;
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
    const box = Mp4Generator.allocBox('trun', bytesLen);
    offset += Mp4Generator.BOX_HEADER_SIZE_ + bytesLen;
    const isVideo = streamInfo.type === ContentType.VIDEO;

    // Header del TRUN
    // version
    box[Mp4Generator.BOX_HEADER_SIZE_] = isVideo ? 0x01 : 0x00;
    // flags
    box[Mp4Generator.BOX_HEADER_SIZE_ + 1] = 0x00;
    box[Mp4Generator.BOX_HEADER_SIZE_ + 2] = 0x0f;
    box[Mp4Generator.BOX_HEADER_SIZE_ + 3] = 0x01;
    // sample_count
    this.writeUint32_(box, samplesLength, Mp4Generator.BOX_HEADER_SIZE_ + 4);
    // data_offset
    this.writeUint32_(box, offset, Mp4Generator.BOX_HEADER_SIZE_ + 8);

    for (let i = 0; i < samplesLength; i++) {
      const sample = samples[i];
      const flags = sample.flags;
      const base = Mp4Generator.BOX_HEADER_SIZE_ + 12 + 16 * i;
      // sample_duration
      this.writeUint32_(box, sample.duration, base);
      // sample_size
      this.writeUint32_(box, sample.size, base + 4);
      // sample_flags
      box[base + 8] = (flags.isLeading << 2) | flags.dependsOn;
      box[base + 9] = (flags.isDependedOn << 6) |
          (flags.hasRedundancy << 4) | flags.isNonSync;
      box[base + 10] = flags.degradPrio & (0xf0 << 8);
      box[base + 11] = flags.degradPrio & 0x0f;
      // sample_composition_time_offset
      this.writeUint32_(box, sample.cts, base + 12);
    }
    return box;
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
    return Mp4Generator.box('mdat', ...allData);
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} value
   * @param {number} offset
   * @private
   */
  writeUint32_(bytes, value, offset) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} value
   * @param {number} offset
   * @private
   */
  writeUint16_(bytes, value, offset) {
    bytes[offset] = (value >>> 8) & 0xff;
    bytes[offset + 1] = value & 0xff;
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
    let size = 0;
    // calculate the total size of the payload
    for (const chunk of payload) {
      size += chunk.byteLength;
    }

    const result = shaka.util.Mp4Generator.allocBox(boxName, size);

    // copy the payload into the result
    let pointer = shaka.util.Mp4Generator.BOX_HEADER_SIZE_;

    for (let i = 0; i < payload.length; i++) {
      // copy payload[i] array @ offset pointer
      result.set(payload[i], pointer);
      pointer += payload[i].byteLength;
    }
    return result;
  }

  /**
   * Generate a box that can hold a payload of a given size
   *
   * @param {string} boxName
   * @param {number} payloadSize
   * @return {!Uint8Array}
   */
  static allocBox(boxName, payloadSize) {
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
    // calculate the total size we need to allocate
    const size = shaka.util.Mp4Generator.BOX_HEADER_SIZE_ + payloadSize;

    const result = new Uint8Array(size);
    result[0] = (size >> 24) & 0xff;
    result[1] = (size >> 16) & 0xff;
    result[2] = (size >> 8) & 0xff;
    result[3] = size & 0xff;
    result.set(type, 4);

    return result;
  }

  /**
   * @param {!shaka.extern.Stream} stream
   * @return {boolean}
   * @private
   */
  static isStreamEncrypted_(stream) {
    return stream.encrypted && stream.drmInfos.length > 0;
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
 * @const {number}
 */
shaka.util.Mp4Generator.BOX_HEADER_SIZE_ = 8;

/**
 * Template MVHD (version 1, 112 bytes).
 * Dynamic fields: timescale [20], upperDur [24], lowerDur [28].
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.MVHD_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x01, 0x00, 0x00, 0x00, // version 1, flags
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, // creation_time
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, // modification_time
      0x00, 0x00, 0x00, 0x00, // timescale         [20]
      0x00, 0x00, 0x00, 0x00, // upperWordDuration [24]
      0x00, 0x00, 0x00, 0x00, // lowerWordDuration [28]
      0x00, 0x01, 0x00, 0x00, // rate 1.0
      0x01, 0x00, // volume 1.0
      0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00, // reserved
      // unity matrix
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x40, 0x00, 0x00, 0x00,
      // pre_defined (24 bytes, todos cero)
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xff, 0xff, 0xff, // next_track_ID
    ]));

/**
 * Template TKHD (version 1, 96 bytes).
 * Dynamic fields: track_ID [20], upperDur [28], lowerDur [32],
 *                   width [88] (uint16), height [92] (uint16).
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.TKHD_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x01, 0x00, 0x00, 0x07, // version 1, flags
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, // creation_time
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, // modification_time
      0x00, 0x00, 0x00, 0x00, // track_ID          [20]
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00, // upperWordDuration [28]
      0x00, 0x00, 0x00, 0x00, // lowerWordDuration [32]
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x00, // layer
      0x00, 0x00, // alternate_group
      0x00, 0x00, // non-audio track volume
      0x00, 0x00, // reserved
      // unity matrix
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x40, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // width  [88]
      0x00, 0x00, 0x00, 0x00, // height [92]
    ]));

/**
 * Template MDHD (version 1, 36 bytes).
 * Dynamic fields: timescale [20], upperDur [24], lowerDur [28],
 *                   language [32] (uint16).
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.MDHD_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x01, 0x00, 0x00, 0x00, // version 1, flags
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, // creation_time
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, // modification_time
      0x00, 0x00, 0x00, 0x00, // timescale         [20]
      0x00, 0x00, 0x00, 0x00, // upperWordDuration [24]
      0x00, 0x00, 0x00, 0x00, // lowerWordDuration [28]
      0x00, 0x00, // language          [32]
      0x00, 0x00, // pre_defined
    ]));

/**
 * Template TREX (24 bytes).
 * Dynamic field: track_ID [4].
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.TREX_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, 0x00, 0x00, 0x00, // version 0, flags
      0x00, 0x00, 0x00, 0x00, // track_ID                        [4]
      0x00, 0x00, 0x00, 0x01, // default_sample_description_index
      0x00, 0x00, 0x00, 0x00, // default_sample_duration
      0x00, 0x00, 0x00, 0x00, // default_sample_size
      0x00, 0x00, 0x00, 0x00, // default_sample_flags
    ]));

/**
 * Template TFHD (24 bytes).
 * Dynamic field: track_ID [4].
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.TFHD_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, 0x00, 0x00, 0x3a, // version 0, flags
      0x00, 0x00, 0x00, 0x00, // track_ID                 [4]
      0x00, 0x00, 0x00, 0x01, // sample_description_index
      0x00, 0x00, 0x00, 0x00, // default_sample_duration
      0x00, 0x00, 0x00, 0x00, // default_sample_size
      0x00, 0x00, 0x00, 0x00, // default_sample_flags
    ]));

/**
 * Template ESDS (31 bytes).
 * Dynamic fields: ES_ID [6] (uint16), ASC byte1 [26], ASC byte2 [27].
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.ESDS_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, 0x00, 0x00, 0x00, // version 0, flags
      0x03, // tag: ES_DescriptionTag
      0x19, // length: 25
      0x00, 0x00, // ES_ID            [6]
      0x00, // streamDependenceFlag / URL_flag / priority
      0x04, // tag: DecoderConfigDescriptionTag
      0x11, // length: 17
      0x40, // object type: Audio ISO/IEC 14496-3
      0x15, // streamType: AudioStream
      0x00, 0x00, 0x00, // bufferSizeDB
      0x00, 0x00, 0x00, 0x00, // maxBitrate
      0x00, 0x00, 0x00, 0x00, // avgBitrate
      0x05, // tag: DecoderSpecificInfoTag
      0x02, // length: 2
      0x00, // AudioSpecificConfig byte 1 [26]
      0x00, // AudioSpecificConfig byte 2 [27]
      0x06, 0x01, 0x02, // GASpecificConfig
    ]));

/**
 * Template for mp3_, ac3_, ec3_, opus_, mp4a_ (28 bytes).
 * Dynamic fields: channelsCount [17] (uint8),
 *                   audioSamplingRate [24] (uint16).
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.AUDIO_STSD_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, 0x00, 0x00, // reserved
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, // padding
      0x00, // channelsCount    [17]
      0x00, 0x10, // sampleSize: 16 bits
      0x00, 0x00, 0x00, 0x00, // reserved2
      0x00, 0x00, // audioSamplingRate [24]
      0x00, 0x00,
    ]));

/**
 * Template for avc1_ and hvc1_ (78 bytes).
 * Dynamic fields: width [24] (uint16), height [26] (uint16).
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.VIDEO_SAMPLE_ENTRY_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, // pre_defined
      0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // pre_defined
      0x00, 0x00, // width  [24]
      0x00, 0x00, // height [26]
      0x00, 0x48, 0x00, 0x00, // horizontal resolution 72 dpi
      0x00, 0x48, 0x00, 0x00, // vertical resolution 72 dpi
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // frame_count
      // compressor name (32 bytes)
      0x13,
      0x76, 0x69, 0x64, 0x65,
      0x6f, 0x6a, 0x73, 0x2d,
      0x63, 0x6f, 0x6e, 0x74,
      0x72, 0x69, 0x62, 0x2d,
      0x68, 0x6c, 0x73, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00,
      0x00, 0x18, // depth = 24
      0x11, 0x11, // pre_defined = -1
    ]));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.TENC_HEADER_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, // version 0
      0x00, 0x00, 0x00, // flags
      0x00, 0x00, // reserved fields
      0x01, // default_isProtected: true
      0x08, // default_Per_Sample_IV_Size: 8
    ]));

/**
 * Template SCHM (12 bytes).
 * Dynamic field: schemeNumber [4] (uint32).
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.SCHM_TEMPLATE_ =
    new shaka.util.Lazy(() => new Uint8Array([
      0x00, 0x00, 0x00, 0x00, // version 0, flags
      0x00, 0x00, 0x00, 0x00, // scheme type [4]
      0x00, 0x01, 0x00, 0x00, // scheme version: 1.0
    ]));

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
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STTS_BOX_ = new shaka.util.Lazy(
    () => shaka.util.Mp4Generator.box(
        'stts', shaka.util.Mp4Generator.STTS_.value()));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STSC_BOX_ = new shaka.util.Lazy(
    () => shaka.util.Mp4Generator.box(
        'stsc', shaka.util.Mp4Generator.STSC_.value()));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STSZ_BOX_ = new shaka.util.Lazy(
    () => shaka.util.Mp4Generator.box(
        'stsz', shaka.util.Mp4Generator.STSZ_.value()));

/**
 * @private {!shaka.util.Lazy<!Uint8Array>}
 */
shaka.util.Mp4Generator.STCO_BOX_ = new shaka.util.Lazy(
    () => shaka.util.Mp4Generator.box(
        'stco', shaka.util.Mp4Generator.STCO_.value()));

/**
 * @typedef {{
 *   id: number,
 *   type: string,
 *   codecs: string,
 *   timescale: number,
 *   duration: number,
 *   mediaConfig: !Uint8Array,
 *   hSpacing: (number|undefined),
 *   vSpacing: (number|undefined),
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
 * @property {number} timescale
 *   The Stream's timescale.
 * @property {number} duration
 *   The Stream's duration.
 * @property {!Uint8Array} mediaConfig
 *   The stream's media config.
 * @property {number|undefined} hSpacing
 *   The stream's video horizontal spacing of pixels.
 * @property {number|undefined} vSpacing
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
