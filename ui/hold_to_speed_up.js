/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.HoldToSpeedUp');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * Speeds up the playback while the user holds down a key, a mouse button or
 * a finger, and restores the previous playback rate when it is released.  It
 * does not listen to the input itself: whoever handles the input calls
 * begin() when the hold starts and end() when it is released.
 *
 * See holdToSpeedUpRate.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.ui.HoldToSpeedUp = class {
  /**
   * @param {!shaka.ui.Controls} controls
   */
  constructor(controls) {
    /** @private {shaka.ui.Controls} */
    this.controls_ = controls;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /**
     * Speeds up the playback once the hold has lasted long enough.
     * @private {shaka.util.Timer}
     */
    this.timer_ = new shaka.util.Timer(() => this.start_());

    /** @private {boolean} */
    this.holding_ = false;

    /**
     * The playback rate to restore when the hold ends, or null if the
     * playback is not sped up.
     * @private {?number}
     */
    this.previousRate_ = null;

    /** @private {HTMLElement} */
    this.indicator_ = null;

    // The hold may be released where we can't see it, so these end it as
    // well.  A pause ends it too, so that releasing does not toggle the
    // playback again.
    const end = () => this.end();
    this.eventManager_.listen(controls.getVideo(), 'pause', end);
    this.eventManager_.listen(controls.getPlayer(), 'unloading', end);
    this.eventManager_.listen(
        controls.getAdManager(), shaka.ads.Utils.AD_STARTED, end);
    this.eventManager_.listen(window, 'blur', end);
    this.eventManager_.listen(document, 'visibilitychange', () => {
      if (document.hidden) {
        this.end();
      }
    });
  }

  /** @override */
  release() {
    this.end();
    this.eventManager_.release();
    this.eventManager_ = null;
    this.timer_.stop();
    this.timer_ = null;
    this.controls_ = null;
  }

  /**
   * @return {boolean} True if the feature is enabled in the configuration.
   */
  isEnabled() {
    return this.controls_.getConfig().holdToSpeedUpRate > 0;
  }

  /**
   * @return {boolean} True while a hold is in progress, whether the playback
   *   has been sped up yet or not.
   */
  isHolding() {
    return this.holding_;
  }

  /**
   * @return {boolean} True if the playback could be sped up now.
   */
  canSpeedUp() {
    const controls = this.controls_;
    const player = controls.getPlayer();
    const ad = controls.getAd();
    // While the seek bar is being dragged, a play/pause input ends the drag
    // and toggles the playback right away.  See playPausePresentation().
    return this.isEnabled() && !controls.isSeeking() &&
        !controls.presentationIsPaused() && !player.isEnded() &&
        player.getPlaybackRate() > 0 && (!ad || !ad.isLinear());
  }

  /**
   * Starts a hold.  The playback is sped up if the hold lasts long enough and
   * the playback can be sped up by then.
   */
  begin() {
    this.end();
    if (!this.isEnabled()) {
      return;
    }
    this.holding_ = true;
    this.timer_.tickAfter(shaka.ui.HoldToSpeedUp.DELAY_);
  }

  /**
   * Ends the hold, restoring the playback rate if it was sped up.  Does
   * nothing if there is no hold.
   *
   * @return {boolean} True if the playback had been sped up, so the release
   *   should not be handled as a short press.
   */
  end() {
    this.holding_ = false;
    this.timer_?.stop();

    const previousRate = this.previousRate_;
    if (previousRate == null) {
      return false;
    }
    this.previousRate_ = null;
    if (this.indicator_) {
      this.indicator_.remove();
      this.indicator_ = null;
    }
    const player = this.controls_.getPlayer();
    if (previousRate == this.controls_.getVideo().defaultPlaybackRate) {
      player.cancelTrickPlay();
    } else {
      player.trickPlay(previousRate, /* useTrickPlayTrack= */ false);
    }
    return true;
  }

  /** @private */
  start_() {
    if (!this.holding_ || this.previousRate_ != null || !this.canSpeedUp()) {
      return;
    }
    const player = this.controls_.getPlayer();
    const rate = this.controls_.getConfig().holdToSpeedUpRate;
    this.previousRate_ = player.getPlaybackRate();
    player.trickPlay(rate, /* useTrickPlayTrack= */ false);

    this.indicator_ = shaka.util.Dom.createHTMLElement('div');
    this.indicator_.classList.add('shaka-speed-up-indicator');
    const label = shaka.util.Dom.createHTMLElement('div');
    label.classList.add('shaka-speed-up-label');
    const text = shaka.util.Dom.createHTMLElement('span');
    text.textContent = rate + 'x';
    label.appendChild(text);
    const icon = new shaka.ui.Icon(/* parent= */ null,
        shaka.ui.Enums.MaterialDesignSVGIcons['FAST_FORWARD']);
    label.appendChild(icon.getSvgElement());
    this.indicator_.appendChild(label);
    this.controls_.getVideoContainer().appendChild(this.indicator_);
  }
};


/**
 * How long, in seconds, the hold must last to speed up the playback.
 *
 * @const {number}
 * @private
 */
shaka.ui.HoldToSpeedUp.DELAY_ = 0.5;
