/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ManifestUpdated');

goog.require('shaka.util.FakeEvent');


/**
 * Fired after the manifest has been updated (live streams).
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ManifestUpdated = class extends shaka.util.FakeEvent {
  /**
   * @param {boolean} isLive
   *   True when the playlist is live. Useful to detect transition from live
   *   to static playlist.
   * @param {boolean} isInProgress
   *   True when the playlist is in-progress content. Useful to detect
   *   transition from live to static playlist.
   */
  constructor(isLive, isInProgress) {
    super(shaka.util.FakeEvent.EventName.ManifestUpdated);

    /** @type {boolean} */
    this.isLive = isLive;

    /** @type {boolean} */
    this.isInProgress = isInProgress;
  }
};
