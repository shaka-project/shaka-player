/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.VideoPlayPromise');

goog.require('shaka.log');
goog.require('shaka.polyfill');


/**
 * @summary A polyfill to silence the play() Promise in HTML5 video.
 */
shaka.polyfill.VideoPlayPromise = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    shaka.log.debug('VideoPlayPromise.install');

    if (window.HTMLMediaElement) {
      // eslint-disable-next-line no-restricted-syntax
      const originalPlay = HTMLMediaElement.prototype.play;
      // eslint-disable-next-line no-restricted-syntax
      HTMLMediaElement.prototype.play = function() {
        // eslint-disable-next-line no-restricted-syntax
        const p = originalPlay.apply(this);
        if (p) {
          // This browser is returning a Promise from play().
          // If the play() call fails or is interrupted, the Promise will be
          // rejected.  Some apps, however, don't listen to this Promise,
          // especially since it is not available cross-browser.  If the Promise
          // is rejected without anyone listening for the failure, an error will
          // appear in the JS console.
          // To avoid confusion over this innocuous "error", we will install a
          // catch handler on the Promise.  This does not prevent the app from
          // also catching failures and handling them.  It only prevents the
          // console message.
          p.catch(() => {});
        }
        return p;
      };
    }
  }
};


shaka.polyfill.register(shaka.polyfill.VideoPlayPromise.install);
