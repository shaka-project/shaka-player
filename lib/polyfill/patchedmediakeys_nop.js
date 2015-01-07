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
 * @fileoverview A polyfill to stub out {@link http://goo.gl/sgJHNN EME draft
 * 01 December 2014} on browsers without EME.  All methods will fail.
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
  // Work around read-only declarations for these properties by using strings:
  HTMLMediaElement.prototype['mediaKeys'] = null;
  HTMLMediaElement.prototype['waitingFor'] = '';
  HTMLMediaElement.prototype.setMediaKeys = nop.setMediaKeys;
  window.MediaKeys = nop.MediaKeys;
  // TODO: isTypeSupported is deprecated
  window.MediaKeys.isTypeSupported = nop.MediaKeys.isTypeSupported;
};


/**
 * An implementation of Navigator.prototype.requestMediaKeySystemAccess.
 * Retrieve a MediaKeySystemAccess object.
 *
 * @this {!Navigator}
 * @param {string} keySystem
 * @param {Array.<Object>=} opt_supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
shaka.polyfill.PatchedMediaKeys.nop.requestMediaKeySystemAccess =
    function(keySystem, opt_supportedConfigurations) {
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
 * An unusable constructor for MediaKeys.  Hosts isTypeSupported.
 */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeys = function() {
  throw new TypeError('Illegal constructor.');
};


/**
 * Determines if a key system and MIME type are supported by the browser.
 *
 * @param {string} keySystem
 * @param {string=} opt_mimeType
 * @return {boolean}
 */
shaka.polyfill.PatchedMediaKeys.nop.MediaKeys.isTypeSupported =
    function(keySystem, opt_mimeType) {
  // TODO: isTypeSupported is deprecated
  shaka.log.debug('PatchedMediaKeys.nop.isTypeSupported');
  return false;
};

