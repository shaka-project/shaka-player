/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Error');

goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.util.Error');


/**
 * Fired when a playback error occurs.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Error = class extends shaka.util.FakeEvent {
  /**
   * @param {!shaka.util.Error} detail
   *   An object which contains details on the error.  The error's
   *   <code>category</code> and <code>code</code> properties will identify the
   *   specific error that occurred.  In an uncompiled build, you can also use
   *   the <code>message</code> and <code>stack</code> properties to debug.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.Error);

    /** @type {!shaka.util.Error} */
    this.detail = detail;
  }
};
