/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.events.ErrorEvent');

goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');


/**
 * @event shaka.events.ErrorEvent
 * @description Fired when a playback error occurs.
 * @property {string} type
 *   'error'
 * @property {!shaka.util.Error} detail
 *   An object which contains details on the error.  The error's
 *   <code>category</code> and <code>code</code> properties will identify the
 *   specific error that occurred.  In an uncompiled build, you can also use the
 *   <code>message</code> and <code>stack</code> properties to debug.
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.events.ErrorEvent = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.util.Error} error
   */
  constructor(error) {
    /** @type {!shaka.util.FakeEvent.EventName} */
    const name = shaka.util.FakeEvent.EventName.Error;

    /** @type {Map.<string, Object>} */
    const data = new Map().set('detail', error);

    super(name, data);
  }
};
