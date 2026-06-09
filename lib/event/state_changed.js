/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.StateChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player state has changed.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.StateChanged = class extends shaka.util.FakeEvent {
  /**
   * @param {string} newstate
   *   The new state.
   */
  constructor(newstate) {
    super(shaka.util.FakeEvent.EventName.StateChanged);

    /** @type {string} */
    this.newstate = newstate;
  }
};
