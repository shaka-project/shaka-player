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
 * @fileoverview A very temporary polyfill to add MediaKeys.isTypeSupported
 * for Chrome 41+ where it has been removed.
 *
 * @see http://enwp.org/polyfill
 */

goog.provide('shaka.polyfill.PatchedMediaKeys.isTypeSupported');

goog.require('shaka.asserts');
goog.require('shaka.log');


/**
 * Install the polyfill.
 */
shaka.polyfill.PatchedMediaKeys.isTypeSupported.install = function() {
  shaka.log.debug('isTypeSupported.install');

  shaka.asserts.assert(!MediaKeys.isTypeSupported);
  shaka.asserts.assert(navigator.userAgent.indexOf('Chrome/') != -1);

  // Alias.
  var isTypeSupported = shaka.polyfill.PatchedMediaKeys.isTypeSupported;

  // Install patch.
  MediaKeys.isTypeSupported = isTypeSupported.patch;
};


/**
 * An implementation of MediaKeys.isTypeSupported for Chrome.
 * Assumes the types Chrome is known to support.
 *
 * @param {string} keySystem
 * @param {string=} opt_mimeType
 * @return {boolean}
 */
shaka.polyfill.PatchedMediaKeys.isTypeSupported.patch =
    function(keySystem, opt_mimeType) {
  shaka.log.debug('isTypeSupported');

  // Not Chrome?  Don't try to guess.  We are not prepared for this.
  if (navigator.userAgent.indexOf('Chrome/') == -1) {
    return false;
  }

  // Not Widevine or ClearKey?  Not supported.
  if (keySystem != 'com.widevine.alpha' && keySystem != 'org.w3.clearkey') {
    return false;
  }

  // No MIME type?  Not needed.  You've passed the checks for keySystem.
  if (opt_mimeType == undefined) {
    return true;
  }

  // Not MP4 or WebM?  Not supported.
  var basicType = opt_mimeType.split(';')[0];
  if (basicType != 'video/mp4' && basicType != 'video/webm' &&
      basicType != 'audio/mp4' && basicType != 'audio/webm') {
    return false;
  }

  // No codec parameters?  Not needed.  You've passed everything else.
  var params = opt_mimeType.split(';')[1];
  if (!params) {
    return true;
  }

  // Rather than assume a detailed list of what codecs and profiles are
  // supported, just ask MediaSource what it supports.  It requires parameters
  // beyond the basic MIME type anyway, which we now know we have.
  return MediaSource.isTypeSupported(opt_mimeType);
};

