/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.TextChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when a call from the application caused a text stream change.
 * Can be triggered by calls to <code>selectTextTrack()</code>.
 * An app may want to look at <code>getStats()</code> or
 * <code>getTextTracks()</code> to see what happened.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.TextChanged = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.TextChanged);
  }
};
