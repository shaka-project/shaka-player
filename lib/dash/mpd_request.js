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

goog.provide('shaka.dash.MpdRequest');

goog.require('shaka.dash.mpd');
goog.require('shaka.player.Defaults');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.FailoverUri');



/**
 * Creates an MpdRequest.
 *
 * @param {!shaka.util.FailoverUri} url The URL.
 * @param {number=} opt_requestTimeout The timeout for a MpdRequest in seconds.
 *
 * @struct
 * @constructor
 */
shaka.dash.MpdRequest = function(url, opt_requestTimeout) {
  /** @private {!shaka.util.AjaxRequest.Parameters} */
  this.parameters_ = new shaka.util.AjaxRequest.Parameters();

  var timeoutSeconds = opt_requestTimeout != null ?
      opt_requestTimeout : shaka.player.Defaults.MPD_REQUEST_TIMEOUT;
  this.parameters_.responseType = 'text';
  this.parameters_.maxAttempts = 3;
  this.parameters_.requestTimeoutMs = timeoutSeconds * 1000;

  // The server delivering the DASH manifest is the only one that we should
  // be synchronizing our clock against, because the time parameters in the
  // DASH manifest are the only ones in this system which are sensitive to
  // getting out of sync.  This is specifically true for live content.
  this.parameters_.synchronizeClock = true;

  /** @private {!shaka.util.FailoverUri} */
  this.url_ = url;
};


/**
 * Sends the MPD request.
 *
 * @return {!Promise.<!shaka.dash.mpd.Mpd>}
 */
shaka.dash.MpdRequest.prototype.send = function() {
  var url = this.url_;
  return url.fetch(this.parameters_).then(
      /** @param {!ArrayBuffer|string} data */
      function(data) {
        var mpd = shaka.dash.mpd.parseMpd(
            /** @type {string} */ (data), url.urls);
        if (mpd) {
          return Promise.resolve(mpd);
        }

        var error = new Error('MPD parse failure.');
        error.type = 'dash';
        return Promise.reject(error);
      }
  );
};

