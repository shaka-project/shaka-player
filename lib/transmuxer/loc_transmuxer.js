/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.LocTransmuxer');

goog.require('goog.asserts');
goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.H264');
goog.require('shaka.transmuxer.H265');
goog.require('shaka.transmuxer.Opus');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.transmuxer.TransmuxerUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.StreamUtils');

goog.requireType('shaka.media.SegmentReference');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.LocTransmuxer = class {
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

    /** @private {?Uint8Array} */
    this.lastInitSegment_ = null;

    /**
     * Cached result of H264.parseInfo(), populated from the first IDR frame
     * that carries SPS+PPS. Reused for all subsequent non-IDR frames.
     * @private {?{videoConfig: !Uint8Array, hSpacing: number, vSpacing: number,
     *              height: number, width: number}}
     */
    this.avcInfo_ = null;

    /**
     * Cached result of H265.parseInfo(), populated from the first IDR frame
     * that carries VPS+SPS+PPS. Reused for all subsequent non-IDR frames.
     * @private {?{videoConfig: !Uint8Array, hSpacing: number, vSpacing: number,
     *              height: number, width: number}}
     */
    this.hvcInfo_ = null;
  }


  /**
   * @override
   * @export
   */
  destroy() {
    this.initSegments.clear();
    this.avcInfo_ = null;
    this.hvcInfo_ = null;
  }


  /**
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    const Capabilities = shaka.media.Capabilities;

    if (!this.isLocContainer_(mimeType)) {
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

    const LocTransmuxer = shaka.transmuxer.LocTransmuxer;

    if (audioCodec) {
      const normalizedCodec = MimeUtils.getNormalizedCodec(audioCodec);
      if (!LocTransmuxer.SUPPORTED_AUDIO_CODECS_.includes(normalizedCodec)) {
        return false;
      }
    }

    if (videoCodec) {
      const normalizedCodec = MimeUtils.getNormalizedCodec(videoCodec);
      if (!LocTransmuxer.SUPPORTED_VIDEO_CODECS_.includes(normalizedCodec)) {
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
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isLocContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'moq/loc';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isLocContainer_(mimeType)) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      const StreamUtils = shaka.util.StreamUtils;
      const codecs = shaka.util.MimeUtils.getCodecs(mimeType).split(',')
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
    const MimeUtils = shaka.util.MimeUtils;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    const streamInfos = [];
    try {
      const normalizedCodec = MimeUtils.getNormalizedCodec(stream.codecs);
      let streamInfo;
      if (contentType == ContentType.VIDEO) {
        switch (normalizedCodec) {
          case 'avc':
            streamInfo = this.getAvcStreamInfo_(
                uint8ArrayData, stream, reference, duration);
            break;
          case 'hevc':
            streamInfo = this.getHvcStreamInfo_(
                uint8ArrayData, stream, duration, reference);
            break;
        }
        if (streamInfo) {
          streamInfos.push(streamInfo);
        }
      }
      if (contentType == ContentType.AUDIO) {
        switch (normalizedCodec) {
          case 'aac':
            streamInfo = this.getAacStreamInfo_(
                uint8ArrayData, stream, duration, reference);
            break;
          case 'opus':
            streamInfo = this.getOpusStreamInfo_(
                uint8ArrayData, stream, duration, reference);
            break;
        }
        if (streamInfo) {
          streamInfos.push(streamInfo);
        }
      }
    } catch (e) {
      return Promise.reject(e);
    }

    if (!streamInfos.length) {
      return Promise.resolve({
        data: new Uint8Array([]),
        init: null,
      });
    }
    const mp4Generator = new shaka.util.Mp4Generator(streamInfos);
    const initSegmentKey = stream.id + '_' + reference.discontinuitySequence;
    const initSegment = this.initSegments.getOrInsertComputed(
        initSegmentKey, () => mp4Generator.initSegment());
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
   * Extracts NAL units from a LOC video payload.
   *
   * The LOC spec (§2.1) allows two framing formats:
   *
   *  - **Length-prefix** (§2.1.3): 4-byte big-endian length before each NALU.
   *    This is the canonical AVCC/HVCC format.
   *
   *  - **Start-code** (§2.1.4): a 4-byte value of `0x00000001` (= 1 in network
   *    byte order) is reserved as a start-code sentinel; the extractor then
   *    scans ahead for the next 3- or 4-byte start code boundary.  Per the
   *    spec a length value of 1 SHOULD be interpreted this way.
   *
   * @param {!Uint8Array} data
   * @param {string} codec  Normalised codec string: 'avc' or 'hvc'
   * @return {!Array<shaka.extern.VideoNalu>}
   * @private
   */
  extractNalus_(data, codec) {
    const nalus = [];
    const isHvc = codec === 'hvc';
    // H265 NALU header is 2 bytes; H264 header is 1 byte.
    const headerSize = isHvc ? 2 : 1;
    let offset = 0;

    while (offset + 4 <= data.byteLength) {
      // Read the 4-byte framing word in network (big-endian) byte order.
      // Using `>>> 0` coerces the signed int32 result to uint32.
      const prefix =
          ((data[offset] << 24) | (data[offset + 1] << 16) |
          (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
      offset += 4;

      let naluEnd;

      if (prefix === 1) {
        // ── AnnexB mode (LOC §2.1.4) ───────────────────────────────────────
        // The sentinel value 1 means a 4-byte start code was present; scan
        // forward for the next 4-byte (0x00000001) or 3-byte (0x000001)
        // start code to find the end of this NALU.
        naluEnd = data.byteLength;
        for (let i = offset; i + 2 < data.byteLength; i++) {
          if (data[i] === 0 && data[i + 1] === 0) {
            if (data[i + 2] === 1) {
              // 3-byte start code 0x000001
              naluEnd = i;
              break;
            }
            if (i + 3 < data.byteLength && data[i + 2] === 0 &&
                data[i + 3] === 1) {
              // 4-byte start code 0x00000001
              naluEnd = i;
              break;
            }
          }
        }
      } else {
        // ── Length-prefix mode (LOC §2.1.3, AVCC/HVCC) ────────────────────
        naluEnd = offset + prefix;
        if (naluEnd > data.byteLength) {
          break; // malformed: length exceeds remaining buffer
        }
      }

      if (naluEnd <= offset) {
        // empty or zero-length NALU — stop to avoid an infinite loop
        break;
      }

      const fullData = data.subarray(offset, naluEnd);

      // Extract the NALU type from the header byte(s).
      // H264: forbidden_zero_bit(1) | nal_ref_idc(2) | nal_unit_type(5)
      // H265: forbidden_zero_bit(1) | nal_unit_type(6) | nuh_layer_id(6)
      //       | nuh_temporal_id_plus1(3)  — type is bits [14:9] of the 16-bit
      //       header, equivalent to (firstByte & 0x7e) >> 1.
      const type = isHvc ? (fullData[0] & 0x7e) >> 1 : fullData[0] & 0x1f;

      // `data` = post-header payload consumed by ExpGolomb in parseInfo().
      const naluData = fullData.length > headerSize ?
          fullData.subarray(headerSize) : new Uint8Array([]);

      nalus.push({
        type,
        data: naluData,
        fullData,
      });
      offset = naluEnd;
    }

    return nalus;
  }


  /**
   * @param {!Uint8Array} data
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @param {number} duration
   * @return {?shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAvcStreamInfo_(data, stream, reference, duration) {
    const H264 = shaka.transmuxer.H264;

    /** @type {number} */
    const timescale = shaka.transmuxer.LocTransmuxer.VIDEO_TIMESCALE_;

    const nalus = this.extractNalus_(data, 'avc');

    // H264.parseInfo() requires SPS + PPS NALUs, which are only present in
    // IDR (keyframe) objects. Cache the result so non-IDR frames can still
    // produce a valid StreamInfo.
    const parsedInfo = H264.parseInfo(nalus);
    if (parsedInfo) {
      this.avcInfo_ = parsedInfo;
      stream.height = parsedInfo.height;
      stream.width = parsedInfo.width;
    }

    if (!this.avcInfo_) {
      return null;
    }

    const isKeyframe = H264.isKeyframe(nalus);

    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(reference.startTime * timescale);

    /** @type {number} */
    const sampleDuration =
        Math.floor((reference.endTime - reference.startTime) * timescale);

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [
      {
        data,
        size: data.byteLength,
        duration: sampleDuration,
        cts: 0,
        flags: isKeyframe ?
            shaka.transmuxer.TransmuxerUtils.VIDEO_KEYFRAME_FLAGS :
            shaka.transmuxer.TransmuxerUtils.VIDEO_NON_KEYFRAME_FLAGS,
      },
    ];

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      codecs: 'avc1',
      timescale,
      duration,
      mediaConfig: this.avcInfo_.videoConfig,
      hSpacing: this.avcInfo_.hSpacing,
      vSpacing: this.avcInfo_.vSpacing,
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
  }


  /**
   * @param {!Uint8Array} data
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {?shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getHvcStreamInfo_(data, stream, duration, reference) {
    const H265 = shaka.transmuxer.H265;

    /** @type {number} */
    const timescale = shaka.transmuxer.LocTransmuxer.VIDEO_TIMESCALE_;

    const nalus = this.extractNalus_(data, 'hvc');

    // H265.parseInfo() requires VPS + SPS + PPS NALUs, present only in IDR
    // objects. Cache the result for reuse with subsequent non-IDR frames.
    const parsedInfo = H265.parseInfo(nalus);
    if (parsedInfo) {
      this.hvcInfo_ = parsedInfo;
      stream.height = parsedInfo.height;
      stream.width = parsedInfo.width;
    }

    if (!this.hvcInfo_) {
      return null;
    }

    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(reference.startTime * timescale);

    /** @type {number} */
    const sampleDuration =
        Math.floor((reference.endTime - reference.startTime) * timescale);

    /** @type {!shaka.transmuxer.H265.H265Frame} */
    const frame = {
      data: new Uint8Array(0),
      isKeyframe: false,
    };
    const didParseFrame = H265.parseFrame(nalus, frame);
    if (!didParseFrame) {
      return null;
    }

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [
      {
        data: frame.data,
        size: frame.data.byteLength,
        duration: sampleDuration,
        cts: 0,
        flags: frame.isKeyframe ?
            shaka.transmuxer.TransmuxerUtils.VIDEO_KEYFRAME_FLAGS :
            shaka.transmuxer.TransmuxerUtils.VIDEO_NON_KEYFRAME_FLAGS,
      },
    ];

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      codecs: 'hvc1',
      timescale,
      duration,
      mediaConfig: this.hvcInfo_.videoConfig,
      hSpacing: this.hvcInfo_.hSpacing,
      vSpacing: this.hvcInfo_.vSpacing,
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
  }


  /**
   * @param {!Uint8Array} data
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAacStreamInfo_(data, stream, duration, reference) {
    goog.asserts.assert(stream.audioSamplingRate,
        'Must have audioSamplingRate');

    /** @type {number} */
    const timescale = stream.audioSamplingRate;

    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(reference.startTime * timescale);

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [
      {
        data: data,
        size: data.length,
        duration: 1024,
        cts: 0,
        flags: shaka.transmuxer.TransmuxerUtils.AUDIO_SAMPLE_FLAGS,
      },
    ];

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: stream.codecs,
      timescale,
      duration,
      mediaConfig: new Uint8Array([]),
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
  }


  /**
   * @param {!Uint8Array} data
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getOpusStreamInfo_(data, stream, duration, reference) {
    goog.asserts.assert(stream.audioSamplingRate,
        'Must have audioSamplingRate');

    const Opus = shaka.transmuxer.Opus;

    /** @type {number} */
    const timescale = stream.audioSamplingRate;

    /** @type {number} */
    const baseMediaDecodeTime = Math.floor(reference.startTime * timescale);

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [
      {
        data: data,
        size: data.length,
        duration: Opus.getPacketSampleCount(data),
        cts: 0,
        flags: shaka.transmuxer.TransmuxerUtils.AUDIO_SAMPLE_FLAGS,
      },
    ];

    /** @type {!Uint8Array} */
    const mediaConfig = new Uint8Array([
      0x00,         // Version (1)
      stream.channelsCount, // OutputChannelCount: 2
      0x00, 0x00,   // PreSkip: 2
      (stream.audioSamplingRate >>> 24) & 0xFF,  // Audio sample rate: 4
      (stream.audioSamplingRate >>> 17) & 0xFF,
      (stream.audioSamplingRate >>> 8) & 0xFF,
      (stream.audioSamplingRate >>> 0) & 0xFF,
      0x00, 0x00,  // Global Gain : 2
      0x0, // channel mapping family
    ]);

    return {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: stream.codecs,
      timescale,
      duration,
      mediaConfig,
      data: {
        sequenceNumber: this.frameIndex_,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
  }
};

/**
 * @const {number}
 * @private
 */
shaka.transmuxer.LocTransmuxer.VIDEO_TIMESCALE_ = 90000;

/**
 * Supported audio codecs.
 *
 * @private
 * @const {!Array<string>}
 */
shaka.transmuxer.LocTransmuxer.SUPPORTED_AUDIO_CODECS_ = [
  'aac',
  'opus',
];

/**
 * Supported video codecs.
 *
 * @private
 * @const {!Array<string>}
 */
shaka.transmuxer.LocTransmuxer.SUPPORTED_VIDEO_CODECS_ = [
  'avc',
  'hevc',
];

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'moq/loc',
    () => new shaka.transmuxer.LocTransmuxer('moq/loc'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
