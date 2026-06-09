/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.AudioTracksChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the list of audio tracks changes.
 * An app may want to look at <code>getAudioTracks()</code> to see what
 * happened.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.AudioTracksChanged = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.AudioTracksChanged);
  }
};
