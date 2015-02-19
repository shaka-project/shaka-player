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
 * @fileoverview Implements a DASH video source.
 */

goog.provide('shaka.player.DashVideoSource');

goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.TypedBind');



/**
 * Creates a DashVideoSource.
 * @param {string} mpdUrl The MPD URL.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 *
 * @struct
 * @constructor
 * @extends {shaka.player.StreamVideoSource}
 * @export
 */
shaka.player.DashVideoSource = function(mpdUrl, interpretContentProtection) {
  shaka.player.StreamVideoSource.call(this, null);

  /** @private {string} */
  this.mpdUrl_ = mpdUrl;

  /** @private {?shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /** @private {?number} */
  this.updateTimer_ = null;
};
goog.inherits(shaka.player.DashVideoSource, shaka.player.StreamVideoSource);


/**
 * A callback to the application to interpret DASH ContentProtection elements.
 * These elements can contain almost anything and can be highly application-
 * specific, so they cannot (in general) be interpreted by the library.
 *
 * The first parameter is the ContentProtection element.
 * The callback should return a DrmSchemeInfo object if the ContentProtection
 * element is understood by the application, or null otherwise.
 *
 * @typedef {function(!shaka.dash.mpd.ContentProtection):
 *           shaka.player.DrmSchemeInfo}
 * @expose
 */
shaka.player.DashVideoSource.ContentProtectionCallback;


/**
 * The minimum time, in seconds, between MPD fetches.
 * @const {number}
 * @private
 */
shaka.player.DashVideoSource.MIN_UPDATE_PERIOD_ = 2;


/** @override */
shaka.player.DashVideoSource.prototype.destroy = function() {
  this.cancelUpdateTimer_();
  this.interpretContentProtection_ = null;
  shaka.player.StreamVideoSource.prototype.destroy.call(this);
};


/** @override */
shaka.player.DashVideoSource.prototype.load = function(preferredLanguage) {
  var mpdRequest = new shaka.dash.MpdRequest(this.mpdUrl_);

  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        mpdProcessor.process(mpd);

        this.manifestInfo = mpdProcessor.manifestInfo;

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        var p = baseClassLoad.call(this, preferredLanguage);
        return p.then(this.setUpdateTimer_.bind(this, mpd));
      })
  );
};


/**
 * Updates the manifest using a new MPD.
 * @private
 */
shaka.player.DashVideoSource.prototype.update_ = function() {
  this.updateTimer_ = null;

  shaka.log.debug('Requesting new MPD...');
  var mpdRequest = new shaka.dash.MpdRequest(this.mpdUrl_);

  mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        mpdProcessor.process(mpd);

        this.updateManifest(mpdProcessor.manifestInfo);
        this.setUpdateTimer_(mpd);
      })
  );
};


/**
 * Sets the update timer.
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @private
 */
shaka.player.DashVideoSource.prototype.setUpdateTimer_ = function(mpd) {
  shaka.asserts.assert(this.updateTimer_ == null);

  if (!mpd.minUpdatePeriod) {
    // Treat the MPD as static.
    return;
  }

  // Fetch a new MPD before we run out of segments.
  // TODO: This shouldn't rely on the implementation details of MpdProcessor.
  var derivedPeriodDuration =
      Math.min(mpd.minUpdatePeriod || Number.POSITIVE_INFINITY,
               shaka.dash.MpdProcessor.DEFAULT_DERIVED_PERIOD_DURATION);
  var minBufferTime = mpd.minBufferTime || 0;
  var extraDelay = 10;

  var updateDelta =
      Math.max(derivedPeriodDuration - minBufferTime - extraDelay,
               shaka.player.DashVideoSource.MIN_UPDATE_PERIOD_);
  shaka.log.debug('updateDelta', updateDelta);

  var ms = 1000 * updateDelta;
  this.updateTimer_ = window.setTimeout(this.update_.bind(this), ms);
};


/**
 * Cancels the update timer, if any.
 * @private
 */
shaka.player.DashVideoSource.prototype.cancelUpdateTimer_ = function() {
  if (this.updateTimer_) {
    window.clearTimeout(this.updateTimer_);
    this.updateTimer_ = null;
  }
};

