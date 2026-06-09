/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.AbrStatusChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the state of ABR has been changed (enabled or disabled).
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.AbrStatusChanged = class extends shaka.util.FakeEvent {
  /**
   * @param {boolean} newStatus
   *   The new status of the ABR. True for 'is enabled' and false otherwise.
   */
  constructor(newStatus) {
    super(shaka.util.FakeEvent.EventName.AbrStatusChanged);

    /** @type {boolean} */
    this.newStatus = newStatus;
  }
};
