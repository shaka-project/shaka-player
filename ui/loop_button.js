/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.LoopButton');

goog.require('shaka.ui.ContextMenu');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.LoopButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    const LocIds = shaka.ui.Locales.Ids;
    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-loop-button');
    this.button_.classList.add('shaka-tooltip');

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.icon_ = new shaka.ui.MaterialSVGIcon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons.LOOP);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    label.classList.add('shaka-simple-overflow-button-label-inline');
    this.nameSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.nameSpan_.textContent = this.localization.resolve(LocIds.LOOP);
    label.appendChild(this.nameSpan_);

    /** @private {!HTMLElement} */
    this.currentState_ = shaka.util.Dom.createHTMLElement('span');
    this.currentState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentState_);

    this.button_.appendChild(label);

    this.updateLocalizedStrings_();

    this.parent.appendChild(this.button_);

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.onClick_();
    });

    /** @private {boolean} */
    this.loopEnabled_ = this.video.loop;

    // No event is fired when the video.loop property changes, so
    // in order to detect a manual change to the property, we have
    // two options:
    // 1) set an observer that gets triggered every time the video
    // object is mutated and check is the loop property was changed.
    // 2) create a timer that checks the state of the loop property
    // regularly.
    // I (ismena) opted to go for #2 as at least video.currentTime
    // will be changing constantly during playback, to say nothing
    // about other video properties. I expect the timer to be less
    // of a performance hit.
    /**
     * The timer that tracks down the ad progress.
     *
     * @private {shaka.util.Timer}
     */
    this.timer_ = new shaka.util.Timer(() => {
      this.onTimerTick_();
    });

    this.timer_.tickEvery(1);

    this.eventManager.listen(this.player, 'unloading', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'manifestupdated', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.video, 'durationchange', () => {
      this.checkAvailability_();
    });
  }

  /**
   * @override
   */
  release() {
    this.timer_.stop();
    this.timer_ = null;
    super.release();
  }


  /** @private */
  onClick_() {
    this.video.loop = !this.video.loop;
    this.timer_.tickNow();
    this.timer_.tickEvery(1);
  }


  /** @private */
  onTimerTick_() {
    if (this.loopEnabled_ == this.video.loop) {
      return;
    }

    this.updateLocalizedStrings_();
    this.loopEnabled_ = this.video.loop;
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;

    this.nameSpan_.textContent =
        this.localization.resolve(LocIds.LOOP);

    const labelText = this.video.loop ? LocIds.ON : LocIds.OFF;

    this.currentState_.textContent = this.localization.resolve(labelText);

    this.icon_.use(this.video.loop ? Icons.UNLOOP : Icons.LOOP);

    const ariaText = this.video.loop ?
        LocIds.EXIT_LOOP_MODE : LocIds.ENTER_LOOP_MODE;

    this.button_.ariaLabel = this.localization.resolve(ariaText);
  }


  /**
   * @private
   */
  checkAvailability_() {
    shaka.ui.Utils.setDisplay(this.button_, !this.player.isLive());
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.LoopButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.LoopButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'loop', new shaka.ui.LoopButton.Factory());

shaka.ui.Controls.registerElement(
    'loop', new shaka.ui.LoopButton.Factory());

shaka.ui.ContextMenu.registerElement(
    'loop', new shaka.ui.LoopButton.Factory());
