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

goog.provide('shaka.polyfill.MediaSource');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.MediaSource
 *
 * @summary A polyfill to patch MSE bugs.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.MediaSource.install = function() {
  shaka.log.debug('MediaSource.install');

  if (!window.MediaSource) {
    shaka.log.info('No MSE implementation available.');
    return;
  }

  // Detection is complicated by the fact that Safari does not expose
  // SourceBuffer on window.  So we can't detect missing features by accessing
  // SourceBuffer.prototype.  That is why we use navigator to detect Safari and
  // particular versions of it.
  var vendor = navigator.vendor;
  var version = navigator.appVersion;
  if (!vendor || !version || vendor.indexOf('Apple') < 0) {
    shaka.log.info('Using native MSE as-is.');
    return;
  }

  if (version.indexOf('Version/8') >= 0) {
    // Safari 8 does not implement appendWindowEnd.  If we ignore the
    // incomplete MSE implementation, some content (especially multi-period)
    // will fail to play correctly.  The best we can do is blacklist Safari 8
    // by making MediaSourceEngine.isBrowserSupported() fail later.
    shaka.log.info('Blacklisting Safari 8 MSE.');
    window['MediaSource'] = null;
  } else {
    // Safari 9 does not correctly implement abort() on SourceBuffer.  Calling
    // abort() causes the decoder to completely fail, rather than resetting
    // the decode timestamp as called for by the spec.
    // Bug filed: http://goo.gl/UZ2rPp
    // TODO: update for Safari 10 when that becomes available
    shaka.log.info('Patching Safari MSE bugs.');

    var addSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function() {
      var sourceBuffer = addSourceBuffer.apply(this, arguments);
      sourceBuffer.abort = function() {};  // Stub out to avoid decoder errors.
      return sourceBuffer;
    };
  }
};


shaka.polyfill.register(shaka.polyfill.MediaSource.install);
