/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.LicenseRenewal');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when a license renewal has been triggered.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.LicenseRenewal = class extends shaka.util.FakeEvent {
  /**
   * @param {shaka.extern.DrmSessionMetadata} oldSessionMetadata
   *   The metadata of the session before renewal.
   * @param {shaka.extern.DrmSessionMetadata} newSessionMetadata
   *   The metadata of the session after renewal.
   */
  constructor(oldSessionMetadata, newSessionMetadata) {
    super('licenserenewal');

    /** @type {shaka.extern.DrmSessionMetadata} */
    this.oldSessionMetadata = oldSessionMetadata;

    /** @type {shaka.extern.DrmSessionMetadata} */
    this.newSessionMetadata = newSessionMetadata;
  }
};
