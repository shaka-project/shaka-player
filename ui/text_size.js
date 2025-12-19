/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextSize');

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
shaka.ui.TextSize = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_SIZE']);

    this.button.classList.add('shaka-caption-size-button');
    this.button.classList.add('shaka-tooltip-status');
    this.menu.classList.add('shaka-text-positions');

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.player, 'loading', () => {
      this.updateTextSizeSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.updateTextSizeSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.updateTextSizeSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'textchanged', () => {
      this.updateTextSizeSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateTextSizeSelection_();
      this.checkAvailability_();
    });

    if (this.isSubMenu) {
      this.eventManager.listen(this.controls, 'submenuopen', () => {
        this.checkAvailability_();
      });
      this.eventManager.listen(this.controls, 'submenuclose', () => {
        this.checkAvailability_();
      });
    }

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();

    this.checkAvailability_();
    this.addTextSizes_();
    this.updateTextSizeSelection_();
  }

  /** @private */
  checkAvailability_() {
    const tracks = this.player.getTextTracks() || [];
    const hasTrack = tracks.some((track) => track.active);
    const available = hasTrack && !this.isSubMenuOpened &&
        this.controls.getConfig().captionsStyles;
    shaka.ui.Utils.setDisplay(this.button, available);
    if (available) {
      this.button.ariaPressed = 'true';
    } else {
      this.button.ariaPressed = 'false';
    }
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.button.ariaLabel = this.localization.resolve(LocIds.SUBTITLE_SIZE);
    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.nameSpan.textContent =
        this.localization.resolve(LocIds.SUBTITLE_SIZE);
    this.backSpan.textContent =
        this.localization.resolve(LocIds.SUBTITLE_SIZE);
  }

  /** @private */
  addTextSizes_() {
    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    // 4. Add new items
    for (const fontScaleFactor of
      this.controls.getConfig().captionsFontScaleFactors) {
      const button = shaka.util.Dom.createButton();
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = fontScaleFactor * 100 + '%';
      button.appendChild(span);

      this.eventManager.listen(button, 'click', () => {
        this.player.configure('textDisplayer.fontScaleFactor', fontScaleFactor);
        this.updateTextSizeSelection_();
      });

      this.menu.appendChild(button);
    }
    this.updateTextSizeSelection_();
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
  }

  /** @private */
  updateTextSizeSelection_() {
    // Remove the old checkmark icon and related tags and classes if it exists.
    const checkmarkIcon = shaka.ui.Utils.getDescendantIfExists(
        this.menu, 'shaka-ui-icon shaka-chosen-item');
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
    const fontScaleFactor =
        this.player.getConfiguration().textDisplayer.fontScaleFactor;
    const fontScaleFactorName = fontScaleFactor * 100 + '%'; ;
    // Add the checkmark icon, related tags and classes to the newly selected
    // button.
    const span = Array.from(this.menu.querySelectorAll('span')).find((el) => {
      return el.textContent === fontScaleFactorName;
    });
    if (span) {
      const button = span.parentElement;
      button.appendChild(shaka.ui.Utils.checkmarkIcon());
      button.ariaSelected = 'true';
      span.classList.add('shaka-chosen-item');
    }
    this.currentSelection.textContent = fontScaleFactorName;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextSize.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextSize(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-size', new shaka.ui.TextSize.Factory());

shaka.ui.Controls.registerElement(
    'captions-size', new shaka.ui.TextSize.Factory());
