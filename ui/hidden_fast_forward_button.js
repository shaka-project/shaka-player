/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.HiddenFastForwardButton');

goog.require('shaka.ui.Element');
goog.require('shaka.util.Timer');
goog.require('shaka.ui.Enums');
goog.require('shaka.util.Dom');

goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.HiddenFastForwardButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {?number} */
    this.lastTouchEventTimeSet_ = null;

    /** @private {?boolean} */
    this.triggeredTouchValid_ = false;

    /**
     * This timer will be used to hide fast forward button on video Container.
     * When the timer ticks it will force button to be invisible.
     *
     * @private {shaka.util.Timer}
     */
    this.hideFastForwardButtonContainerTimer_ = new shaka.util.Timer(() => {
      this.hideFastForwardButtonContainer_();
    });


    /** @private {!HTMLElement} */
    this.fastforwardContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.fastforwardContainer_.classList.add(
        'shaka-fast-foward-container');
    this.parent.appendChild(this.fastforwardContainer_);

    this.eventManager.listen(
        this.fastforwardContainer_, 'touchstart', (event) => {
          // In case any settings menu are open this assigns the first touch
          // to close the menu.
          if (this.controls.anySettingsMenusAreOpen()) {
            // prevent the default changes that browser triggers
            event.preventDefault();
            this.controls.hideSettingsMenus();
          } else if (this.controls.getConfig().tapSeekDistance > 0) {
            // prevent the default changes that browser triggers
            event.preventDefault();
            this.onFastForwardButtonClick_();
          }
        });

    /** @private {!HTMLElement} */
    this.fastForwardValue_ = shaka.util.Dom.createHTMLElement('span');
    this.fastForwardValue_.textContent = '0s';
    this.fastforwardContainer_.appendChild(this.fastForwardValue_);

    /** @private {!HTMLElement} */
    this.fastforwardIcon_ = shaka.util.Dom.createHTMLElement('span');
    this.fastforwardIcon_.classList.add(
        'shaka-forward-rewind-container-icon');
    this.fastforwardIcon_.textContent =
        shaka.ui.Enums.MaterialDesignIcons.FAST_FORWARD;
    this.fastforwardContainer_.appendChild(this.fastforwardIcon_);
  }

  /**
   * @private
   */
  onFastForwardButtonClick_() {
    const tapSeekDistance = this.controls.getConfig().tapSeekDistance;
    // This stores the time for first touch and makes touch valid for
    // next 1s so incase the touch event is triggered again within 1s
    // this if condition fails and the video seeking happens.
    if (!this.triggeredTouchValid_) {
      this.triggeredTouchValid_ = true;
      this.lastTouchEventTimeSet_ = Date.now();
      this.hideFastForwardButtonContainerTimer_.tickAfter(1);
    } else if (this.lastTouchEventTimeSet_+1000 > Date.now()) {
      // stops hidding of fast-forward button incase the timmer is active
      // because of previous touch event.
      this.hideFastForwardButtonContainerTimer_.stop();
      this.lastTouchEventTimeSet_ = Date.now();
      const position =
          parseInt(this.fastForwardValue_.textContent, 10) + tapSeekDistance;
      this.fastForwardValue_.textContent = position.toString() + 's';
      this.fastforwardContainer_.style.opacity = '1';
      this.hideFastForwardButtonContainerTimer_.tickAfter(1);
    }
  }

  /**
   * @private
   */
  hideFastForwardButtonContainer_() {
    // Prevent adding seek value if its a single tap.
    if (parseInt(this.fastForwardValue_.textContent, 10) != 0) {
      this.video.currentTime = this.controls.getDisplayTime() + parseInt(
          this.fastForwardValue_.textContent, 10);
    }
    this.fastforwardContainer_.style.opacity = '0';
    this.triggeredTouchValid_ = false;
    this.fastForwardValue_.textContent = '0s';
  }
};
