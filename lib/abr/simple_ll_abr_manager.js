goog.provide('shaka.abr.SimpleLLAbrManager');

goog.require('goog.asserts');
goog.require('shaka.abr.EwmaBandwidthEstimator');
goog.require('shaka.log');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.Timer');


/**
 * @summary
 * <p>
 * This defines the default Low Latency ABR manager for the Player
 * </p>
 *
 * @implements {shaka.extern.AbrManager}
 * @export
 */
shaka.abr.SimpleLLAbrManager = class {
  /**
   *
   */
  constructor() {
    /** @private {?shaka.abr.SimpleLLAbrManager.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {?shaka.extern.AbrManager.SwitchCallback} */
    this.switch_ = null;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {shaka.abr.EwmaBandwidthEstimator} */
    this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();

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

    /** @private {number} */
    this.currentBitrate_ = 0;

    /** @private {number} */
    this.stallCount_ = 0;

    /** @private {number} */
    this.resetStallCountDelay_ = 30;

    /** @private {number} */
    this.increaseVideoBitrateDelay_ = 10;

    /** @private {number} */
    this.consecutiveFailedIncreaseVideoBitrateCount_ = 0;

    /** @private {number} */
    this.bufferingTimeToDecreaseBitrate_ = 0.5;

    /** @private {number} */
    this.monitorBufferInterval_ = 0.5;

    /** @private {Array<number>} */
    this.bufferLevelHistory_ = [];

    /** @private {number} */
    this.maxBufferHistoryCount_ = 20;

    /** @private {number} */
    this.bufferLevelSum_ = 0;

    /**
     * Buffer level drop to decrease bitrate, range 0.0 to 1.0
     * @private {number}
     * */
    this.bufferLevelDropToDecreaseBitrate_ = 0.6;

    /** @private {boolean} */
    this.isPreviousSwitchIncrease_ = false;

    /** @private {boolean} */
    this.isSwitchIncrease_ = true;

    /** @private {shaka.util.Timer} */
    this.resetStallCountTimer_ = new shaka.util.Timer(() => {
      this.resetStallCount_();
    });

    /** @private {shaka.util.Timer} */
    this.increaseBitrateTimer_ = new shaka.util.Timer(() => {
      this.increaseVideoBitrate_();
    });

    /** @private {shaka.util.Timer} */
    this.decreaseBitrateTimer_ = new shaka.util.Timer(() => {
      this.decreaseVideoBitrate_();
    });

    /** @private {shaka.util.Timer} */
    this.monitorBufferTimer_ = new shaka.util.Timer(() => {
      this.monitorBuffer_();
    });
  }


  /**
   * @param {?shaka.abr.SimpleLLAbrManager.PlayerInterface} playerInterface
   */
  setPlayerInterface(playerInterface) {
    this.playerInterface_ = playerInterface;
  }


  /**
   * @override
   * @export
   */
  stop() {
    this.switch_ = null;
    this.enabled_ = false;
    this.variants_ = [];
    this.lastTimeChosenMs_ = null;
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
    const AbrManager = shaka.abr.SimpleLLAbrManager;

    // Get sorted Variants.
    let sortedVariants = AbrManager.filterAndSortVariants_(
        this.config_.restrictions, this.variants_);

    if (this.variants_.length && !sortedVariants.length) {
      shaka.log.warning('No variants met the ABR restrictions. ' +
                        'Choosing a variant by lowest bandwidth.');
      sortedVariants = AbrManager.filterAndSortVariants_(
          /* restrictions= */ null, this.variants_);
      sortedVariants = [sortedVariants[0]];
    }

    // Start by assuming that we will use the highest birate Stream.
    let chosen = sortedVariants.length > 0 ?
        sortedVariants[sortedVariants.length - 1] : null;
    if (this.lastTimeChosenMs_) {
      if (this.isSwitchIncrease_) {
        // Find the first variant that greater than current bitrate
        for (let i = 0; i < sortedVariants.length; i++) {
          if (this.isPreviousSwitchIncrease_) {
            this.consecutiveFailedIncreaseVideoBitrateCount_ = 0;
          }
          const item = sortedVariants[i];
          if (item.bandwidth > this.currentBitrate_) {
            chosen = item;
            shaka.log.info('Increase bandwidth to', item.bandwidth);
            break;
          }
        }
      } else {
        chosen = sortedVariants.length > 0 ?
            sortedVariants[0] : null;
        // Find the first variant that smaller than current bitrate
        for (let i = sortedVariants.length - 1; i >= 0; i--) {
          if (this.isPreviousSwitchIncrease_) {
            this.consecutiveFailedIncreaseVideoBitrateCount_++;
          } else {
            this.consecutiveFailedIncreaseVideoBitrateCount_ = 0;
          }
          const item = sortedVariants[i];
          if (item.bandwidth < this.currentBitrate_) {
            chosen = item;
            shaka.log.info('Decrease bandwidth to', item.bandwidth);
            break;
          }
        }
      }
    }

    if (chosen) {
      this.currentBitrate_ = chosen.bandwidth;
    }

    this.isPreviousSwitchIncrease_ = this.isSwitchIncrease_;
    this.lastTimeChosenMs_ = Date.now();
    this.scheduleIncreaseVideoBitrate_();
    return chosen;
  }


  /**
   * @override
   * @export
   */
  enable() {
    this.enabled_ = true;
    this.monitorBufferTimer_.tickEvery(this.monitorBufferInterval_);
  }


  /**
   * @override
   * @export
   */
  disable() {
    this.enabled_ = false;
    this.monitorBufferTimer_.stop();
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
    if (navigator.connection && navigator.connection.downlink &&
        this.config_.useNetworkInformation) {
      defaultBandwidthEstimate = navigator.connection.downlink * 1e6;
    }
    return defaultBandwidthEstimate;
  }


  /**
   * @override
   * @export
   */
  onBuffering() {
    this.stallCount_++;
    this.scheduleResetStallCount_();
    this.scheduleIncreaseVideoBitrate_();
    this.decreaseBitrateTimer_.tickAfter(this.bufferingTimeToDecreaseBitrate_);

    if (this.stallCount_ >= this.config_.stallCountToDowngrade) {
      this.decreaseVideoBitrate_();
    }
  }

  /**
   * @override
   * @export
   */
  onBufferingEnd() {
    this.decreaseBitrateTimer_.stop();
  }


  /**
   * @private
   */
  resetStallCount_() {
    this.stallCount_ = 0;
  }


  /**
   * @private
   */
  scheduleResetStallCount_() {
    this.resetStallCountTimer_.stop();
    this.resetStallCountTimer_.tickAfter(this.resetStallCountDelay_);
  }


  /**
   * @private
   */
  scheduleIncreaseVideoBitrate_() {
    this.increaseBitrateTimer_.stop();
    this.increaseBitrateTimer_.tickAfter(this.increaseVideoBitrateDelay_ <<
      this.consecutiveFailedIncreaseVideoBitrateCount_);
  }


  /**
   * @private
   */
  increaseVideoBitrate_() {
    this.isSwitchIncrease_ = true;
    if (this.enabled_) {
      const serviceDescription = this.playerInterface_.getServiceDescription();
      const presentationLatency =
          this.playerInterface_.getPresentationLatency();
      let latency = 0;
      if (serviceDescription && presentationLatency.length > 0 &&
        presentationLatency[0]['latency']) {
        latency = presentationLatency[0]['latency'];
      }
      if (latency > serviceDescription.latency.max) {
        this.scheduleIncreaseVideoBitrate_();
      } else {
        this.suggestStreams_();
      }
    }
  }


  /**
   * @private
   */
  decreaseVideoBitrate_() {
    this.isSwitchIncrease_ = false;
    if (this.enabled_) {
      this.suggestStreams_();
    }
    this.resetStallCount_();
  }


  /**
   * @private
   */
  monitorBuffer_() {
    if (!this.playerInterface_) {
      return;
    }

    const bufferLevel = this.playerInterface_.getBufferLevel();
    if (bufferLevel < 0.25) {
      return;
    }
    this.bufferLevelSum_ += bufferLevel;
    this.bufferLevelHistory_.push(bufferLevel);
    if (this.bufferLevelHistory_.length > this.maxBufferHistoryCount_) {
      this.bufferLevelSum_ -= this.bufferLevelHistory_[0];
      this.bufferLevelHistory_.shift();
    }

    if (this.bufferLevelHistory_.length == this.maxBufferHistoryCount_) {
      const average = this.bufferLevelSum_ / this.bufferLevelHistory_.length;
      // If current buffer level is drop more than
      // bufferLevelDropToDecreaseBitrate_, decrease bitrate
      if (bufferLevel < average) {
        const factor = (average - bufferLevel) / average;
        if (factor > this.bufferLevelDropToDecreaseBitrate_) {
          this.decreaseVideoBitrate_();
        }
      }
    }
  }


  /**
   * @return {number}
   */
  getIncreaseVideoBitrateDelay() {
    return this.increaseVideoBitrateDelay_;
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

/**
 * @typedef {{
 *   getBufferLevel: function():number,
 *   getPresentationLatency: function():Array<Object>,
 *   getServiceDescription:
 *   (function():shaka.extern.ServiceDescription|undefined)
 * }}
 *
 * @property {function():number} getBufferLevel
 *   Get the buffer level in seconds
 * @property {function():Array<Object>} getPresentationLatency
 *   Get the presentation latency
 * @export
 */
shaka.abr.SimpleLLAbrManager.PlayerInterface;
