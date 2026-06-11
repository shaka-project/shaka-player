/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Emsg');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when an emsg box is found in a segment.
 * If the application calls preventDefault() on this event, further parsing
 * will not happen, and no 'metadata' event will be raised for ID3 payloads.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Emsg = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.EmsgInfo} detail
   *   An object which contains the content of the emsg box.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.Emsg);

    /** @type {shaka.extern.EmsgInfo} */
    this.detail = detail;
  }
};
