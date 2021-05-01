/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.HiddenRewindButton');

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
shaka.ui.HiddenRewindButton = class extends shaka.ui.Element {
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
     * This timer will be used to hide rewind button on video Container.
     * When the timer ticks it will force button to be invisible.
     *
     * @private {shaka.util.Timer}
     */
    this.hideRewindButtonOnControlsContainerTimer_ = new shaka.util.Timer(
        () => {
          this.hideRewindButtonOnControlsContainer();
        });

    /** @private {!HTMLElement} */
    this.rewindContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.rewindContainer_.classList.add(
        'shaka-rewind-onControlsContainer');
    this.parent.appendChild(this.rewindContainer_);

    this.eventManager.listen(this.rewindContainer_, 'touchstart', (event) => {
      // prevent the default changes that browser triggers
      event.preventDefault();
      // incase any settings menu are open this assigns the first touch
      // to close the menu.
      if (this.controls.anySettingsMenusAreOpen()) {
        this.controls.hideSettingsMenus();
      } else {
        this.onRewindButtonClick_();
      }
    });

    /** @private {!HTMLElement} */
    this.rewindValue_ = shaka.util.Dom.createHTMLElement('span');
    this.rewindValue_.textContent = '0s';
    this.rewindContainer_.appendChild(this.rewindValue_);

    /** @private {!HTMLElement} */
    this.rewindIcon_ = shaka.util.Dom.createHTMLElement('span');
    this.rewindIcon_.classList.add(
        'shaka-forward-rewind-onControlsContainer-icon');
    this.rewindIcon_.textContent =
        shaka.ui.Enums.MaterialDesignIcons.REWIND;
    this.rewindContainer_.appendChild(this.rewindIcon_);
  }

  /**
   * This callback is for detecting a double tap or more continuos
   * taps and seeking the video forward as per the number of taps
   * @private
   */
  onRewindButtonClick_() {
    // this stores the time for first touch and makes touch valid for
    // next 1s so incase the touch event is triggered again within 1s
    // this if condition fails and the video seeking happens.
    if (!this.triggeredTouchValid_) {
      this.triggeredTouchValid_ = true;
      this.lastTouchEventTimeSet_ = Date.now();
      this.hideRewindButtonOnControlsContainerTimer_.tickAfter(1);
    } else if (this.lastTouchEventTimeSet_+1000 > Date.now()) {
      // stops hidding of fast-forward button incase the timmer is active
      // because of previous touch event.
      this.hideRewindButtonOnControlsContainerTimer_.stop();
      this.lastTouchEventTimeSet_ = Date.now();
      this.rewindValue_.textContent =
        (parseInt(this.rewindValue_.textContent, 10) - 5).toString() + 's';
      this.rewindContainer_.style.opacity = '1';
      this.hideRewindButtonOnControlsContainerTimer_.tickAfter(1);
    }
  }

  /**
   * called when the rewind button needs to be hidden
   */
  hideRewindButtonOnControlsContainer() {
    // prevent adding seek value if its a single tap.
    if (parseInt(this.rewindValue_.textContent, 10) != 0) {
      this.video.currentTime = this.controls.getDisplayTime() + parseInt(
          this.rewindValue_.textContent, 10);
    }
    this.rewindContainer_.style.opacity = '0';
    this.triggeredTouchValid_ = false;
    this.rewindValue_.textContent = '0s';
  }
};
