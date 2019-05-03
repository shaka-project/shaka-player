/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.polyfill.PiPWebkit');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.PiPWebkit
 *
 * @summary A polyfill to provide PiP support in Safari.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.PiPWebkit.install = function() {
  if (!window.HTMLVideoElement) {
    // Avoid errors on very old browsers.
    return;
  }

  const proto = HTMLVideoElement.prototype;
  if (proto.requestPictureInPicture &&
    document.exitPictureInPicture) {
    // No polyfill needed.
    return;
  }

  if (!proto.webkitSupportsPresentationMode) {
    // No polyfill available.
    return;
  }
  shaka.log.debug('PiPWebkit.install');

  /** @type {HTMLMediaElement} */
  let polyfillPictureInPictureElement = null;

  let polyfillEnterpictureinpicture = null;
  let polyfillLeavepictureinpicture = null;

  /**
   * polyfill document.pictureInPictureElement
   */
  Object.defineProperty(document, 'pictureInPictureElement', {
    get() {
      return polyfillPictureInPictureElement;
    },

    set(value) {
      if (value === polyfillPictureInPictureElement) return;

      if (polyfillPictureInPictureElement) {
        polyfillPictureInPictureElement.removeEventListener(
          'webkitpresentationmodechanged',
          shaka.polyfill.PiPWebkit.updatePictureInPictureElementInDocument_,
        );
      }

      polyfillPictureInPictureElement =
        /** @type {HTMLMediaElement} */ (value);
      if (polyfillPictureInPictureElement) {
        polyfillPictureInPictureElement.addEventListener(
          'webkitpresentationmodechanged',
          shaka.polyfill.PiPWebkit.updatePictureInPictureElementInDocument_,
        );
      }
    },
  });

  /**
   * polyfill document.pictureInPictureEnabled
   */
  document.pictureInPictureEnabled = true;

  /**
   * polyfill HTMLMediaElement.requestPictureInPicture
   */
  proto.requestPictureInPicture =
      shaka.polyfill.PiPWebkit.requestPictureInPicture_;


  /**
   * polyfill document.exitPictureInPicture
   */
  document.exitPictureInPicture =
      shaka.polyfill.PiPWebkit.exitPictureInPicture_;

  /**
   * polyfill enterpictureinpicture and leavepictureinpicture events
   */

  const oldAddEventListener = proto.addEventListener;
  /**
   * @this {HTMLMediaElement}
   */
  proto.addEventListener = function(type, listener, options) {
    const callback = /** @type {Function} */ (listener);
    if (type === 'enterpictureinpicture') {
      // eslint-disable-next-line no-inner-declarations
      function proxyEnterPiPEvent(event) {
        const videoElement =
          /** @type {HTMLVideoElement} */ (event.target);
        if (videoElement.webkitPresentationMode === 'picture-in-picture') {
          // keep track of the pipElement
          document.pictureInPictureElement = videoElement;
          callback();
        }
      }
      this.addEventListener('webkitpresentationmodechanged',
        proxyEnterPiPEvent);

      // keep track of the listener to be able to remove them later
      if (polyfillEnterpictureinpicture) {
        polyfillEnterpictureinpicture[listener] = proxyEnterPiPEvent;
      } else {
        polyfillEnterpictureinpicture = {
          [listener]: proxyEnterPiPEvent,
        };
      }
    } else if (type === 'leavepictureinpicture') {
      // eslint-disable-next-line no-inner-declarations
      function proxyLeavePiPEvent(event) {
        const videoElement =
          /** @type {HTMLVideoElement} */ (event.target);
        if (videoElement.webkitPresentationMode === 'inline') {
          callback();
        }
      }
      this.addEventListener('webkitpresentationmodechanged',
        proxyLeavePiPEvent);

      // keep track of the listener to be able to remove them later
      if (polyfillLeavepictureinpicture) {
        polyfillLeavepictureinpicture[listener] = proxyLeavePiPEvent;
      } else {
        polyfillLeavepictureinpicture = {
          [listener]: proxyLeavePiPEvent,
        };
      }
    } else {
      // fallback for all the other events
      oldAddEventListener.apply(this, [type, listener, options]);
    }
  };

  const oldRemoveEventListener = proto.removeEventListener;
  /**
   * @this {HTMLMediaElement}
   */
  proto.removeEventListener = function(type, listener, options) {
    if (type === 'enterpictureinpicture') {
      this.removeEventListener('webkitpresentationmodechanged',
        polyfillEnterpictureinpicture[listener]);
    } else if (type === 'leavepictureinpicture') {
      this.removeEventListener('webkitpresentationmodechanged',
        polyfillLeavepictureinpicture[listener]);
    } else {
      // fallback for all the other events
      oldRemoveEventListener.apply(this, [type, listener, options]);
    }
  };
};

/**
 * @param {!Event} event
 * @private
 */
shaka.polyfill.PiPWebkit.updatePictureInPictureElementInDocument_ =
  function(event) {
  const videoElement = /** @type {HTMLVideoElement} */ (event.target);
  if (videoElement.webkitPresentationMode &&
    videoElement.webkitPresentationMode !== 'picture-in-picture') {
    document.pictureInPictureElement = null;
  }
};

/**
 * @this {HTMLMediaElement}
 * @return {!Promise}
 * @private
 */
shaka.polyfill.PiPWebkit.requestPictureInPicture_ = function() {
  // check if PIP is enabled
  if (!this.webkitSupportsPresentationMode('picture-in-picture')) {
    const error = new Error('PIP not allowed by videoElement',
      'InvalidStateError');
    return Promise.reject(error);
  } else {
    // enter PIP mode
    this.webkitSetPresentationMode('picture-in-picture');
    document.pictureInPictureElement = this;
    return Promise.resolve();
  }
};

/**
 * @this {Document}
 * @return {!Promise}
 * @private
 */
shaka.polyfill.PiPWebkit.exitPictureInPicture_ = function() {
  if (document.pictureInPictureElement) {
    // exit PIP mode
    const video =
      /** @type {!HTMLMediaElement} */ (document.pictureInPictureElement);
    video.webkitSetPresentationMode('inline');
    document.pictureInPictureElement = null;
    return Promise.resolve();
  } else {
    const error = new Error('No picture in picture element found',
      'InvalidStateError');
    return Promise.reject(error);
  }
};

shaka.polyfill.register(shaka.polyfill.PiPWebkit.install);
