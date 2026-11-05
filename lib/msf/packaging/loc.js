/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.Loc');

goog.require('shaka.log');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.LOCParser');
goog.require('shaka.msf.PackagingRegistry');
goog.require('shaka.msf.draft18.Codec');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');


/**
 * Packaging for Low Overhead Container tracks, where every MoQT object is one
 * frame of a raw elementary bitstream.
 *
 * A frame carries no container, so nothing about the media can be read out of
 * the objects themselves: the codec comes from the catalog, and timing is a
 * fixed frame duration derived from the catalog's framerate or samplerate,
 * with the frame's own timestamp used only to place it.
 *
 * @see https://www.ietf.org/archive/id/draft-ietf-moq-loc-04.html
 *
 * @implements {shaka.extern.MsfPackaging}
 * @final
 */
shaka.msf.packaging.Loc = class {
  constructor() {
    /** @private {number} */
    this.frameDuration_ = 0;

    /** @private {string} */
    this.normalizedCodec_ = '';

    /** @private {boolean} */
    this.isVideo_ = false;
  }

  /**
   * @override
   */
  describeTrack(track, initData) {
    if (!track.codec) {
      shaka.log.info('Skipping LOC track with no codec', track);
      return null;
    }

    // For LOC tracks compute the fixed frame duration from MSF catalog fields
    // so that timing never depends on the optional LOC Timestamp property.
    const frameDuration = shaka.msf.LOCParser.frameDurationFromTrack(track);
    if (frameDuration === null) {
      shaka.log.warning(`LOC track "${track.name}" has no usable frame ` +
          'duration; skipping.');
      return null;
    }
    this.frameDuration_ = frameDuration;
    this.normalizedCodec_ =
        shaka.util.MimeUtils.getNormalizedCodec(track.codec);

    const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMimeType(
        `moq/loc; codecs="${track.codec}"`);
    // The MIME type is moq/loc, so basicInfo.type cannot tell video apart.
    // Classify the codec the way MSFParser does when it builds the stream.
    this.isVideo_ = shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS.some(
        (format) => format.test(track.codec.trim()));

    // LOC has no initialization segment: an object is a raw elementary
    // bitstream frame, and LocTransmuxer builds the MP4 initialization
    // segment itself from the parsed parameter sets.
    //
    // A reference used to be synthesised for any track declaring a timescale.
    // MediaSourceEngine then appended it, and an initialization-segment
    // append passes reference=null into transmux(), which every LOC stream
    // handler dereferences for its baseMediaDecodeTime:
    //
    //   TypeError: Cannot read properties of null (reading 'startTime')
    //
    // That aborted every append, and surfaced only as "failed fetch and
    // append: code=undefined" — the code is undefined because a raw
    // TypeError is not a shaka.util.Error — with the player stalled at
    // HAVE_NOTHING. The timescale it carried is read only by
    // MediaSourceEngine's prft parsing, which cannot apply to a track that
    // has no MP4 boxes on the wire.
    return {basicInfo, initSegmentReference: null};
  }

  /**
   * @override
   */
  createSegmenter(codec) {
    // A caller with no session -- a test, or a packaging driven directly --
    // gets the encoding every supported draft uses.
    return new shaka.msf.packaging.LocSegmenter(
        new shaka.msf.LOCParser(
            codec || new shaka.msf.draft18.Codec(),
            this.frameDuration_, this.normalizedCodec_), this.isVideo_);
  }
};


/**
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.LocSegmenter = class {
  /**
   * @param {!shaka.msf.LOCParser} parser
   * @param {boolean} isVideo
   */
  constructor(parser, isVideo) {
    /** @private {!shaka.msf.LOCParser} */
    this.parser_ = parser;

    /** @private {boolean} */
    this.isVideo_ = isVideo;
  }

  /**
   * @override
   */
  push(obj) {
    if (!obj.data.byteLength) {
      return [];
    }

    const result = this.parser_.parse(obj);
    // The payload is empty once the private properties prefix is stripped when
    // the object carried properties but no bitstream.
    if (!result.duration || !result.payload.byteLength) {
      return [];
    }

    return [{
      startTime: result.startTime,
      duration: result.duration,
      data: result.payload,
      timestampOffset: 0,
      discontinuitySequence: -1,
      independent: this.isIndependent_(obj, result.independent),
    }];
  }

  /**
   * @override
   */
  release() {
    // Nothing is held beyond what garbage collection frees.
  }

  /**
   * @param {!shaka.extern.MsfObject} obj
   * @param {?boolean} frameMarking The I bit of the object's Video Frame
   *   Marking, or null when it carries none.
   * @return {boolean}
   * @private
   */
  isIndependent_(obj, frameMarking) {
    if (!this.isVideo_) {
      return true;
    }
    // The publisher's own marking also covers key frames inside a Group.
    if (frameMarking !== null) {
      return frameMarking;
    }
    // Otherwise each video Group is one GOP whose first Object is the key
    // frame (MSF section 4.1, LOC section 4.2). A live join can deliver the
    // rest of the Group first, and those frames cannot start decoding.
    return obj.location.object == BigInt(0);
  }
};


shaka.msf.PackagingRegistry.registerPackaging(
    'loc', () => new shaka.msf.packaging.Loc());
