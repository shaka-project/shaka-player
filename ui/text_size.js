/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextSize');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextStyleMenu');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.TextStyleMenu<number>}
 * @final
 * @export
 */
shaka.ui.TextSize = class extends shaka.ui.TextStyleMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_SIZE']);

    this.button.classList.add('shaka-caption-size-button');
    this.button.classList.add('shaka-tooltip');
    this.menu.classList.add('shaka-text-positions');

    this.updateLocalizedStrings();
    this.checkAvailability();
    this.rebuildMenu();
  }

  /** @override */
  getItems() {
    return this.controls.getConfig().captionsFontScaleFactors;
  }

  /** @override */
  getLabelForItem(fontScaleFactor) {
    return fontScaleFactor * 100 + '%';
  }

  /** @override */
  onItemSelected(fontScaleFactor) {
    this.player.configure('textDisplayer.fontScaleFactor', fontScaleFactor);
  }

  /** @override */
  getPreviewConfigForItem(fontScaleFactor) {
    return {fontScaleFactor: fontScaleFactor};
  }

  /** @override */
  getCurrentValueLabel() {
    const fontScaleFactor =
        this.player.getConfiguration().textDisplayer.fontScaleFactor;
    return fontScaleFactor * 100 + '%';
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const label = this.localization.resolve(LocIds.SUBTITLE_SIZE);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;
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
