/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ItemsRemoved');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when items are removed from the queue.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ItemsRemoved = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.ItemsRemoved);
  }
};
