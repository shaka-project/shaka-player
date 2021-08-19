/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SeekBar');

goog.require('shaka.ads.AdManager');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.RangeElement');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ads.CuePoint');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.RangeElement}
 * @implements {shaka.extern.IUISeekBar}
 * @final
 * @export
 */
shaka.ui.SeekBar = class extends shaka.ui.RangeElement {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        [
          'shaka-seek-bar-container',
        ],
        [
          'shaka-seek-bar',
          'shaka-no-propagation',
          'shaka-show-controls-on-mouse-over',
        ]);

    /** @private {!HTMLElement} */
    this.adMarkerContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.adMarkerContainer_.classList.add('shaka-ad-markers');
    // Insert the ad markers container as a first child for proper
    // positioning.
    this.container.insertBefore(
        this.adMarkerContainer_, this.container.childNodes[0]);


    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    /**
     * This timer is used to introduce a delay between the user scrubbing across
     * the seek bar and the seek being sent to the player.
     *
     * @private {shaka.util.Timer}
     */
    this.seekTimer_ = new shaka.util.Timer(() => {
      this.video.currentTime = this.getValue();
    });


    /**
     * The timer is activated for live content and checks if
     * new ad breaks need to be marked in the current seek range.
     *
     * @private {shaka.util.Timer}
     */
    this.adBreaksTimer_ = new shaka.util.Timer(() => {
      this.markAdBreaks_();
    });

    /**
     * When user is scrubbing the seek bar - we should pause the video - see https://git.io/JUhHG
     * but will conditionally pause or play the video after scrubbing
     * depending on its previous state
     *
     * @private {boolean}
     */
    this.wasPlaying_ = false;

    /** @private {!Array.<!shaka.ads.CuePoint>} */
    this.adCuePoints_ = [];

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_UPDATED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_CHANGED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STARTED, () => {
          shaka.ui.Utils.setDisplay(this.container, false);
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STOPPED, () => {
          if (this.shouldBeDisplayed_()) {
            shaka.ui.Utils.setDisplay(this.container, true);
          }
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.CUEPOINTS_CHANGED, (e) => {
          this.adCuePoints_ = (e)['cuepoints'];
          this.onAdCuePointsChanged_();
        });

    this.eventManager.listen(
        this.player, 'unloading', () => {
          this.adCuePoints_ = [];
          this.onAdCuePointsChanged_();
        });

    // Initialize seek state and label.
    this.setValue(this.video.currentTime);
    this.update();
    this.updateAriaLabel_();

    if (this.ad) {
      // There was already an ad.
      shaka.ui.Utils.setDisplay(this.container, false);
    }
  }

  /** @override */
  release() {
    if (this.seekTimer_) {
      this.seekTimer_.stop();
      this.seekTimer_ = null;
      this.adBreaksTimer_.stop();
      this.adBreaksTimer_ = null;
    }

    super.release();
  }

  /**
   * Called by the base class when user interaction with the input element
   * begins.
   *
   * @override
   */
  onChangeStart() {
    this.wasPlaying_ = !this.video.paused;
    this.controls.setSeeking(true);
    this.video.pause();
  }

  /**
   * Update the video element's state to match the input element's state.
   * Called by the base class when the input element changes.
   *
   * @override
   */
  onChange() {
    if (!this.video.duration) {
      // Can't seek yet.  Ignore.
      return;
    }

    // Update the UI right away.
    this.update();

    // We want to wait until the user has stopped moving the seek bar for a
    // little bit to reduce the number of times we ask the player to seek.
    //
    // To do this, we will start a timer that will fire in a little bit, but if
    // we see another seek bar change, we will cancel that timer and re-start
    // it.
    //
    // Calling |start| on an already pending timer will cancel the old request
    // and start the new one.
    this.seekTimer_.tickAfter(/* seconds= */ 0.125);
  }

  /**
   * Called by the base class when user interaction with the input element
   * ends.
   *
   * @override
   */
  onChangeEnd() {
    // They just let go of the seek bar, so cancel the timer and manually
    // call the event so that we can respond immediately.
    this.seekTimer_.tickNow();
    this.controls.setSeeking(false);

    if (this.wasPlaying_) {
      this.video.play();
    }
  }

  /**
   * @override
  */
  isShowing() {
    // It is showing by default, so it is hidden if shaka-hidden is in the list.
    return !this.container.classList.contains('shaka-hidden');
  }

  /**
   * @override
   */
  update() {
    const colors = this.config_.seekBarColors;
    const currentTime = this.getValue();
    const bufferedLength = this.video.buffered.length;
    const bufferedStart = bufferedLength ? this.video.buffered.start(0) : 0;
    const bufferedEnd =
        bufferedLength ? this.video.buffered.end(bufferedLength - 1) : 0;

    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;

    this.setRange(seekRange.start, seekRange.end);

    if (!this.shouldBeDisplayed_()) {
      shaka.ui.Utils.setDisplay(this.container, false);
    } else {
      shaka.ui.Utils.setDisplay(this.container, true);

      if (bufferedLength == 0) {
        this.container.style.background = colors.base;
      } else {
        const clampedBufferStart = Math.max(bufferedStart, seekRange.start);
        const clampedBufferEnd = Math.min(bufferedEnd, seekRange.end);
        const clampedCurrentTime = Math.min(
            Math.max(currentTime, seekRange.start),
            seekRange.end);

        const bufferStartDistance = clampedBufferStart - seekRange.start;
        const bufferEndDistance = clampedBufferEnd - seekRange.start;
        const playheadDistance = clampedCurrentTime - seekRange.start;

        // NOTE: the fallback to zero eliminates NaN.
        const bufferStartFraction = (bufferStartDistance / seekRangeSize) || 0;
        const bufferEndFraction = (bufferEndDistance / seekRangeSize) || 0;
        const playheadFraction = (playheadDistance / seekRangeSize) || 0;

        const unbufferedColor =
            this.config_.showUnbufferedStart ? colors.base : colors.played;

        const gradient = [
          'to right',
          this.makeColor_(unbufferedColor, bufferStartFraction),
          this.makeColor_(colors.played, bufferStartFraction),
          this.makeColor_(colors.played, playheadFraction),
          this.makeColor_(colors.buffered, playheadFraction),
          this.makeColor_(colors.buffered, bufferEndFraction),
          this.makeColor_(colors.base, bufferEndFraction),
        ];
        this.container.style.background =
            'linear-gradient(' + gradient.join(',') + ')';
      }
    }
  }

  /**
   * @private
   */
  markAdBreaks_() {
    if (!this.adCuePoints_.length) {
      this.adMarkerContainer_.style.background = 'transparent';
      return;
    }

    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;
    const gradient = ['to right'];
    const pointsAsFractions = [];
    const adBreakColor = this.config_.seekBarColors.adBreaks;
    let postRollAd = false;
    for (const point of this.adCuePoints_) {
      // Post-roll ads are marked as starting at -1 in CS IMA ads.
      if (point.start == -1 && !point.end) {
        postRollAd = true;
      }
      // Filter point within the seek range. For points with no endpoint
      // (client side ads) check that the start point is within range.
      if (point.start >= seekRange.start && point.start < seekRange.end) {
        if (point.end && point.end > seekRange.end) {
          continue;
        }

        const startDist = point.start - seekRange.start;
        const startFrac = (startDist / seekRangeSize) || 0;
        // For points with no endpoint assume a 1% length: not too much,
        // but enough to be visible on the timeline.
        let endFrac = startFrac + 0.01;
        if (point.end) {
          const endDist = point.end - seekRange.start;
          endFrac = (endDist / seekRangeSize) || 0;
        }

        pointsAsFractions.push({
          start: startFrac,
          end: endFrac,
        });
      }
    }

    for (const point of pointsAsFractions) {
      gradient.push(this.makeColor_('transparent', point.start));
      gradient.push(this.makeColor_(adBreakColor, point.start));
      gradient.push(this.makeColor_(adBreakColor, point.end));
      gradient.push(this.makeColor_('transparent', point.end));
    }

    if (postRollAd) {
      gradient.push(this.makeColor_('transparent', 0.99));
      gradient.push(this.makeColor_(adBreakColor, 0.99));
    }
    this.adMarkerContainer_.style.background =
            'linear-gradient(' + gradient.join(',') + ')';
  }


  /**
   * @param {string} color
   * @param {number} fract
   * @return {string}
   * @private
   */
  makeColor_(color, fract) {
    return color + ' ' + (fract * 100) + '%';
  }


  /**
   * @private
   */
  onAdCuePointsChanged_() {
    this.markAdBreaks_();
    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;
    const minSeekBarWindow = shaka.ui.Constants.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR;
    // Seek range keeps changing for live content and some of the known
    // ad breaks might not be in the seek range now, but get into
    // it later.
    // If we have a LIVE seekable content, keep checking for ad breaks
    // every second.
    if (this.player.isLive() && seekRangeSize > minSeekBarWindow) {
      this.adBreaksTimer_.tickEvery(1);
    }
  }


  /**
   * @return {boolean}
   * @private
   */
  shouldBeDisplayed_() {
    // The seek bar should be hidden when the seek window's too small or
    // there's an ad playing.
    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;

    if (this.player.isLive() &&
        seekRangeSize < shaka.ui.Constants.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR) {
      return false;
    }

    return this.ad == null;
  }

  /** @private */
  updateAriaLabel_() {
    this.bar.ariaLabel = this.localization.resolve(shaka.ui.Locales.Ids.SEEK);
  }
};


/**
 * @implements {shaka.extern.IUISeekBar.Factory}
 * @export
 */

shaka.ui.SeekBar.Factory = class {
  /**
   * Creates a shaka.ui.SeekBar. Use this factory to register the default
   * SeekBar when needed
   *
   * @override
   */
  create(rootElement, controls) {
    return new shaka.ui.SeekBar(rootElement, controls);
  }
};
