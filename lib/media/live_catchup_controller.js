/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.LiveCatchUpController');

goog.require('shaka.util.Timer');


/**
 * The play rate controller controls the playback rate on the media element.
 * This provides some missing functionality (e.g. negative playback rate). If
 * the playback rate on the media element can change outside of the controller,
 * the playback controller will need to be updated to stay in-sync.
 *
 * TODO: Try not to manage buffering above the browser with playbackRate=0.
 *
 */
shaka.media.LiveCatchUpController = class {
  /**
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.media.LiveCatchUpController.PlayerInterface} playerInterface
   */
  constructor(manifest, playerInterface) {
    /** @private {?shaka.media.LiveCatchUpController.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.Manifest} */
    // this.manifest_ = manifest;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {number} */
    this.updateInterval_ = 0.5;

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
    if (!this.enabled_) {
      this.updateTimer_.stop();
    }

    const currentPlayRate = this.playerInterface_.getPlayRate();
    if (currentPlayRate <= 0) {
      return;
    }

    const newPlaykRate = this.calculateNewPlaybackRate();
    if (newPlaykRate != currentPlayRate) {
      this.playerInterface_.trickPlay(newPlaykRate);
    }
    this.updateTimer_.tickAfter(this.updateInterval_);
  }

  /**
   *
   */
  calculateNewPlaybackRate() {
    // TODO: Read min/max values from manifest
    const maxRate = 1.1;
    const delay = this.playerInterface_.getBufferEnd() -
        this.playerInterface_.getPresentationTime();

    let newRate = 1;
    if (delay > 2) {
      newRate = maxRate;
    }
    return newRate;
  }
};

/**
 * @typedef {{
 *   getBufferEnd: function():number,
 *   getPlayRate: function():number,
 *   getPresentationTime: function():number,
 *   trickPlay: function(number)
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
