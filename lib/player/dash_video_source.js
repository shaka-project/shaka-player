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

goog.provide('shaka.player.DashVideoSource');

goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.features');
goog.require('shaka.media.IAbrManager');
goog.require('shaka.media.SimpleAbrManager');
goog.require('shaka.player.DrmInfo');
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

  /** @private {string} */
  this.mpdUrl_ = mpdUrl;

  /** @private {shaka.dash.mpd.Mpd} */
  this.oldMpd_ = null;

  /** @private {?shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /** @private {!Array.<string>} */
  this.captionsUrl_ = [];

  /** @private {!Array.<string>} */
  this.captionsLang_ = [];

  /** @private {!Array.<string>} */
  this.captionsMime_ = [];

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.networkCallback_ = null;
};
goog.inherits(shaka.player.DashVideoSource, shaka.player.StreamVideoSource);
if (shaka.features.Dash) {
  goog.exportSymbol('shaka.player.DashVideoSource',
                    shaka.player.DashVideoSource);
}


/**
 * A callback to the application to interpret DASH ContentProtection elements.
 *
 * The first parameter is the scheme ID URI.
 * The second parameter is the ContentProtection XML element.
 *
 * The callback should return an array of {@link shaka.player.DrmInfo.Config}
 * objects. A return value of null or an empty array indicates that the
 * ContentProtection XML element could not be understood by the application. An
 * empty {@link shaka.player.DrmInfo.Config} object or one with an empty
 * key system indicates that the content is unencrypted.
 *
 * Note: the 'cenc:pssh' element is automatically parsed by the library.
 * So, if the MPD specifies an explicit PSSH then the application does not have
 * to manually convert it into an initData value
 * (see {@link shaka.player.DrmInfo.Config}).
 *
 * @typedef {function(string, !Node): Array.<shaka.player.DrmInfo.Config>}
 * @exportDoc
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


/**
 * Sets the callback used to modify each segment request's URL and headers.
 *
 * @param {!shaka.util.FailoverUri.NetworkCallback} callback
 * @export
 */
shaka.player.DashVideoSource.prototype.setNetworkCallback = function(callback) {
  this.networkCallback_ = callback;
};


/** @override */
shaka.player.DashVideoSource.prototype.destroy = function() {
  this.interpretContentProtection_ = null;
  this.networkCallback_ = null;
  this.oldMpd_ = null;
  shaka.player.StreamVideoSource.prototype.destroy.call(this);
};


/** @override */
shaka.player.DashVideoSource.prototype.load = function() {
  var url = new shaka.util.FailoverUri(this.networkCallback_,
                                       [new goog.Uri(this.mpdUrl_)]);
  var mpdRequest = new shaka.dash.MpdRequest(url, this.mpdRequestTimeout);
  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        this.oldMpd_ = mpd;
        for (var i = 0; i < this.captionsUrl_.length; i++) {
          mpd.addExternalCaptions(this.captionsUrl_[i],
                                  this.captionsLang_[i], this.captionsMime_[i]);
        }

        if (!shaka.features.Live && mpd.type == 'dynamic') {
          var error = new Error('Live manifest support not enabled.');
          error.type = 'app';
          return Promise.reject(error);
        }

        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        this.manifestInfo = mpdProcessor.process(mpd, this.networkCallback_);

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        var p = baseClassLoad.call(this);

        return p;
      })
  );
};


if (shaka.features.Live) {
  /** @override */
  shaka.player.DashVideoSource.prototype.onUpdateManifest = function(url) {
    var mpdRequest = new shaka.dash.MpdRequest(url, this.mpdRequestTimeout);
    return mpdRequest.send().then(shaka.util.TypedBind(this,
        /** @param {!shaka.dash.mpd.Mpd} mpd */
        function(mpd) {
          this.oldMpd_ = mpd;
          var mpdProcessor =
              new shaka.dash.MpdProcessor(this.interpretContentProtection_);
          var newManifestInfo =
              mpdProcessor.process(mpd, this.networkCallback_);
          return Promise.resolve(newManifestInfo);
        })
    );
  };

  /** @override */
  shaka.player.DashVideoSource.prototype.onUpdateLocalManifest = function() {
    shaka.asserts.assert(this.oldMpd_);
    var mpdProcessor =
        new shaka.dash.MpdProcessor(this.interpretContentProtection_);
    var newManifestInfo =
        mpdProcessor.process(/** @type {!shaka.dash.mpd.Mpd} */ (this.oldMpd_),
                             this.networkCallback_);
    return Promise.resolve(newManifestInfo);
  };
}

