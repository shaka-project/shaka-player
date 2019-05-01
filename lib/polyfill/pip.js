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

goog.provide('shaka.polyfill.PiP');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.PiP
 *
 * @summary A polyfill to provide PiP support in Safari.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.PiP.install = function() {
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
  shaka.log.debug('PiP.install');

  /** @type {HTMLMediaElement} */
  let polyfillPictureInPictureElement = null;

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
          shaka.polyfill.PiP.updatePictureInPictureElementInDocument_,
        );
      }

      polyfillPictureInPictureElement =
        /** @type {HTMLMediaElement} */ (value);
      if (polyfillPictureInPictureElement) {
        polyfillPictureInPictureElement.addEventListener(
          'webkitpresentationmodechanged',
          shaka.polyfill.PiP.updatePictureInPictureElementInDocument_,
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
  proto.requestPictureInPicture = shaka.polyfill.PiP.requestPictureInPicture_;


  /**
   * polyfill document.exitPictureInPicture
   */
  document.exitPictureInPicture = shaka.polyfill.PiP.exitPictureInPicture_;

  /**
   * polyfill enterpictureinpicture and leavepictureinpicture events
   */

  const oldAddEventListener = proto.addEventListener;
  /**
   * @this {HTMLMediaElement}
   */
  proto.addEventListener = function(type, listener, options) {
    if (type === 'enterpictureinpicture') {
      const proxyEnterPiPEvent =
        shaka.polyfill.PiP.getProxyEnterPiPEvent_(listener);
      this.addEventListener('webkitpresentationmodechanged',
        proxyEnterPiPEvent);
    } else if (type === 'leavepictureinpicture') {
      const proxyLeavePiPEvent =
        shaka.polyfill.PiP.getProxyLeavePiPEvent_(listener);
      this.addEventListener('webkitpresentationmodechanged',
        proxyLeavePiPEvent);
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
      const proxyEnterPiPEvent =
        shaka.polyfill.PiP.getProxyEnterPiPEvent_(listener);
      this.removeEventListener('webkitpresentationmodechanged',
        proxyEnterPiPEvent);
    } else if (type === 'leavepictureinpicture') {
      const proxyLeavePiPEvent =
        shaka.polyfill.PiP.getProxyLeavePiPEvent_(listener);
      this.removeEventListener('webkitpresentationmodechanged',
        proxyLeavePiPEvent);
    } else {
      // fallback for all the other events
      oldRemoveEventListener.apply(this, [type, listener, options]);
    }
  };
};

/**
 * @this {HTMLMediaElement}
 * @private
 */
shaka.polyfill.PiP.updatePictureInPictureElementInDocument_ = function() {
  if (this.webkitPresentationMode &&
    this.webkitPresentationMode !== 'picture-in-picture') {
    document.pictureInPictureElement = null;
  }
};

/**
 * @this {HTMLMediaElement}
 * @return {!Promise}
 * @private
 */
shaka.polyfill.PiP.requestPictureInPicture_ = function() {
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
shaka.polyfill.PiP.exitPictureInPicture_ = function() {
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

/**
 * Get the proxy webkitpresentationmodechanged event.
 *
 * @param {EventListener} listener
 * @return {!Function}
 * @private
 */
shaka.polyfill.PiP.getProxyEnterPiPEvent_ = function(listener) {
  return function(event) {
    const videoElement = /** @type {HTMLVideoElement} */ (event.target);
    if (videoElement.webkitPresentationMode === 'picture-in-picture') {
      // keep track of the pipElement
      document.pictureInPictureElement = videoElement;
      listener();
    }
  };
};

/**
 * Get the proxy webkitpresentationmodechanged event.
 *
 * @param {EventListener} listener
 * @return {!Function}
 * @private
 */
shaka.polyfill.PiP.getProxyLeavePiPEvent_ = function(listener) {
  return function(event) {
    const videoElement = /** @type {HTMLVideoElement} */ (event.target);
    if (videoElement.webkitPresentationMode === 'inline') {
      listener();
    }
  };
};

shaka.polyfill.register(shaka.polyfill.PiP.install);
