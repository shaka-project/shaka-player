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
 * Note that Safari only supports PiP on video elements, not audio.
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
    // No Webkit PiP API available.
    return;
  }

  const PiPWebkit = shaka.polyfill.PiPWebkit;
  shaka.log.debug('PiPWebkit.install');

  // Polyfill document.pictureInPictureEnabled.
  // It's definitely enabled now.  :-)
  document.pictureInPictureEnabled = true;

  // Polyfill document.pictureInPictureElement.
  // This is initially empty.  We don't need getter or setter because we don't
  // need any special handling when this is set.  We assume in good faith that
  // applications won't try to set this directly.
  document.pictureInPictureElement = null;

  // Polyfill HTMLVideoElement.requestPictureInPicture.
  proto.requestPictureInPicture = PiPWebkit.requestPictureInPicture_;

  // Polyfill document.exitPictureInPicture.
  document.exitPictureInPicture = PiPWebkit.exitPictureInPicture_;

  // Use the "capturing" event phase to get the webkit presentation mode event
  // from the document.  This way, we get the event on its way from document to
  // the target element without having to intercept events in every possible
  // video element.
  document.addEventListener(
      'webkitpresentationmodechanged', PiPWebkit.proxyEvent_,
      /* useCapture= */ true);
};

/**
 * @param {!Event} event
 * @private
 */
shaka.polyfill.PiPWebkit.proxyEvent_ = function(event) {
  const PiPWebkit = shaka.polyfill.PiPWebkit;
  const element = /** @type {!HTMLVideoElement} */(event.target);

  if (element.webkitPresentationMode == PiPWebkit.PIP_MODE_) {
    // Keep track of the PiP element.  This element just entered PiP mode.
    document.pictureInPictureElement = element;

    // Dispatch a standard event to match.
    const event2 = new Event('enterpictureinpicture');
    element.dispatchEvent(event2);
  } else {
    // Keep track of the PiP element.  This element just left PiP mode.
    // If something else hasn't already take its place, clear it.
    if (document.pictureInPictureElement == element) {
      document.pictureInPictureElement = null;
    }

    // Dispatch a standard event to match.
    const event2 = new Event('leavepictureinpicture');
    element.dispatchEvent(event2);
  }
};

/**
 * @this {HTMLVideoElement}
 * @return {!Promise}
 * @private
 */
shaka.polyfill.PiPWebkit.requestPictureInPicture_ = function() {
  const PiPWebkit = shaka.polyfill.PiPWebkit;
  // NOTE: "this" here is the video element.

  // Check if PiP is enabled for this element.
  if (!this.webkitSupportsPresentationMode(PiPWebkit.PIP_MODE_)) {
    const error = new Error('PiP not allowed by video element');
    return Promise.reject(error);
  } else {
    // Enter PiP mode.
    this.webkitSetPresentationMode(PiPWebkit.PIP_MODE_);
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
  const PiPWebkit = shaka.polyfill.PiPWebkit;

  const pipElement =
      /** @type {HTMLVideoElement} */(document.pictureInPictureElement);
  if (pipElement) {
    // Exit PiP mode.
    pipElement.webkitSetPresentationMode(PiPWebkit.INLINE_MODE_);
    document.pictureInPictureElement = null;
    return Promise.resolve();
  } else {
    const error = new Error('No picture in picture element found');
    return Promise.reject(error);
  }
};

/**
 * The presentation mode string used to indicate PiP mode in Safari.
 *
 * @const {string}
 * @private
 */
shaka.polyfill.PiPWebkit.PIP_MODE_ = 'picture-in-picture';

/**
 * The presentation mode string used to indicate inline mode in Safari.
 *
 * @const {string}
 * @private
 */
shaka.polyfill.PiPWebkit.INLINE_MODE_ = 'inline';

shaka.polyfill.register(shaka.polyfill.PiPWebkit.install);
