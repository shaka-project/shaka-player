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

goog.provide('shaka.polyfill.VideoPlayPromise');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.VideoPlayPromise
 *
 * @summary A polyfill to silence the play() Promise in HTML5 video.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.VideoPlayPromise.install = function() {
  shaka.log.debug('VideoPlayPromise.install');

  if (window.HTMLMediaElement) {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      let p = originalPlay.apply(this);
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
        p.catch(function() {});
      }
      return p;
    };
  }
};

shaka.polyfill.register(shaka.polyfill.VideoPlayPromise.install);
