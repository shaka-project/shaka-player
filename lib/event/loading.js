/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Loading');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the player begins loading. The start of loading is defined as
 * when the user has communicated intent to load content (i.e.
 * <code>Player.load</code> has been called).
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Loading = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.Loading);
  }
};
