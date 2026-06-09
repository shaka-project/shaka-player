/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ProgramInformation');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the content includes ProgramInformation.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ProgramInformation = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.xml.Node} detail
   *   The XML element that defines the ProgramInformation.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.ProgramInformation);

    /** @type {shaka.extern.xml.Node} */
    this.detail = detail;
  }
};
