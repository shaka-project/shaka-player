/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.RateChange');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the video's playback rate changes.
 * This allows the PlayRateController to update its internal rate field,
 * before the UI updates the playback button with the newest playback rate.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.RateChange = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.RateChange);
  }
};
