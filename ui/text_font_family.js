/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextFontFamily');

goog.require('shaka.config.FontFamily');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextStyleMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the font family of the subtitles.
 *
 * @extends {shaka.ui.TextStyleMenu<shaka.config.FontFamily>}
 * @final
 * @export
 */
shaka.ui.TextFontFamily = class extends shaka.ui.TextStyleMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_FONT_FAMILY']);

    this.button.classList.add('shaka-caption-font-family-button');
    this.button.classList.add('shaka-tooltip');

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  getItems() {
    return Object.values(shaka.config.FontFamily);
  }

  /** @override */
  getLabelForItem(fontFamily) {
    return this.getName_(fontFamily);
  }

  /** @override */
  onItemSelected(fontFamily) {
    this.player.configure('textDisplayer.fontFamily', fontFamily);
  }

  /** @override */
  getPreviewConfigForItem(fontFamily) {
    return {fontFamily};
  }

  /** @override */
  getCurrentValueLabel() {
    return this.getName_(
        this.player.getConfiguration().textDisplayer.fontFamily);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    // Inside a menu group, the group already names the context.
    const label = this.localization.resolve(
        this.isInMenuGroup ? LocIds.FONT_FAMILY : LocIds.SUBTITLE_FONT_FAMILY);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;

    this.rebuildMenu();
  }

  /**
   * @param {!shaka.config.FontFamily} fontFamily
   * @return {string}
   * @private
   */
  getName_(fontFamily) {
    const LocIds = shaka.ui.Locales.Ids;
    switch (fontFamily) {
      case shaka.config.FontFamily.DEFAULT:
        return this.localization.resolve(LocIds.DEFAULT);
      case shaka.config.FontFamily.MONOSPACED_SERIF:
        return this.localization.resolve(LocIds.MONOSPACED_SERIF);
      case shaka.config.FontFamily.PROPORTIONAL_SERIF:
        return this.localization.resolve(LocIds.PROPORTIONAL_SERIF);
      case shaka.config.FontFamily.MONOSPACED_SANS_SERIF:
        return this.localization.resolve(LocIds.MONOSPACED_SANS_SERIF);
      case shaka.config.FontFamily.PROPORTIONAL_SANS_SERIF:
        return this.localization.resolve(LocIds.PROPORTIONAL_SANS_SERIF);
    }
    return '';
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextFontFamily.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextFontFamily(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-font-family', new shaka.ui.TextFontFamily.Factory());

shaka.ui.Controls.registerElement(
    'captions-font-family', new shaka.ui.TextFontFamily.Factory());
