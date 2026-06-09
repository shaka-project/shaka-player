/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.TimelineRegionAdded');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when a media timeline region is added.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.TimelineRegionAdded = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.TimelineRegionInfo} detail
   *   An object which contains a description of the region.
   */
  constructor(detail) {
    super(shaka.util.FakeEvent.EventName.TimelineRegionAdded);

    /** @type {shaka.extern.TimelineRegionInfo} */
    this.detail = detail;
  }
};
