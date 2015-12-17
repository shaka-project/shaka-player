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

goog.provide('shaka.Player');

goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.util.IDestroyable');



/**
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.Player = function() {
  // TODO
};


/**
 * @override
 */
shaka.Player.prototype.destroy = function() {
  // TODO
};


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v1.9.9-alpha-debug');


/**
 * @const {string}
 * @export
 */
shaka.Player.version = GIT_VERSION;


/**
 * @return {!Promise.<!shakaExtern.SupportType>}
 * @export
 */
shaka.Player.support = function() {
  // Basic features needed for the library to be usable.
  var basic = !!window.Promise && !!window.Uint8Array &&
              !!Array.prototype.forEach;

  if (basic) {
    var manifest = shaka.media.ManifestParser.support();
    var media = shaka.media.MediaSourceEngine.support();
    return shaka.media.DrmEngine.support().then(function(drm) {
      /** @type {!shakaExtern.SupportType} */
      var support = {
        manifest: manifest,
        media: media,
        drm: drm,
        supported: manifest['basic'] && media['basic'] && drm['basic']
      };
      return support;
    });
  } else {
    // Return something Promise-like so that the application can still check
    // for support.
    return /** @type {!Promise.<!shakaExtern.SupportType>} */({
      'then': function(fn) {
        fn({'supported': false});
      }
    });
  }
};
