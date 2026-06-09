/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.Started');

goog.require('shaka.util.FakeEvent');


/**
 * Fires when the content starts playing.
 * Only for VoD.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.Started = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.Started);
  }
};
