/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.MediaQualityChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the media quality changes at the playhead.
 * That may be caused by an adaptation change or a manual track change.
 * By quality change we mean a change in bitrate, codec, resolution,
 * frame rate, sampling rate, or channel count.
 * Separate events are emitted for audio and video contentTypes.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.MediaQualityChanged = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.MediaQualityInfo} mediaQuality
   *   Information about media quality at the playhead position.
   * @param {number} position
   *   The playhead position.
   */
  constructor(mediaQuality, position) {
    super(shaka.util.FakeEvent.EventName.MediaQualityChanged);

    /** @type {shaka.extern.MediaQualityInfo} */
    this.mediaQuality = mediaQuality;

    /** @type {number} */
    this.position = position;
  }
};
