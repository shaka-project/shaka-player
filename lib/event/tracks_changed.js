/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.TracksChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the list of tracks changes.  For example, this will happen when
 * new tracks are added/removed or when track restrictions change.
 * An app may want to look at <code>getAudioTracks()</code> or
 * <code>getVideoTracks()</code> or <code>getVariantTracks()</code> to see
 * what happened.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.TracksChanged = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.TracksChanged);
  }
};
