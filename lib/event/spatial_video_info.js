/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.SpatialVideoInfo');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the video has spatial video info. If a previous event was fired,
 * this includes the new info.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.SpatialVideoInfo = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.SpatialVideoInfo} detail
   *   An object which contains the spatial video info.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.SpatialVideoInfoEvent);

    /** @type {shaka.extern.SpatialVideoInfo} */
    this.detail = detail;
  }
};
