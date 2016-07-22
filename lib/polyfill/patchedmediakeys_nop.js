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

goog.provide('shaka.polyfill.PatchedMediaKeysNop');

goog.require('goog.asserts');
goog.require('shaka.log');


/**
 * Install a polyfill to stub out {@link http://goo.gl/blgtZZ EME draft
 * 12 March 2015} on browsers without EME.  All methods will fail.
 */
shaka.polyfill.PatchedMediaKeysNop.install = function() {
  shaka.log.debug('PatchedMediaKeysNop.install');

  // Alias.
  var PatchedMediaKeysNop = shaka.polyfill.PatchedMediaKeysNop;

  // Install patches.
  navigator.requestMediaKeySystemAccess =
      PatchedMediaKeysNop.requestMediaKeySystemAccess;
  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = PatchedMediaKeysNop.setMediaKeys;
  // These are not usable, but allow Player.isBrowserSupported to pass.
  window.MediaKeys = PatchedMediaKeysNop.MediaKeys;
  window.MediaKeySystemAccess = PatchedMediaKeysNop.MediaKeySystemAccess;
};


/**
 * An implementation of navigator.requestMediaKeySystemAccess.
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeysNop.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeysNop.requestMediaKeySystemAccess');
  goog.asserts.assert(this == navigator,
                      'bad "this" for requestMediaKeySystemAccess');


  return Promise.reject(new Error(
      'The key system specified is not supported.'));
};


/**
 * An implementation of HTMLMediaElement.prototype.setMediaKeys.
 * Attach a MediaKeys object to the media element.
 *
 * @this {!HTMLMediaElement}
 * @param {MediaKeys} mediaKeys
 * @return {!Promise}
 */
shaka.polyfill.PatchedMediaKeysNop.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('PatchedMediaKeysNop.setMediaKeys');
  goog.asserts.assert(this instanceof HTMLMediaElement,
                      'bad "this" for setMediaKeys');

  if (mediaKeys == null) {
    return Promise.resolve();
  }

  return Promise.reject(new Error('MediaKeys not supported.'));
};



/**
 * An unusable constructor for MediaKeys.
 * @constructor
 * @struct
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeysNop.MediaKeys = function() {
  throw new TypeError('Illegal constructor.');
};


/** @override */
shaka.polyfill.PatchedMediaKeysNop.MediaKeys.prototype.createSession =
    function() {};


/** @override */
shaka.polyfill.PatchedMediaKeysNop.MediaKeys.prototype.setServerCertificate =
    function() {};



/**
 * An unusable constructor for MediaKeySystemAccess.
 * @constructor
 * @struct
 * @implements {MediaKeySystemAccess}
 */
shaka.polyfill.PatchedMediaKeysNop.MediaKeySystemAccess = function() {
  throw new TypeError('Illegal constructor.');
};


/** @override */
shaka.polyfill.PatchedMediaKeysNop.MediaKeySystemAccess.prototype.
    getConfiguration = function() {};


/** @override */
shaka.polyfill.PatchedMediaKeysNop.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {};


/** @override */
shaka.polyfill.PatchedMediaKeysNop.MediaKeySystemAccess.prototype.
    keySystem;

