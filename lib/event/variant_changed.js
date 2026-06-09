/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.VariantChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when a call from the application caused a variant change.
 * Can be triggered by calls to <code>selectVariantTrack()</code>,
 * <code>selectTextTrack()</code>, or <code>selectAudioTrack()</code>.
 * Does not fire when an automatic adaptation causes a variant change.
 * An app may want to look at <code>getStats()</code> or
 * <code>getVariantTracks()</code> to see what happened.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.VariantChanged = class extends shaka.util.FakeEvent {
  /**
   * @param {?shaka.extern.Track} oldTrack
   * @param {shaka.extern.Track} newTrack
   */
  constructor(oldTrack, newTrack) {
    super(shaka.util.FakeEvent.EventName.VariantChanged);

    /** @type {?shaka.extern.Track} */
    this.oldTrack = oldTrack;

    /** @type {shaka.extern.Track} */
    this.newTrack = newTrack;
  }
};
