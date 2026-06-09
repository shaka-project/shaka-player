/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Buffering');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player's buffering state changes.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Buffering = class extends shaka.util.FakeEvent {
  /**
   * @param {boolean} buffering
   *   True when the Player enters the buffering state.
   *   False when the Player leaves the buffering state.
   */
  constructor(buffering) {
    super(shaka.util.FakeEvent.EventName.Buffering);

    /** @type {boolean} */
    this.buffering = buffering;
  }
};
