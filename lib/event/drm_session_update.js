/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.DrmSessionUpdate');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when the CDM has accepted the license response.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.DrmSessionUpdate = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.DrmSessionUpdate);
  }
};
