/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.MatroskaTransmuxer');

goog.require('shaka.codec.AAC');
goog.require('shaka.codec.Ac3');
goog.require('shaka.codec.DolbyVision');
goog.require('shaka.codec.Ec3');
goog.require('shaka.codec.Flac');
goog.require('shaka.codec.MpegAudio');
goog.require('shaka.codec.Opus');
goog.require('shaka.codec.Vorbis');
goog.require('shaka.media.Capabilities');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.mkv.MatroskaCodecs');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.transmuxer.BaseTransmuxer');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.transmuxer.TransmuxerUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.Uint8ArrayUtils');
goog.require('shaka.util.WebmGenerator');
goog.requireType('shaka.media.SegmentReference');


/**
 * Repackages the frames of one Matroska track into what MSE plays: fragmented
 * MP4, or WebM for the codecs that browsers only take there (VP8, Vorbis).  The
 * encoded frames are copied as they are; nothing is decoded or transcoded.
 *
 * The initialization segment of a track (the beginning of the file, up to the
 * end of the track's TrackEntry) has no media to convert, so it only tells the
 * transmuxer what the track is.  The initialization segment that MSE gets is
 * produced together with the first media segment.
 *
 * @extends {shaka.transmuxer.BaseTransmuxer}
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.MatroskaTransmuxer = class extends
  shaka.transmuxer.BaseTransmuxer {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    super(mimeType);

    /**
     * The tracks and the time scale described by the last initialization
     * segment.
     * @private {?shaka.mkv.MatroskaIndexParser.Header}
     */
    this.header_ = null;

    /**
     * The track that is being converted.
     * @private {?shaka.mkv.MatroskaIndexParser.Track}
     */
    this.track_ = null;

    /**
     * The decode time at which the next segment is expected to start, in ticks
     * of the timescale, or null before the first segment.
     * @private {?number}
     */
    this.nextDecodeTime_ = null;

    /**
     * What the first audio segment showed about the audio stream.
     * @private {?shaka.transmuxer.MatroskaTransmuxer.AudioInfo}
     */
    this.audioInfo_ = null;
  }

  /**
   * @override
   * @export
   */
  destroy() {
    super.destroy();
    this.header_ = null;
    this.track_ = null;
    this.audioInfo_ = null;
  }

  /**
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    if (this.getContainer_(mimeType) != this.getOriginalMimeType()) {
      return false;
    }
    const codecs = shaka.util.MimeUtils.getCodecs(mimeType);
    const MatroskaTransmuxer = shaka.transmuxer.MatroskaTransmuxer;
    if (!codecs || !MatroskaTransmuxer.isSupportedCodec_(codecs)) {
      return false;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const type = contentType || (mimeType.startsWith('audio/') ?
        ContentType.AUDIO : ContentType.VIDEO);
    return shaka.media.Capabilities.isTypeSupported(
        this.convertCodecs(type, mimeType));
  }

  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.getContainer_(mimeType) != this.getOriginalMimeType()) {
      return mimeType;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;
    const isAudio = contentType == ContentType.AUDIO;
    let codecs = MimeUtils.getCodecs(mimeType);
    if (isAudio && MimeUtils.getNormalizedCodec(codecs) == 'mp3' &&
        shaka.mkv.MatroskaCodecs.usesRawMpegAudio(shaka.mkv.CodecId.MP3)) {
      return 'audio/mpeg';
    }
    const isWebm = shaka.transmuxer.MatroskaTransmuxer.WEBM_CODECS_.some(
        (prefix) => codecs.toLowerCase().startsWith(prefix));
    const container = (isAudio ? 'audio' : 'video') +
        (isWebm ? '/webm' : '/mp4');
    if (isAudio) {
      codecs = MimeUtils.getCorrectAudioCodecs(codecs, container);
    }
    return MimeUtils.getFullType(container, codecs);
  }

  /**
   * @override
   * @export
   */
  transmux(data, stream, reference, duration, contentType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    try {
      const bytes = shaka.util.BufferUtils.toUint8(data);
      if (!reference) {
        this.parseInit_(bytes, stream);
        // Nothing to append yet: see the description of the class.
        return Promise.resolve(new Uint8Array(0));
      }
      const trackNumber = shaka.mkv.MatroskaCodecs.getTrackNumber(stream.id);
      if (!this.header_ || !this.track_ || this.track_.number != trackNumber) {
        throw new Error('The initialization segment of track ' + trackNumber +
            ' has not been received');
      }
      const output = contentType == ContentType.AUDIO ?
          this.transmuxAudio_(bytes, stream, reference, duration) :
          this.transmuxVideo_(bytes, stream, reference, duration);
      return Promise.resolve(output);
    } catch (error) {
      if (error instanceof shaka.util.Error) {
        return Promise.reject(error);
      }
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          error && error.message ? error.message : String(error)));
    }
  }

  /**
   * Learns what the track is from its initialization segment.
   *
   * @param {!Uint8Array} bytes
   * @param {shaka.extern.Stream} stream
   * @private
   */
  parseInit_(bytes, stream) {
    const header = shaka.mkv.MatroskaIndexParser.parseHeader(bytes);
    const trackNumber = shaka.mkv.MatroskaCodecs.getTrackNumber(stream.id);
    const track = header.tracks.find((entry) => entry.number == trackNumber);
    if (!track) {
      throw new Error('Track ' + trackNumber + ' is not in the file');
    }
    this.header_ = header;
    this.track_ = track;
    // Everything derived from the previous track no longer applies.
    this.nextDecodeTime_ = null;
    this.audioInfo_ = null;
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @param {number} duration
   * @return {shaka.extern.TransmuxerOutput}
   * @private
   */
  transmuxVideo_(bytes, stream, reference, duration) {
    const MatroskaTransmuxer = shaka.transmuxer.MatroskaTransmuxer;
    const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      this.track_);
    const header = /** @type {!shaka.mkv.MatroskaIndexParser.Header} */(
      this.header_);
    const timescale = MatroskaTransmuxer.VIDEO_TIMESCALE_;

    if (shaka.mkv.MatroskaCodecs.usesWebm(track.codecId)) {
      return this.packageWebm_(bytes, stream, reference);
    }
    const frames = shaka.mkv.MatroskaClusterParser.parseFrames(
        bytes, track, header.timecodeScale);
    if (!frames.length) {
      return {data: new Uint8Array(0), init: null};
    }

    // Matroska stores only presentation times, and the frames come in decode
    // order.  With B-frames the two orders differ, and a frame must never be
    // decoded after the moment it is to be presented.  The frames decode in
    // the order of their presentation times, so those, sorted, are the decode
    // times.  The presentation times are moved later by the shift, which is
    // more than any encoder reorders frames.  As the decode times come from the
    // file alone, they continue from one segment to the next without any need
    // to know how the frames are reordered.
    const shift = Math.round(
        shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT * timescale);
    const times = frames.map((frame) => Math.round(frame.time * timescale));
    const presentationTimes = times.map((time) => time + shift);
    const decodeTimes = times.slice().sort((a, b) => a - b);
    const offset = this.getContinuityOffset_(
        decodeTimes[0], header, timescale);

    const lastDuration = MatroskaTransmuxer.getLastDuration_(
        track, decodeTimes, timescale, reference);
    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = [];
    for (let i = 0; i < frames.length; i++) {
      const decodeTime = decodeTimes[i] + offset;
      const nextDecodeTime = i + 1 < frames.length ?
          decodeTimes[i + 1] + offset : decodeTime + lastDuration;
      samples.push({
        data: frames[i].data,
        size: frames[i].data.byteLength,
        duration: nextDecodeTime - decodeTime,
        cts: presentationTimes[i] - decodeTime,
        flags: frames[i].keyframe ?
            shaka.transmuxer.TransmuxerUtils.VIDEO_KEYFRAME_FLAGS :
            shaka.transmuxer.TransmuxerUtils.VIDEO_NON_KEYFRAME_FLAGS,
      });
    }
    const baseMediaDecodeTime = decodeTimes[0] + offset;
    this.nextDecodeTime_ = baseMediaDecodeTime +
        samples.reduce((sum, sample) => sum + sample.duration, 0);

    // The stream is Dolby Vision if its codec string says so.
    const dolbyVisionEntry = track.dolbyVisionConfig ?
        shaka.codec.DolbyVision.getEntryName(stream.codecs) : null;
    const codecs = dolbyVisionEntry ||
        shaka.mkv.MatroskaCodecs.getMp4VideoCodec(track.codecId);
    const pixelAspectRatio =
        shaka.mkv.MatroskaCodecs.getPixelAspectRatio(track);
    /** @type {shaka.util.Mp4Generator.StreamInfo} */
    const streamInfo = {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
      codecs,
      timescale,
      duration,
      mediaConfig: shaka.mkv.MatroskaCodecs.getVideoConfig(
          track, stream.codecs),
      hSpacing: pixelAspectRatio ? pixelAspectRatio.horizontal : undefined,
      vSpacing: pixelAspectRatio ? pixelAspectRatio.vertical : undefined,
      dolbyVisionConfig: dolbyVisionEntry ?
          /** @type {!Uint8Array} */(track.dolbyVisionConfig) : undefined,
      data: {
        sequenceNumber: this.frameIndex,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
    return this.packageSegment(
        new shaka.util.Mp4Generator([streamInfo]), stream, reference);
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @param {number} duration
   * @return {shaka.extern.TransmuxerOutput}
   * @private
   */
  transmuxAudio_(bytes, stream, reference, duration) {
    const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      this.track_);
    const header = /** @type {!shaka.mkv.MatroskaIndexParser.Header} */(
      this.header_);

    if (shaka.mkv.MatroskaCodecs.usesWebm(track.codecId)) {
      return this.packageWebm_(bytes, stream, reference);
    }
    const frames = shaka.mkv.MatroskaClusterParser.parseFrames(
        bytes, track, header.timecodeScale);
    if (!frames.length) {
      return {data: new Uint8Array(0), init: null};
    }
    if (!this.audioInfo_) {
      this.audioInfo_ = shaka.transmuxer.MatroskaTransmuxer.getAudioInfo_(
          track, frames[0].data);
    }
    const info = this.audioInfo_;
    // What the decoder is going to see decides what the stream is, not what
    // the file announced.
    stream.audioSamplingRate = info.sampleRate;
    stream.channelsCount = info.channelCount;

    if (shaka.mkv.MatroskaCodecs.usesRawMpegAudio(track.codecId)) {
      return {
        data: shaka.util.Uint8ArrayUtils.concatRange(
            frames.map((frame) => frame.data)),
        init: null,
      };
    }

    /** @type {!Array<shaka.util.Mp4Generator.Mp4Sample>} */
    const samples = frames.map((frame) => {
      return {
        data: frame.data,
        size: frame.data.byteLength,
        duration: info.getDuration(frame.data),
        cts: 0,
        flags: shaka.transmuxer.TransmuxerUtils.AUDIO_SAMPLE_FLAGS,
      };
    });

    let baseMediaDecodeTime = Math.round(
        (frames[0].time + shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT) *
        info.timescale);
    baseMediaDecodeTime += this.getContinuityOffset_(
        baseMediaDecodeTime, header, info.timescale);
    this.nextDecodeTime_ = baseMediaDecodeTime +
        samples.reduce((sum, sample) => sum + sample.duration, 0);

    /** @type {shaka.util.Mp4Generator.StreamInfo} */
    const streamInfo = {
      id: stream.id,
      type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
      codecs: info.codecs,
      timescale: info.timescale,
      duration,
      mediaConfig: info.config,
      data: {
        sequenceNumber: this.frameIndex,
        baseMediaDecodeTime,
        samples,
      },
      stream,
    };
    return this.packageSegment(
        new shaka.util.Mp4Generator([streamInfo]), stream, reference);
  }

  /**
   * Writes the frames of a track as WebM.  WebM has presentation times only,
   * and the codecs it is used for here (VP8, Vorbis) do not reorder frames, so
   * they are what the file says, moved by the shift.
   *
   * @param {!Uint8Array} bytes
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.extern.TransmuxerOutput}
   * @private
   */
  packageWebm_(bytes, stream, reference) {
    const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      this.track_);
    const header = /** @type {!shaka.mkv.MatroskaIndexParser.Header} */(
      this.header_);
    const {NANOSECONDS_PER_SECOND, MEDIA_TIME_SHIFT} =
        shaka.mkv.MatroskaConstants;
    const ticksPerSecond = NANOSECONDS_PER_SECOND / header.timecodeScale;

    const frames = shaka.mkv.MatroskaClusterParser.parseFrames(
        bytes, track, header.timecodeScale);
    if (!frames.length) {
      return {data: new Uint8Array(0), init: null};
    }
    const times = this.getWebmTimes_(frames, track);

    /** @type {shaka.util.WebmGenerator.StreamInfo} */
    const streamInfo = {
      trackNumber: track.number,
      type: track.type,
      codecId: track.codecId,
      codecPrivate: track.codecPrivate,
      timecodeScale: header.timecodeScale,
      width: track.width || stream.width || 0,
      height: track.height || stream.height || 0,
      channelCount: track.channels || stream.channelsCount || 1,
      sampleRate: track.sampleRate || stream.audioSamplingRate || 0,
      frames: frames.map((frame, i) => {
        return {
          timecode: Math.round((times[i] + MEDIA_TIME_SHIFT) * ticksPerSecond),
          data: frame.data,
          keyframe: frame.keyframe,
        };
      }),
    };
    return this.packageSegment(
        new shaka.util.WebmGenerator(streamInfo), stream, reference);
  }

  /**
   * Gets the time of each frame.  Every block has one, and blocks written by
   * muxers often lace several frames of audio: MSE does not take lacing, so
   * each of those frames has to get a time of its own.  What is known of a
   * frame laced with others is the time of its block, which is the time of the
   * first, and (for the codecs that say it) how much audio each frame holds.
   *
   * @param {!Array<shaka.mkv.MatroskaClusterParser.Frame>} frames
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {!Array<number>} The times in seconds.
   * @private
   */
  getWebmTimes_(frames, track) {
    const Vorbis = shaka.codec.Vorbis;
    const vorbisInfo = track.codecId == shaka.mkv.CodecId.VORBIS &&
        track.codecPrivate ? Vorbis.parseHeaders(track.codecPrivate) : null;
    const sampleRate = track.sampleRate || 0;

    const times = [];
    let previousWindow = 0;
    for (const frame of frames) {
      if (!vorbisInfo || !sampleRate || frame.laceIndex == 0) {
        // The time that the block writes, or that it spreads over its frames
        // if it says how long it lasts.
        times.push(frame.time);
        previousWindow = vorbisInfo ?
            Vorbis.getWindowSize(vorbisInfo, frame.data) : 0;
        continue;
      }
      // The next frame of a block of Vorbis starts when the audio of the one
      // before it is over.
      const window = Vorbis.getWindowSize(vorbisInfo, frame.data);
      times.push(times[times.length - 1] +
          Vorbis.getAdvance(previousWindow, window) / sampleRate);
      previousWindow = window;
    }
    return times;
  }

  /**
   * Segments that follow each other should have decode times that follow each
   * other too.  Times taken from Matroska have the resolution of its timecode
   * scale (one millisecond by default), so a segment's start can differ from
   * the end of the previous one by that much, which MSE would see as a tiny
   * gap or overlap.  This tells how much to move the start of a segment to
   * make it continue the previous one, when it is close enough to be the
   * next segment.
   *
   * @param {number} decodeTime The decode time the segment starts at.
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @param {number} timescale
   * @return {number} How much to add to the decode times, in ticks.
   * @private
   */
  getContinuityOffset_(decodeTime, header, timescale) {
    if (this.nextDecodeTime_ == null) {
      return 0;
    }
    const nanosecondsPerSecond =
        shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
    const ticks = shaka.transmuxer.MatroskaTransmuxer.CONTINUITY_TICKS_;
    // The rounding error of a time is up to half a tick of the timecode scale.
    // Allow two, for the ends of both segments.
    const tolerance = Math.ceil(
        ticks * header.timecodeScale / nanosecondsPerSecond * timescale);
    const offset = this.nextDecodeTime_ - decodeTime;
    return Math.abs(offset) <= tolerance ? offset : 0;
  }

  /**
   * Gets the duration of the last video sample of a segment, which has no
   * next frame to measure it against.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @param {!Array<number>} decodeTimes
   * @param {number} timescale
   * @param {?shaka.media.SegmentReference} reference
   * @return {number}
   * @private
   */
  static getLastDuration_(track, decodeTimes, timescale, reference) {
    if (track.defaultDuration) {
      return Math.round(track.defaultDuration * timescale);
    }
    const count = decodeTimes.length;
    if (count > 1) {
      return decodeTimes[count - 1] - decodeTimes[count - 2];
    }
    // A lone frame: it can only last as long as its segment.
    return reference ?
        Math.round((reference.endTime - reference.startTime) * timescale) : 0;
  }

  /**
   * Works out how to describe an audio track in MP4.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @param {!Uint8Array} firstFrame The first frame of the track.
   * @return {!shaka.transmuxer.MatroskaTransmuxer.AudioInfo}
   * @private
   */
  static getAudioInfo_(track, firstFrame) {
    const CodecId = shaka.mkv.CodecId;
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    const MatroskaTransmuxer = shaka.transmuxer.MatroskaTransmuxer;
    const sampleRate = track.sampleRate || 0;
    const channelCount = track.channels || 0;

    switch (track.codecId) {
      case CodecId.AAC: {
        if (!sampleRate || !track.codecPrivate) {
          throw new Error('The AAC track has no sample rate or configuration');
        }
        return {
          codecs: MatroskaCodecs.getCodecs(track) || '',
          timescale: sampleRate,
          sampleRate,
          channelCount,
          config: shaka.codec.AAC.buildEsds(track.codecPrivate),
          getDuration: () => MatroskaTransmuxer.AAC_SAMPLES_PER_FRAME_,
        };
      }
      case CodecId.AC3:
      case CodecId.EAC3: {
        const isEc3 = track.codecId == CodecId.EAC3;
        // The configuration boxes (dac3, dec3) describe the first frame.
        /** @type {!shaka.codec.Ac3.Ac3Frame} */
        const frame = {
          sampleRate: 0,
          channelCount: 0,
          audioConfig: new Uint8Array(0),
          frameLength: 0,
        };
        const parsed = isEc3 ?
            shaka.codec.Ec3.parseFrame(firstFrame, 0, frame) :
            shaka.codec.Ac3.parseFrame(firstFrame, 0, frame);
        if (!parsed || !frame.sampleRate) {
          throw new Error('The first Dolby Digital frame is invalid');
        }
        const samplesPerFrame = isEc3 ?
            shaka.codec.Ec3.EC3_SAMPLES_PER_FRAME :
            shaka.codec.Ac3.AC3_SAMPLES_PER_FRAME;
        return {
          codecs: isEc3 ? 'ec-3' : 'ac-3',
          timescale: frame.sampleRate,
          sampleRate: frame.sampleRate,
          channelCount: frame.channelCount,
          config: frame.audioConfig,
          getDuration: () => samplesPerFrame,
        };
      }
      case CodecId.OPUS:
        return {
          codecs: 'opus',
          timescale: shaka.codec.Opus.SAMPLE_RATE,
          sampleRate: shaka.codec.Opus.SAMPLE_RATE,
          channelCount,
          config: MatroskaCodecs.getOpusConfig(track),
          // A packet holds a variable amount of audio, given by its TOC.
          getDuration: (frame) => shaka.codec.Opus.getPacketSampleCount(frame),
        };
      case CodecId.FLAC: {
        const parsedInfo = track.codecPrivate &&
            shaka.codec.Flac.parseStreamInfo(track.codecPrivate);
        if (!parsedInfo || !track.codecPrivate) {
          throw new Error('The FLAC track has no STREAMINFO');
        }
        const flacInfo = /** @type {shaka.codec.Flac.StreamInfo} */(
          parsedInfo);
        return {
          codecs: 'flac',
          timescale: flacInfo.sampleRate,
          sampleRate: flacInfo.sampleRate,
          channelCount: flacInfo.channelCount,
          config: shaka.codec.Flac.buildDfLa(track.codecPrivate),
          // Each frame says how many samples it has.
          getDuration: (frame) => {
            return shaka.codec.Flac.getBlockSize(frame, flacInfo);
          },
        };
      }
      case CodecId.MP3: {
        const parsed = shaka.codec.MpegAudio.parseHeader(firstFrame, 0);
        if (!parsed) {
          throw new Error('The first MP3 frame is invalid');
        }
        return {
          codecs: 'mp3',
          timescale: parsed.sampleRate,
          sampleRate: parsed.sampleRate,
          channelCount: parsed.channelCount,
          config: new Uint8Array(0),
          getDuration: () => parsed.samplesPerFrame,
        };
      }
    }
    throw new Error('Unsupported audio codec ' + track.codecId);
  }

  /**
   * @param {string} mimeType
   * @return {string} The MIME type without the parameters, in lower case.
   * @private
   */
  getContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0];
  }

  /**
   * @param {string} codecs
   * @return {boolean}
   * @private
   */
  static isSupportedCodec_(codecs) {
    const prefixes = shaka.transmuxer.MatroskaTransmuxer.SUPPORTED_CODECS_;
    return prefixes.some((prefix) => codecs.toLowerCase().startsWith(prefix));
  }
};


/**
 * @typedef {{
 *   codecs: string,
 *   timescale: number,
 *   sampleRate: number,
 *   channelCount: number,
 *   config: !Uint8Array,
 *   getDuration: function(!Uint8Array):number,
 * }}
 *
 * @property {string} codecs
 *   The codec, as Mp4Generator names it.
 * @property {number} timescale
 *   The ticks per second the media times are written in.
 * @property {number} sampleRate
 * @property {number} channelCount
 * @property {!Uint8Array} config
 *   The payload of the codec configuration box.
 * @property {function(!Uint8Array):number} getDuration
 *   Returns the duration, in ticks, of a frame.
 */
shaka.transmuxer.MatroskaTransmuxer.AudioInfo;


/**
 * The clock of MPEG video, 90 kHz.  Video frame durations (1/24, 1/25, 1/30,
 * 1/60 s and their 1001/1000 variants) are whole numbers of ticks at this rate,
 * and it leaves plenty of room in the 64-bit decode times.
 *
 * @private @const {number}
 */
shaka.transmuxer.MatroskaTransmuxer.VIDEO_TIMESCALE_ = 90000;


/**
 * The number of samples an AAC frame codes (AAC-LC and HE-AAC alike, counted
 * at the rate of the AAC core).
 *
 * @private @const {number}
 */
shaka.transmuxer.MatroskaTransmuxer.AAC_SAMPLES_PER_FRAME_ = 1024;


/**
 * How many ticks of the timecode scale apart two adjoining segments may be for
 * the transmuxer to consider them continuous: half a tick of rounding error at
 * the end of one and at the start of the other.
 *
 * @private @const {number}
 */
shaka.transmuxer.MatroskaTransmuxer.CONTINUITY_TICKS_ = 2;


/**
 * The prefixes of the codec strings that can be repackaged.  They are the
 * codecs MP4 can carry and that MSE plays; see shaka.mkv.MatroskaCodecs.
 *
 * @private @const {!Array<string>}
 */
shaka.transmuxer.MatroskaTransmuxer.SUPPORTED_CODECS_ = [
  'avc1.',
  'hvc1.',
  'av01.',
  'vp09.',
  'dvh1.',
  'dva1.',
  'dav1.',
  'mp4a.40.',
  'ac-3',
  'ec-3',
  'opus',
  'mp3',
  'flac',
  'vp8',
  'vorbis',
];


/**
 * The prefixes of the codec strings that are written as WebM; the others are
 * written as MP4.
 *
 * @private @const {!Array<string>}
 */
shaka.transmuxer.MatroskaTransmuxer.WEBM_CODECS_ = ['vp8', 'vorbis'];


shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'video/x-matroska',
    () => new shaka.transmuxer.MatroskaTransmuxer('video/x-matroska'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'audio/x-matroska',
    () => new shaka.transmuxer.MatroskaTransmuxer('audio/x-matroska'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
