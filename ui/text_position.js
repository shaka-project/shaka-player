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
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextStyleMenu');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.TextStyleMenu<shaka.config.PositionArea>}
 * @final
 * @export
 */
shaka.ui.TextPosition = class extends shaka.ui.TextStyleMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_POSITION']);

    this.button.classList.add('shaka-caption-position-button');
    this.button.classList.add('shaka-tooltip');
    this.menu.classList.add('shaka-text-positions');

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  getItems() {
    return Object.values(shaka.config.PositionArea);
  }

  /** @override */
  getLabelForItem(position) {
    return this.getNameOfPosition_(position);
  }

  /** @override */
  onItemSelected(position) {
    this.player.configure('textDisplayer.positionArea', position);
  }

  /** @override */
  getPreviewConfigForItem(position) {
    return {positionArea: position};
  }

  /** @override */
  getCurrentValueLabel() {
    return this.getNameOfPosition_(
        this.player.getConfiguration().textDisplayer.positionArea);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const label = this.localization.resolve(LocIds.SUBTITLE_POSITION);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;

    this.rebuildMenu();
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
      case shaka.config.PositionArea.CENTER:
        return this.localization.resolve(LocIds.CENTER);
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
