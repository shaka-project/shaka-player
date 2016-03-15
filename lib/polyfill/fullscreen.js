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

goog.provide('shaka.polyfill.Fullscreen');

goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.Fullscreen
 *
 * @summary A polyfill to unify fullscreen APIs across browsers.
 * Many browsers have prefixed fullscreen methods on Element and document.
 * See {@link http://goo.gl/n7TYl0 Using fullscreen mode} on MDN for more
 * information.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.Fullscreen.install = function() {
  if (!window.Document) {
    // Avoid errors on very old browsers.
    return;
  }

  var proto = Element.prototype;
  proto.requestFullscreen = proto.requestFullscreen ||
                            proto.mozRequestFullScreen ||
                            proto.msRequestFullscreen ||
                            proto.webkitRequestFullscreen;

  proto = Document.prototype;
  proto.exitFullscreen = proto.exitFullscreen ||
                         proto.mozCancelFullScreen ||
                         proto.msExitFullscreen ||
                         proto.webkitExitFullscreen;

  if (!('fullscreenElement' in document)) {
    Object.defineProperty(document, 'fullscreenElement', {
      get: function() {
        return document.mozFullScreenElement ||
               document.msFullscreenElement ||
               document.webkitFullscreenElement;
      }
    });
  }

  var proxy = shaka.polyfill.Fullscreen.proxyEvent_;
  document.addEventListener('webkitfullscreenchange', proxy);
  document.addEventListener('webkitfullscreenerror', proxy);
  document.addEventListener('mozfullscreenchange', proxy);
  document.addEventListener('mozfullscreenerror', proxy);
  document.addEventListener('MSFullscreenChange', proxy);
  document.addEventListener('MSFullscreenError', proxy);
};


/**
 * Proxy fullscreen events after changing their name.
 * @param {!Event} event
 * @private
 * @suppress {unnecessaryCasts}
 */
shaka.polyfill.Fullscreen.proxyEvent_ = function(event) {
  var type2 = event.type.replace(/^(webkit|moz|MS)/, '').toLowerCase();
  var event2 = new Event(type2, /** @type {EventInit} */(event));
  event.target.dispatchEvent(event2);
};


shaka.polyfill.register(shaka.polyfill.Fullscreen.install);
