/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlaybackRateSelection');

goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.PlaybackRateSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignIcons.PLAYBACK_RATE);

    this.button.classList.add('shaka-playbackrate-button');
    this.menu.classList.add('shaka-playback-rates');

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.player, 'ratechange', () => {
      this.updatePlaybackRateSelection_(this.player.getPlaybackRate());
    });

    /** @type {!Map.<string, number>} */
    this.playbackRates_ = new Map([
      ['0.5x', 0.5],
      ['0.75x', 0.75],
      ['1x', 1],
      ['1.25x', 1.25],
      ['1.5x', 1.5],
      ['1.75x', 1.75],
      ['2x', 2],
    ]);

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();
    this.addPlaybackRates_();
    this.updatePlaybackRateSelection_(this.player.getPlaybackRate());
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.button.ariaLabel = this.localization.resolve(LocIds.PLAYBACK_RATE);
    this.nameSpan.textContent = this.localization.resolve(LocIds.PLAYBACK_RATE);
    this.backSpan.textContent = this.localization.resolve(LocIds.PLAYBACK_RATE);
  }

  /**
   * Update checkmark icon and related class and attribute for the chosen rate
   * button.
   * @param {number} rate The video playback rate.
   * @private
   */
  updatePlaybackRateSelection_(rate) {
    // Remove the old checkmark icon and related tags and classes if it exists.
    const checkmarkIcon = shaka.ui.Utils.getDescendantIfExists(
        this.menu, 'material-icons-round shaka-chosen-item');
    if (checkmarkIcon) {
      const previouslySelectedButton = checkmarkIcon.parentElement;
      previouslySelectedButton.removeAttribute('aria-selected');
      const previouslySelectedSpan =
          previouslySelectedButton.getElementsByTagName('span')[0];
      previouslySelectedSpan.classList.remove('shaka-chosen-item');
      previouslySelectedButton.removeChild(checkmarkIcon);
    }
    // Find the button that represents the newly selected playback rate.
    // Add the checkmark icon, related tags and classes to the newly selected
    // button.
    const span = Array.from(this.menu.querySelectorAll('span')).find((el) => {
      return this.playbackRates_.get(el.textContent) == rate;
    });
    if (span) {
      const button = span.parentElement;
      button.appendChild(shaka.ui.Utils.checkmarkIcon());
      button.ariaSelected = 'true';
      span.classList.add('shaka-chosen-item');
    }

    // Set the label to display the current playback rate in the overflow menu,
    // in the format of '1x', '1.5x', etc.
    this.currentSelection.textContent = rate + 'x';
  }

  /** @private */
  addPlaybackRates_() {
    for (const rateStr of this.playbackRates_.keys()) {
      const button = shaka.util.Dom.createButton();
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = rateStr;
      button.appendChild(span);

      this.eventManager.listen(button, 'click', () => {
        this.video.playbackRate = this.playbackRates_.get(rateStr);
        this.video.defaultPlaybackRate = this.playbackRates_.get(rateStr);
      });

      this.menu.appendChild(button);
    }
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.PlaybackRateSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.PlaybackRateSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'playback_rate', new shaka.ui.PlaybackRateSelection.Factory());
