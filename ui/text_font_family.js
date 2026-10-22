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
 * Selects the font style of the subtitles: its font family and font variant.
 * The options are given by the captionsFontStyles UI config.
 *
 * @extends {shaka.ui.TextStyleMenu<shaka.extern.UIFontStyle>}
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
    return this.controls.getConfig().captionsFontStyles;
  }

  /** @override */
  getLabelForItem(fontStyle) {
    return fontStyle.label || this.getName_(fontStyle.fontFamily);
  }

  /** @override */
  onItemSelected(fontStyle) {
    this.player.configure({
      textDisplayer: {
        fontFamily: fontStyle.fontFamily,
        fontVariant: fontStyle.fontVariant || '',
      },
    });
  }

  /** @override */
  getPreviewConfigForItem(fontStyle) {
    return {
      fontFamily: fontStyle.fontFamily,
      fontVariant: fontStyle.fontVariant || '',
    };
  }

  /** @override */
  getCurrentValueLabel() {
    const config = this.player.getConfiguration().textDisplayer;
    const fontStyle = this.getItems().find((item) => {
      return item.fontFamily == config.fontFamily &&
          (item.fontVariant || '') == config.fontVariant;
    });
    if (fontStyle) {
      return this.getLabelForItem(fontStyle);
    }
    return this.getName_(config.fontFamily);
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
   * @param {string} fontFamily
   * @return {string}
   * @private
   */
  getName_(fontFamily) {
    const LocIds = shaka.ui.Locales.Ids;
    const FontFamily = shaka.config.FontFamily;
    switch (fontFamily) {
      case FontFamily.DEFAULT:
        return this.localization.resolve(LocIds.DEFAULT);
      case FontFamily.MONOSPACED_SERIF:
        return this.localization.resolve(LocIds.MONOSPACED_SERIF);
      case FontFamily.PROPORTIONAL_SERIF:
        return this.localization.resolve(LocIds.PROPORTIONAL_SERIF);
      case FontFamily.MONOSPACED_SANS_SERIF:
        return this.localization.resolve(LocIds.MONOSPACED_SANS_SERIF);
      case FontFamily.PROPORTIONAL_SANS_SERIF:
        return this.localization.resolve(LocIds.PROPORTIONAL_SANS_SERIF);
      case FontFamily.CASUAL:
        return this.localization.resolve(LocIds.CASUAL);
      case FontFamily.CURSIVE:
        return this.localization.resolve(LocIds.CURSIVE);
      case FontFamily.SMALL_CAPITALS:
        return this.localization.resolve(LocIds.SMALL_CAPITALS);
    }
    // Font families given by the application are shown by their first font.
    return fontFamily.split(',')[0].trim().replace(/^(["'])(.*)\1$/, '$2');
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
