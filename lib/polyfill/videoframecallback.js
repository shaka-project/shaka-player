/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.VideoFrameCallback');

goog.require('shaka.polyfill');


/**
 * @summary A polyfill for requestVideoFrameCallback.
 * Uses requestAnimationFrame + getVideoPlaybackQuality.
 * @export
 */
shaka.polyfill.VideoFrameCallback = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    if (!window.HTMLVideoElement) {
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    const proto = HTMLVideoElement.prototype;

    if (proto.requestVideoFrameCallback) {
      return;
    }

    if (!window.requestAnimationFrame) {
      return;
    }

    if (!proto.getVideoPlaybackQuality) {
      return;
    }

    proto.requestVideoFrameCallback =
        shaka.polyfill.VideoFrameCallback.requestVideoFrameCallback_;

    proto.cancelVideoFrameCallback =
        shaka.polyfill.VideoFrameCallback.cancelVideoFrameCallback_;
  }

  /**
   * @param {!HTMLVideoElement} video
   * @return {!shaka.polyfill.VideoFrameCallback.CallbackData_}
   * @private
   */
  static getData_(video) {
    let data = shaka.polyfill.VideoFrameCallback.callbackMap_.get(video);

    if (!data) {
      data = {
        nextHandle: 1,
        callbacks: new Map(),
        presentedFrames: 0,
      };

      shaka.polyfill.VideoFrameCallback.callbackMap_.set(video, data);
    }

    return data;
  }

  /**
   * @this {HTMLVideoElement}
   * @param {function(number, ?VideoFrameMetadata)} callback
   * @return {number}
   * @private
   */
  static requestVideoFrameCallback_(callback) {
    /** @type {!HTMLVideoElement} */
    const video = this;

    const data =
        shaka.polyfill.VideoFrameCallback.getData_(video);

    const handle = data.nextHandle++;

    const checkFrame = (now) => {
      if (!data.callbacks.has(handle)) {
        return;
      }

      const quality = video.getVideoPlaybackQuality();

      const presentedFrames = quality.totalVideoFrames || 0;

      if (presentedFrames !== data.presentedFrames) {
        data.presentedFrames = presentedFrames;

        /** @type {!VideoFrameMetadata} */
        const metadata = /** @type {!VideoFrameMetadata} */ ({
          presentationTime: now,
          expectedDisplayTime: now,
          mediaTime: video.currentTime,
          presentedFrames,
          width: video.videoWidth,
          height: video.videoHeight,
          processingDuration: 0,
        });

        data.callbacks.delete(handle);

        callback(now, metadata);

        return;
      }

      const rafId = window.requestAnimationFrame(checkFrame);

      data.callbacks.set(handle, rafId);
    };

    const rafId = window.requestAnimationFrame(checkFrame);

    data.callbacks.set(handle, rafId);

    return handle;
  }

  /**
   * @this {HTMLVideoElement}
   * @param {number} handle
   * @private
   */
  static cancelVideoFrameCallback_(handle) {
    /** @type {!HTMLVideoElement} */
    const video = this;

    const data =
        shaka.polyfill.VideoFrameCallback.callbackMap_.get(video);

    if (!data) {
      return;
    }

    const rafId = data.callbacks.get(handle);

    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      data.callbacks.delete(handle);
    }
  }
};


/**
 * @typedef {{
 *   nextHandle: number,
 *   callbacks: !Map<number, number>,
 *   presentedFrames: number
 * }}
 * @private
 */
shaka.polyfill.VideoFrameCallback.CallbackData_;


/**
 * @private {!WeakMap<
 *   !HTMLVideoElement,
 *   !shaka.polyfill.VideoFrameCallback.CallbackData_>}
 */
shaka.polyfill.VideoFrameCallback.callbackMap_ =
    new WeakMap();


// Install at a low priority so that other Video polyfills go first.
shaka.polyfill.register(shaka.polyfill.VideoFrameCallback.install, -2);
