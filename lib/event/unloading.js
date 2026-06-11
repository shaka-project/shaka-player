/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Unloading');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player unloads or fails to load.
 * Used by the Cast receiver to determine idle state.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Unloading = class extends shaka.util.FakeEvent {
  /**
   * @param {boolean=} isSwitchingContent
   */
  constructor(isSwitchingContent = false) {
    super(shaka.util.FakeEvent.EventName.Unloading);

    /** @type {boolean} */
    this.isSwitchingContent = isSwitchingContent;
  }
};
