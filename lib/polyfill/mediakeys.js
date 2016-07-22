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

goog.provide('shaka.polyfill.MediaKeys');

goog.require('shaka.log');
goog.require('shaka.polyfill.PatchedMediaKeysMs');
goog.require('shaka.polyfill.PatchedMediaKeysNop');
goog.require('shaka.polyfill.PatchedMediaKeysWebkit');
goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.MediaKeys
 *
 * @summary A polyfill to unify EME APIs across browser versions.
 *
 * The {@link https://w3c.github.io/encrypted-media/ EME spec} is still a
 * work-in-progress.  As such, we need to provide a consistent API to the Shaka
 * Player.  Until the spec is completely stable, the API provided by this
 * polyfill may lag behind the latest spec developments.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.MediaKeys.install = function() {
  shaka.log.debug('MediaKeys.install');

  if (!window.HTMLVideoElement) {
    // Avoid errors on very old browsers.
    return;
  }

  if (navigator.requestMediaKeySystemAccess &&
      MediaKeySystemAccess.prototype.getConfiguration) {
    shaka.log.info('Using native EME as-is.');
  } else if (HTMLMediaElement.prototype.webkitGenerateKeyRequest) {
    shaka.log.info('Using webkit-prefixed EME v0.1b');
    shaka.polyfill.PatchedMediaKeysWebkit.install();
  } else if (window.MSMediaKeys) {
    shaka.log.info('Using ms-prefixed EME v20140218');
    shaka.polyfill.PatchedMediaKeysMs.install();
  } else {
    shaka.log.info('EME not available.');
    shaka.polyfill.PatchedMediaKeysNop.install();
  }
};


shaka.polyfill.register(shaka.polyfill.MediaKeys.install);
