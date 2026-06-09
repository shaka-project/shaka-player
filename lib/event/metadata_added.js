/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.MetadataAdded');

goog.require('shaka.util.FakeEvent');


/**
 * Triggers when metadata associated with the stream is added.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.MetadataAdded = class extends shaka.util.FakeEvent {
  /**
   * @param {number} startTime
   *   The time that describes the beginning of the range of the metadata to
   *   which the cue applies.
   * @param {?number} endTime
   *   The time that describes the end of the range of the metadata to which
   *   the cue applies.
   * @param {string} metadataType
   *   Type of metadata. Eg: 'org.id3' or 'com.apple.quicktime.HLS'
   * @param {shaka.extern.MetadataFrame} payload
   *   The metadata itself.
   */
  constructor(startTime, endTime, metadataType, payload) {
    super(shaka.util.FakeEvent.EventName.MetadataAdded);

    /** @type {number} */
    this.startTime = startTime;

    /** @type {?number} */
    this.endTime = endTime;

    /** @type {string} */
    this.metadataType = metadataType;

    /** @type {shaka.extern.MetadataFrame} */
    this.payload = payload;
  }
};
