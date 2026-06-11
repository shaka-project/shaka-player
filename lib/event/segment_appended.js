/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.SegmentAppended');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when a segment is appended to the media element.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.SegmentAppended = class extends shaka.util.FakeEvent {
  /**
   * @param {number} start
   *   The start time of the segment.
   * @param {number} end
   *   The end time of the segment.
   * @param {string} contentType
   *   The content type of the segment. E.g. 'video', 'audio', or 'text'.
   * @param {boolean} isMuxed
   *   Indicates if the segment is muxed (audio + video).
   * @param {boolean} isDependency
   *   Indicates if the segment is from a dependency stream.
   */
  constructor(start, end, contentType, isMuxed, isDependency) {
    super(shaka.util.FakeEvent.EventName.SegmentAppended);

    /** @type {number} */
    this.start = start;

    /** @type {number} */
    this.end = end;

    /** @type {string} */
    this.contentType = contentType;

    /** @type {boolean} */
    this.isMuxed = isMuxed;

    /** @type {boolean} */
    this.isDependency = isDependency;
  }
};
