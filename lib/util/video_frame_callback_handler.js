/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.VideoFrameCallbackHandler');

goog.require('shaka.util.IReleasable');


/**
 * Handles video frame callbacks using requestVideoFrameCallback.
 *
 * Note: Only one active callback can be registered at a time. Calling `start`
 * will cancel any previously scheduled callback before registering a new one.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.util.VideoFrameCallbackHandler = class {
  /**
   * @param {!HTMLVideoElement} video
   */
  constructor(video) {
    /** @private {?HTMLVideoElement} */
    this.video_ = video;

    /** @private {?number} */
    this.callbackHandle_ = null;

    /** @private {?VideoFrameRequestCallback} */
    this.boundCallback_ = null;
  }

  /**
   * @param {!function(number,  ?VideoFrameMetadata)} callback
   * @param {boolean=} once
   * @return {boolean}
   */
  start(callback, once = false) {
    this.cancelPending_();

    if (!this.video_ ||
        !('requestVideoFrameCallback' in this.video_)) {
      return false;
    }

    const loopCallback = (now, metadata) => {
      if (!this.video_ || this.boundCallback_ !== loopCallback) {
        return;
      }

      this.callbackHandle_ = null;
      if (!once) {
        this.callbackHandle_ =
            this.video_.requestVideoFrameCallback(loopCallback);
      }

      callback(now, metadata);
    };

    this.boundCallback_ = loopCallback;
    this.callbackHandle_ = this.video_.requestVideoFrameCallback(loopCallback);

    return true;
  }

  /** @override */
  release() {
    this.cancelPending_();
    this.video_ = null;
  }

  /**
   * @private
   */
  cancelPending_() {
    if (this.callbackHandle_ !== null) {
      this.video_?.cancelVideoFrameCallback?.(this.callbackHandle_);
      this.callbackHandle_ = null;
    }

    this.boundCallback_ = null;
  }
};
