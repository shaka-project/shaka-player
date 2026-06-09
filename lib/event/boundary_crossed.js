/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.BoundaryCrossed');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player has crossed a boundary and reset the MediaSource
 * successfully.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.BoundaryCrossed = class extends shaka.util.FakeEvent {
  /**
   * @param {boolean} oldEncrypted
   *   True when the old boundary is encrypted.
   * @param {boolean} newEncrypted
   *   True when the new boundary is encrypted.
   */
  constructor(oldEncrypted, newEncrypted) {
    super(shaka.util.FakeEvent.EventName.BoundaryCrossed);

    /** @type {boolean} */
    this.oldEncrypted = oldEncrypted;

    /** @type {boolean} */
    this.newEncrypted = newEncrypted;
  }
};
