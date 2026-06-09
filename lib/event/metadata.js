/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Metadata');

goog.require('shaka.util.FakeEvent');


/**
 * Triggers after metadata associated with the stream is found.
 * Usually they are metadata of type ID3.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Metadata = class extends shaka.util.FakeEvent {
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
    super(shaka.util.FakeEvent.EventName.Metadata);

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
