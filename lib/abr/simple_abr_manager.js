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

goog.provide('shaka.abr.SimpleAbrManager');

goog.require('goog.asserts');
goog.require('shaka.abr.EwmaBandwidthEstimator');
goog.require('shaka.log');



/**
 * Creates a new SimpleAbrManager.
 *
 * @constructor
 * @struct
 * @implements {shakaExtern.AbrManager}
 * @export
 */
shaka.abr.SimpleAbrManager = function() {
  /** @private {?shakaExtern.AbrManager.SwitchCallback} */
  this.switch_ = null;

  /** @private {boolean} */
  this.enabled_ = false;

  /** @private {shaka.abr.EwmaBandwidthEstimator} */
  this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();

  /**
   * The last StreamSets given to us via chooseStreams().
   * @private {Object.<string, shakaExtern.StreamSet>}
   */
  this.streamSetsByType_ = {};

  /**
   * The last Streams chosen.
   * @private {Object.<string, shakaExtern.Stream>}
   */
  this.streamsByType_ = {};

  /** @private {boolean} */
  this.startupComplete_ = false;

  /**
   * The last wall-clock time, in milliseconds, when Streams were chosen via
   * chooseStreams() or switch_().
   *
   * @private {?number}
   */
  this.lastTimeChosenMs_ = null;
};


/**
 * The minimum amount of time that must pass between switches, in milliseconds.
 * This keeps us from changing too often and annoying the user.
 *
 * @const {number}
 */
shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS = 8000;


/**
 * The fraction of the estimated bandwidth which we should try to use when
 * upgrading.
 *
 * @private
 * @const {number}
 */
shaka.abr.SimpleAbrManager.BANDWIDTH_UPGRADE_TARGET_ = 0.85;


/**
 * The largest fraction of the estimated bandwidth we should use. We should
 * downgrade to avoid this.
 *
 * @private
 * @const {number}
 */
shaka.abr.SimpleAbrManager.BANDWIDTH_DOWNGRADE_TARGET_ = 0.95;


/** @override */
shaka.abr.SimpleAbrManager.prototype.stop = function() {
  this.switch_ = null;
  this.enabled_ = false;
  this.streamSetsByType_ = {};
  this.streamsByType_ = {};
  this.lastTimeChosenMs_ = null;

  // Don't reset |startupComplete_|: if we've left the startup interval then we
  // can start using bandwidth estimates right away if init() is called again.
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.init = function(switchCallback) {
  this.switch_ = switchCallback;
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.chooseStreams = function(
    streamSetsByType) {
  // Merge StreamSets.  We may have been given a partial list.
  for (var type in streamSetsByType) {
    this.streamSetsByType_[type] = streamSetsByType[type];
  }

  // Choose streams for the specific types requested.
  var chosen = {};

  if ('audio' in streamSetsByType) {
    var audioStream = this.chooseAudioStream_();
    if (audioStream) {
      chosen['audio'] = audioStream;
      this.streamsByType_['audio'] = audioStream;
    } else {
      delete this.streamsByType_['audio'];
    }
  }

  if ('video' in streamSetsByType) {
    var videoStream = this.chooseVideoStream_();
    if (videoStream) {
      chosen['video'] = videoStream;
      this.streamsByType_['video'] = videoStream;
    } else {
      delete this.streamsByType_['video'];
    }
  }

  if ('text' in streamSetsByType) {
    // We don't adapt text, so just choose stream 0.
    chosen['text'] = streamSetsByType['text'].streams[0];
  }

  this.lastTimeChosenMs_ = Date.now();
  return chosen;
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.enable = function() {
  this.enabled_ = true;
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.disable = function() {
  this.enabled_ = false;
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.segmentDownloaded = function(
    startTimeMs, endTimeMs, numBytes) {
  shaka.log.v2('Segment downloaded:',
               'startTimeMs=' + startTimeMs,
               'endTimeMs=' + endTimeMs,
               'numBytes=' + numBytes);
  goog.asserts.assert(endTimeMs >= startTimeMs,
                      'expected a non-negative duration');
  this.bandwidthEstimator_.sample(endTimeMs - startTimeMs, numBytes);

  if ((this.lastTimeChosenMs_ != null) && this.enabled_)
    this.suggestStreams_();
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.getBandwidthEstimate = function() {
  return this.bandwidthEstimator_.getBandwidthEstimate();
};


/** @override */
shaka.abr.SimpleAbrManager.prototype.setDefaultEstimate = function(estimate) {
  this.bandwidthEstimator_.setDefaultEstimate(estimate);
};


/**
 * Calls switch_() with which Streams to switch to.
 *
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.suggestStreams_ = function() {
  shaka.log.v2('Suggesting Streams...');
  goog.asserts.assert(this.lastTimeChosenMs_ != null,
                      'lastTimeChosenMs_ should not be null');

  if (!this.startupComplete_) {
    // Check if we've got enough data yet.
    if (!this.bandwidthEstimator_.hasGoodEstimate()) {
      shaka.log.v2('Still waiting for a good estimate...');
      return;
    }
    this.startupComplete_ = true;
  } else {
    // Check if we've left the switch interval.
    var now = Date.now();
    var delta = now - this.lastTimeChosenMs_;
    if (delta < shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS) {
      shaka.log.v2('Still within switch interval...');
      return;
    }
  }

  var chosen = this.chooseStreams_();
  var currentBandwidthKbps =
      Math.round(this.bandwidthEstimator_.getBandwidthEstimate() / 1000.0);
  shaka.log.debug(
      'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
  // If any of these chosen streams are already chosen, Player will filter them
  // out before passing the choices on to StreamingEngine.
  this.switch_(chosen);
};


/**
 * Chooses which Streams to switch to.
 *
 * @return {!Object.<string, !shakaExtern.Stream>}
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.chooseStreams_ = function() {
  var streamsByType = {};

  // Choose audio Stream.
  var audioStream = this.chooseAudioStream_();
  if (audioStream) {
    streamsByType['audio'] = audioStream;
    this.streamsByType_['audio'] = audioStream;
  }

  // Choose video Stream.
  var videoStream = this.chooseVideoStream_();
  if (videoStream) {
    streamsByType['video'] = videoStream;
    this.streamsByType_['video'] = videoStream;
  }

  this.lastTimeChosenMs_ = Date.now();
  return streamsByType;
};


/**
 * Chooses which audio Stream to switch to.
 *
 * @return {?shakaExtern.Stream}
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.chooseAudioStream_ = function() {
  // Alias.
  var SimpleAbrManager = shaka.abr.SimpleAbrManager;

  // Get sorted audio Streams.
  var audioStreamSet = this.streamSetsByType_['audio'];
  if (!audioStreamSet)
    return null;
  var audioStreams = SimpleAbrManager.sortStreamsByBandwidth_(audioStreamSet);

  // Just pick the middle one.
  // TODO: Implement better audio adaptation.
  return audioStreams[Math.floor(audioStreams.length / 2)];
};


/**
 * Chooses which video Stream to switch to.
 *
 * @return {?shakaExtern.Stream}
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.chooseVideoStream_ = function() {
  // Alias.
  var SimpleAbrManager = shaka.abr.SimpleAbrManager;

  // Get sorted video Streams.
  var videoStreamSet = this.streamSetsByType_['video'];
  if (!videoStreamSet)
    return null;
  var videoStreams = SimpleAbrManager.sortStreamsByBandwidth_(videoStreamSet);

  var audioStream = this.streamsByType_['audio'];
  var audioBandwidth = (audioStream && audioStream.bandwidth) || 0;
  var currentBandwidth = this.bandwidthEstimator_.getBandwidthEstimate();

  // Start by assuming that we will use the first Stream.
  var chosen = videoStreams[0];

  for (var i = 0; i < videoStreams.length; ++i) {
    var stream = videoStreams[i];
    var nextStream = (i + 1 < videoStreams.length) ?
                     videoStreams[i + 1] :
                     {bandwidth: Infinity};

    // Ignore Streams which don't have bandwidth information.
    if (!stream.bandwidth) continue;

    var minBandwidth = (stream.bandwidth + audioBandwidth) /
                       SimpleAbrManager.BANDWIDTH_DOWNGRADE_TARGET_;
    var maxBandwidth = (nextStream.bandwidth + audioBandwidth) /
                       SimpleAbrManager.BANDWIDTH_UPGRADE_TARGET_;
    shaka.log.v2('Bandwidth ranges:',
                 ((stream.bandwidth + audioBandwidth) / 1e6).toFixed(3),
                 (minBandwidth / 1e6).toFixed(3),
                 (maxBandwidth / 1e6).toFixed(3));

    if (currentBandwidth >= minBandwidth && currentBandwidth <= maxBandwidth)
      chosen = stream;
  }

  return chosen;
};


/**
 * @param {!shakaExtern.StreamSet} streamSet
 * @return {!Array.<shakaExtern.Stream>} |streamSet|'s Streams sorted
 *   in ascending order of bandwidth.
 * @private
 */
shaka.abr.SimpleAbrManager.sortStreamsByBandwidth_ = function(streamSet) {
  return streamSet.streams.slice(0)
      .filter(function(s) {
        return s.allowedByApplication && s.allowedByKeySystem;
      })
      .sort(function(s1, s2) { return s1.bandwidth - s2.bandwidth; });
};

