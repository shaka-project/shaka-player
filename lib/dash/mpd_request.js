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
 * @fileoverview Implements an MPD request.
 */

goog.provide('shaka.dash.MpdRequest');

goog.require('shaka.dash.mpd');
goog.require('shaka.util.AjaxRequest');



/**
 * Creates an MpdRequest.
 *
 * @param {string} url The URL.
 *
 * @struct
 * @constructor
 * @extends {shaka.util.AjaxRequest}
 */
shaka.dash.MpdRequest = function(url) {
  shaka.util.AjaxRequest.call(this, url);
  this.parameters.responseType = 'text';

  // The server delivering the DASH manifest is the only one that we should
  // be synchronizing our clock against, because the time parameters in the
  // DASH manifest are the only ones in this system which are sensitive to
  // getting out of sync.  This is specifically true for live content.
  this.parameters.synchronizeClock = true;
};
goog.inherits(shaka.dash.MpdRequest, shaka.util.AjaxRequest);


/**
 * Sends the MPD request.
 * @return {!Promise.<!shaka.dash.mpd.Mpd>}
 */
shaka.dash.MpdRequest.prototype.send = function() {
  var url = this.url;
  return this.sendInternal().then(
      /** @param {!XMLHttpRequest} xhr */
      function(xhr) {
        var mpd = shaka.dash.mpd.parseMpd(xhr.responseText, url);
        if (mpd) {
          return Promise.resolve(mpd);
        }

        var error = new Error('MPD parse failure.');
        error.type = 'mpd';
        return Promise.reject(error);
      }
  );
};

