/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.LoopButton');

goog.require('shaka.config.RepeatMode');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
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

    /** @private {shaka.extern.IQueueManager} */
    this.queueManager_ = this.controls.getQueueManager();

    const LocIds = shaka.ui.Locales.Ids;
    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-loop-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    this.button_.ariaPressed = 'false';

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons['LOOP']);

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

    this.eventManager.listenMulti(
        this.localization,
        [
          shaka.ui.Localization.LOCALE_UPDATED,
          shaka.ui.Localization.LOCALE_CHANGED,
        ], () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.onClick_();
    });

    /** @private {MutationObserver} */
    this.mutationObserver_ = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'attributes' &&
            mutation.attributeName === 'loop') {
          this.updateLocalizedStrings_();
        }
      }
    });

    this.mutationObserver_.observe(this.controls.getLocalVideo(), {
      attributes: true,
      attributeFilter: ['loop'],
    });

    this.eventManager.listenMulti(
        this.player,
        [
          'unloading',
          'loaded',
          'manifestupdated',
        ], () => {
          this.checkAvailability_();
        });

    this.eventManager.listen(this.player, 'configurationchanged', () => {
      this.updateLocalizedStrings_();
    });

    this.eventManager.listen(this.video, 'durationchange', () => {
      this.checkAvailability_();
    });

    if (this.isSubMenu) {
      this.eventManager.listenMulti(
          this.controls,
          [
            'submenuopen',
            'submenuclose',
          ], () => {
            this.checkAvailability_();
          });
    }

    this.checkAvailability_();
  }

  /**
   * @override
   */
  release() {
    this.mutationObserver_?.disconnect();
    this.mutationObserver_ = null;
    super.release();
  }


  /** @private */
  onClick_() {
    if (this.queueManager_.getCurrentItem() && !this.video.loop) {
      const currentMode = this.player.getConfiguration().queue.repeatMode;
      let nextMode;
      switch (currentMode) {
        case shaka.config.RepeatMode.OFF:
          nextMode = shaka.config.RepeatMode.ALL;
          break;
        case shaka.config.RepeatMode.ALL:
          nextMode = shaka.config.RepeatMode.SINGLE;
          break;
        case shaka.config.RepeatMode.SINGLE:
        default:
          nextMode = shaka.config.RepeatMode.OFF;
          break;
      }
      this.player.configure('queue.repeatMode', nextMode);
    } else {
      this.video.loop = !this.video.loop;
    }
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;

    this.nameSpan_.textContent =
        this.localization.resolve(LocIds.LOOP);

    let currentMode = shaka.config.RepeatMode.OFF;
    if (this.video.loop) {
      currentMode = shaka.config.RepeatMode.ALL;
    } else if (this.queueManager_.getCurrentItem()) {
      currentMode = this.player.getConfiguration().queue.repeatMode;
    }
    switch (currentMode) {
      case shaka.config.RepeatMode.OFF:
        this.currentState_.textContent = this.localization.resolve(LocIds.OFF);
        this.icon_.use(Icons['UNLOOP']);
        this.button_.ariaLabel =
            this.localization.resolve(LocIds.ENTER_LOOP_MODE);
        this.button_.ariaPressed = 'false';
        break;
      case shaka.config.RepeatMode.ALL:
        this.currentState_.textContent = this.localization.resolve(LocIds.ON);
        this.icon_.use(Icons['LOOP']);
        this.button_.ariaLabel =
            this.localization.resolve(LocIds.EXIT_LOOP_MODE);
        this.button_.ariaPressed = 'true';
        break;
      case shaka.config.RepeatMode.SINGLE:
      default:
        this.currentState_.textContent = this.localization.resolve(LocIds.ON);
        this.icon_.use(Icons['LOOP_ONE']);
        this.button_.ariaLabel =
            this.localization.resolve(LocIds.EXIT_LOOP_MODE);
        this.button_.ariaPressed = 'true';
        break;
    }
  }


  /**
   * @private
   */
  checkAvailability_() {
    shaka.ui.Utils.setDisplay(
        this.button_, !this.player.isLive() && !this.isSubMenuOpened);
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

shaka.ui.Controls.registerBigElement(
    'loop', new shaka.ui.LoopButton.Factory());
