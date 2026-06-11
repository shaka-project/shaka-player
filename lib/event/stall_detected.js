/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.StallDetected');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when a stall in playback is detected by the StallDetector.
 * Not all stalls are caused by gaps in the buffered ranges.
 * An app may want to look at <code>getStats()</code> to see what happened.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.StallDetected = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.StallDetected);
  }
};
