/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.KeyStatusChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the key status changed.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.KeyStatusChanged = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.KeyStatusChanged);
  }
};
