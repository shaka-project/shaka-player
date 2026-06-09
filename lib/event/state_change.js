/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.StateChange');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player changes load states.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.StateChange = class extends shaka.util.FakeEvent {
  /**
   * @param {string} state
   *   The name of the state that the player just entered.
   */
  constructor(state) {
    super(shaka.util.FakeEvent.EventName.OnStateChange);

    /** @type {string} */
    this.state = state;
  }
};
