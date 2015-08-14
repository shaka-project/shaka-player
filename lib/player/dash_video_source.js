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
goog.require('shaka.features');
goog.require('shaka.media.IAbrManager');
goog.require('shaka.media.SimpleAbrManager');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.EWMA');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.FailoverUri');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.TypedBind');



/**
 * Creates a DashVideoSource.
 * @param {string} mpdUrl The MPD URL.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 * @param {shaka.util.IBandwidthEstimator} estimator
 * @param {shaka.media.IAbrManager} abrManager
 *
 * @constructor
 * @struct
 * @extends {shaka.player.StreamVideoSource}
 * @exportDoc
 */
shaka.player.DashVideoSource =
    function(mpdUrl, interpretContentProtection, estimator, abrManager) {
  if (!estimator) {
    // For backward compatibility, provide an instance of the default
    // implementation if none is provided.
    estimator = new shaka.util.EWMABandwidthEstimator();
  }
  if (!abrManager) {
    abrManager = new shaka.media.SimpleAbrManager();
  }

  shaka.player.StreamVideoSource.call(this, null, estimator, abrManager);

  /** @private {!shaka.util.FailoverUri} */
  this.mpdUrl_ = new shaka.util.FailoverUri([new goog.Uri(mpdUrl)]);

  /** @private {?shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /** @private {!Array.<string>} */
  this.captionsUrl_ = [];

  /** @private {!Array.<string>} */
  this.captionsLang_ = [];

  /** @private {!Array.<string>} */
  this.captionsMime_ = [];
};
goog.inherits(shaka.player.DashVideoSource, shaka.player.StreamVideoSource);
if (shaka.features.Dash) {
  goog.exportSymbol('shaka.player.DashVideoSource',
                    shaka.player.DashVideoSource);
}


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
 * Adds the given URL as a source for text tracks in addition to those
 * specified in the MPD.  This has no effect after load().
 *
 * @param {string} url The |url| of the file to load from.
 * @param {string=} opt_lang Optional language of the text track,
 *         defaults to 'en'.
 * @param {string=} opt_mime Optional MIME type of the file, defaults
 *          to 'text/vtt'.
 * @export
 */
shaka.player.DashVideoSource.prototype.addExternalCaptions =
    function(url, opt_lang, opt_mime) {
  this.captionsUrl_.push(url);
  this.captionsLang_.push(opt_lang || '');
  this.captionsMime_.push(opt_mime || '');
};


/** @override */
shaka.player.DashVideoSource.prototype.destroy = function() {
  this.interpretContentProtection_ = null;
  shaka.player.StreamVideoSource.prototype.destroy.call(this);
};


/** @override */
shaka.player.DashVideoSource.prototype.load = function() {
  var mpdRequest =
      new shaka.dash.MpdRequest(this.mpdUrl_, this.mpdRequestTimeout);
  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        for (var i = 0; i < this.captionsUrl_.length; i++) {
          mpd.addExternalCaptions(this.captionsUrl_[i],
                                  this.captionsLang_[i], this.captionsMime_[i]);
        }

        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        this.manifestInfo = mpdProcessor.process(mpd);

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        var p = baseClassLoad.call(this);

        return p;
      })
  );
};


/** @override */
shaka.player.DashVideoSource.prototype.onUpdateManifest = function(url) {
  var mpdRequest =
      new shaka.dash.MpdRequest(url, this.mpdRequestTimeout);
  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        var newManifestInfo = mpdProcessor.process(mpd);
        return Promise.resolve(newManifestInfo);
      })
  );
};

