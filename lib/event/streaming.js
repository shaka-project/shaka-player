/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Streaming');

goog.require('shaka.util.FakeEvent');


/**
 * Fired after the manifest has been parsed and track information is available,
 * but before streams have been chosen and before any segments have been
 * fetched.  You may use this event to configure the player based on
 * information found in the manifest.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Streaming = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.Streaming);
  }
};
