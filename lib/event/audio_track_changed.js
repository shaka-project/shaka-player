/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.AudioTrackChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the audio track changes at the playhead.
 * That may be caused by a user requesting to change audio tracks.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.AudioTrackChanged = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.MediaQualityInfo} mediaQuality
   *   Information about media quality at the playhead position.
   * @param {number} position
   *   The playhead position.
   */
  constructor(mediaQuality, position) {
    super(shaka.util.FakeEvent.EventName.AudioTrackChanged);

    /** @type {shaka.extern.MediaQualityInfo} */
    this.mediaQuality = mediaQuality;

    /** @type {number} */
    this.position = position;
  }
};
