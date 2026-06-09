/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Adaptation');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when an automatic adaptation causes the active tracks to change.
 * Does not fire when the application calls <code>selectVariantTrack()</code>,
 * <code>selectTextTrack()</code>, or <code>selectAudioTrack()</code>.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Adaptation = class extends shaka.util.FakeEvent {
  /**
   * @param {?shaka.extern.Track} oldTrack
   * @param {shaka.extern.Track} newTrack
   */
  constructor(oldTrack, newTrack) {
    super(shaka.util.FakeEvent.EventName.Adaptation);

    /** @type {?shaka.extern.Track} */
    this.oldTrack = oldTrack;

    /** @type {shaka.extern.Track} */
    this.newTrack = newTrack;
  }
};
