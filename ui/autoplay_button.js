/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AutoPlayNextButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * Toggles <code>queue.autoPlayNext</code>, which controls whether the queue
 * advances to the next item when the current one ends.
 *
 * Unlike the other elements of the control panel, this is drawn as a switch
 * rather than an icon, because it reflects a persistent setting instead of an
 * action.  The glyph inside the knob says what will happen when the current
 * item ends: play the next one, or stop.
 *
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.AutoPlayNextButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {?shaka.extern.IQueueManager} */
    this.queueManager_ = this.controls.getQueueManager();

    if (!this.queueManager_) {
      return;
    }

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-autoplay-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    this.button_.ariaPressed = 'false';

    /** @private {!HTMLElement} */
    this.knob_ = shaka.util.Dom.createHTMLElement('span');
    this.knob_.classList.add('shaka-autoplay-knob');

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.knob_,
        shaka.ui.Enums.MaterialDesignSVGIcons['PLAY']);

    const switchTrack = shaka.util.Dom.createHTMLElement('span');
    switchTrack.classList.add('shaka-autoplay-switch');
    switchTrack.appendChild(this.knob_);
    this.button_.appendChild(switchTrack);

    // The label is only rendered when this button lives in the overflow menu.
    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    label.classList.add('shaka-simple-overflow-button-label-inline');

    /** @private {!HTMLElement} */
    this.nameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.nameSpan_);

    /** @private {!HTMLElement} */
    this.currentState_ = shaka.util.Dom.createHTMLElement('span');
    this.currentState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentState_);

    this.button_.appendChild(label);

    this.parent.appendChild(this.button_);

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      const autoPlayNext = this.player.getConfiguration().queue.autoPlayNext;
      this.player.configure('queue.autoPlayNext', !autoPlayNext);
    });

    this.eventManager.listen(this.player, 'configurationchanged', () => {
      this.updateLocalizedStrings();
    });

    this.eventManager.listenMulti(
        this.player,
        [
          'unloading',
          'loaded',
          'manifestupdated',
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listenMulti(
        this.queueManager_,
        [
          'itemsinserted',
          'itemsremoved',
        ], () => {
          this.checkAvailability();
        });

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;

    this.nameSpan_.textContent = this.localization.resolve(LocIds.AUTOPLAY);

    const autoPlayNext = this.player.getConfiguration().queue.autoPlayNext;
    if (autoPlayNext) {
      this.currentState_.textContent = this.localization.resolve(LocIds.ON);
      this.icon_.use(Icons['PLAY']);
      this.button_.ariaLabel =
          this.localization.resolve(LocIds.DISABLE_AUTOPLAY);
      this.button_.ariaPressed = 'true';
    } else {
      this.currentState_.textContent = this.localization.resolve(LocIds.OFF);
      this.icon_.use(Icons['PAUSE']);
      this.button_.ariaLabel =
          this.localization.resolve(LocIds.ENABLE_AUTOPLAY);
      this.button_.ariaPressed = 'false';
    }
  }

  /** @override */
  checkAvailability() {
    // With a single item there is no next item to play, and on live content
    // the queue never completes.
    const hasNextItem = this.queueManager_.getItems().length > 1;
    shaka.ui.Utils.setDisplay(this.button_,
        hasNextItem && !this.player.isLive() && !this.isSubMenuOpened);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.AutoPlayNextButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.AutoPlayNextButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'autoplay', new shaka.ui.AutoPlayNextButton.Factory());

shaka.ui.OverflowMenu.registerElement(
    'autoplay', new shaka.ui.AutoPlayNextButton.Factory());
