/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TsTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.Ac3');
goog.require('shaka.transmuxer.ADTS');
goog.require('shaka.transmuxer.Ec3');
goog.require('shaka.transmuxer.H264');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.TsParser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.TsTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {number} */
    this.frameIndex_ = 0;

    /** @private {!Map.<number, !Uint8Array>} */
    this.initSegments = new Map();

    /** @private {?shaka.util.TsParser} */
    this.tsParser_ = null;
  }


  /**
   * @override
   * @export
   */
  destroy() {
    this.initSegments.clear();
  }


  /**
   * Check if the mime type and the content type is supported.
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    const Capabilities = shaka.media.Capabilities;

    if (!this.isTsContainer_(mimeType)) {
      return false;
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;

    const codecs = MimeUtils.getCodecs(mimeType);
    const allCodecs = MimeUtils.splitCodecs(codecs);

    const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, allCodecs);
    const videoCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, allCodecs);

    // We don't support muxed content yet.
    if (audioCodec && videoCodec) {
      return false;
    }

    const TsTransmuxer = shaka.transmuxer.TsTransmuxer;

    if (audioCodec) {
      const normalizedCodec = MimeUtils.getNormalizedCodec(audioCodec);
      if (!TsTransmuxer.SUPPORTED_AUDIO_CODECS_.includes(normalizedCodec)) {
        return false;
      }
    }

    if (videoCodec) {
      const normalizedCodec = MimeUtils.getNormalizedCodec(videoCodec);
      if (!TsTransmuxer.SUPPORTED_VIDEO_CODECS_.includes(normalizedCodec)) {
        return false;
      }
    }

    if (contentType) {
      return Capabilities.isTypeSupported(
          this.convertCodecs(contentType, mimeType));
    }

    const audioMime = this.convertCodecs(ContentType.AUDIO, mimeType);
    const videoMime = this.convertCodecs(ContentType.VIDEO, mimeType);
    return Capabilities.isTypeSupported(audioMime) ||
        Capabilities.isTypeSupported(videoMime);
  }


  /**
   * Check if the mimetype is 'video/mp2t'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isTsContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'video/mp2t';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isTsContainer_(mimeType)) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      const codecs = shaka.util.MimeUtils.getCodecs(mimeType);
      if (contentType == ContentType.AUDIO) {
        return `audio/mp4; codecs="${codecs}"`;
      }
      return `video/mp4; codecs="${codecs}"`;
    }
    return mimeType;
  }


  /**
   * @override
   * @export
   */
  getOrginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * @override
   * @export
   */
  transmux(data, stream, reference, duration) {
    if (!this.tsParser_) {
      this.tsParser_ = new shaka.util.TsParser();
    } else {
      this.tsParser_.clearData();
    }
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    let timestamp = reference.endTime * 1000;

    const tsParser = this.tsParser_.parse(uint8ArrayData);
    const startTime = tsParser.getStartTime();

    if (startTime.audio != null) {
      timestamp = startTime.audio;
    }
    if (startTime.video != null) {
      timestamp = startTime.video;
    }
    let streamInfo;
    const codecs = tsParser.getCodecs();
    try {
      switch (codecs.audio) {
        case 'aac':
          streamInfo =
            this.getAacStreamInfo_(tsParser, timestamp, stream, duration);
          break;
        case 'ac3':
          streamInfo =
            this.getAc3treamInfo_(tsParser, timestamp, stream, duration);
          break;
        case 'ec3':
          streamInfo =
            this.getEc3treamInfo_(tsParser, timestamp, stream, duration);
          break;
      }
      switch (codecs.video) {
        case 'avc':
          streamInfo =
            this.getAvctreamInfo_(tsParser, timestamp, stream, duration);
          break;
      }
    } catch (e) {
      return Promise.reject(e);
    }

    if (!streamInfo) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED));
    }

    const mp4Generator = new shaka.util.Mp4Generator(streamInfo);
    let initSegment;
    if (!this.initSegments.has(stream.id)) {
      initSegment = mp4Generator.initSegment();
      this.initSegments.set(stream.id, initSegment);
    } else {
      initSegment = this.initSegments.get(stream.id);
    }
    const segmentData = mp4Generator.segmentData();

    this.frameIndex_++;
    const transmuxData = Uint8ArrayUtils.concat(initSegment, segmentData);
    return Promise.resolve(transmuxData);
  }


  /**
   * @param {shaka.util.TsParser} tsParser
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAacStreamInfo_(tsParser, timestamp, stream, duration) {
    const ADTS = shaka.transmuxer.ADTS;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    let info;

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      if (!data) {
        continue;
      }
      let offset = 0;
      info = ADTS.parseInfo(data, offset);
      if (!info) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
      }
      stream.audioSamplingRate = info.sampleRate;
      stream.channelsCount = info.channelCount;
      stream.codecs = info.codec;
      stream.type = 'audio';

      while (offset < data.length) {
        const header = ADTS.parseHeader(data, offset);
        if (!header) {
          offset++;
          continue;
        }
        const length = header.headerLength + header.frameLength;
        if (offset + length <= data.length) {
          const frameData = data.subarray(
              offset + header.headerLength, offset + length);

          samples.push({
            data: frameData,
            size: header.frameLength,
            duration: ADTS.AAC_SAMPLES_PER_FRAME,
            cts: 0,
            flags: {
              isLeading: 0,
              isDependedOn: 0,
              hasRedundancy: 0,
              degradPrio: 0,
              dependsOn: 2,
              isNonSync: 0,
            },
          });
        }
        offset += length;
      }
    }

    if (!info) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED);
    }

    /** @type {number} */
    const sampleRate = info.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

    return {
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: new Uint8Array([]),
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
  }


  /**
   * @param {shaka.util.TsParser} tsParser
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAc3treamInfo_(tsParser, timestamp, stream, duration) {
    const Ac3 = shaka.transmuxer.Ac3;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      let offset = 0;
      while (offset < data.length) {
        const frame = Ac3.parseFrame(data, offset);
        if (!frame) {
          offset++;
          continue;
        }
        stream.audioSamplingRate = frame.sampleRate;
        stream.channelsCount = frame.channelCount;
        sampleRate = frame.sampleRate;
        audioConfig = frame.audioConfig;

        const frameData = data.subarray(
            offset, offset + frame.frameLength);

        samples.push({
          data: frameData,
          size: frame.frameLength,
          duration: Ac3.AC3_SAMPLES_PER_FRAME,
          cts: 0,
          flags: {
            isLeading: 0,
            isDependedOn: 0,
            hasRedundancy: 0,
            degradPrio: 0,
            dependsOn: 2,
            isNonSync: 0,
          },
        });
        offset += frame.frameLength;
      }
    }

    if (sampleRate == 0 || audioConfig.byteLength == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED);
    }


    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

    return {
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: audioConfig,
      videoConfig: new Uint8Array([]),
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
  }


  /**
   * @param {shaka.util.TsParser} tsParser
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getEc3treamInfo_(tsParser, timestamp, stream, duration) {
    const Ec3 = shaka.transmuxer.Ec3;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      let offset = 0;
      while (offset < data.length) {
        const frame = Ec3.parseFrame(data, offset);
        if (!frame) {
          offset++;
          continue;
        }
        stream.audioSamplingRate = frame.sampleRate;
        stream.channelsCount = frame.channelCount;
        sampleRate = frame.sampleRate;
        audioConfig = frame.audioConfig;

        const frameData = data.subarray(
            offset, offset + frame.frameLength);

        samples.push({
          data: frameData,
          size: frame.frameLength,
          duration: Ec3.EC3_SAMPLES_PER_FRAME,
          cts: 0,
          flags: {
            isLeading: 0,
            isDependedOn: 0,
            hasRedundancy: 0,
            degradPrio: 0,
            dependsOn: 2,
            isNonSync: 0,
          },
        });
        offset += frame.frameLength;
      }
    }

    if (sampleRate == 0 || audioConfig.byteLength == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED);
    }


    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

    return {
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: audioConfig,
      videoConfig: new Uint8Array([]),
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
  }


  /**
   * @param {shaka.util.TsParser} tsParser
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAvctreamInfo_(tsParser, timestamp, stream, duration) {
    const H264 = shaka.transmuxer.H264;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {?number} */
    let baseMediaDecodeTime = null;

    let nalus = [];
    const videoData = tsParser.getVideoData().filter((pes) => {
      return pes.pts != null && pes.dts != null;
    });
    for (let i = 0; i < videoData.length; i++) {
      const pes = videoData[i];
      let nextPes;
      if (i + 1 < videoData.length) {
        nextPes = videoData[i + 1];
      }
      const dataNalus = tsParser.parseAvcNalus(pes, nextPes);
      nalus = nalus.concat(dataNalus);
      const frame = H264.parseFrame(dataNalus);
      if (!frame) {
        continue;
      }
      if (baseMediaDecodeTime == null && pes.dts != null) {
        baseMediaDecodeTime = pes.dts;
      }
      let duration;
      if (i + 1 < videoData.length) {
        duration = (videoData[i + 1].dts || 0) - (pes.dts || 0);
      } else {
        duration = (pes.dts || 0) - (videoData[i - 1].dts || 0);
      }
      samples.push({
        data: frame.data,
        size: frame.data.byteLength,
        duration: duration,
        cts: Math.round((pes.pts || 0) - (pes.dts || 0)),
        flags: {
          isLeading: 0,
          isDependedOn: 0,
          hasRedundancy: 0,
          degradPrio: 0,
          dependsOn: frame.isKeyframe ? 2 : 1,
          isNonSync: frame.isKeyframe ? 0 : 1,
        },
      });
    }

    const info = H264.parseInfo(nalus);

    if (!info || baseMediaDecodeTime == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED);
    }
    stream.height = info.height;
    stream.width = info.width;

    return {
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: timescale,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: info.videoConfig,
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime: baseMediaDecodeTime,
        samples: samples,
      },
      stream: stream,
    };
  }
};

/**
 * Supported audio codecs.
 *
 * @private
 * @const {!Array.<string>}
 */
shaka.transmuxer.TsTransmuxer.SUPPORTED_AUDIO_CODECS_ = [
  'aac',
  'ac-3',
  'ec-3',
];

/**
 * Supported audio codecs.
 *
 * @private
 * @const {!Array.<string>}
 */
shaka.transmuxer.TsTransmuxer.SUPPORTED_VIDEO_CODECS_ = [
  'avc',
];


shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'video/mp2t',
    () => new shaka.transmuxer.TsTransmuxer('video/mp2t'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.PREFERRED);
