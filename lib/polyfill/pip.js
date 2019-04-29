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

  let proto = HTMLVideoElement.prototype;
  if (proto.requestPictureInPicture &&
    document.exitPictureInPicture) {
    // No polyfill needed.
    return;
  }

  if (proto.webkitSupportsPresentationMode &&
    typeof proto.webkitSetPresentationMode === 'function') {
    shaka.log.debug('PiP.install');

    /**
     * polyfill document.pictureInPictureElement
     */

    // eslint-disable-next-line no-inner-declarations
    function updatePictureInPictureElementInDocument() {
      if (this.webkitPresentationMode &&
        this.webkitPresentationMode !== 'picture-in-picture') {
        document.pictureInPictureElement = null;
      }
    }

    Object.defineProperty(document, 'pictureInPictureElement', {
      get() {
        if (!this.$pictureInPictureElement) {
          const videoElementList = document.querySelectorAll('video');

          for (let i = 0; i < videoElementList.length; i += 1) {
            const video = videoElementList[i];

            if (video.webkitPresentationMode &&
              video.webkitPresentationMode === 'picture-in-picture') {
              this.pictureInPictureElement = video;
              break;
            }
          }
        }

        return this.$pictureInPictureElement || null;
      },

      set(value) {
        if (value === this.$pictureInPictureElement) return;

        if (this.$pictureInPictureElement) {
          this.$pictureInPictureElement.removeEventListener(
            'webkitpresentationmodechanged',
            updatePictureInPictureElementInDocument,
          );
        }

        this.$pictureInPictureElement = value;
        if (this.$pictureInPictureElement) {
          this.$pictureInPictureElement.addEventListener(
            'webkitpresentationmodechanged',
            updatePictureInPictureElementInDocument,
          );
        }
      },
    });

    /**
     * polyfill methods and attributes
     */

    // eslint-disable-next-line require-await
    proto.requestPictureInPicture = async function _() {
      // check if PIP is enabled
      if (
        this.attributes.disablePictureInPicture ||
        !this.webkitSupportsPresentationMode('picture-in-picture')
      ) {
        throw new Error('PIP not allowed by videoElement', 'InvalidStateError');
      }

      // enter PIP mode
      this.webkitSetPresentationMode('picture-in-picture');
      document.pictureInPictureElement = this;
    };

    // eslint-disable-next-line require-await
    document.exitPictureInPicture = async function _() {
      if (document.pictureInPictureElement) {
        // exit PIP mode
        document.pictureInPictureElement.webkitSetPresentationMode('inline');
        document.pictureInPictureElement = null;
      } else {
        throw new DOMException(
          'No picture in picture element found',
          'InvalidStateError',
        );
      }
    };

    /**
     * polyfill events
     */

    const oldAddEventListener = proto.addEventListener;
    proto.addEventListener = function _(...args) {
      const [name, callback] = args;

      if (name === 'enterpictureinpicture') {
        // eslint-disable-next-line no-inner-declarations
        function webkitListener() {
          if (this.webkitPresentationMode === 'picture-in-picture') {
            callback();
          }
        }

        this.addEventListener('webkitpresentationmodechanged', webkitListener);

        // keep track of the listener to be able to remove them later
        if (this.$pipPolyfillEnter) {
          this.$pipPolyfillEnter[callback] = webkitListener;
        } else {
          this.$pipPolyfillEnter = {
            [callback]: webkitListener,
          };
        }
      } else if (name === 'leavepictureinpicture') {
        // eslint-disable-next-line no-inner-declarations
        function webkitListener() {
          if (this.webkitPresentationMode === 'inline') {
            if (this.$pipPreviousPresentationMode === 'picture-in-picture') {
              callback();
            }
          } else {
            // keep track of the pipElement
            document.pictureInPictureElement = this;
          }
          this.$pipPreviousPresentationMode = this.webkitPresentationMode;
        }

        this.addEventListener('webkitpresentationmodechanged', webkitListener);
        this.$pipPreviousPresentationMode = this.webkitPresentationMode;

        // keep track of the listener to be able to remove them later
        if (this.$pipPolyfillLeave) {
          this.$pipPolyfillLeave[callback] = webkitListener;
        } else {
          this.$pipPolyfillLeave = {
            [callback]: webkitListener,
          };
        }
      } else {
        // fallback for all the other events
        oldAddEventListener.apply(this, args);
      }
    };

    const oldRemoveEventListener = proto.removeEventListener;
    proto.removeEventListener = function _(...args) {
      const [name, callback] = args;

      if (name === 'enterpictureinpicture' && this.$pipPolyfillEnter) {
        this.removeEventListener(
          'webkitpresentationmodechanged',
          this.$pipPolyfillEnter[callback],
        );
        delete this.$pipPolyfillEnter[callback];
      } else if (name === 'leavepictureinpicture' && this.$pipPolyfillLeave) {
        this.removeEventListener(
          'webkitpresentationmodechanged',
          this.$pipPolyfillLeave[callback],
        );
        delete this.$pipPolyfillLeave[callback];
      } else {
        oldRemoveEventListener.apply(this, args);
      }
    };

    /**
     * Complete PIP Api
     */
    document.pictureInPictureEnabled = true;
  }
};

shaka.polyfill.register(shaka.polyfill.PiP.install);
