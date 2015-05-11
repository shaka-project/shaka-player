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
 * @fileoverview Implements a manager for adaptive bitrate streaming.
 */

goog.provide('shaka.media.SimpleAbrManager');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.IAbrManager');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IBandwidthEstimator');



/**
 * Creates a SimpleAbrManager, which selects video tracks using a basic set of
 * heuristics.
 *
 * @struct
 * @constructor
 * @implements {shaka.media.IAbrManager}
 * @export
 */
shaka.media.SimpleAbrManager = function() {
  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = null;

  /** @private {shaka.player.IVideoSource} */
  this.videoSource_ = null;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /**
   * The timestamp after which we are allowed to adapt, in milliseconds.
   * @private {number}
   */
  this.nextAdaptationTime_ = Number.POSITIVE_INFINITY;

  /** @private {boolean} */
  this.enabled_ = true;
};


/**
 * The minimum amount of time that must pass before the first switch, in
 * milliseconds.  This gives the bandwidth estimator time to get some real
 * data before changing anything.
 *
 * @private
 * @const {number}
 */
shaka.media.SimpleAbrManager.FIRST_SWITCH_INTERVAL_ = 4000;


/**
 * The minimum amount of time that must pass between switches, in milliseconds.
 * This keeps us from changing too often and annoying the user.
 *
 * @private
 * @const {number}
 */
shaka.media.SimpleAbrManager.MIN_SWITCH_INTERVAL_ = 30000;


/**
 * The minimum amount of time that must pass between bandwidth evaluations, in
 * milliseconds.  This keeps us from checking for adaptation opportunities too
 * often.
 *
 * @private
 * @const {number}
 */
shaka.media.SimpleAbrManager.MIN_EVAL_INTERVAL_ = 3000;


/**
 * The fraction of the estimated bandwidth which we should try to use when
 * upgrading.
 *
 * @private
 * @const {number}
 */
shaka.media.SimpleAbrManager.BANDWIDTH_UPGRADE_TARGET_ = 0.85;


/**
 * The fraction of the estimated bandwidth we should downgrade to avoid
 * exceeding.
 *
 * @private
 * @const {number}
 */
shaka.media.SimpleAbrManager.BANDWIDTH_DOWNGRADE_TARGET_ = 0.95;


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.SimpleAbrManager.prototype.destroy = function() {
  this.eventManager_.destroy();

  this.eventManager_ = null;
  this.estimator_ = null;
  this.videoSource_ = null;
};


/** @override */
shaka.media.SimpleAbrManager.prototype.start = function(estimator,
                                                        videoSource) {
  if (this.estimator_ && this.videoSource_) return;

  this.estimator_ = estimator;
  this.videoSource_ = videoSource;

  this.nextAdaptationTime_ =
      Date.now() + shaka.media.SimpleAbrManager.FIRST_SWITCH_INTERVAL_;
  this.eventManager_.listen(this.estimator_, 'bandwidth',
                            this.onBandwidth_.bind(this));
  this.eventManager_.listen(this.videoSource_, 'adaptation',
                            this.onAdaptation_.bind(this));
};


/** @override */
shaka.media.SimpleAbrManager.prototype.enable = function(enabled) {
  this.enabled_ = enabled;
};


/** @override */
shaka.media.SimpleAbrManager.prototype.getInitialVideoTrackId = function() {
  shaka.asserts.assert(this.videoSource_);
  shaka.asserts.assert(this.estimator_);
  if (!this.videoSource_ || !this.estimator_) return null;

  var chosen = this.chooseVideoTrack_();
  return chosen ? chosen.id : null;
};


/**
 * Find the active track in the list.
 *
 * @param {!Array.<T>} trackList
 * @return {T}
 *
 * @template T
 * @private
 */
shaka.media.SimpleAbrManager.findActiveTrack_ = function(trackList) {
  for (var i = 0; i < trackList.length; ++i) {
    if (trackList[i].active) {
      return trackList[i];
    }
  }

  return null;
};


/**
 * Handles bandwidth update events and makes adaptation decisions.
 *
 * @param {!Event} event
 * @private
 */
shaka.media.SimpleAbrManager.prototype.onBandwidth_ = function(event) {
  if (!this.enabled_) {
    return;
  }

  // Alias.
  var SimpleAbrManager = shaka.media.SimpleAbrManager;

  if (Date.now() < this.nextAdaptationTime_) {
    return;
  }

  var chosen = this.chooseVideoTrack_();

  if (chosen) {
    if (chosen.active) {
      // We are already using the correct video track.
      this.nextAdaptationTime_ =
          Date.now() + SimpleAbrManager.MIN_EVAL_INTERVAL_;
      return;
    }

    shaka.log.info('Video adaptation:', chosen);
    this.videoSource_.selectVideoTrack(chosen.id, false);
  }

  // Can't adapt again until we get confirmation of this one.
  this.nextAdaptationTime_ = Number.POSITIVE_INFINITY;
};


/**
 * Handles adaptation events.
 *
 * @param {!Event} event
 * @private
 */
shaka.media.SimpleAbrManager.prototype.onAdaptation_ = function(event) {
  // This check allows us to ignore the initial adaptation events, which would
  // otherwise cause us not to honor FIRST_SWITCH_INTERVAL_.
  if (this.nextAdaptationTime_ == Number.POSITIVE_INFINITY) {
    // Adaptation is complete, so schedule the next adaptation.
    this.nextAdaptationTime_ =
        Date.now() + shaka.media.SimpleAbrManager.MIN_SWITCH_INTERVAL_;
  }
};


/**
 * Choose a video track based on current bandwidth conditions.
 *
 * @return {shaka.player.VideoTrack} The chosen video track or null if there
 *     are no video tracks to choose.
 * @private
 */
shaka.media.SimpleAbrManager.prototype.chooseVideoTrack_ = function() {
  // Alias.
  var SimpleAbrManager = shaka.media.SimpleAbrManager;

  var videoTracks = this.videoSource_.getVideoTracks();
  if (videoTracks.length == 0) {
    return null;
  }

  videoTracks.sort(shaka.player.VideoTrack.compare);

  var activeAudioTrack =
      SimpleAbrManager.findActiveTrack_(this.videoSource_.getAudioTracks());
  var audioBandwidth = activeAudioTrack ? activeAudioTrack.bandwidth : 0;

  var bandwidth = this.estimator_.getBandwidth();

  // Start by assuming that we will use the first track.
  var chosen = videoTracks[0];

  for (var i = 0; i < videoTracks.length; ++i) {
    var track = videoTracks[i];
    var nextTrack = (i + 1 < videoTracks.length) ?
                    videoTracks[i + 1] :
                    { bandwidth: Number.POSITIVE_INFINITY };

    // Ignore any track which is missing bandwidth info.
    if (!track.bandwidth) continue;

    var minBandwidth = (track.bandwidth + audioBandwidth) /
                       SimpleAbrManager.BANDWIDTH_DOWNGRADE_TARGET_;
    var maxBandwidth = (nextTrack.bandwidth + audioBandwidth) /
                       SimpleAbrManager.BANDWIDTH_UPGRADE_TARGET_;
    shaka.log.v2('Bandwidth ranges:',
                 ((track.bandwidth + audioBandwidth) / 1e6).toFixed(3),
                 (minBandwidth / 1e6).toFixed(3),
                 (maxBandwidth / 1e6).toFixed(3));

    if (bandwidth >= minBandwidth && bandwidth <= maxBandwidth) {
      chosen = track;
      if (chosen.active) break;
    }
  }

  return chosen;
};

