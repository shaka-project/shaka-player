/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.media.DrmEngine');

goog.require('shaka.util.IDestroyable');



/**
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.DrmEngine = function() {
  // TODO
};


/**
 * @override
 */
shaka.media.DrmEngine.prototype.destroy = function() {
  // TODO
};


/**
 * Returns a Promise to map of EME support for well-known key systems.
 *
 * @return {!Promise.<!Object.<string, boolean>>}
 */
shaka.media.DrmEngine.support = function() {
  // Every object in the support hierarchy has a "basic" member.
  // All "basic" members must be true for the library to be usable.
  var basic =
      !!window.MediaKeys &&
      !!window.navigator &&
      !!window.navigator.requestMediaKeySystemAccess &&
      !!window.MediaKeySystemAccess &&
      !!window.MediaKeySystemAccess.prototype.getConfiguration;

  var support = {'basic': basic};

  var tests = [];
  if (support['basic']) {
    var testKeySystems = [
      'org.w3.clearkey',
      'com.widevine.alpha',
      'com.microsoft.playready',
      'com.apple.fps.2_0',
      'com.apple.fps.1_0',
      'com.apple.fps',
      'com.adobe.primetime'
    ];

    testKeySystems.forEach(function(keySystem) {
      var p = navigator.requestMediaKeySystemAccess(keySystem, [{}])
          .then(function() {
            support[keySystem] = true;
          }, function() {
            support[keySystem] = false;
          });
      tests.push(p);
    });
  }

  return Promise.all(tests).then(function() {
    return support;
  });
};
