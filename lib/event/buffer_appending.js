/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.BufferAppending');

goog.require('shaka.util.FakeEvent');


/**
 * Fired before a segment is appended to the media element.
 * Provides segment data.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.BufferAppending = class extends shaka.util.FakeEvent {
  /**
   * @param {string} contentType
   *   The content type of the segment. E.g. 'video', 'audio'.
   * @param {BufferSource} data
   *   The segment data.
   * @param {boolean} isInitData
   *   Indicates if the segment is an init segment.
   *   Useful for prepending to data for decoding.
   */
  constructor(contentType, data, isInitData) {
    super(shaka.util.FakeEvent.EventName.BufferAppending);

    /** @type {string} */
    this.contentType = contentType;

    /** @type {BufferSource} */
    this.data = data;

    /** @type {boolean} */
    this.isInitData = isInitData;
  }
};
