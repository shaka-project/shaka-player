goog.provide('shaka.media.LiveCatchUpController');

goog.require('shaka.util.Timer');


/**
 * The live catch up controller that tries to minimize latency to live edge.
 */
shaka.media.LiveCatchUpController = class {
  /**
   * @param {shaka.media.LiveCatchUpController.PlayerInterface} playerInterface
   */
  constructor(playerInterface) {
    /** @private {?shaka.media.LiveCatchUpController.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.LiveCatchUpConfiguration} */
    this.config_ = null;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {number} */
    this.updateInterval_ = 0.5;

    /** @private {number} */
    this.defaultMaxPlayRate_ = 1.1;

    /** @private {number} */
    this.defaultMinPlayRate_ = 0.9;

    /** @private {number} */
    this.lastPlayRate_ = 1.0;

    /** @private {shaka.util.Timer} */
    this.updateTimer_ = new shaka.util.Timer(() => {
      this.update_();
    });
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes. Must be called at least once before start().
   *
   * @param {shaka.extern.LiveCatchUpConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   *
   */
  enable() {
    this.enabled_ = true;
    this.updateTimer_.tickAfter(this.updateInterval_);
  }

  /**
   *
   */
  disable() {
    this.enabled_ = false;
    this.updateTimer_.stop();
  }

  /**
   * @private
   */
  update_() {
    this.updatePlayRate();
    if (this.enabled_) {
      this.updateTimer_.tickAfter(this.updateInterval_);
    }
  }

  /**
   *
   */
  updatePlayRate() {
    const currentPlayRate = this.playerInterface_.getPlayRate();
    if (currentPlayRate <= 0) {
      return;
    }

    const newPlayRate = this.calculateNewPlaybackRate_();
    if (newPlayRate != currentPlayRate) {
      this.playerInterface_.trickPlay(newPlayRate);
    }
  }

  /**
   * @return {number}
   * @private
   */
  calculateNewPlaybackRate_() {
    const maxRate = this.getPlaybackRateMax_();
    const minRate = this.getPlaybackRateMin_();
    const maxBuffer = this.config_.maxBuffer;
    const minBuffer = this.config_.minBuffer;

    const delay = this.playerInterface_.getBufferEnd() -
        this.playerInterface_.getPresentationTime();

    // Assume maxRate >= 1 and minRate <= 1
    let newRate = 1.0;
    if (delay >= maxBuffer) {
      // Blend between 1.0 ~ maxRate
      newRate = 1.0 + (maxRate - 1.0) * (delay - maxBuffer) / maxBuffer;
    } else if (delay <= minBuffer) {
      // Blend between minRate ~ 1.0
      newRate = 1.0 - (1.0 - minRate) * (minBuffer - delay) / minBuffer;
    }

    if (newRate > maxRate) {
      newRate = maxRate;
    }

    if (newRate < minRate) {
      newRate = minRate;
    }

    const blend = this.config_.playbackRateBlend;
    newRate = blend * this.lastPlayRate_ + (1.0 - blend) * newRate;
    this.lastPlayRate_ = newRate;
    return newRate;
  }

  /**
   * @return {number}
   */
  getDefaultMaxPlayRate() {
    return this.defaultMaxPlayRate_;
  }

  /**
   * @return {number}
   * @private
   */
  getPlaybackRateMax_() {
    let maxRate = this.defaultMaxPlayRate_;
    const serviceDescription = this.playerInterface_.getServiceDescription();
    if (serviceDescription && serviceDescription.playbackRate) {
      maxRate = serviceDescription.playbackRate.max;
    }
    if (this.config_.playbackRateMaxOverride > 0) {
      maxRate = this.config_.playbackRateMaxOverride;
    }
    return maxRate;
  }

  /**
   * @return {number}
   * @private
   */
  getPlaybackRateMin_() {
    let minRate = this.defaultMinPlayRate_;
    const serviceDescription = this.playerInterface_.getServiceDescription();
    if (serviceDescription && serviceDescription.playbackRate) {
      minRate = serviceDescription.playbackRate.min;
    }
    if (this.config_.playbackRateMaxOverride > 0) {
      minRate = this.config_.playbackRateMinOverride;
    }
    return minRate;
  }
};

/**
 * @typedef {{
 *   getBufferEnd: function():number,
 *   getPlayRate: function():number,
 *   getPresentationTime: function():number,
 *   getPresentationLatency: function():number,
 *   trickPlay: function(number),
 *   getServiceDescription:
 *   (function():shaka.extern.ServiceDescription|undefined)
 * }}
 *
 * @property {function():number} getBufferEnd
 *   Get the Buffer end.
 * @property {function():number} getPlayRate
 *   Get the current play rate.
 * @property {function():number} getPresentationTime
 *   Get the position in the presentation (in seconds) of the content that the
 *   viewer is seeing on screen right now.
 * @property {function():number} getPresentationLatency
 *   Get the presentation latency
 * @property {function(number)} trickPlay
 *   Called when an event occurs that should be sent to the app.
 */
shaka.media.LiveCatchUpController.PlayerInterface;
