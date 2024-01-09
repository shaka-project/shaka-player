/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.HiddenSeekButton');

goog.require('shaka.ui.Element');
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

    /** @private {?boolean} */
    this.triggeredTouchValid_ = false;

    /**
     * This timer will be used to hide seek button on video Container.
     * When the timer ticks it will force button to be invisible.
     *
     * @private {shaka.util.Timer}
     */
    this.hideSeekButtonContainerTimer_ = new shaka.util.Timer(() => {
      this.hideSeekButtonContainer_();
    });

    /** @protected {!HTMLElement} */
    this.seekContainer = shaka.util.Dom.createHTMLElement('div');
    this.parent.appendChild(this.seekContainer);

    this.eventManager.listen(this.seekContainer, 'touchend', (event) => {
      // Do nothing if the controls are not visible
      if (!this.controls.isOpaque()) {
        return;
      }
      // In case any settings menu are open this assigns the first touch
      // to close the menu.
      if (this.controls.anySettingsMenusAreOpen()) {
        // prevent the default changes that browser triggers
        event.preventDefault();
        this.controls.hideSettingsMenus();
      } else if (this.controls.getConfig().tapSeekDistance > 0) {
        // prevent the default changes that browser triggers
        event.preventDefault();
        this.onSeekButtonClick_();
      }
    });

    /** @private {!HTMLElement} */
    this.seekValue_ = shaka.util.Dom.createHTMLElement('span');
    this.seekValue_.textContent = '0s';
    this.seekContainer.appendChild(this.seekValue_);


    /** @protected {!HTMLElement} */
    this.seekIcon = shaka.util.Dom.createHTMLElement('span');
    this.seekIcon.classList.add(
        'shaka-forward-rewind-container-icon');
    this.seekContainer.appendChild(this.seekIcon);

    /** @protected {boolean} */
    this.isRewind = false;
  }

  /**
   * @private
   */
  onSeekButtonClick_() {
    const tapSeekDistance = this.controls.getConfig().tapSeekDistance;
    // This stores the time for first touch and makes touch valid for
    // next 1s so incase the touch event is triggered again within 1s
    // this if condition fails and the video seeking happens.
    if (!this.triggeredTouchValid_) {
      this.triggeredTouchValid_ = true;
      this.lastTouchEventTimeSet_ = Date.now();
      this.hideSeekButtonContainerTimer_.tickAfter(1);
    } else if (this.lastTouchEventTimeSet_+1000 > Date.now()) {
      // stops hidding of seek button incase the timmer is active
      // because of previous touch event.
      this.hideSeekButtonContainerTimer_.stop();
      this.lastTouchEventTimeSet_ = Date.now();
      let position = 0;
      if (this.isRewind) {
        position =
            parseInt(this.seekValue_.textContent, 10) - tapSeekDistance;
      } else {
        position =
            parseInt(this.seekValue_.textContent, 10) + tapSeekDistance;
      }
      this.seekValue_.textContent = position.toString() + 's';
      this.seekContainer.style.opacity = '1';
      this.hideSeekButtonContainerTimer_.tickAfter(1);
    }
  }

  /**
   * @private
   */
  hideSeekButtonContainer_() {
    // Prevent adding seek value if its a single tap.
    if (parseInt(this.seekValue_.textContent, 10) != 0) {
      this.video.currentTime = this.controls.getDisplayTime() + parseInt(
          this.seekValue_.textContent, 10);
    }
    this.seekContainer.style.opacity = '0';
    this.triggeredTouchValid_ = false;
    this.seekValue_.textContent = '0s';
  }
};
