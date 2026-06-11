/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.ManifestParsed');

goog.require('shaka.util.FakeEvent');


/**
 * Fired after the manifest has been parsed, but before anything else happens.
 * The manifest may contain streams that will be filtered out, at this stage
 * of the loading process.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.ManifestParsed = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.ManifestParsed);
  }
};
