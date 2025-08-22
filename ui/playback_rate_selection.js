/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlaybackRateSelection');

goog.require('shaka.ui.Controls');
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
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons.PLAYBACK_RATE);

    this.button.classList.add('shaka-playbackrate-button');
    this.menu.classList.add('shaka-playback-rates');
    this.button.classList.add('shaka-tooltip-status');

    if (!Array.from(parent.classList).includes('shaka-overflow-menu')) {
      this.playbackRateMark = shaka.util.Dom.createHTMLElement('span');
      this.playbackRateMark.classList.add('shaka-overflow-playback-rate-mark');
      this.button.appendChild(this.playbackRateMark);
    }

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.updatePlaybackRateSelection_();
    });

    this.eventManager.listen(this.player, 'ratechange', () => {
      this.updatePlaybackRateSelection_();
    });

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();
    this.addPlaybackRates_();
    this.updatePlaybackRateSelection_();
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
   * @private
   */
  updatePlaybackRateSelection_() {
    const rate = this.player.getPlaybackRate();
    // Remove the old checkmark icon and related tags and classes if it exists.
    const checkmarkIcon = shaka.ui.Utils.getDescendantIfExists(
        this.menu, 'material-svg-icon shaka-chosen-item');
    if (checkmarkIcon) {
      const previouslySelectedButton = checkmarkIcon.parentElement;
      previouslySelectedButton.removeAttribute('aria-selected');
      const previouslySelectedSpan =
          previouslySelectedButton.getElementsByTagName('span')[0];
      if (previouslySelectedSpan) {
        previouslySelectedSpan.classList.remove('shaka-chosen-item');
      }
      previouslySelectedButton.removeChild(checkmarkIcon);
    }
    // Find the button that represents the newly selected playback rate.
    // Add the checkmark icon, related tags and classes to the newly selected
    // button.
    const span = Array.from(this.menu.querySelectorAll('span')).find((el) => {
      return el.textContent == (rate + 'x');
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
    this.button.setAttribute('shaka-status', rate + 'x');
    if (this.playbackRateMark) {
      this.playbackRateMark.textContent = rate + 'x';
    }
  }

  /** @private */
  addPlaybackRates_() {
    for (const rate of this.controls.getConfig().playbackRates) {
      const button = shaka.util.Dom.createButton();
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = rate + 'x';
      button.appendChild(span);

      this.eventManager.listen(button, 'click', () => {
        if (rate == this.video.defaultPlaybackRate) {
          this.player.cancelTrickPlay();
        } else {
          this.player.trickPlay(rate, /* useTrickPlayTrack= */ false);
        }
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

shaka.ui.Controls.registerElement(
    'playback_rate', new shaka.ui.PlaybackRateSelection.Factory());
