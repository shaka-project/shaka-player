/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.CurrentItemChanged');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the current item in the queue changes.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.CurrentItemChanged = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.CurrentItemChanged);
  }
};
