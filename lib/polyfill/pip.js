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

  if (proto.webkitSupportsPresentationMode) {
    shaka.log.debug('PiP.install');

    /**
     * polyfill document.pictureInPictureElement
     */
    Object.defineProperty(document, 'pictureInPictureElement', {
      get() {
        return document.polyfillPictureInPictureElement;
      },

      set(value) {
        if (value === document.polyfillPictureInPictureElement) return;

        if (document.polyfillPictureInPictureElement) {
          document.polyfillPictureInPictureElement.removeEventListener(
            'webkitpresentationmodechanged',
            shaka.polyfill.PiP.updatePictureInPictureElementInDocument_,
          );
        }

        document.polyfillPictureInPictureElement =
          /** @type {!HTMLMediaElement} */ (value);
        if (document.polyfillPictureInPictureElement) {
          document.polyfillPictureInPictureElement.addEventListener(
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
    proto.addEventListener = function(...args) {
      const [name, callback] = args;

      if (name === 'enterpictureinpicture') {
        // eslint-disable-next-line no-inner-declarations
        function enterpictureinpictureListener() {
          if (this.webkitPresentationMode === 'picture-in-picture') {
            callback();
          }
        }
        this.addEventListener('webkitpresentationmodechanged',
          enterpictureinpictureListener);

        // keep track of the listener to be able to remove them later
        if (this.polyfillEnterpictureinpicture) {
          this.polyfillEnterpictureinpicture[callback] =
            enterpictureinpictureListener;
        } else {
          this.polyfillEnterpictureinpicture = {
            [callback]: enterpictureinpictureListener,
          };
        }
      } else if (name === 'leavepictureinpicture') {
        // eslint-disable-next-line no-inner-declarations
        function leavepictureinpictureListener() {
          if (this.webkitPresentationMode === 'inline') {
            if (this.polyfillPreviousPresentationMode ===
              'picture-in-picture') {
              callback();
            }
          } else {
            // keep track of the pipElement
            document.pictureInPictureElement = this;
          }
          this.polyfillPreviousPresentationMode = this.webkitPresentationMode;
        }
        this.addEventListener('webkitpresentationmodechanged',
          leavepictureinpictureListener);

        // keep track of the listener to be able to remove them later
        if (this.polyfillLeavepictureinpicture) {
          this.polyfillLeavepictureinpicture[callback] =
            leavepictureinpictureListener;
        } else {
          this.polyfillLeavepictureinpicture = {
            [callback]: leavepictureinpictureListener,
          };
        }
      } else {
        // fallback for all the other events
        oldAddEventListener.apply(this, args);
      }
    };

    const oldRemoveEventListener = proto.removeEventListener;
    proto.removeEventListener = function(...args) {
      const [name, callback] = args;

      if (name === 'enterpictureinpicture' &&
        this.polyfillEnterpictureinpicture) {
        this.removeEventListener(
          'webkitpresentationmodechanged',
          this.polyfillEnterpictureinpicture[callback],
        );
        delete this.polyfillEnterpictureinpicture[callback];
      } else if (name === 'leavepictureinpicture' &&
        this.polyfillLeavepictureinpicture) {
        this.removeEventListener(
          'webkitpresentationmodechanged',
          this.polyfillLeavepictureinpicture[callback],
        );
        delete this.polyfillLeavepictureinpicture[callback];
      } else {
        oldRemoveEventListener.apply(this, args);
      }
    };
  }
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

shaka.polyfill.register(shaka.polyfill.PiP.install);
