/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.BaseTransmuxer');

goog.require('shaka.metadata.Id3Utils');

goog.requireType('shaka.media.SegmentReference');
goog.requireType('shaka.util.Mp4Generator');


/**
 * A base class for transmuxers that package transmuxed samples into fMP4
 * segments.  It factors out the state and bookkeeping shared by every such
 * transmuxer (the original MIME type, the running frame index and the cache of
 * generated init segments), leaving subclasses to implement only the
 * container-specific parsing in transmux().
 *
 * @abstract
 * @export
 */
shaka.transmuxer.BaseTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @protected {number} */
    this.frameIndex = 0;

    /** @private {!Map<string, !Uint8Array>} */
    this.initSegments = new Map();

    /** @private {?Uint8Array} */
    this.lastInitSegment_ = null;
  }


  /**
   * @export
   */
  destroy() {
    this.initSegments.clear();
  }


  /**
   * @return {string}
   * @export
   */
  getOriginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * Reads the transport-stream timestamp carried in the given ID3 data (the
   * 'com.apple.streaming.transportStreamTimestamp' frame), if present, falling
   * back to the provided default otherwise.
   *
   * @param {!Uint8Array} id3Data
   * @param {number} defaultTimestamp
   * @return {number}
   * @protected
   */
  getId3Timestamp(id3Data, defaultTimestamp) {
    const frames = shaka.metadata.Id3Utils.getID3Frames(id3Data);
    if (frames.length) {
      const metadataTimestamp = frames.find((frame) => {
        return frame.description ===
            'com.apple.streaming.transportStreamTimestamp';
      });
      if (metadataTimestamp) {
        return /** @type {number} */(metadataTimestamp.data);
      }
    }
    return defaultTimestamp;
  }


  /**
   * Packages the init and media segments produced by the given Mp4Generator.
   * The init segment is cached per discontinuity and the running frame index is
   * advanced.  The init segment is only (re)appended when it differs from the
   * last one used.
   *
   * @param {!shaka.util.Mp4Generator} mp4Generator
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference
   * @return {shaka.extern.TransmuxerOutput}
   * @protected
   */
  packageSegment(mp4Generator, stream, reference) {
    const initSegmentKey = stream.id + '_' + reference.discontinuitySequence;
    const initSegment = this.initSegments.getOrInsertComputed(
        initSegmentKey, () => mp4Generator.initSegment());
    const appendInitSegment = this.lastInitSegment_ !== initSegment;
    const segmentData = mp4Generator.segmentData();
    this.lastInitSegment_ = initSegment;
    this.frameIndex++;
    return {
      data: segmentData,
      init: appendInitSegment ? initSegment : null,
    };
  }
};
