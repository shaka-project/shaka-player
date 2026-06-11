/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.TimelineRegionEnter');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the playhead enters a timeline region.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.TimelineRegionEnter = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.TimelineRegionInfo} detail
   *   An object which contains a description of the region.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.TimelineRegionEnter);

    /** @type {shaka.extern.TimelineRegionInfo} */
    this.detail = detail;
  }
};
