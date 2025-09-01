/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TsTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.AacTransmuxer');
goog.require('shaka.transmuxer.Ac3');
goog.require('shaka.transmuxer.ADTS');
goog.require('shaka.transmuxer.Ec3');
goog.require('shaka.transmuxer.H264');
goog.require('shaka.transmuxer.H265');
goog.require('shaka.transmuxer.MpegAudio');
goog.require('shaka.transmuxer.Opus');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.TsParser');
goog.require('shaka.util.Uint8ArrayUtils');

goog.requireType('shaka.media.SegmentReference');


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

    /** @private {!Map<string, !Uint8Array>} */
    this.initSegments = new Map();

    /** @private {?shaka.util.TsParser} */
    this.tsParser_ = null;

    /** @private {?shaka.transmuxer.AacTransmuxer} */
    this.aacTransmuxer_ = null;

    /** @private {?Uint8Array} */
    this.lastInitSegment_ = null;
  }


  /**
   * @override
   * @export
   */
  destroy() {
    this.initSegments.clear();

    if (this.aacTransmuxer_) {
      this.aacTransmuxer_.destroy();
    }
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

    let convertedMimeType = mimeType;
    if (contentType) {
      convertedMimeType = this.convertCodecs(contentType, mimeType);
    }
    const codecs = MimeUtils.getCodecs(convertedMimeType);
    const allCodecs = MimeUtils.splitCodecs(codecs);

    const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, allCodecs);
    const videoCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, allCodecs);

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
      const StreamUtils = shaka.util.StreamUtils;
      // The replace it's necessary because Firefox(the only browser that
      // supports MP3 in MP4) only support the MP3 codec with the mp3 string.
      // MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.34"') -> false
      // MediaSource.isTypeSupported('audio/mp4; codecs="mp3"') -> true
      const codecs = shaka.util.MimeUtils.getCodecs(mimeType)
          .replace('mp4a.40.34', 'mp3').split(',')
          .map((codecs) => {
            return StreamUtils.getCorrectAudioCodecs(codecs, 'audio/mp4');
          })
          .map(StreamUtils.getCorrectVideoCodecs).join(',');
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
  getOriginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * @override
   * @export
   */
  transmux(data, stream, reference, duration, contentType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    if (contentType == ContentType.AUDIO &&
        !shaka.util.TsParser.probe(uint8ArrayData)) {
      const id3Data = shaka.util.Id3Utils.getID3Data(uint8ArrayData);
      let offset = id3Data.length;
      for (; offset < uint8ArrayData.length; offset++) {
        if (shaka.transmuxer.MpegAudio.probe(uint8ArrayData, offset)) {
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MEDIA,
              shaka.util.Error.Code.TRANSMUXING_FAILED,
              reference ? reference.getUris()[0] : null));
        }
      }
      offset = id3Data.length;
      for (; offset < uint8ArrayData.length; offset++) {
        if (shaka.transmuxer.ADTS.probe(uint8ArrayData, offset)) {
          if (!this.aacTransmuxer_) {
            this.aacTransmuxer_ =
                new shaka.transmuxer.AacTransmuxer('audio/aac');
          }
          return this.aacTransmuxer_
              .transmux(data, stream, reference, duration, contentType);
        }
      }
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null));
    }

    if (!this.tsParser_) {
      this.tsParser_ = new shaka.util.TsParser();
    } else {
      this.tsParser_.clearData();
    }
    this.tsParser_.setDiscontinuitySequence(reference.discontinuitySequence);

    const tsParser = this.tsParser_.parse(uint8ArrayData);
    const streamInfos = [];
    const codecs = tsParser.getCodecs();
    try {
      let streamInfo = null;
      if (contentType == ContentType.VIDEO) {
        switch (codecs.video) {
          case 'avc':
            streamInfo =
              this.getAvcStreamInfo_(tsParser, stream, duration, reference);
            break;
          case 'hvc':
            streamInfo =
              this.getHvcStreamInfo_(tsParser, stream, duration, reference);
            break;
        }
        if (streamInfo) {
          streamInfos.push(streamInfo);
          streamInfo = null;
        }
      }
      if (contentType == ContentType.AUDIO) {
        switch (codecs.audio) {
          case 'aac':
            streamInfo =
              this.getAacStreamInfo_(tsParser, stream, duration, reference);
            break;
          case 'ac3':
            streamInfo =
              this.getAc3StreamInfo_(tsParser, stream, duration, reference);
            break;
          case 'ec3':
            streamInfo =
              this.getEc3StreamInfo_(tsParser, stream, duration, reference);
            break;
          case 'mp3':
            streamInfo =
              this.getMp3StreamInfo_(tsParser, stream, duration, reference);
            break;
          case 'opus':
            streamInfo =
              this.getOpusStreamInfo_(tsParser, stream, duration, reference);
            break;
        }
        if (streamInfo) {
          streamInfos.push(streamInfo);
          streamInfo = null;
        }
      }
    } catch (e) {
      if (e && e.code == shaka.util.Error.Code.TRANSMUXING_NO_VIDEO_DATA) {
        return Promise.resolve(new Uint8Array([]));
      }
      return Promise.reject(e);
    }

    if (!streamInfos.length) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null));
    }

    const mp4Generator = new shaka.util.Mp4Generator(streamInfos);
    let initSegment;
    const initSegmentKey = stream.id + '_' + reference.discontinuitySequence;
    if (!this.initSegments.has(initSegmentKey)) {
      initSegment = mp4Generator.initSegment();
      this.initSegments.set(initSegmentKey, initSegment);
    } else {
      initSegment = this.initSegments.get(initSegmentKey);
    }
    const appendInitSegment = this.lastInitSegment_ !== initSegment;
    const segmentData = mp4Generator.segmentData();
    this.lastInitSegment_ = initSegment;
    this.frameIndex_++;
    return Promise.resolve({
      data: segmentData,
      init: appendInitSegment ? initSegment : null,
    });
  }


  /**
   * @param {shaka.util.TsParser} tsParser
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAacStreamInfo_(tsParser, stream, duration, reference) {
    const ADTS = shaka.transmuxer.ADTS;
    const timescale = shaka.util.TsParser.Timescale;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    let info;

    let firstPts = null;

    /** @type {?number} */
    let nextStartOffset = null;
    /** @type {?Uint8Array} */
    let overflowBytes = null;

    for (const audioData of tsParser.getAudioData()) {
      let data = audioData.data;
      if (!data) {
        continue;
      }
      let offset = 0;
      if (nextStartOffset == -1 && overflowBytes) {
        data = Uint8ArrayUtils.concat(overflowBytes, audioData.data);
        nextStartOffset = null;
      } else if (nextStartOffset != null && overflowBytes) {
        offset = Math.max(0, nextStartOffset);
        const missingFrameData =
            Uint8ArrayUtils.concat(overflowBytes, data.subarray(0, offset));
        samples.push({
          data: missingFrameData,
          size: missingFrameData.byteLength,
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
        overflowBytes = null;
        nextStartOffset = null;
      }
      info = ADTS.parseInfo(data, offset);
      if (!info) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED,
            reference ? reference.getUris()[0] : null);
      }
      stream.audioSamplingRate = info.sampleRate;
      stream.channelsCount = info.channelCount;
      if (firstPts == null && audioData.pts !== null) {
        firstPts = audioData.pts;
      }
      while (offset < data.length) {
        const header = ADTS.parseHeader(data, offset);
        if (!header) {
          overflowBytes = data.subarray(offset, data.length);
          nextStartOffset = -1;
          break;
        }
        const length = header.headerLength + header.frameLength;
        nextStartOffset = Math.max(0, offset + length - data.length);
        if (nextStartOffset != 0) {
          overflowBytes = data.subarray(
              offset + header.headerLength, offset + length);
        } else if (offset + length <= data.length) {
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

    if (!info || firstPts == null) {
      firstPts = reference.startTime * timescale;

      const allCodecs = shaka.util.MimeUtils.splitCodecs(stream.codecs);
      const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
          shaka.util.ManifestParserUtils.ContentType.AUDIO, allCodecs);
      if (!audioCodec || !stream.channelsCount || !stream.audioSamplingRate) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED,
            reference ? reference.getUris()[0] : null);
      }
      info = {
        sampleRate: stream.audioSamplingRate,
        channelCount: stream.channelsCount,
        codec: audioCodec,
      };
      const silenceFrame =
          ADTS.getSilentFrame(audioCodec, stream.channelsCount);
      if (!silenceFrame) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED,
            reference ? reference.getUris()[0] : null);
      }
      const segmentDuration =
          (reference.endTime - reference.startTime) * timescale;
      const finalPTs = firstPts + segmentDuration;
      let currentPts = firstPts;
      while (currentPts < finalPTs) {
        samples.push({
          data: silenceFrame,
          size: silenceFrame.byteLength,
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
        currentPts += ADTS.AAC_SAMPLES_PER_FRAME / info.sampleRate * timescale;
      }
    }

    /** @type {number} */
    const sampleRate = info.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = firstPts / timescale * sampleRate;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: info.codec,
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: new Uint8Array([]),
      hSpacing: 0,
      vSpacing: 0,
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
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAc3StreamInfo_(tsParser, stream, duration, reference) {
    const Ac3 = shaka.transmuxer.Ac3;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    let firstPts = null;

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      if (firstPts == null && audioData.pts !== null) {
        firstPts = audioData.pts;
      }
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

    if (sampleRate == 0 || audioConfig.byteLength == 0 || firstPts == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }


    /** @type {number} */
    const baseMediaDecodeTime = firstPts / timescale * sampleRate;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: 'ac-3',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: audioConfig,
      videoConfig: new Uint8Array([]),
      hSpacing: 0,
      vSpacing: 0,
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
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getEc3StreamInfo_(tsParser, stream, duration, reference) {
    const Ec3 = shaka.transmuxer.Ec3;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    let firstPts = null;

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      if (firstPts == null && audioData.pts !== null) {
        firstPts = audioData.pts;
      }
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

    if (sampleRate == 0 || audioConfig.byteLength == 0 || firstPts == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }


    /** @type {number} */
    const baseMediaDecodeTime = firstPts / timescale * sampleRate;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: 'ec-3',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: audioConfig,
      videoConfig: new Uint8Array([]),
      hSpacing: 0,
      vSpacing: 0,
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
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getMp3StreamInfo_(tsParser, stream, duration, reference) {
    const MpegAudio = shaka.transmuxer.MpegAudio;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    let firstHeader;

    let firstPts = null;

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      if (!data) {
        continue;
      }
      if (firstPts == null && audioData.pts !== null) {
        firstPts = audioData.pts;
      }
      let offset = 0;
      while (offset < data.length) {
        const header = MpegAudio.parseHeader(data, offset);
        if (!header) {
          offset++;
          continue;
        }
        if (!firstHeader) {
          firstHeader = header;
        }
        if (offset + header.frameLength <= data.length) {
          samples.push({
            data: data.subarray(offset, offset + header.frameLength),
            size: header.frameLength,
            duration: MpegAudio.MPEG_AUDIO_SAMPLE_PER_FRAME,
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
        offset += header.frameLength;
      }
    }
    if (!firstHeader || firstPts == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }
    /** @type {number} */
    const sampleRate = firstHeader.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = firstPts / timescale * sampleRate;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: 'mp3',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: new Uint8Array([]),
      hSpacing: 0,
      vSpacing: 0,
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
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getOpusStreamInfo_(tsParser, stream, duration, reference) {
    const Opus = shaka.transmuxer.Opus;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    let firstPts = null;

    /** @type {?shaka.util.TsParser.OpusMetadata} */
    const opusMetadata = tsParser.getOpusMetadata();

    if (!opusMetadata) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }

    /** @type {!Uint8Array} */
    const audioConfig = Opus.getAudioConfig(opusMetadata);

    /** @type {number} */
    const sampleRate = opusMetadata.sampleRate;

    for (const audioData of tsParser.getAudioData()) {
      const data = audioData.data;
      if (firstPts == null && audioData.pts !== null) {
        firstPts = audioData.pts;
      }
      let offset = 0;
      while (offset < data.length) {
        const opusPendingTrimStart = (data[offset + 1] & 0x10) !== 0;
        const trimEnd = (data[offset + 1] & 0x08) !== 0;
        let index = offset + 2;
        let size = 0;

        while (data[index] === 0xFF) {
          size += 255;
          index += 1;
        }
        size += data[index];
        index += 1;
        index += opusPendingTrimStart ? 2 : 0;
        index += trimEnd ? 2 : 0;

        const sample = data.slice(index, index + size);

        samples.push({
          data: sample,
          size: sample.byteLength,
          duration: Opus.OPUS_AUDIO_SAMPLE_PER_FRAME,
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
        offset = index + size;
      }
    }

    if (audioConfig.byteLength == 0 || firstPts == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }

    stream.audioSamplingRate = opusMetadata.sampleRate;
    stream.channelsCount = opusMetadata.channelCount;


    /** @type {number} */
    const baseMediaDecodeTime = firstPts / timescale * sampleRate;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: 'opus',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: sampleRate,
      duration: duration,
      videoNalus: [],
      audioConfig: audioConfig,
      videoConfig: new Uint8Array([]),
      hSpacing: 0,
      vSpacing: 0,
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
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAvcStreamInfo_(tsParser, stream, duration, reference) {
    const H264 = shaka.transmuxer.H264;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {?number} */
    let baseMediaDecodeTime = null;

    const videoData = tsParser.getVideoData();
    const videoSamples = H264.getVideoSamples(videoData);
    if (!videoSamples.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_NO_VIDEO_DATA,
          reference ? reference.getUris()[0] : null);
    }
    for (let i = 0; i < videoSamples.length; i++) {
      const videoSample = videoSamples[i];
      if (baseMediaDecodeTime == null) {
        baseMediaDecodeTime = videoSample.dts;
      }
      let duration;
      if (i + 1 < videoSamples.length) {
        duration = (videoSamples[i + 1].dts || 0) - (videoSample.dts || 0);
      } else if (videoSamples.length > 1) {
        duration = (videoSample.dts || 0) - (videoSamples[i - 1].dts || 0);
      } else {
        duration = (reference.endTime - reference.startTime) * timescale;
      }
      samples.push({
        data: videoSample.data,
        size: videoSample.data.byteLength,
        duration: duration,
        cts: Math.round((videoSample.pts || 0) - (videoSample.dts || 0)),
        flags: {
          isLeading: 0,
          isDependedOn: 0,
          hasRedundancy: 0,
          degradPrio: 0,
          dependsOn: videoSample.isKeyframe ? 2 : 1,
          isNonSync: videoSample.isKeyframe ? 0 : 1,
        },
      });
    }

    const nalus = [];
    for (const pes of videoData) {
      nalus.push(...pes.nalus);
    }
    const info = H264.parseInfo(nalus);

    if (!info || baseMediaDecodeTime == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }
    stream.height = info.height;
    stream.width = info.width;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      codecs: 'avc1',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: timescale,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: info.videoConfig,
      hSpacing: info.hSpacing,
      vSpacing: info.vSpacing,
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
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getHvcStreamInfo_(tsParser, stream, duration, reference) {
    const H265 = shaka.transmuxer.H265;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {?number} */
    let baseMediaDecodeTime = null;

    const nalus = [];
    const videoData = tsParser.getVideoData();
    if (!videoData.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_NO_VIDEO_DATA,
          reference ? reference.getUris()[0] : null);
    }
    for (let i = 0; i < videoData.length; i++) {
      const pes = videoData[i];
      const dataNalus = pes.nalus;
      nalus.push(...dataNalus);
      const frame = H265.parseFrame(dataNalus);
      if (!frame) {
        continue;
      }
      if (baseMediaDecodeTime == null && pes.dts != null) {
        baseMediaDecodeTime = pes.dts;
      }
      let duration;
      if (i + 1 < videoData.length) {
        duration = (videoData[i + 1].dts || 0) - (pes.dts || 0);
      } else if (videoData.length > 1) {
        duration = (pes.dts || 0) - (videoData[i - 1].dts || 0);
      } else {
        duration = (reference.endTime - reference.startTime) * timescale;
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

    const info = H265.parseInfo(nalus);

    if (!info || baseMediaDecodeTime == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          reference ? reference.getUris()[0] : null);
    }
    stream.height = info.height;
    stream.width = info.width;

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      codecs: 'hvc1',
      encrypted: stream.encrypted && stream.drmInfos.length > 0,
      timescale: timescale,
      duration: duration,
      videoNalus: [],
      audioConfig: new Uint8Array([]),
      videoConfig: info.videoConfig,
      hSpacing: info.hSpacing,
      vSpacing: info.vSpacing,
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
 * @const {!Array<string>}
 */
shaka.transmuxer.TsTransmuxer.SUPPORTED_AUDIO_CODECS_ = [
  'aac',
  'ac-3',
  'ec-3',
  'mp3',
  'opus',
];

/**
 * Supported audio codecs.
 *
 * @private
 * @const {!Array<string>}
 */
shaka.transmuxer.TsTransmuxer.SUPPORTED_VIDEO_CODECS_ = [
  'avc',
  'hevc',
];


shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'video/mp2t',
    () => new shaka.transmuxer.TsTransmuxer('video/mp2t'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.PREFERRED);
