/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.abr.SimpleAbrManager');

goog.require('goog.asserts');
goog.require('shaka.abr.EwmaBandwidthEstimator');
goog.require('shaka.log');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.StreamUtils');


/**
 * @summary
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
 * @implements {shaka.extern.AbrManager}
 * @export
 */
shaka.abr.SimpleAbrManager = class {
  /** */
  constructor() {
    /** @private {?shaka.extern.AbrManager.SwitchCallback} */
    this.switch_ = null;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {shaka.abr.EwmaBandwidthEstimator} */
    this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();

    // Some browsers implement the Network Information API, which allows
    // retrieving information about a user's network connection. We listen
    // to the change event to be able to make quick changes in case the type
    // of connectivity changes.
    if (navigator.connection) {
      navigator.connection.addEventListener('change', () => {
        if (this.config_.useNetworkInformation && this.enabled_) {
          this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();
          const chosenVariant = this.chooseVariant();
          if (chosenVariant) {
            this.switch_(chosenVariant);
          }
        }
      });
    }

    /**
     * A filtered list of Variants to choose from.
     * @private {!Array.<!shaka.extern.Variant>}
     */
    this.variants_ = [];

    /** @private {number} */
    this.playbackRate_ = 1;

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
  }


  /**
   * @override
   * @export
   */
  stop() {
    this.switch_ = null;
    this.enabled_ = false;
    this.variants_ = [];
    this.playbackRate_ = 1;
    this.lastTimeChosenMs_ = null;

    // Don't reset |startupComplete_|: if we've left the startup interval, we
    // can start using bandwidth estimates right away after init() is called.
  }


  /**
   * @override
   * @export
   */
  init(switchCallback) {
    this.switch_ = switchCallback;
  }


  /**
   * @override
   * @export
   */
  chooseVariant() {
    const SimpleAbrManager = shaka.abr.SimpleAbrManager;

    // Get sorted Variants.
    let sortedVariants = SimpleAbrManager.filterAndSortVariants_(
        this.config_.restrictions, this.variants_);

    const defaultBandwidthEstimate = this.getDefaultBandwidth_();
    const currentBandwidth = this.bandwidthEstimator_.getBandwidthEstimate(
        defaultBandwidthEstimate);

    if (this.variants_.length && !sortedVariants.length) {
      // If we couldn't meet the ABR restrictions, we should still play
      // something.
      // These restrictions are not "hard" restrictions in the way that
      // top-level or DRM-based restrictions are.  Sort the variants without
      // restrictions and keep just the first (lowest-bandwidth) one.
      shaka.log.warning('No variants met the ABR restrictions. ' +
                        'Choosing a variant by lowest bandwidth.');
      sortedVariants = SimpleAbrManager.filterAndSortVariants_(
          /* restrictions= */ null, this.variants_);
      sortedVariants = [sortedVariants[0]];
    }

    // Start by assuming that we will use the first Stream.
    let chosen = sortedVariants[0] || null;

    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {item, next} of enumerate(sortedVariants)) {
      const playbackRate =
          !isNaN(this.playbackRate_) ? Math.abs(this.playbackRate_) : 1;
      const itemBandwidth = playbackRate * item.bandwidth;
      const minBandwidth =
          itemBandwidth / this.config_.bandwidthDowngradeTarget;
      const nextBandwidth =
          playbackRate * (next || {bandwidth: Infinity}).bandwidth;
      const maxBandwidth = nextBandwidth / this.config_.bandwidthUpgradeTarget;
      shaka.log.v2('Bandwidth ranges:',
          (itemBandwidth / 1e6).toFixed(3),
          (minBandwidth / 1e6).toFixed(3),
          (maxBandwidth / 1e6).toFixed(3));

      if (currentBandwidth >= minBandwidth &&
          currentBandwidth <= maxBandwidth) {
        chosen = item;
      }
    }

    this.lastTimeChosenMs_ = Date.now();
    return chosen;
  }


  /**
   * @override
   * @export
   */
  enable() {
    this.enabled_ = true;
  }


  /**
   * @override
   * @export
   */
  disable() {
    this.enabled_ = false;
  }


  /**
   * @override
   * @export
   */
  segmentDownloaded(deltaTimeMs, numBytes) {
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
  }


  /**
   * @override
   * @export
   */
  getBandwidthEstimate() {
    return this.bandwidthEstimator_.getBandwidthEstimate(
        this.config_.defaultBandwidthEstimate);
  }


  /**
   * @override
   * @export
   */
  setVariants(variants) {
    this.variants_ = variants;
  }


  /**
   * @override
   * @export
   */
  playbackRateChanged(rate) {
    this.playbackRate_ = rate;
  }


  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
  }


  /**
   * Calls switch_() with the variant chosen by chooseVariant().
   *
   * @private
   */
  suggestStreams_() {
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
      const now = Date.now();
      const delta = now - this.lastTimeChosenMs_;
      if (delta < this.config_.switchInterval * 1000) {
        shaka.log.v2('Still within switch interval...');
        return;
      }
    }

    const chosenVariant = this.chooseVariant();
    const defaultBandwidthEstimate = this.getDefaultBandwidth_();
    const bandwidthEstimate = this.bandwidthEstimator_.getBandwidthEstimate(
        defaultBandwidthEstimate);
    const currentBandwidthKbps = Math.round(bandwidthEstimate / 1000.0);

    if (chosenVariant) {
      shaka.log.debug(
          'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
      // If any of these chosen streams are already chosen, Player will filter
      // them out before passing the choices on to StreamingEngine.
      this.switch_(chosenVariant);
    }
  }


  /**
   * @private
   */
  getDefaultBandwidth_() {
    let defaultBandwidthEstimate = this.config_.defaultBandwidthEstimate;

    // Some browsers implement the Network Information API, which allows
    // retrieving information about a user's network connection.  Tizen 3 has
    // NetworkInformation, but not the downlink attribute.
    if (navigator.connection && navigator.connection.downlink &&
        this.config_.useNetworkInformation) {
      // If it's available, get the bandwidth estimate from the browser (in
      // megabits per second) and use it as defaultBandwidthEstimate.
      defaultBandwidthEstimate = navigator.connection.downlink * 1e6;
    }
    return defaultBandwidthEstimate;
  }


  /**
   * @param {?shaka.extern.Restrictions} restrictions
   * @param {!Array.<shaka.extern.Variant>} variants
   * @return {!Array.<shaka.extern.Variant>} variants filtered according to
   *   |restrictions| and sorted in ascending order of bandwidth.
   * @private
   */
  static filterAndSortVariants_(restrictions, variants) {
    if (restrictions) {
      variants = variants.filter((variant) => {
        // This was already checked in another scope, but the compiler doesn't
        // seem to understand that.
        goog.asserts.assert(restrictions, 'Restrictions should exist!');

        return shaka.util.StreamUtils.meetsRestrictions(
            variant, restrictions,
            /* maxHwRes= */ {width: Infinity, height: Infinity});
      });
    }

    return variants.sort((v1, v2) => {
      return v1.bandwidth - v2.bandwidth;
    });
  }
};
