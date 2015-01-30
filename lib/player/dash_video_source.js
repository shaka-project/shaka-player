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

goog.require('shaka.asserts');
goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.media.Stream');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.TypedBind');



/**
 * Creates a DashVideoSource.
 * @param {string} mpdUrl The MPD URL.
 * @param {shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 *
 * @struct
 * @constructor
 * @implements {shaka.player.IVideoSource}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.DashVideoSource = function(mpdUrl, interpretContentProtection) {
  shaka.util.FakeEventTarget.call(this, null);

  /** @private {string} */
  this.mpdUrl_ = mpdUrl;

  /** @private {shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /**
   * The underlying StreamVideoSource to delegate to.
   * @private {shaka.player.StreamVideoSource}
   */
  this.streamVideoSource_ = null;

  /** @private {boolean} */
  this.adaptationEnabled_ = true;
};
goog.inherits(shaka.player.DashVideoSource, shaka.util.FakeEventTarget);


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
 * Destroys the DashVideoSource.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.player.DashVideoSource.prototype.destroy = function() {
  if (this.streamVideoSource_) {
    this.streamVideoSource_.destroy();
    this.streamVideoSource_ = null;
  }

  this.interpretContentProtection_ = null;
  this.parent = null;
};


/** @override */
shaka.player.DashVideoSource.prototype.attach = function(player, video) {
  if (!this.streamVideoSource_) {
    var error = new Error('Manifest has not been loaded.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  // Note that streamVideoSource_.attach() will return a rejected promise if it
  // has not been loaded yet.
  return this.streamVideoSource_.attach(player, video);
};


/** @override */
shaka.player.DashVideoSource.prototype.getDrmSchemeInfo = function() {
  return this.streamVideoSource_.getDrmSchemeInfo();
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

        this.streamVideoSource_ =
            new shaka.player.StreamVideoSource(mpdProcessor.manifestInfo);
        this.streamVideoSource_.enableAdaptation(this.adaptationEnabled_);
        return this.streamVideoSource_.load(preferredLanguage);
      })
  );
};


/** @override */
shaka.player.DashVideoSource.prototype.getVideoTracks = function() {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.getVideoTracks() :
         [];
};


/** @override */
shaka.player.DashVideoSource.prototype.getAudioTracks = function() {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.getAudioTracks() :
         [];
};


/** @override */
shaka.player.DashVideoSource.prototype.getTextTracks = function() {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.getTextTracks() :
         [];
};


/** @override */
shaka.player.DashVideoSource.prototype.getResumeThreshold = function() {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.getResumeThreshold() :
         0;
};


/** @override */
shaka.player.DashVideoSource.prototype.selectVideoTrack =
    function(id, immediate) {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.selectVideoTrack(id, immediate) :
         false;
};


/** @override */
shaka.player.DashVideoSource.prototype.selectAudioTrack =
    function(id, immediate) {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.selectAudioTrack(id, immediate) :
         false;
};


/** @override */
shaka.player.DashVideoSource.prototype.selectTextTrack =
    function(id, immediate) {
  return this.streamVideoSource_ ?
         this.streamVideoSource_.selectTextTrack(id, immediate) :
         false;
};


/** @override */
shaka.player.DashVideoSource.prototype.enableTextTrack = function(enabled) {
  if (this.streamVideoSource_) {
    this.streamVideoSource_.enableTextTrack(enabled);
  }
};


/** @override */
shaka.player.DashVideoSource.prototype.enableAdaptation = function(enabled) {
  this.adaptationEnabled_ = enabled;
  if (this.streamVideoSource_) {
    this.streamVideoSource_.enableAdaptation(enabled);
  }
};


/** @override */
shaka.player.DashVideoSource.prototype.setRestrictions =
    function(restrictions) {
  if (this.streamVideoSource_) {
    this.streamVideoSource_.setRestrictions(restrictions);
  }
};

