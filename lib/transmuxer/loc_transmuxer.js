/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.LocTransmuxer');

goog.require('goog.asserts');
goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.ADTS');
goog.require('shaka.transmuxer.AV1');
goog.require('shaka.transmuxer.BaseTransmuxer');
goog.require('shaka.transmuxer.H264');
goog.require('shaka.transmuxer.H265');
goog.require('shaka.transmuxer.Opus');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.transmuxer.TransmuxerUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');

goog.requireType('shaka.media.SegmentReference');


/**
 * @extends {shaka.transmuxer.BaseTransmuxer}
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.LocTransmuxer = class extends shaka.transmuxer.BaseTransmuxer {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    super(mimeType);

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

    /**
     * Cached result of AV1.parseInfo(), populated from the first temporal unit
     * that carries a sequence header OBU. Reused for all subsequent frames.
     * @private {?shaka.transmuxer.AV1.Info}
     */
    this.av1Info_ = null;

    /**
     * `id` of the stream the cached configs above were parsed from. One
     * transmuxer instance is reused across an adaptation, so this is what
     * tells us the cache now describes a different rendition.
     * @private {?number}
     */
    this.configStreamId_ = null;
  }


  /**
   * @override
   * @export
   */
  destroy() {
    super.destroy();
    this.avcInfo_ = null;
    this.hvcInfo_ = null;
    this.av1Info_ = null;
    this.configStreamId_ = null;
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
      const MimeUtils = shaka.util.MimeUtils;
      const codecs = MimeUtils.getCodecs(mimeType).split(',')
          .map((codecs) => {
            return MimeUtils.getCorrectAudioCodecs(codecs, 'audio/mp4');
          })
          .map(MimeUtils.getCorrectVideoCodecs).join(',');
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
  transmux(data, stream, reference, duration, contentType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    // Drop the cached decoder configs when the rendition changes.
    //
    // MediaSourceEngine keeps one transmuxer per content type, and every LOC
    // rendition normalises to the same base codec, so an adaptation takes the
    // ResetMode.NONE path: same SourceBuffer, same transmuxer instance, no
    // changeType().  The cached parameter sets would otherwise survive it, and
    // because a switch typically lands mid-GOP the first frames of the new
    // rendition are non-IDR and cannot refresh them — so the initialization
    // segment generated for the new stream would describe the OLD rendition's
    // resolution, and the decoder would be handed samples that do not match
    // it.
    //
    // Clearing here suppresses output until the new rendition's first key
    // frame, which is the same behaviour as at startup.
    if (stream.id !== this.configStreamId_) {
      this.avcInfo_ = null;
      this.hvcInfo_ = null;
      this.av1Info_ = null;
      this.configStreamId_ = stream.id;
    }

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
          case 'av01':
            streamInfo = this.getAv1StreamInfo_(
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
    return Promise.resolve(
        this.packageSegment(mp4Generator, stream, reference));
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
        sequenceNumber: this.frameIndex,
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
        sequenceNumber: this.frameIndex,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
  }


  /**
   * Builds the StreamInfo for an AV1 temporal unit.
   *
   * Unlike AVC/HEVC there is nothing to reframe: LOC carries the temporal unit
   * exactly as the encoder produced it — no start codes, no length prefixes —
   * and that is also what an `av01` sample is, so the payload becomes one
   * sample unchanged.  The OBUs are only walked to find the sequence header
   * and the frame type.
   *
   * @param {!Uint8Array} data
   * @param {shaka.extern.Stream} stream
   * @param {number} duration
   * @param {?shaka.media.SegmentReference} reference
   * @return {?shaka.util.Mp4Generator.StreamInfo}
   * @private
   */
  getAv1StreamInfo_(data, stream, duration, reference) {
    const AV1 = shaka.transmuxer.AV1;

    /** @type {number} */
    const timescale = shaka.transmuxer.LocTransmuxer.VIDEO_TIMESCALE_;

    const obus = AV1.parseObus(data);

    // A sequence header OBU rides in the key frames only, so cache it and let
    // the inter frames that follow reuse it.
    const parsedInfo = AV1.parseInfo(obus);
    if (parsedInfo) {
      this.av1Info_ = parsedInfo;
      stream.height = parsedInfo.height;
      stream.width = parsedInfo.width;
    }

    if (!this.av1Info_) {
      return null;
    }

    const isKeyframe =
        AV1.isKeyframe(obus, this.av1Info_.reducedStillPicture);

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
      codecs: 'av01',
      timescale,
      duration,
      // AV1 signals no sample aspect ratio in its sequence header, so there is
      // nothing for a pasp box to carry.
      mediaConfig: this.av1Info_.videoConfig,
      data: {
        sequenceNumber: this.frameIndex,
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

    /** @type {!Uint8Array} */
    const audioData = this.stripAdtsHeader_(data);

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [
      {
        data: audioData,
        size: audioData.length,
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
        sequenceNumber: this.frameIndex,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
  }


  /**
   * Strips the ADTS header from an AAC access unit, if the publisher left one
   * on.
   *
   * An mp4a sample entry describes its stream through the esds
   * (AudioSpecificConfig), so samples must be RAW access units. A frame that
   * still carries its 7- or 9-byte ADTS header is not one: the decoder is
   * configured from the esds, then receives a packet beginning with the
   * 0xFFFx syncword and rejects it. Chromium reports "Failed to send audio
   * packet for decoding" on the very first packet and fails the whole
   * pipeline, taking video down with it.
   *
   * LOC-04 §2 defines the payload as the elementary bitstream "without any
   * encapsulation", so a conforming publisher never sends the header — but
   * some do, so detect rather than assume. The check is deliberately tighter
   * than a syncword match: raw AAC can begin with 0xFF by coincidence, while
   * a genuine ADTS frame declares a length covering exactly this object,
   * because in LOC one object is one frame.
   *
   * @param {!Uint8Array} data
   * @return {!Uint8Array}
   * @private
   */
  stripAdtsHeader_(data) {
    const ADTS = shaka.transmuxer.ADTS;
    if (data.length <= 2 || !ADTS.isHeaderPattern(data, 0)) {
      return data;
    }
    const header = ADTS.parseHeader(data, 0);
    if (!header || header.headerLength + header.frameLength != data.length) {
      return data;
    }
    return data.subarray(header.headerLength);
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
        sequenceNumber: this.frameIndex,
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
  'av01',
];

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'moq/loc',
    () => new shaka.transmuxer.LocTransmuxer('moq/loc'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
