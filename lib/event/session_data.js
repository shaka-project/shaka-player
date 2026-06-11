/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.SessionData');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the manifest parser finds info about session data.
 * Specification: https://tools.ietf.org/html/rfc8216#section-4.3.4.4
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.SessionData = class extends shaka.util.FakeEvent {
  /**
   * @param {string} id
   *   The id of the session data.
   * @param {?string} uri
   *   The uri with the session data info.
   * @param {?string} language
   *   The language of the session data.
   * @param {?string} value
   *   The value of the session data.
   */
  constructor(id, uri, language, value) {
    super(shaka.util.FakeEvent.EventName.SessionDataEvent);

    /** @type {string} */
    this.id = id;

    /** @type {?string} */
    this.uri = uri;

    /** @type {?string} */
    this.language = language;

    /** @type {?string} */
    this.value = value;
  }
};
