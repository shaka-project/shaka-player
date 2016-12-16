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

  /** @private {shakaExtern.Restrictions} */
  this.restrictions_ = {
    minWidth: 0,
    maxWidth: Infinity,
    minHeight: 0,
    maxHeight: Infinity,
    minPixels: 0,
    maxPixels: Infinity,
    minBandwidth: 0,
    maxBandwidth: Infinity
  };
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
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.init = function(switchCallback) {
  this.switch_ = switchCallback;
};


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
    var variant = this.chooseVariant_(this.variants_);
    if (variant && variant.video)
      chosen[ContentType.VIDEO] = variant.video;

    if (variant && variant.audio)
      chosen[ContentType.AUDIO] = variant.audio;
  }

  if (mediaTypesToUpdate.indexOf(ContentType.TEXT) > -1) {
    // We don't adapt text, so just choose stream 0.
    chosen[ContentType.TEXT] = this.textStreams_[0];
  }

  this.lastTimeChosenMs_ = Date.now();
  return chosen;
};


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
    this.suggestStreams_();
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.getBandwidthEstimate = function() {
  return this.bandwidthEstimator_.getBandwidthEstimate();
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.setDefaultEstimate = function(estimate) {
  this.bandwidthEstimator_.setDefaultEstimate(estimate);
};


/**
 * @override
 * @export
 */
shaka.abr.SimpleAbrManager.prototype.setRestrictions = function(restrictions) {
  this.restrictions_ = restrictions;
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
 * Calls switch_() with which Streams to switch to.
 *
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.suggestStreams_ = function() {
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
  } else {
    // Check if we've left the switch interval.
    var now = Date.now();
    var delta = now - this.lastTimeChosenMs_;
    if (delta < shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS) {
      shaka.log.v2('Still within switch interval...');
      return;
    }
  }

  var chosen = this.chooseStreams([ContentType.AUDIO, ContentType.VIDEO]);
  var currentBandwidthKbps =
      Math.round(this.bandwidthEstimator_.getBandwidthEstimate() / 1000.0);
  shaka.log.debug(
      'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
  // If any of these chosen streams are already chosen, Player will filter them
  // out before passing the choices on to StreamingEngine.
  this.switch_(chosen);
};


/**
 * Chooses a Variant with an optimal bandwidth.
 *
 * @param {!Array.<shakaExtern.Variant>} variants
 * @return {shakaExtern.Variant}
 * @private
 */
shaka.abr.SimpleAbrManager.prototype.chooseVariant_ = function(variants) {
  // Alias.
  var SimpleAbrManager = shaka.abr.SimpleAbrManager;

  // Get sorted Streams.
  var sortedVariants = SimpleAbrManager.filterAndSortVariants_(
      this.restrictions_, variants);
  var currentBandwidth = this.bandwidthEstimator_.getBandwidthEstimate();

  if (variants.length && !sortedVariants.length) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET);
  }

  // Start by assuming that we will use the first Stream.
  var chosen = sortedVariants[0];

  for (var i = 0; i < sortedVariants.length; ++i) {
    var variant = sortedVariants[i];
    var nextVariant = sortedVariants[i + 1] || {bandwidth: Infinity};

    var minBandwidth = variant.bandwidth /
                       SimpleAbrManager.BANDWIDTH_DOWNGRADE_TARGET_;
    var maxBandwidth = nextVariant.bandwidth /
                       SimpleAbrManager.BANDWIDTH_UPGRADE_TARGET_;
    shaka.log.v2('Bandwidth ranges:',
                 (variant.bandwidth / 1e6).toFixed(3),
                 (minBandwidth / 1e6).toFixed(3),
                 (maxBandwidth / 1e6).toFixed(3));

    if (currentBandwidth >= minBandwidth && currentBandwidth <= maxBandwidth)
      chosen = variant;
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
            variant, restrictions,
            /* maxHwRes */ {width: Infinity, height: Infinity});
      })
      .sort(function(v1, v2) {
        return v1.bandwidth - v2.bandwidth;
      });
};

