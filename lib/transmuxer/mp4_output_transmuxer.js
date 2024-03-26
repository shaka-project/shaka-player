/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Mp4OutputTransmuxer');

goog.require('shaka.transmuxer.ADTS');
goog.require('shaka.transmuxer.Ac3');
goog.require('shaka.transmuxer.Ec3');
goog.require('shaka.transmuxer.H264');
goog.require('shaka.transmuxer.H265');
goog.require('shaka.transmuxer.MpegAudio');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.TsParser');
goog.require('shaka.util.Uint8ArrayUtils');

goog.requireType('shaka.media.SegmentReference');


/**
 * MP4 output transmuxer
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.transmuxer.Mp4OutputTransmuxer = class {
  /**
   * @param {!shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT} inputFormat
   */
  constructor(inputFormat) {
    /** @private {!shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT} */
    this.inputFormat_ = inputFormat;

    /** @private {number} */
    this.frameIndex_ = 0;

    /** @private {!Map.<number, !Uint8Array>} */
    this.initSegments = new Map();

    /** @private {?shaka.util.TsParser} */
    this.tsParser_ = null;
  }

  /** @override */
  release() {
    this.initSegments.clear();
  }

  /**
   * @param {BufferSource} data
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @param {number} duration
   * @param {string} contentType
   * @return {!Promise.<!Uint8Array>}
   */
  transmux(data, stream, reference, duration, contentType) {
    const ADTS = shaka.transmuxer.ADTS;
    const MpegAudio = shaka.transmuxer.MpegAudio;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const INPUT_FORMAT = shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    let timestamp = reference.endTime * 1000;
    const id3Data = shaka.util.Id3Utils.getID3Data(uint8ArrayData);
    const frames = shaka.util.Id3Utils.getID3Frames(id3Data);
    if (frames.length && reference) {
      const metadataTimestamp = frames.find((frame) => {
        return frame.description ===
            'com.apple.streaming.transportStreamTimestamp';
      });
      if (metadataTimestamp) {
        timestamp = /** @type {!number} */(metadataTimestamp.data);
      }
    }

    let format = this.inputFormat_;
    if (format == INPUT_FORMAT.TS && contentType == ContentType.AUDIO &&
        !shaka.util.TsParser.probe(uint8ArrayData)) {
      format = INPUT_FORMAT.UNKNOWN;
      let offset = id3Data.length;
      for (; offset < uint8ArrayData.length; offset++) {
        if (MpegAudio.probe(uint8ArrayData, offset)) {
          format = INPUT_FORMAT.MP3;
          break;
        }
      }
      if (format == INPUT_FORMAT.UNKNOWN) {
        offset = id3Data.length;
        for (; offset < uint8ArrayData.length; offset++) {
          if (ADTS.probe(uint8ArrayData, offset)) {
            format = INPUT_FORMAT.AAC;
            break;
          }
        }
      }
    }
    try {
      let streamInfo;
      switch (format) {
        case shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.AAC:
          streamInfo = this.transmuxAAC_(
              uint8ArrayData, id3Data, timestamp, stream, duration);
          break;
        case shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.AC3:
          streamInfo = this.transmuxAC3_(
              uint8ArrayData, id3Data, timestamp, stream, duration);
          break;
        case shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.EC3:
          streamInfo = this.transmuxEC3_(
              uint8ArrayData, id3Data, timestamp, stream, duration);
          break;
        case shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.MP3:
          streamInfo = this.transmuxMP3_(
              uint8ArrayData, id3Data, stream, duration);
          break;
        case shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.TS:
          streamInfo = this.transmuxTS_(
              uint8ArrayData, stream, reference, duration, contentType);
      }
      if (streamInfo) {
        const mp4Generator = new shaka.util.Mp4Generator([streamInfo]);
        let initSegment;
        if (!this.initSegments.has(stream.id)) {
          initSegment = mp4Generator.initSegment();
          this.initSegments.set(stream.id, initSegment);
        } else {
          initSegment = this.initSegments.get(stream.id);
        }
        const segmentData = mp4Generator.segmentData();

        this.frameIndex_++;
        const transmuxData =
            shaka.util.Uint8ArrayUtils.concat(initSegment, segmentData);
        return Promise.resolve(transmuxData);
      }
    } catch (e) {
      if (e && e.code == shaka.util.Error.Code.TRANSMUXING_NO_VIDEO_DATA) {
        return Promise.resolve(new Uint8Array([]));
      }
    }
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.TRANSMUXING_FAILED));
  }

  /**
   * @param {!Uint8Array} uint8ArrayData
   * @param {!Uint8Array} id3Data
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {!shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  transmuxAAC_(uint8ArrayData, id3Data, timestamp, stream, duration) {
    const ADTS = shaka.transmuxer.ADTS;

    // Check for the ADTS sync word
    // Look for ADTS header | 1111 1111 | 1111 X00X | where X can be
    // either 0 or 1
    // Layer bits (position 14 and 15) in header should be always 0 for ADTS
    // More info https://wiki.multimedia.cx/index.php?title=ADTS
    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (ADTS.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    const info = ADTS.parseInfo(uint8ArrayData, offset);
    if (!info) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED);
    }
    stream.audioSamplingRate = info.sampleRate;
    stream.channelsCount = info.channelCount;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const header = ADTS.parseHeader(uint8ArrayData, offset);
      if (!header) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
      }
      const length = header.headerLength + header.frameLength;
      if (offset + length <= uint8ArrayData.length) {
        const data = uint8ArrayData.subarray(
            offset + header.headerLength, offset + length);
        samples.push({
          data: data,
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

    /** @type {number} */
    const sampleRate = info.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

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
   * @param {!Uint8Array} uint8ArrayData
   * @param {!Uint8Array} id3Data
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {!shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  transmuxAC3_(uint8ArrayData, id3Data, timestamp, stream, duration) {
    const Ac3 = shaka.transmuxer.Ac3;

    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (Ac3.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const frame = Ac3.parseFrame(uint8ArrayData, offset);
      if (!frame) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
      }
      stream.audioSamplingRate = frame.sampleRate;
      stream.channelsCount = frame.channelCount;
      sampleRate = frame.sampleRate;
      audioConfig = frame.audioConfig;

      const frameData = uint8ArrayData.subarray(
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
    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

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
   * @param {!Uint8Array} uint8ArrayData
   * @param {!Uint8Array} id3Data
   * @param {number} timestamp
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {!shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  transmuxEC3_(uint8ArrayData, id3Data, timestamp, stream, duration) {
    const Ec3 = shaka.transmuxer.Ec3;

    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (Ec3.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    /** @type {number} */
    let sampleRate = 0;

    /** @type {!Uint8Array} */
    let audioConfig = new Uint8Array([]);

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const frame = Ec3.parseFrame(uint8ArrayData, offset);
      if (!frame) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
      }
      stream.audioSamplingRate = frame.sampleRate;
      stream.channelsCount = frame.channelCount;
      sampleRate = frame.sampleRate;
      audioConfig = frame.audioConfig;

      const frameData = uint8ArrayData.subarray(
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
    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(timestamp * sampleRate / 1000);

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
   * @param {!Uint8Array} uint8ArrayData
   * @param {!Uint8Array} id3Data
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @return {!shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  transmuxMP3_(uint8ArrayData, id3Data, stream, duration) {
    const MpegAudio = shaka.transmuxer.MpegAudio;

    let offset = id3Data.length;
    for (; offset < uint8ArrayData.length; offset++) {
      if (MpegAudio.probe(uint8ArrayData, offset)) {
        break;
      }
    }

    const timescale = 90000;
    let firstHeader;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    while (offset < uint8ArrayData.length) {
      const header = MpegAudio.parseHeader(uint8ArrayData, offset);
      if (!header) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
      }
      if (!firstHeader) {
        firstHeader = header;
      }
      if (offset + header.frameLength <= uint8ArrayData.length) {
        samples.push({
          data: uint8ArrayData.subarray(offset, offset + header.frameLength),
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
    if (!firstHeader) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED);
    }
    /** @type {number} */
    const sampleRate = firstHeader.sampleRate;
    /** @type {number} */
    const frameDuration =
        firstHeader.samplesPerFrame * timescale / firstHeader.sampleRate;
    /** @type {number} */
    const baseMediaDecodeTime = this.frameIndex_ * frameDuration;

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
   * @param {!Uint8Array} uint8ArrayData
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @param {number} duration
   * @param {string} contentType
   * @return {?shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  transmuxTS_(uint8ArrayData, stream, reference, duration, contentType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (!this.tsParser_) {
      this.tsParser_ = new shaka.util.TsParser();
    } else {
      this.tsParser_.clearData();
    }

    const tsParser = this.tsParser_.parse(uint8ArrayData);
    const codecs = tsParser.getCodecs();
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
    }
    if (contentType == ContentType.AUDIO) {
      switch (codecs.audio) {
        case 'aac':
          streamInfo =
            this.getAacStreamInfo_(tsParser, stream, duration, reference);
          break;
        case 'ac3':
          streamInfo =
            this.getAc3StreamInfo_(tsParser, stream, duration);
          break;
        case 'ec3':
          streamInfo =
            this.getEc3StreamInfo_(tsParser, stream, duration);
          break;
        case 'mp3':
          streamInfo =
            this.getMp3StreamInfo_(tsParser, stream, duration);
          break;
      }
    }
    return streamInfo;
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

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    let info;

    let firstPts = null;

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
      if (firstPts == null && audioData.pts !== null) {
        firstPts = audioData.pts;
      }
      while (offset < data.length) {
        const header = ADTS.parseHeader(data, offset);
        if (!header) {
          // We will increment one byte each time until we find the header.
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

    if (!info || firstPts == null) {
      if (!tsParser.getVideoData().length) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
      }

      firstPts = reference.startTime * timescale;

      const allCodecs = shaka.util.MimeUtils.splitCodecs(stream.codecs);
      const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
          shaka.util.ManifestParserUtils.ContentType.AUDIO, allCodecs);
      if (!audioCodec || !stream.channelsCount || !stream.audioSamplingRate) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED);
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
            shaka.util.Error.Code.TRANSMUXING_FAILED);
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
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAc3StreamInfo_(tsParser, stream, duration) {
    const Ac3 = shaka.transmuxer.Ac3;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
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
          shaka.util.Error.Code.TRANSMUXING_FAILED);
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
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getEc3StreamInfo_(tsParser, stream, duration) {
    const Ec3 = shaka.transmuxer.Ec3;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
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
          shaka.util.Error.Code.TRANSMUXING_FAILED);
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
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getMp3StreamInfo_(tsParser, stream, duration) {
    const MpegAudio = shaka.transmuxer.MpegAudio;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
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
          shaka.util.Error.Code.TRANSMUXING_FAILED);
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
  getAvcStreamInfo_(tsParser, stream, duration, reference) {
    const H264 = shaka.transmuxer.H264;
    const timescale = shaka.util.TsParser.Timescale;

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {?number} */
    let baseMediaDecodeTime = null;

    const nalus = [];
    const videoData = tsParser.getVideoData();
    if (!videoData.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_NO_VIDEO_DATA);
    }
    for (let i = 0; i < videoData.length; i++) {
      const pes = videoData[i];
      const dataNalus = pes.nalus;
      nalus.push(...dataNalus);
      const frame = H264.parseFrame(dataNalus);
      if (!frame) {
        continue;
      }
      if (baseMediaDecodeTime == null) {
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

    /** @type {!Array.<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];

    /** @type {?number} */
    let baseMediaDecodeTime = null;

    const nalus = [];
    const videoData = tsParser.getVideoData();
    if (!videoData.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_NO_VIDEO_DATA);
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
          shaka.util.Error.Code.TRANSMUXING_FAILED);
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
 * @enum {number}
 */
shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT = {
  'UNKNOWN': 0,
  'AAC': 1,
  'AC3': 2,
  'EC3': 3,
  'MP3': 4,
  'TS': 5,
};
