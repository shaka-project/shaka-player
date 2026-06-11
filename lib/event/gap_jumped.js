/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.GapJumped');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the GapJumpingController jumps over a gap in the buffered ranges.
 * An app may want to look at <code>getStats()</code> to see what happened.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.GapJumped = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.GapJumped);
  }
};
