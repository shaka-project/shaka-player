/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ExpirationUpdated');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when there is a change in the expiration times of an EME session.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ExpirationUpdated = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.ExpirationUpdated);
  }
};
