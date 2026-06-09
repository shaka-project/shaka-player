/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.CanUpdateStartTime');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when it is safe to update the start time of a stream.
 * You may use this event to get the seek range and update the start time,
 * e.g. on live streams.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.CanUpdateStartTime = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.CanUpdateStartTime);
  }
};
