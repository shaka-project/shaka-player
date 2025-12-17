/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextPosition');

goog.require('shaka.config.PositionArea');
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
shaka.ui.TextPosition = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_POSITION']);

    this.button.classList.add('shaka-caption-position-button');
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
      this.updateTextPositionSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.updateTextPositionSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.updateTextPositionSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'textchanged', () => {
      this.updateTextPositionSelection_();
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateTextPositionSelection_();
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
    this.addTextPositions_();
    this.updateTextPositionSelection_();
  }

  /** @private */
  checkAvailability_() {
    const tracks = this.player.getTextTracks() || [];
    const hasTrack = tracks.some((track) => track.active);
    shaka.ui.Utils.setDisplay(this.button, hasTrack && !this.isSubMenuOpened);
    if (hasTrack && !this.isSubMenuOpened) {
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

    this.button.ariaLabel = this.localization.resolve(LocIds.SUBTITLE_POSITION);
    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.nameSpan.textContent =
        this.localization.resolve(LocIds.SUBTITLE_POSITION);
    this.backSpan.textContent =
        this.localization.resolve(LocIds.SUBTITLE_POSITION);

    this.addTextPositions_();
  }

  /** @private */
  addTextPositions_() {
    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    // 4. Add new items
    for (const position of Object.values(shaka.config.PositionArea)) {
      const button = shaka.util.Dom.createButton();
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = this.getNameOfPosition_(position);
      button.appendChild(span);

      this.eventManager.listen(button, 'click', () => {
        this.player.configure('textDisplayer.positionArea', position);
        this.updateTextPositionSelection_();
      });

      this.menu.appendChild(button);
    }
    this.updateTextPositionSelection_();
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
  }

  /** @private */
  updateTextPositionSelection_() {
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
    const positionArea =
        this.player.getConfiguration().textDisplayer.positionArea;
    const positionAreaName = this.getNameOfPosition_(positionArea);
    // Add the checkmark icon, related tags and classes to the newly selected
    // button.
    const span = Array.from(this.menu.querySelectorAll('span')).find((el) => {
      return el.textContent === positionAreaName;
    });
    if (span) {
      const button = span.parentElement;
      button.appendChild(shaka.ui.Utils.checkmarkIcon());
      button.ariaSelected = 'true';
      span.classList.add('shaka-chosen-item');
    }
    this.currentSelection.textContent = positionAreaName;
  }

  /**
   * @param {!shaka.config.PositionArea} position
   * @return {string}
   * @private
   */
  getNameOfPosition_(position) {
    const LocIds = shaka.ui.Locales.Ids;
    switch (position) {
      case shaka.config.PositionArea.DEFAULT:
        return this.localization.resolve(LocIds.DEFAULT);
      case shaka.config.PositionArea.TOP_LEFT:
        return this.localization.resolve(LocIds.TOP_LEFT);
      case shaka.config.PositionArea.TOP_CENTER:
        return this.localization.resolve(LocIds.TOP_CENTER);
      case shaka.config.PositionArea.TOP_RIGHT:
        return this.localization.resolve(LocIds.TOP_RIGHT);
      case shaka.config.PositionArea.CENTER_LEFT:
        return this.localization.resolve(LocIds.CENTER_LEFT);
      case shaka.config.PositionArea.CENTER_CENTER:
        return this.localization.resolve(LocIds.CENTER_CENTER);
      case shaka.config.PositionArea.CENTER_RIGHT:
        return this.localization.resolve(LocIds.CENTER_RIGHT);
      case shaka.config.PositionArea.BOTTOM_LEFT:
        return this.localization.resolve(LocIds.BOTTOM_LEFT);
      case shaka.config.PositionArea.BOTTOM_CENTER:
        return this.localization.resolve(LocIds.BOTTOM_CENTER);
      case shaka.config.PositionArea.BOTTOM_RIGHT:
        return this.localization.resolve(LocIds.BOTTOM_RIGHT);
    }
    return '';
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextPosition.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextPosition(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-position', new shaka.ui.TextPosition.Factory());

shaka.ui.Controls.registerElement(
    'captions-position', new shaka.ui.TextPosition.Factory());
