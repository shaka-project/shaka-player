/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.InitSegmentReference');
goog.provide('shaka.media.SegmentReference');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.BufferUtils');


/**
 * Creates an InitSegmentReference, which provides the location to an
 * initialization segment.
 *
 * @export
 */
shaka.media.InitSegmentReference = class {
  /**
   * @param {function(): !Array<string>} uris A function that creates the URIs
   *   of the resource containing the segment.
   * @param {number} startByte The offset from the start of the resource to the
   *   start of the segment.
   * @param {?number} endByte The offset from the start of the resource
   *   to the end of the segment, inclusive.  A value of null indicates that the
   *   segment extends to the end of the resource.
   * @param {null|shaka.extern.MediaQualityInfo=} mediaQuality Information about
   *   the quality of the media associated with this init segment.
   * @param {(null|number)=} timescale
   * @param {(null|BufferSource)=} segmentData
   * @param {?shaka.extern.aesKey=} aesKey
   *  The segment's AES-128-CBC full segment encryption key and iv.
   * @param {boolean=} encrypted
   */
  constructor(uris, startByte, endByte, mediaQuality = null, timescale = null,
      segmentData = null, aesKey = null, encrypted = false) {
    /** @type {function(): !Array<string>} */
    this.getUris = uris;

    /** @const {number} */
    this.startByte = startByte;

    /** @const {?number} */
    this.endByte = endByte;

    /** @type {shaka.extern.MediaQualityInfo|null} */
    this.mediaQuality = mediaQuality;

    /** @type {number|null} */
    this.timescale = timescale;

    /** @type {BufferSource|null} */
    this.segmentData = segmentData;

    /** @type {?shaka.extern.aesKey} */
    this.aesKey = aesKey;

    /** @type {?string} */
    this.codecs = null;

    /** @type {?string} */
    this.mimeType = null;

    /** @type {?number} */
    this.boundaryEnd = null;

    /** @const {boolean} */
    this.encrypted = encrypted;
  }

  /**
   * Returns the offset from the start of the resource to the
   * start of the segment.
   *
   * @return {number}
   * @export
   */
  getStartByte() {
    return this.startByte;
  }

  /**
   * Returns the offset from the start of the resource to the end of the
   * segment, inclusive.  A value of null indicates that the segment extends
   * to the end of the resource.
   *
   * @return {?number}
   * @export
   */
  getEndByte() {
    return this.endByte;
  }

  /**
   * Returns the size of the init segment.
   * @return {?number}
   */
  getSize() {
    if (this.endByte) {
      return this.endByte - this.startByte;
    } else {
      return null;
    }
  }

  /**
   * Returns media quality information for the segments associated with
   * this init segment.
   *
   * @return {?shaka.extern.MediaQualityInfo}
   */
  getMediaQuality() {
    return this.mediaQuality;
  }

  /**
   * Set the segment data.
   *
   * @param {!BufferSource} segmentData
   */
  setSegmentData(segmentData) {
    this.segmentData = segmentData;
  }

  /**
   * Return the segment data.
   *
   * @return {?BufferSource}
   */
  getSegmentData() {
    return this.segmentData;
  }


  /**
   * Check if two initSegmentReference have all the same values.
   * @param {?shaka.media.InitSegmentReference} reference1
   * @param {?shaka.media.InitSegmentReference} reference2
   * @return {boolean}
   */
  static equal(reference1, reference2) {
    const ArrayUtils = shaka.util.ArrayUtils;
    const BufferUtils = shaka.util.BufferUtils;

    if (reference1 === reference2) {
      return true;
    } else if (!reference1 || !reference2) {
      return reference1 == reference2;
    } else {
      return reference1.getStartByte() == reference2.getStartByte() &&
          reference1.getEndByte() == reference2.getEndByte() &&
          ArrayUtils.equal(
              reference1.getUris().sort(), reference2.getUris().sort()) &&
          BufferUtils.equal(reference1.getSegmentData(),
              reference2.getSegmentData());
    }
  }
};


/**
 * SegmentReference provides the start time, end time, and location to a media
 * segment.
 *
 * @export
 */
shaka.media.SegmentReference = class {
  /**
   * @param {number} startTime The segment's start time in seconds.
   * @param {number} endTime The segment's end time in seconds.  The segment
   *   ends the instant before this time, so |endTime| must be strictly greater
   *   than |startTime|.
   * @param {function(): !Array<string>} uris
   *   A function that creates the URIs of the resource containing the segment.
   * @param {number} startByte The offset from the start of the resource to the
   *   start of the segment.
   * @param {?number} endByte The offset from the start of the resource to the
   *   end of the segment, inclusive.  A value of null indicates that the
   *   segment extends to the end of the resource.
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   *   The segment's initialization segment metadata, or null if the segments
   *   are self-initializing.
   * @param {number} timestampOffset
   *   The amount of time, in seconds, that must be added to the segment's
   *   internal timestamps to align it to the presentation timeline.
   *   <br>
   *   For DASH, this value should equal the Period start time minus the first
   *   presentation timestamp of the first frame/sample in the Period.  For
   *   example, for MP4 based streams, this value should equal Period start
   *   minus the first segment's tfdt box's 'baseMediaDecodeTime' field (after
   *   it has been converted to seconds).
   *   <br>
   *   For HLS, this value should be the start time of the most recent
   *   discontinuity, or 0 if there is no preceding discontinuity. Only used
   *   in segments mode.
   * @param {number} appendWindowStart
   *   The start of the append window for this reference, relative to the
   *   presentation.  Any content from before this time will be removed by
   *   MediaSource.
   * @param {number} appendWindowEnd
   *   The end of the append window for this reference, relative to the
   *   presentation.  Any content from after this time will be removed by
   *   MediaSource.
   * @param {!Array<!shaka.media.SegmentReference>=} partialReferences
   *   A list of SegmentReferences for the partial segments.
   * @param {?string=} tilesLayout
   *   The value is a grid-item-dimension consisting of two positive decimal
   *   integers in the format: column-x-row ('4x3'). It describes the
   *   arrangement of Images in a Grid. The minimum valid LAYOUT is '1x1'.
   * @param {?number=} tileDuration
   *  The explicit duration of an individual tile within the tiles grid.
   *  If not provided, the duration should be automatically calculated based on
   *  the duration of the reference.
   * @param {?number=} syncTime
   *  A time value, expressed in seconds since 1970, which is used to
   *  synchronize between streams.  Both produced and consumed by the HLS
   *  parser.  Other components should not need this value.
   * @param {shaka.media.SegmentReference.Status=} status
   *  The segment status is used to indicate that a segment does not exist or is
   *  not available.
   * @param {?shaka.extern.aesKey=} aesKey
   *  The segment's AES-128-CBC full segment encryption key and iv.
   * @param {boolean=} allPartialSegments
   *  Indicate if the segment has all partial segments
   */
  constructor(
      startTime, endTime, uris, startByte, endByte, initSegmentReference,
      timestampOffset, appendWindowStart, appendWindowEnd,
      partialReferences = [], tilesLayout = '', tileDuration = null,
      syncTime = null, status = shaka.media.SegmentReference.Status.AVAILABLE,
      aesKey = null, allPartialSegments = false) {
    // A preload hinted Partial Segment has the same startTime and endTime.
    goog.asserts.assert(startTime <= endTime,
        'startTime must be less than or equal to endTime');
    goog.asserts.assert((endByte == null) || (startByte < endByte),
        'startByte must be < endByte');

    /** @type {number} */
    this.startTime = startTime;

    /** @type {number} */
    this.endTime = endTime;

    /**
     * The "true" end time of the segment, without considering the period end
     * time.  This is necessary for thumbnail segments, where timing requires us
     * to know the original segment duration as described in the manifest.
     * @type {number}
     */
    this.trueEndTime = endTime;

    /** @type {function(): !Array<string>} */
    this.getUrisInner = uris;

    /** @const {number} */
    this.startByte = startByte;

    /** @const {?number} */
    this.endByte = endByte;

    /** @type {shaka.media.InitSegmentReference} */
    this.initSegmentReference = initSegmentReference;

    /** @type {number} */
    this.timestampOffset = timestampOffset;

    /** @type {number} */
    this.appendWindowStart = appendWindowStart;

    /** @type {number} */
    this.appendWindowEnd = appendWindowEnd;

    /** @type {!Array<!shaka.media.SegmentReference>} */
    this.partialReferences = partialReferences;

    /** @type {?string} */
    this.tilesLayout = tilesLayout;

    /** @type {?number} */
    this.tileDuration = tileDuration;

    /**
     * A time value, expressed in seconds since 1970, which is used to
     * synchronize between streams.  Both produced and consumed by the HLS
     * parser.  Other components should not need this value.
     *
     * @type {?number}
     */
    this.syncTime = syncTime;

    /** @type {shaka.media.SegmentReference.Status} */
    this.status = status;

    /** @type {boolean} */
    this.preload = false;

    /** @type {boolean} */
    this.independent = true;

    /** @type {boolean} */
    this.byterangeOptimization = false;

    /** @type {?shaka.extern.aesKey} */
    this.aesKey = aesKey;

    /** @type {?shaka.extern.ThumbnailSprite} */
    this.thumbnailSprite = null;

    /** @type {number} */
    this.discontinuitySequence = -1;

    /** @type {boolean} */
    this.allPartialSegments = allPartialSegments;

    /** @type {boolean} */
    this.partial = false;

    /** @type {boolean} */
    this.lastPartial = false;

    for (const partial of this.partialReferences) {
      partial.markAsPartial();
    }
    if (this.allPartialSegments && this.partialReferences.length) {
      const lastPartial =
          this.partialReferences[this.partialReferences.length - 1];
      lastPartial.markAsLastPartial();
    }

    /** @type {?string} */
    this.codecs = null;

    /** @type {?string} */
    this.mimeType = null;

    /** @type {?number} */
    this.bandwidth = null;

    /** @type {BufferSource|null} */
    this.segmentData = null;

    /** @type {boolean} */
    this.removeSegmentDataOnGet = false;
  }

  /**
   * Creates and returns the URIs of the resource containing the segment.
   *
   * @return {!Array<string>}
   * @export
   */
  getUris() {
    return this.getUrisInner();
  }

  /**
   * Returns the segment's start time in seconds.
   *
   * @return {number}
   * @export
   */
  getStartTime() {
    return this.startTime;
  }

  /**
   * Returns the segment's end time in seconds.
   *
   * @return {number}
   * @export
   */
  getEndTime() {
    return this.endTime;
  }

  /**
   * Returns the offset from the start of the resource to the
   * start of the segment.
   *
   * @return {number}
   * @export
   */
  getStartByte() {
    return this.startByte;
  }

  /**
   * Returns the offset from the start of the resource to the end of the
   * segment, inclusive.  A value of null indicates that the segment extends to
   * the end of the resource.
   *
   * @return {?number}
   * @export
   */
  getEndByte() {
    return this.endByte;
  }

  /**
   * Returns the size of the segment.
   * @return {?number}
   */
  getSize() {
    if (this.endByte) {
      return this.endByte - this.startByte;
    } else {
      return null;
    }
  }

  /**
   * Returns true if it contains partial SegmentReferences.
   * @return {boolean}
   */
  hasPartialSegments() {
    return this.partialReferences.length > 0;
  }

  /**
   * Returns true if it contains all partial SegmentReferences.
   * @return {boolean}
   */
  hasAllPartialSegments() {
    return this.allPartialSegments;
  }

  /**
   * Returns the segment's tiles layout. Only defined in image segments.
   *
   * @return {?string}
   * @export
   */
  getTilesLayout() {
    return this.tilesLayout;
  }

  /**
   * Returns the segment's explicit tile duration.
   * Only defined in image segments.
   *
   * @return {?number}
   * @export
   */
  getTileDuration() {
    return this.tileDuration;
  }

  /**
   * Returns the segment's status.
   *
   * @return {shaka.media.SegmentReference.Status}
   * @export
   */
  getStatus() {
    return this.status;
  }

  /**
   * Mark the reference as unavailable.
   *
   * @export
   */
  markAsUnavailable() {
    this.status = shaka.media.SegmentReference.Status.UNAVAILABLE;
  }

  /**
   * Mark the reference as preload.
   *
   * @export
   */
  markAsPreload() {
    this.preload = true;
  }

  /**
   * Returns true if the segment is preloaded.
   *
   * @return {boolean}
   * @export
   */
  isPreload() {
    return this.preload;
  }

  /**
   * Mark the reference as non-independent.
   *
   * @export
   */
  markAsNonIndependent() {
    this.independent = false;
  }

  /**
   * Returns true if the segment is independent.
   *
   * @return {boolean}
   * @export
   */
  isIndependent() {
    return this.independent;
  }

  /**
   * Mark the reference as partial.
   *
   * @export
   */
  markAsPartial() {
    this.partial = true;
  }

  /**
   * Returns true if the segment is partial.
   *
   * @return {boolean}
   * @export
   */
  isPartial() {
    return this.partial;
  }

  /**
   * Mark the reference as being the last part of the full segment
   *
   * @export
   */
  markAsLastPartial() {
    this.lastPartial = true;
  }

  /**
   * Returns true if reference as being the last part of the full segment.
   *
   * @return {boolean}
   * @export
   */
  isLastPartial() {
    return this.lastPartial;
  }

  /**
   * Mark the reference as byterange optimization.
   *
   * The "byterange optimization" means that it is playable using MP4 low
   * latency streaming with chunked data.
   *
   * @export
   */
  markAsByterangeOptimization() {
    this.byterangeOptimization = true;
  }

  /**
   * Returns true if the segment has a byterange optimization.
   *
   * @return {boolean}
   * @export
   */
  hasByterangeOptimization() {
    return this.byterangeOptimization;
  }

  /**
   * Set the segment's thumbnail sprite.
   *
   * @param {shaka.extern.ThumbnailSprite} thumbnailSprite
   * @export
   */
  setThumbnailSprite(thumbnailSprite) {
    this.thumbnailSprite = thumbnailSprite;
  }

  /**
   * Returns the segment's thumbnail sprite.
   *
   * @return {?shaka.extern.ThumbnailSprite}
   * @export
   */
  getThumbnailSprite() {
    return this.thumbnailSprite;
  }

  /**
   * Offset the segment reference by a fixed amount.
   *
   * @param {number} offset The amount to add to the segment's start and end
   *   times.
   * @export
   */
  offset(offset) {
    this.startTime += offset;
    this.endTime += offset;
    this.trueEndTime += offset;

    for (const partial of this.partialReferences) {
      partial.startTime += offset;
      partial.endTime += offset;
      partial.trueEndTime += offset;
    }
  }

  /**
   * Sync this segment against a particular sync time that will serve as "0" in
   * the presentation timeline.
   *
   * @param {number} lowestSyncTime
   * @export
   */
  syncAgainst(lowestSyncTime) {
    if (this.syncTime == null) {
      shaka.log.alwaysError('Sync attempted without sync time!');
      return;
    }
    const desiredStart = this.syncTime - lowestSyncTime;
    const offset = desiredStart - this.startTime;
    if (Math.abs(offset) >= 0.001) {
      this.offset(offset);
    }
  }

  /**
   * Set the segment data.
   *
   * @param {!BufferSource} segmentData
   * @param {boolean=} singleUse
   * @export
   */
  setSegmentData(segmentData, singleUse = false) {
    this.segmentData = segmentData;
    this.removeSegmentDataOnGet = singleUse;
  }

  /**
   * Return the segment data.
   *
   * @param {boolean=} allowDeleteOnSingleUse
   * @return {?BufferSource}
   * @export
   */
  getSegmentData(allowDeleteOnSingleUse = true) {
    const ret = this.segmentData;
    if (allowDeleteOnSingleUse && this.removeSegmentDataOnGet) {
      this.segmentData = null;
    }
    return ret;
  }

  /**
   * Updates the init segment reference and propagates the update to all partial
   * references.
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   */
  updateInitSegmentReference(initSegmentReference) {
    this.initSegmentReference = initSegmentReference;
    for (const partialReference of this.partialReferences) {
      partialReference.updateInitSegmentReference(initSegmentReference);
    }
  }
};


/**
 * Rather than using booleans to communicate what the state of the reference,
 * we have this enum.
 *
 * @enum {number}
 * @export
 */
shaka.media.SegmentReference.Status = {
  AVAILABLE: 0,
  UNAVAILABLE: 1,
  MISSING: 2,
};


/**
 * A convenient typedef for when either type of reference is acceptable.
 *
 * @typedef {shaka.media.InitSegmentReference|shaka.media.SegmentReference}
 */
shaka.media.AnySegmentReference;


/**
 * @typedef {{
 *   height: number,
 *   positionX: number,
 *   positionY: number,
 *   width: number,
 * }}
 *
 * @property {number} height
 *    The thumbnail height in px.
 * @property {number} positionX
 *    The thumbnail left position in px.
 * @property {number} positionY
 *    The thumbnail top position in px.
 * @property {number} width
 *    The thumbnail width in px.
 * @export
 */
shaka.media.SegmentReference.ThumbnailSprite;
