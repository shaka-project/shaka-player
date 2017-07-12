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
goog.require('shaka.abr.EwmaVideoQualityEstimator');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.StreamUtils');

/**
 * <p>
 * This defines the default ABR manager for the Player.  An instance of this
 * class is used when no ABR manager is given.
 * </p>
 * <p>
 * The behavior of this class is to take throughput samples using
 * segmentDownloaded to estimate the current network bandwidth.  Then it will
 * use that to choose the streams that best fit the current bandwidth.  It will
 * always pick the highest bandwidth variant it thinks can be played.
 * </p>
 * <p>
 * After the initial choice (in chooseStreams), this class will call
 * switchCallback() when there is a better choice.  switchCallback() will not
 * be called more than once per
 * ({@link shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS}).
 * </p>
 * <p>
 * This does not adapt for text streams, it will always select the first one.
 * </p>
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

  /** @private {shaka.abr.EwmaVideoQualityEstimator} */
  this.videoQualityEstimator_ = new shaka.abr.EwmaVideoQualityEstimator();

  this.videoQualitySampleTimer_ = null;
  this.videoQualitySampleIntervalMs_ = 1000;

  this.videoElem_ = null;

  /**
   * A filtered list of Variants to choose from.
   * @private {!Array.<!shakaExtern.Variant>}
   */
  this.variants_ = [];

  /**
   * A filtered list of text streams to choose from.
   * @private {!Array.<!shakaExtern.Stream>}
   */
  this.textStreams_ = [];

  /** @private {boolean} */
  this.startupComplete_ = false;

  /**
   * The last wall-clock time, in milliseconds, when Streams were chosen via
   * chooseStreams() or switch_().
   *
   * @private {?number}
   */
  this.lastTimeChosenMs_ = null;

  this.maxQualityVideoStreamChosen_ = null;

  /** @private {?shakaExtern.AbrConfiguration} */
  this.config_ = null;
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.stop = function() {
  this.switch_ = null;
  this.enabled_ = false;
  this.variants_ = [];
  this.textStreams_ = [];
  this.lastTimeChosenMs_ = null;

  // Don't reset |startupComplete_|: if we've left the startup interval then we
  // can start using bandwidth estimates right away if init() is called again.

  clearInterval(this.videoQualitySampleTimer_);
  this.videoQualitySampleTimer_ = null;
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.init = function(switchCallback, videoElem) {
  this.switch_ = switchCallback;
  this.videoElem_ = videoElem;

  this.setupVideoQualitySampling_();
};


shaka.abr.SimpleAbrManager.prototype.setupVideoQualitySampling_ = function() {

  if (this.videoQualitySampleTimer_ === null) {
      this.videoQualitySampleTimer_ = setInterval(function() {

          var videoElem = this.videoElem_;
          var videoInfo = videoElem && videoElem.getVideoPlaybackQuality ?
              videoElem.getVideoPlaybackQuality() : {};
          var decodedFrames = Number(videoInfo.totalVideoFrames);
          var droppedFrames = Number(videoInfo.droppedVideoFrames);

          if (isNaN(decodedFrames) || isNaN(droppedFrames)) {
              return;
          }

          this.videoQualityEstimator_.sample(droppedFrames, decodedFrames);

          var droppedFramesRatioEstimate = this.videoQualityEstimator_.getDroppedFramesRatioEstimate();
          //console.log('DroppedFramesRatioEstimate:', droppedFramesEstimate.toFixed(3));
          if (droppedFramesRatioEstimate > 0.20) {
              console.warn('Dropped-frames-ratio exceeds 20%, emergency flush!');

              if (this.enabled_) {
                  this.suggestStreams_(true);
              }
          }
          
      }.bind(this), this.videoQualitySampleIntervalMs_);
  }
}


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.chooseStreams = function(
    mediaTypesToUpdate) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  // Choose streams for the specific types requested.
  var chosen = {};

  if (mediaTypesToUpdate.indexOf(ContentType.AUDIO) > -1 ||
      mediaTypesToUpdate.indexOf(ContentType.VIDEO) > -1) {
    // Choose a new Variant
    var variant = this.chooseVariant_();
    if (variant && variant.video)
      chosen[ContentType.VIDEO] = variant.video;

    if (variant && variant.audio)
      chosen[ContentType.AUDIO] = variant.audio;
  }

  if (mediaTypesToUpdate.indexOf(ContentType.TEXT) > -1) {
    // We don't adapt text, so just choose stream 0.
    chosen[ContentType.TEXT] = this.textStreams_[0];
  }

  // We are keeping track of the max video quality chosen to allow reacting on
  // video quality estimates (inversly, 
  // that's why we dont need to do this for audio/text streams)
  this.updateVideoQualityEstimator(chosen[ContentType.VIDEO]); // or call this `videoStreamChosen

  this.lastTimeChosenMs_ = Date.now();
  return chosen;
};

shaka.abr.SimpleAbrManager.prototype.updateVideoQualityEstimator = function(videoStreamChosen) {

  if (!videoStreamChosen) {
    return;
  }

  var evalVideoQualityScalar = shaka.abr.EwmaVideoQualityEstimator.evalVideoQualityScalar;
  if ((this.maxQualityVideoStreamChosen_ !== null
    && evalVideoQualityScalar(videoStreamChosen) 
      > evalVideoQualityScalar(this.maxQualityVideoStreamChosen_)) 
    || this.maxQualityVideoStreamChosen_ === null) {

    console.log('maxVideoQualityChosen_:', videoStreamChosen.height, 'height pixels');

    this.maxQualityVideoStreamChosen_ = videoStreamChosen;
  }

}


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.enable = function() {
  this.enabled_ = true;
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.disable = function() {
  this.enabled_ = false;
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.segmentDownloaded = function(
    deltaTimeMs, numBytes) {
  shaka.log.v2('Segment downloaded:',
               'deltaTimeMs=' + deltaTimeMs,
               'numBytes=' + numBytes);
  goog.asserts.assert(deltaTimeMs >= 0, 'expected a non-negative duration');
  this.bandwidthEstimator_.sample(deltaTimeMs, numBytes);

  if ((this.lastTimeChosenMs_ != null) && this.enabled_)
    this.suggestStreams_(false);
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.getBandwidthEstimate = function() {
  return this.bandwidthEstimator_.getBandwidthEstimate(
      this.config_.defaultBandwidthEstimate);
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.setVariants = function(variants) {
  this.variants_ = variants;
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.setTextStreams = function(streams) {
  this.textStreams_ = streams;
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.configure = function(config) {
  this.config_ = config;
};


/**
 * Calls switch_() with which Streams to switch to.
 *
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.suggestStreams_ = function(flush) {
  shaka.log.v2('Suggesting Streams...');
  goog.asserts.assert(this.lastTimeChosenMs_ != null,
                      'lastTimeChosenMs_ should not be null');

  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  if (!this.startupComplete_) {
    // Check if we've got enough data yet.
    if (!this.bandwidthEstimator_.hasGoodEstimate()) {
      shaka.log.v2('Still waiting for a good estimate...');
      return;
    }
    this.startupComplete_ = true;
  } else if (!flush) { 
    // Check if we've left the switch interval.
    // If we are flushing, we override this check.
    var now = Date.now();
    var delta = now - this.lastTimeChosenMs_;
    if (delta < this.config_.switchInterval * 1000) {
      shaka.log.v2('Still within switch interval...');
      return;
    }
  }

  var chosen = this.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);
  var bandwidthEstimate = this.bandwidthEstimator_.getBandwidthEstimate(
      this.config_.defaultBandwidthEstimate);
  var currentBandwidthKbps = Math.round(bandwidthEstimate / 1000.0);

  shaka.log.debug(
      'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
  // If any of these chosen streams are already chosen, Player will filter them
  // out before passing the choices on to StreamingEngine.

  this.switch_(chosen, flush);
};


/**
 * Chooses a Variant with an optimal bandwidth.
 *
 * @return {shakaExtern.Variant}
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.chooseVariant_ = function() {
  // Alias.
  var SimpleAbrManager = shaka.abr.SimpleAbrManager;
  var evalVideoQualityScalar = shaka.abr.EwmaVideoQualityEstimator.evalVideoQualityScalar;

  // Get sorted Streams.
  var sortedVariants = SimpleAbrManager.filterAndSortVariants_(
      this.config_.restrictions, this.variants_);
  var currentBandwidth = this.bandwidthEstimator_.getBandwidthEstimate(
      this.config_.defaultBandwidthEstimate);

  var currentDroppedFramesRatio = this.videoQualityEstimator_.getDroppedFramesRatioEstimate();
  var maxVideoQualityScalar = Infinity;
  if (currentDroppedFramesRatio > 0.10) {
    console.warn('Dropped-frames-ratio estimate exceeds 10%');
    maxVideoQualityScalar = evalVideoQualityScalar(this.maxQualityVideoStreamChosen_) - 1;
    this.maxQualityVideoStreamChosen_ = null;
  }

  if (this.variants_.length && !sortedVariants.length) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET);
  }

  // Start by assuming that we will use the first Stream.
  var chosen = sortedVariants[0];

  for (var i = 0; i < sortedVariants.length; ++i) {
    var exceedsEstimatedMaxVideoQuality = false;
    var variant = sortedVariants[i];
    var nextVariant = sortedVariants[i + 1] || {bandwidth: Infinity};

    var minBandwidth = variant.bandwidth /
                       this.config_.bandwidthDowngradeTarget;
    var maxBandwidth = nextVariant.bandwidth /
                       this.config_.bandwidthUpgradeTarget;

    if (variant.video && evalVideoQualityScalar(variant.video) > maxVideoQualityScalar) {
        exceedsEstimatedMaxVideoQuality = true;
    }

    shaka.log.v2('Bandwidth ranges:',
                 (variant.bandwidth / 1e6).toFixed(3),
                 (minBandwidth / 1e6).toFixed(3),
                 (maxBandwidth / 1e6).toFixed(3));

    if (!exceedsEstimatedMaxVideoQuality
      && currentBandwidth >= minBandwidth 
      && currentBandwidth <= maxBandwidth) {
        chosen = variant;
    }
  }

  return chosen;
};


/**
 * @param {shakaExtern.Restrictions} restrictions
 * @param {!Array.<shakaExtern.Variant>} variants
 * @return {!Array.<shakaExtern.Variant>} variants filtered according to
 *   |restrictions| and sorted in ascending order of bandwidth.
 * @private
 */
shaka.abr.SimpleAbrManager.filterAndSortVariants_ = function(
    restrictions, variants) {
  return variants
      .filter(function(variant) {
        return shaka.util.StreamUtils.meetsRestrictions(
            variant, 
            restrictions,
            {width: Infinity, height: Infinity}
          );
      })
      .sort(function(v1, v2) {
        return v1.bandwidth - v2.bandwidth;
      });
};

