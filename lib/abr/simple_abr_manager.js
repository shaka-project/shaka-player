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
 * After initial choices are made, this class will call switchCallback() when
 * there is a better choice.  switchCallback() will not be called more than once
 * per ({@link shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS}).
 * </p>
 *
 * @constructor
 * @struct
 * @implements {shaka.extern.AbrManager}
 * @export
 */
shaka.abr.SimpleAbrManager = function() {
  /** @private {?shaka.extern.AbrManager.SwitchCallback} */
  this.switch_ = null;

  /** @private {boolean} */
  this.enabled_ = false;

  /** @private {shaka.abr.EwmaBandwidthEstimator} */
  this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();
  // TODO: Consider using NetworkInformation's change event to throw out an old
  // estimate based on changing network types, such as wifi => 3g.

  /**
   * A filtered list of Variants to choose from.
   * @private {!Array.<!shaka.extern.Variant>}
   */
  this.variants_ = [];

  /** @private {boolean} */
  this.startupComplete_ = false;

  /**
   * The last wall-clock time, in milliseconds, when streams were chosen.
   *
   * @private {?number}
   */
  this.lastTimeChosenMs_ = null;

  /** @private {?shaka.extern.AbrConfiguration} */
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
  this.lastTimeChosenMs_ = null;

  // Don't reset |startupComplete_|: if we've left the startup interval, we can
  // start using bandwidth estimates right away after init() is called.
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
shaka.abr.SimpleAbrManager.prototype.chooseVariant = function() {
  const SimpleAbrManager = shaka.abr.SimpleAbrManager;

  // Get sorted Variants.
  let sortedVariants = SimpleAbrManager.filterAndSortVariants_(
      this.config_.restrictions, this.variants_);
  let currentBandwidth = this.bandwidthEstimator_.getBandwidthEstimate(
      this.config_.defaultBandwidthEstimate);

  if (this.variants_.length && !sortedVariants.length) {
    // If we couldn't meet the ABR restrictions, we should still play something.
    // These restrictions are not "hard" restrictions in the way that top-level
    // or DRM-based restrictions are.  Sort the variants without restrictions
    // and keep just the first (lowest-bandwidth) one.
    shaka.log.warning('No variants met the ABR restrictions. ' +
                      'Choosing a variant by lowest bandwidth.');
    sortedVariants = SimpleAbrManager.filterAndSortVariants_(
        /* restrictions */ null, this.variants_);
    sortedVariants = [sortedVariants[0]];
  }

  // Start by assuming that we will use the first Stream.
  let chosen = sortedVariants[0] || null;

  for (let i = 0; i < sortedVariants.length; ++i) {
    let variant = sortedVariants[i];
    let nextVariant = sortedVariants[i + 1] || {bandwidth: Infinity};

    let minBandwidth = variant.bandwidth /
                       this.config_.bandwidthDowngradeTarget;
    let maxBandwidth = nextVariant.bandwidth /
                       this.config_.bandwidthUpgradeTarget;
    shaka.log.v2('Bandwidth ranges:',
                 (variant.bandwidth / 1e6).toFixed(3),
                 (minBandwidth / 1e6).toFixed(3),
                 (maxBandwidth / 1e6).toFixed(3));

    if (currentBandwidth >= minBandwidth && currentBandwidth <= maxBandwidth) {
      chosen = variant;
    }
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
               'numBytes=' + numBytes,
               'lastTimeChosenMs=' + this.lastTimeChosenMs_,
               'enabled=' + this.enabled_);
  goog.asserts.assert(deltaTimeMs >= 0, 'expected a non-negative duration');
  this.bandwidthEstimator_.sample(deltaTimeMs, numBytes);

  if ((this.lastTimeChosenMs_ != null) && this.enabled_) {
    this.suggestStreams_();
  }
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
shaka.abr.SimpleAbrManager.prototype.configure = function(config) {
  this.config_ = config;
};


/**
 * Calls switch_() with the variant chosen by chooseVariant().
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
    let now = Date.now();
    let delta = now - this.lastTimeChosenMs_;
    if (delta < this.config_.switchInterval * 1000) {
      shaka.log.v2('Still within switch interval...');
      return;
    }
  }

  let chosenVariant = this.chooseVariant();
  let bandwidthEstimate = this.bandwidthEstimator_.getBandwidthEstimate(
      this.config_.defaultBandwidthEstimate);
  let currentBandwidthKbps = Math.round(bandwidthEstimate / 1000.0);

  shaka.log.debug(
      'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
  // If any of these chosen streams are already chosen, Player will filter them
  // out before passing the choices on to StreamingEngine.
  this.switch_(chosenVariant);
};


/**
 * @param {?shaka.extern.Restrictions} restrictions
 * @param {!Array.<shaka.extern.Variant>} variants
 * @return {!Array.<shaka.extern.Variant>} variants filtered according to
 *   |restrictions| and sorted in ascending order of bandwidth.
 * @private
 */
shaka.abr.SimpleAbrManager.filterAndSortVariants_ = function(
    restrictions, variants) {
  if (restrictions) {
    variants = variants.filter((variant) => {
      // This was already checked in another scope, but the compiler doesn't
      // seem to understand that.
      goog.asserts.assert(restrictions, 'Restrictions should exist!');

      return shaka.util.StreamUtils.meetsRestrictions(
          variant, restrictions,
          /* maxHwRes */ {width: Infinity, height: Infinity});
    });
  }

  return variants.sort((v1, v2) => {
    return v1.bandwidth - v2.bandwidth;
  });
};

