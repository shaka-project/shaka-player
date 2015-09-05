/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview A polyfill to stub out {@link http://goo.gl/blgtZZ EME draft
 * 12 March 2015} on browsers without EME.  All methods will fail.
 *
 * @see http://enwp.org/polyfill
 */

goog.provide('shaka.polyfill.PatchedMediaKeys.nop');

goog.require('shaka.asserts');
goog.require('shaka.log');


/**
 * Install the polyfill.
 */
shaka.polyfill.PatchedMediaKeys.nop.install = function() {
  shaka.log.debug('PatchedMediaKeys.nop.install');

  // Alias.
  var nop = shaka.polyfill.PatchedMediaKeys.nop;

  // Install patches.
  Navigator.prototype.requestMediaKeySystemAccess =
      nop.requestMediaKeySystemAccess;
  // Delete mediaKeys to work around strict mode compatibility issues.
  delete HTMLMediaElement.prototype['mediaKeys'];
  // Work around read-only declaration for mediaKeys by using a string.
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype.setMediaKeys = nop.setMediaKeys;
  // These are not usable, but allow Player.isBrowserSupported to pass.
  window.MediaKeys = nop.MediaKeys;
  window.MediaKeySystemAccess = nop.MediaKeySystemAccess;
};


/**
 * An implementation of Navigator.prototype.requestMediaKeySystemAccess.
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeys.nop.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {
  shaka.log.debug('PatchedMediaKeys.nop.requestMediaKeySystemAccess');
  shaka.asserts.assert(this instanceof Navigator);

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
shaka.polyfill.PatchedMediaKeys.nop.setMediaKeys = function(mediaKeys) {
  shaka.log.debug('PatchedMediaKeys.nop.setMediaKeys');
  shaka.asserts.assert(this instanceof HTMLMediaElement);

  if (mediaKeys == null) {
    return Promise.resolve();
  }

  return Promise.reject(new Error('MediaKeys not supported.'));
};



/**
 * An unusable constructor for MediaKeys.
 * @constructor
 * @implements {MediaKeys}
 */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeys = function() {
  throw new TypeError('Illegal constructor.');
};


/** @override */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeys.prototype.createSession =
    function() {};


/** @override */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeys.prototype.setServerCertificate =
    function() {};



/**
 * An unusable constructor for MediaKeySystemAccess.
 * @constructor
 * @implements {MediaKeySystemAccess}
 */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeySystemAccess = function() {
  throw new TypeError('Illegal constructor.');
};


/** @override */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeySystemAccess.prototype.
    getConfiguration = function() {};


/** @override */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeySystemAccess.prototype.
    createMediaKeys = function() {};


/** @override */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeySystemAccess.prototype.
    keySystem;

