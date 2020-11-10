/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.InitSegmentReference');
goog.provide('shaka.media.SegmentReference');

goog.require('goog.asserts');
goog.require('shaka.util.ArrayUtils');


/**
 * Creates an InitSegmentReference, which provides the location to an
 * initialization segment.
 *
 * @export
 */
shaka.media.InitSegmentReference = class {
  /**
   * @param {function():!Array.<string>} uris A function that creates the URIs
   *   of the resource containing the segment.
   * @param {number} startByte The offset from the start of the resource to the
   *   start of the segment.
   * @param {?number} endByte The offset from the start of the resource to the
   *   end of the segment, inclusive.  A value of null indicates that the
   *   segment extends to the end of the resource.
   */
  constructor(uris, startByte, endByte) {
    /** @type {function():!Array.<string>} */
    this.getUris = uris;

    /** @const {number} */
    this.startByte = startByte;

    /** @const {?number} */
    this.endByte = endByte;
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
   * Check if two initSegmentReference have all the same values.
   * @param {?shaka.media.InitSegmentReference} reference1
   * @param {?shaka.media.InitSegmentReference} reference2
   * @return {boolean}
   */
  static equal(reference1, reference2) {
    const ArrayUtils = shaka.util.ArrayUtils;
    if (!reference1 || !reference2) {
      return reference1 == reference2;
    } else {
      return reference1.getStartByte() == reference2.getStartByte() &&
          reference1.getEndByte() == reference2.getEndByte() &&
          ArrayUtils.equal(reference1.getUris(), reference2.getUris());
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
   * @param {function():!Array.<string>} uris
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
   *   For HLS, this value should be 0 to keep the presentation time at the most
   *   recent discontinuity minus the corresponding media time.
   * @param {number} appendWindowStart
   *   The start of the append window for this reference, relative to the
   *   presentation.  Any content from before this time will be removed by
   *   MediaSource.
   * @param {number} appendWindowEnd
   *   The end of the append window for this reference, relative to the
   *   presentation.  Any content from after this time will be removed by
   *   MediaSource.
   */
  constructor(
      startTime, endTime, uris, startByte, endByte, initSegmentReference,
      timestampOffset, appendWindowStart, appendWindowEnd) {
    goog.asserts.assert(startTime < endTime,
        'startTime must be less than endTime');
    goog.asserts.assert((endByte == null) || (startByte < endByte),
        'startByte must be < endByte');

    /** @type {number} */
    this.startTime = startTime;

    /** @type {number} */
    this.endTime = endTime;

    /** @type {function():!Array.<string>} */
    this.getUris = uris;

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
};


/**
 * A convenient typedef for when either type of reference is acceptable.
 *
 * @typedef {shaka.media.InitSegmentReference|shaka.media.SegmentReference}
 */
shaka.media.AnySegmentReference;
