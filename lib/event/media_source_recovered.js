/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.MediaSourceRecovered');

goog.require('shaka.util.FakeEvent');


/**
 * Fired when MediaSource has been successfully recovered after occurrence of
 * a video error.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.MediaSourceRecovered = class extends shaka.util.FakeEvent {
  constructor() {
    super(shaka.util.FakeEvent.EventName.MediaSourceRecovered);
  }
};
