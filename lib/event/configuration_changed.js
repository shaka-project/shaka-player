/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ConfigurationChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player configuration changes.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ConfigurationChanged = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.ConfigurationChanged);
  }
};
