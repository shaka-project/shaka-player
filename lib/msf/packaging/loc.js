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
goog.require('shaka.msf.QuicVarIntCodec');
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
    // gets the encoding every draft up to 16 used.
    return new shaka.msf.packaging.LocSegmenter(
        new shaka.msf.LOCParser(
            codec || new shaka.msf.QuicVarIntCodec(),
            this.frameDuration_, this.normalizedCodec_));
  }
};


/**
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.LocSegmenter = class {
  /**
   * @param {!shaka.msf.LOCParser} parser
   */
  constructor(parser) {
    /** @private {!shaka.msf.LOCParser} */
    this.parser_ = parser;
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
    }];
  }
};


shaka.msf.PackagingRegistry.registerPackaging(
    'loc', () => new shaka.msf.packaging.Loc());
