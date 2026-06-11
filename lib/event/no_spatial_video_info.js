/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.NoSpatialVideoInfo');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the video no longer has spatial video information.
 * For it to be fired, the shaka.event.SpatialVideoInfo event must have been
 * previously fired.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.NoSpatialVideoInfo = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.NoSpatialVideoInfoEvent);
  }
};
