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
 * @fileoverview Implements an HTTP video source.
 */

goog.provide('shaka.player.HttpVideoSource');

goog.require('shaka.media.StreamConfig');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.util.FakeEventTarget');



/**
 * Creates an HttpVideoSource.
 * @param {string} mediaUrl The media URL.
 * @param {string} textUrl The text URL, or empty string if no subtitles.
 * @param {shaka.player.DrmSchemeInfo} drmScheme Description of the DRM
 *     scheme, or null for non-encrypted sources.
 * @struct
 * @constructor
 * @implements {shaka.player.IVideoSource}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.player.HttpVideoSource = function(mediaUrl, textUrl, drmScheme) {
  shaka.util.FakeEventTarget.call(this, null);

  /** @private {string} */
  this.mediaUrl_ = mediaUrl;

  /** @private {string} */
  this.textUrl_ = textUrl;

  /** @private {shaka.player.DrmSchemeInfo} */
  this.drmScheme_ = drmScheme ? drmScheme :
                    shaka.player.DrmSchemeInfo.createUnencrypted();

  /** @private {HTMLTrackElement} */
  this.textTrack_ = null;
};
goog.inherits(shaka.player.HttpVideoSource, shaka.util.FakeEventTarget);


/** @override */
shaka.player.HttpVideoSource.prototype.destroy = function() {
  if (this.textTrack_) {
    this.textTrack_.parentElement.removeChild(this.textTrack_);
    this.textTrack_ = null;
  }

  this.drmScheme_ = null;
  this.parent = null;
};


/** @override */
shaka.player.HttpVideoSource.prototype.attach = function(player, video) {
  this.parent = player;

  // This fixes bug #18614098.  See comments in DashVideoSource.attach for more
  // details.
  var backupMediaKeys = video.mediaKeys;
  video.src = this.mediaUrl_;
  var restorePromise = video.setMediaKeys(backupMediaKeys);

  if (this.textUrl_) {
    this.textTrack_ = /** @type {HTMLTrackElement} */
        (document.createElement('track'));
    this.textTrack_.src = this.textUrl_;
    video.appendChild(this.textTrack_);
    // NOTE: mode must be set after appending to the DOM.
    this.textTrack_.track.mode = 'showing';
  }

  return restorePromise;
};


/** @override */
shaka.player.HttpVideoSource.prototype.load = function(preferredLanguage) {
  return Promise.resolve();
};


/** @override */
shaka.player.HttpVideoSource.prototype.getVideoTracks = function() {
  return [];
};


/** @override */
shaka.player.HttpVideoSource.prototype.getAudioTracks = function() {
  return [];
};


/** @override */
shaka.player.HttpVideoSource.prototype.getTextTracks = function() {
  return [];
};


/** @override */
shaka.player.HttpVideoSource.prototype.getResumeThreshold = function() {
  return 5.0;
};


/** @override */
shaka.player.HttpVideoSource.prototype.getConfigurations = function() {
  var cfg = new shaka.media.StreamConfig();
  cfg.drmScheme = this.drmScheme_;
  return [cfg];
};


/** @override */
shaka.player.HttpVideoSource.prototype.selectConfigurations =
    function(configs) {
  // nop
};


/** @override */
shaka.player.HttpVideoSource.prototype.selectVideoTrack =
    function(id, immediate) {
  return false;
};


/** @override */
shaka.player.HttpVideoSource.prototype.selectAudioTrack =
    function(id, immediate) {
  return false;
};


/** @override */
shaka.player.HttpVideoSource.prototype.selectTextTrack =
    function(id, immediate) {
  return false;
};


/** @override */
shaka.player.HttpVideoSource.prototype.enableTextTrack = function(enabled) {
  if (!this.textTrack_) {
    return;
  }

  this.textTrack_.track.mode = enabled ? 'showing' : 'disabled';
};


/** @override */
shaka.player.HttpVideoSource.prototype.enableAdaptation = function(enabled) {
  // nop
};


/** @override */
shaka.player.HttpVideoSource.prototype.setRestrictions =
    function(restrictions) {
  // nop
};


/** @override */
shaka.player.HttpVideoSource.prototype.getSessionIds = function() {
  return [];
};


/** @override */
shaka.player.HttpVideoSource.prototype.isOffline = function() {
  return false;
};


/** @override */
shaka.player.HttpVideoSource.prototype.isLive = function() {
  return false;
};
