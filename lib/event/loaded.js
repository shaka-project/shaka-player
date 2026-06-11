/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Loaded');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player ends the load.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Loaded = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.Loaded);
  }
};
