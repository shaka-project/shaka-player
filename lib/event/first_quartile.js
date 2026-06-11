/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.FirstQuartile');

goog.require('shaka.util.FakeEvent');


/**
 * Fires when the content playhead crosses the first quartile.
 * Only for VoD.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.FirstQuartile = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.FirstQuartile);
  }
};
