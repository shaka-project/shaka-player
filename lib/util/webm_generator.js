/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.WebmGenerator');

goog.require('shaka.mkv.BlockFlag');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.SegmentGenerator');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Writes the initialization and media segments that MSE plays for WebM: a
 * header with one track, and Clusters of SimpleBlocks.  It is what Matroska
 * needs to become WebM (VP8, Vorbis): WebM is a subset of it, and the frames
 * themselves are the same.  Blocks that lace several frames are the exception,
 * as MSE does not take lacing: each frame gets a block of its own.
 *
 * @implements {shaka.util.SegmentGenerator}
 */
shaka.util.WebmGenerator = class {
  /**
   * @param {shaka.util.WebmGenerator.StreamInfo} streamInfo
   */
  constructor(streamInfo) {
    /** @private {shaka.util.WebmGenerator.StreamInfo} */
    this.streamInfo_ = streamInfo;
  }

  /**
   * Generates an initialization segment.
   *
   * @override
   * @return {!Uint8Array}
   */
  initSegment() {
    const WebmGenerator = shaka.util.WebmGenerator;
    const ElementId = shaka.mkv.ElementId;

    const header = WebmGenerator.element_(ElementId.EBML,
        WebmGenerator.uint_(ElementId.EBML_VERSION, 1),
        WebmGenerator.uint_(ElementId.EBML_READ_VERSION, 1),
        WebmGenerator.uint_(ElementId.EBML_MAX_ID_LENGTH, 4),
        WebmGenerator.uint_(ElementId.EBML_MAX_SIZE_LENGTH, 8),
        WebmGenerator.string_(ElementId.DOC_TYPE, 'webm'),
        WebmGenerator.uint_(ElementId.DOC_TYPE_VERSION, 4),
        WebmGenerator.uint_(ElementId.DOC_TYPE_READ_VERSION, 2));
    const info = WebmGenerator.element_(ElementId.INFO,
        WebmGenerator.uint_(
            ElementId.TIMECODE_SCALE, this.streamInfo_.timecodeScale),
        WebmGenerator.string_(ElementId.MUXING_APP, 'Shaka Player'),
        WebmGenerator.string_(ElementId.WRITING_APP, 'Shaka Player'));
    const tracks = WebmGenerator.element_(
        ElementId.TRACKS, this.trackEntry_());
    // The Segment has no size, as it goes on for as long as media is appended.
    return shaka.util.Uint8ArrayUtils.concat(header,
        WebmGenerator.idBytes_(ElementId.SEGMENT),
        WebmGenerator.UNKNOWN_SIZE_, info, tracks);
  }

  /**
   * Generates a media segment: one or more Clusters.
   *
   * @override
   * @return {!Uint8Array}
   */
  segmentData() {
    const WebmGenerator = shaka.util.WebmGenerator;
    const ElementId = shaka.mkv.ElementId;
    const frames = this.streamInfo_.frames;

    const clusters = [];
    let start = 0;
    while (start < frames.length) {
      // A block writes its time as a signed 16-bit number of ticks after the
      // time of its Cluster, so a Cluster can only hold so much time.
      const clusterTimecode = frames[start].timecode;
      let end = start;
      const blocks = [];
      while (end < frames.length && frames[end].timecode - clusterTimecode <=
          WebmGenerator.MAX_CLUSTER_TICKS_) {
        blocks.push(this.simpleBlock_(frames[end], clusterTimecode));
        end++;
      }
      clusters.push(WebmGenerator.element_(ElementId.CLUSTER,
          WebmGenerator.uint_(ElementId.CLUSTER_TIMECODE, clusterTimecode),
          ...blocks));
      start = end;
    }
    return shaka.util.Uint8ArrayUtils.concat(...clusters);
  }

  /**
   * @return {!Uint8Array}
   * @private
   */
  trackEntry_() {
    const WebmGenerator = shaka.util.WebmGenerator;
    const ElementId = shaka.mkv.ElementId;
    const info = this.streamInfo_;
    const isVideo = info.type == shaka.mkv.TrackType.VIDEO;

    const fields = [
      WebmGenerator.uint_(ElementId.TRACK_NUMBER, info.trackNumber),
      // The identifier of the track; the number is as unique as anything.
      WebmGenerator.uint_(ElementId.TRACK_UID, info.trackNumber),
      WebmGenerator.uint_(ElementId.TRACK_TYPE, info.type),
      WebmGenerator.string_(ElementId.CODEC_ID, info.codecId),
    ];
    if (info.codecPrivate) {
      fields.push(WebmGenerator.element_(
          ElementId.CODEC_PRIVATE, info.codecPrivate));
    }
    if (isVideo) {
      fields.push(WebmGenerator.element_(ElementId.VIDEO,
          WebmGenerator.uint_(ElementId.PIXEL_WIDTH, info.width),
          WebmGenerator.uint_(ElementId.PIXEL_HEIGHT, info.height)));
    } else {
      fields.push(WebmGenerator.element_(ElementId.AUDIO,
          WebmGenerator.float_(ElementId.SAMPLING_FREQUENCY, info.sampleRate),
          WebmGenerator.uint_(ElementId.CHANNELS, info.channelCount)));
    }
    return WebmGenerator.element_(ElementId.TRACK_ENTRY, ...fields);
  }

  /**
   * @param {shaka.util.WebmGenerator.Frame} frame
   * @param {number} clusterTimecode
   * @return {!Uint8Array}
   * @private
   */
  simpleBlock_(frame, clusterTimecode) {
    const WebmGenerator = shaka.util.WebmGenerator;
    const relative = frame.timecode - clusterTimecode;
    // The track number is a variable-length integer, whose marker is part of
    // its value; a size is the same thing.
    const trackNumber = WebmGenerator.sizeVint_(this.streamInfo_.trackNumber);
    // The keyframe flag is set on every block of a track that has no other
    // kind (audio).
    const isKeyframe = frame.keyframe ||
        this.streamInfo_.type != shaka.mkv.TrackType.VIDEO;
    const flags = isKeyframe ? shaka.mkv.BlockFlag.KEYFRAME : 0;
    return WebmGenerator.element_(shaka.mkv.ElementId.SIMPLE_BLOCK,
        trackNumber,
        new Uint8Array([(relative >> 8) & 0xff, relative & 0xff, flags]),
        frame.data);
  }

  /**
   * @param {number} id
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   * @private
   */
  static element_(id, ...payload) {
    const WebmGenerator = shaka.util.WebmGenerator;
    const body = shaka.util.Uint8ArrayUtils.concat(...payload);
    return shaka.util.Uint8ArrayUtils.concat(
        WebmGenerator.idBytes_(id), WebmGenerator.sizeVint_(body.length), body);
  }

  /**
   * @param {number} id
   * @param {number} value
   * @return {!Uint8Array}
   * @private
   */
  static uint_(id, value) {
    const bytes = [];
    let rest = value;
    do {
      bytes.unshift(rest % 256);
      rest = Math.floor(rest / 256);
    } while (rest > 0);
    return shaka.util.WebmGenerator.element_(id, new Uint8Array(bytes));
  }

  /**
   * @param {number} id
   * @param {number} value
   * @return {!Uint8Array}
   * @private
   */
  static float_(id, value) {
    const bytes = new Uint8Array(8);
    shaka.util.BufferUtils.toDataView(bytes).setFloat64(0, value);
    return shaka.util.WebmGenerator.element_(id, bytes);
  }

  /**
   * @param {number} id
   * @param {string} value
   * @return {!Uint8Array}
   * @private
   */
  static string_(id, value) {
    return shaka.util.WebmGenerator.element_(id, new Uint8Array(
        Array.from(value).map((char) => char.charCodeAt(0))));
  }

  /**
   * @param {number} id An element ID, with its length marker.
   * @return {!Uint8Array}
   * @private
   */
  static idBytes_(id) {
    const bytes = [];
    for (let rest = id; rest > 0; rest = Math.floor(rest / 256)) {
      bytes.unshift(rest % 256);
    }
    return new Uint8Array(bytes);
  }

  /**
   * Writes a variable-length integer with as few bytes as it can: the number
   * of leading zeros of the first byte is the number of bytes that follow it.
   *
   * @param {number} value
   * @return {!Uint8Array}
   * @private
   */
  static sizeVint_(value) {
    for (let length = 1; length <= 8; length++) {
      // All the bits set is the reserved "unknown" value.
      if (value < Math.pow(2, 7 * length) - 1) {
        const bytes = new Uint8Array(length);
        let rest = value;
        for (let i = length - 1; i >= 0; i--) {
          bytes[i] = rest % 256;
          rest = Math.floor(rest / 256);
        }
        bytes[0] |= 0x80 >> (length - 1);
        return bytes;
      }
    }
    throw new RangeError('The value does not fit an EBML integer');
  }
};


/**
 * @typedef {{
 *   timecode: number,
 *   data: !Uint8Array,
 *   keyframe: boolean,
 * }}
 *
 * @property {number} timecode
 *   The time, in ticks of the timecode scale of the stream.
 * @property {!Uint8Array} data
 * @property {boolean} keyframe
 */
shaka.util.WebmGenerator.Frame;


/**
 * @typedef {{
 *   trackNumber: number,
 *   type: number,
 *   codecId: string,
 *   codecPrivate: ?Uint8Array,
 *   timecodeScale: number,
 *   width: number,
 *   height: number,
 *   channelCount: number,
 *   sampleRate: number,
 *   frames: !Array<shaka.util.WebmGenerator.Frame>,
 * }}
 *
 * @property {number} trackNumber
 * @property {number} type
 *   A shaka.mkv.TrackType.
 * @property {string} codecId
 *   The Matroska CodecID.
 * @property {?Uint8Array} codecPrivate
 * @property {number} timecodeScale
 *   Nanoseconds per tick.
 * @property {number} width
 *   Of a video track.
 * @property {number} height
 *   Of a video track.
 * @property {number} channelCount
 *   Of an audio track.
 * @property {number} sampleRate
 *   Of an audio track.
 * @property {!Array<shaka.util.WebmGenerator.Frame>} frames
 *   The frames of the media segment.
 */
shaka.util.WebmGenerator.StreamInfo;


/**
 * The size that EBML writes to say that an element goes on to the end: 8 bytes,
 * all the bits of the value set.
 *
 * @private @const {!Uint8Array}
 */
shaka.util.WebmGenerator.UNKNOWN_SIZE_ =
    new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);


/**
 * How far apart in time the first and the last block of a Cluster may be.  The
 * time of a block is a signed 16-bit number of ticks after that of its Cluster,
 * so this leaves room for the difference to be rounded.
 *
 * @private @const {number}
 */
shaka.util.WebmGenerator.MAX_CLUSTER_TICKS_ = 30000;
