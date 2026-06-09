/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ProducerReferenceTime');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the content includes ProducerReferenceTime (PRFT) info.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ProducerReferenceTime = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.ProducerReferenceTime} detail
   *   An object which contains the content of the PRFT box.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.Prft);

    /** @type {shaka.extern.ProducerReferenceTime} */
    this.detail = detail;
  }
};
