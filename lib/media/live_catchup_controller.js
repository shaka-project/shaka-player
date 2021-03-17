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

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {number} */
    this.updateInterval_ = 0.5;

    /** @private {number} */
    this.defaultMaxPlayRate_ = 1.1;

    /** @private {number} */
    this.maxBufferDelay_ = 1.5;

    /** @private {shaka.util.Timer} */
    this.updateTimer_ = new shaka.util.Timer(() => {
      this.update_();
    });
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

    const newPlaykRate = this.calculateNewPlaybackRate_();
    if (newPlaykRate != currentPlayRate) {
      this.playerInterface_.trickPlay(newPlaykRate);
    }
  }

  /**
   * @return {number}
   * @private
   */
  calculateNewPlaybackRate_() {
    let maxRate = this.defaultMaxPlayRate_;
    const serviceDescription = this.playerInterface_.getServiceDescription();
    if (serviceDescription && serviceDescription.playbackRate) {
      maxRate = serviceDescription.playbackRate.max;
    }
    const delay = this.playerInterface_.getBufferEnd() -
        this.playerInterface_.getPresentationTime();

    let newRate = 1;
    if (delay > this.maxBufferDelay_) {
      newRate = maxRate;
    }
    return newRate;
  }

  /**
   * @return {number}
   */
  getDefaultMaxPlayRate() {
    return this.defaultMaxPlayRate_;
  }
};

/**
 * @typedef {{
 *   getBufferEnd: function():number,
 *   getPlayRate: function():number,
 *   getPresentationTime: function():number,
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
 * @property {function(number)} trickPlay
 *   Called when an event occurs that should be sent to the app.
 */
shaka.media.LiveCatchUpController.PlayerInterface;
