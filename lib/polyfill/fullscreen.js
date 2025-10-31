/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.Fullscreen');

goog.require('shaka.polyfill');


/**
 * @summary A polyfill to unify fullscreen APIs across browsers.
 * Many browsers have prefixed fullscreen methods on Element and document.
 * See {@link https://mzl.la/2K0xcHo Using fullscreen mode} on MDN for more
 * information.
 * @export
 */
shaka.polyfill.Fullscreen = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    if (!window.Document) {
      // Avoid errors on very old browsers.
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    let proto = Element.prototype;
    proto.requestFullscreen = proto.requestFullscreen ||
                              proto.mozRequestFullScreen ||
                              proto.webkitRequestFullscreen;

    // eslint-disable-next-line no-restricted-syntax
    proto = Document.prototype;
    proto.exitFullscreen = proto.exitFullscreen ||
                           proto.mozCancelFullScreen ||
                           proto.webkitCancelFullScreen;

    if (!('fullscreenElement' in document)) {
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => {
          return document.mozFullScreenElement ||
                 document.webkitCurrentFullScreenElement ||
                 document.webkitFullscreenElement;
        },
      });
      Object.defineProperty(document, 'fullscreenEnabled', {
        get: () => {
          return document.mozFullScreenEnabled ||
                 document.webkitFullscreenEnabled;
        },
      });
    }

    const proxy = shaka.polyfill.Fullscreen.proxyEvent_;
    document.addEventListener('webkitfullscreenchange', proxy);
    document.addEventListener('webkitfullscreenerror', proxy);
    document.addEventListener('mozfullscreenchange', proxy);
    document.addEventListener('mozfullscreenerror', proxy);
  }

  /**
   * Proxy fullscreen events after changing their name.
   * @param {!Event} event
   * @private
   */
  static proxyEvent_(event) {
    const eventType = event.type.replace(/^(webkit|moz)/, '').toLowerCase();

    const newEvent = document.createEvent('Event');
    newEvent.initEvent(eventType, event.bubbles, event.cancelable);

    event.target.dispatchEvent(newEvent);
  }
};


shaka.polyfill.register(shaka.polyfill.Fullscreen.install);
