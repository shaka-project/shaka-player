/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.MediaReadyState');


shaka.util.MediaReadyState = class {
  /**
   * @param {!HTMLMediaElement} mediaElement
   * @param {number} readyState
   * @param {shaka.util.EventManager} eventManager
   * @param {function()} callback
   */
  static waitForReadyState(mediaElement, readyState, eventManager, callback) {
    if (readyState == HTMLMediaElement.HAVE_NOTHING ||
      mediaElement.readyState >= readyState) {
      callback();
    } else {
      const MediaReadyState = shaka.util.MediaReadyState;
      const eventName =
          MediaReadyState.READY_STATES_TO_EVENT_NAMES_.get(readyState);
      eventManager.listenOnce(mediaElement, eventName, callback);
    }
  }
};

/**
 * @const {!Map.<number, string>}
 * @private
 */
shaka.util.MediaReadyState.READY_STATES_TO_EVENT_NAMES_ = new Map([
  [HTMLMediaElement.HAVE_METADATA, 'loadedmetadata'],
  [HTMLMediaElement.HAVE_CURRENT_DATA, 'loadeddata'],
  [HTMLMediaElement.HAVE_FUTURE_DATA, 'canplay'],
  [HTMLMediaElement.HAVE_ENOUGH_DATA, 'canplaythrough'],
]);
