/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.HiddenSeekButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Dom');

goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.Element}
 * @export
 */
shaka.ui.HiddenSeekButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {?number} */
    this.lastTouchEventTimeSet_ = null;

    /** @private {boolean} */
    this.triggeredTouchValid_ = false;

    /**
     * Keeps track of whether the user has moved enough
     * to be considered scrolling.
     * @private {boolean}
     */
    this.hasMoved_ = false;

    /**
     * Touch-start coordinates for detecting scroll distance.
     * @private {?number}
     */
    this.touchStartX_ = null;

    /** @private {?number} */
    this.touchStartY_ = null;

    /**
     * Timer used to hide the seek button container. In the timer’s callback,
     * if the seek value is still 0s, we interpret it as a single tap
     * (play/pause). If not, we perform the seek.
     * @private {shaka.util.Timer}
     */
    this.hideSeekButtonContainerTimer_ = new shaka.util.Timer(() => {
      const seekSeconds = parseInt(this.seekValue_.textContent, 10);
      if (seekSeconds === 0) {
        this.controls.onContainerClick(/* fromTouchEvent= */ true);
      }
      this.hideSeekButtonContainer_();
    });

    /** @protected {!HTMLElement} */
    this.seekContainer = shaka.util.Dom.createHTMLElement('div');
    this.seekContainer.classList.add('shaka-no-propagation');
    this.parent.appendChild(this.seekContainer);

    /** @private {!HTMLElement} */
    this.seekValue_ = shaka.util.Dom.createHTMLElement('span');
    this.seekValue_.textContent = '0s';
    this.seekContainer.appendChild(this.seekValue_);

    /** @protected {!shaka.ui.MaterialSVGIcon} */
    this.seekIcon = new shaka.ui.MaterialSVGIcon(this.seekContainer);
    this.seekIcon.getSvgElement().classList.add(
        'shaka-forward-rewind-container-icon');

    /** @protected {boolean} */
    this.isRewind = false;

    // ---------------------------------------------------------------
    //  TOUCH EVENT LISTENERS for SCROLL vs. TAP DETECTION
    // ---------------------------------------------------------------
    this.eventManager.listen(this.seekContainer, 'touchstart', (e) => {
      const event = /** @type {!TouchEvent} */(e);
      this.onTouchStart_(event);
    });
    this.eventManager.listen(this.seekContainer, 'touchmove', (e) => {
      const event = /** @type {!TouchEvent} */(e);
      this.onTouchMove_(event);
    });
    this.eventManager.listen(this.seekContainer, 'touchend', (e) => {
      const event = /** @type {!TouchEvent} */(e);
      this.onTouchEnd_(event);
    });
  }

  /**
   * Called when the user starts touching the screen.
   * We record the initial touch coordinates for scroll detection.
   * @param {!TouchEvent} event
   * @private
   */
  onTouchStart_(event) {
    // If multiple touches, handle or ignore as needed. Here, we assume
    // single-touch.
    if (event.touches.length > 0) {
      this.touchStartX_ = event.touches[0].clientX;
      this.touchStartY_ = event.touches[0].clientY;
    }
    this.hasMoved_ = false;
  }

  /**
   * Called when the user moves the finger on the screen.
   * If the movement exceeds the scroll threshold, we mark this as scrolling.
   * @param {!TouchEvent} event
   * @private
   */
  onTouchMove_(event) {
    if (event.touches.length > 0 &&
        this.touchStartX_ != null &&
        this.touchStartY_ != null) {
      const dx = event.touches[0].clientX - this.touchStartX_;
      const dy = event.touches[0].clientY - this.touchStartY_;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > shaka.ui.HiddenSeekButton.SCROLL_THRESHOLD_) {
        this.hasMoved_ = true;
      }
    }
  }

  /**
   * Called when the user lifts the finger from the screen.
   * If we haven't moved beyond the threshold, treat it as a tap.
   * @param {!TouchEvent} event
   * @private
   */
  onTouchEnd_(event) {
    // If user scrolled, don't handle as a tap.
    if (this.hasMoved_) {
      return;
    }

    // If any settings menus are open, this tap closes them instead of toggling
    // play/seek.
    if (this.controls.anySettingsMenusAreOpen()) {
      event.preventDefault();
      this.controls.hideSettingsMenus();
      return;
    }

    // Normal tap logic (single vs double tap).
    if (this.controls.getConfig().tapSeekDistance > 0) {
      event.preventDefault();
      this.onSeekButtonClick_();
    }
  }

  /**
   * Determines whether this tap is a single tap (leading to play/pause)
   * or a double tap (leading to a seek). We use a 500 ms window.
   * @private
   */
  onSeekButtonClick_() {
    const tapSeekDistance = this.controls.getConfig().tapSeekDistance;

    const doubleTapWindow = shaka.ui.HiddenSeekButton.DOUBLE_TAP_WINDOW_;

    if (!this.triggeredTouchValid_) {
      // First tap: start our 500 ms "double-tap" timer.
      this.triggeredTouchValid_ = true;
      this.lastTouchEventTimeSet_ = Date.now();

      this.hideSeekButtonContainerTimer_.tickAfter(doubleTapWindow);
    } else if ((this.lastTouchEventTimeSet_ +
        doubleTapWindow * 1000) > Date.now()) {
      // Second tap arrived in time — interpret as a double tap to seek.
      this.hideSeekButtonContainerTimer_.stop();
      this.lastTouchEventTimeSet_ = Date.now();

      let position = parseInt(this.seekValue_.textContent, 10);
      if (this.isRewind) {
        position -= tapSeekDistance;
      } else {
        position += tapSeekDistance;
      }
      this.seekValue_.textContent = position.toString() + 's';
      this.seekContainer.style.opacity = '1';

      // Restart timer if user might tap again (triple tap).
      this.hideSeekButtonContainerTimer_.tickAfter(doubleTapWindow);
    }
  }

  /**
   * If the seek value is zero, interpret it as a single tap (play/pause).
   * Otherwise, apply the seek and reset.
   * @private
   */
  hideSeekButtonContainer_() {
    const seekSeconds = parseInt(this.seekValue_.textContent, 10);
    if (seekSeconds !== 0) {
      // Perform the seek.
      this.video.currentTime = this.controls.getDisplayTime() + seekSeconds;
    }
    // Hide and reset.
    this.seekContainer.style.opacity = '0';
    this.triggeredTouchValid_ = false;
    this.seekValue_.textContent = '0s';
  }
};

/**
 * The amount of time, in seconds, to double-tap detection.
 *
 * @const {number}
 */
shaka.ui.HiddenSeekButton.DOUBLE_TAP_WINDOW_ = 0.5;

/**
 * Minimum distance (px) the finger must move during touch to consider it a
 * scroll rather than a tap.
 *
 * @const {number}
 */
shaka.ui.HiddenSeekButton.SCROLL_THRESHOLD_ = 10;
