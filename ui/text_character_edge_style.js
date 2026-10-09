/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextCharacterEdgeStyle');

goog.require('shaka.config.CharacterEdgeStyle');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextStyleMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the style of the edges of the characters of the subtitles.
 *
 * @extends {shaka.ui.TextStyleMenu<shaka.config.CharacterEdgeStyle>}
 * @final
 * @export
 */
shaka.ui.TextCharacterEdgeStyle = class extends shaka.ui.TextStyleMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    super(parent, controls, Icons['CLOSED_CAPTIONS_CHARACTER_EDGE_STYLE']);

    this.button.classList.add('shaka-caption-character-edge-style-button');
    this.button.classList.add('shaka-tooltip');

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  getItems() {
    return Object.values(shaka.config.CharacterEdgeStyle);
  }

  /** @override */
  getLabelForItem(edgeStyle) {
    return this.getName_(edgeStyle);
  }

  /** @override */
  onItemSelected(edgeStyle) {
    this.player.configure('textDisplayer.characterEdgeStyle', edgeStyle);
  }

  /** @override */
  getPreviewConfigForItem(edgeStyle) {
    return {characterEdgeStyle: edgeStyle};
  }

  /** @override */
  getCurrentValueLabel() {
    return this.getName_(
        this.player.getConfiguration().textDisplayer.characterEdgeStyle);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    // Inside a menu group, the group already names the context.
    const label = this.localization.resolve(
        this.isInMenuGroup ?
            LocIds.CHARACTER_EDGE_STYLE : LocIds.SUBTITLE_CHARACTER_EDGE_STYLE);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;

    this.rebuildMenu();
  }

  /**
   * @param {!shaka.config.CharacterEdgeStyle} edgeStyle
   * @return {string}
   * @private
   */
  getName_(edgeStyle) {
    const LocIds = shaka.ui.Locales.Ids;
    switch (edgeStyle) {
      case shaka.config.CharacterEdgeStyle.DEFAULT:
        return this.localization.resolve(LocIds.DEFAULT);
      case shaka.config.CharacterEdgeStyle.NONE:
        return this.localization.resolve(LocIds.NONE);
      case shaka.config.CharacterEdgeStyle.DROP_SHADOW:
        return this.localization.resolve(LocIds.DROP_SHADOW);
      case shaka.config.CharacterEdgeStyle.RAISED:
        return this.localization.resolve(LocIds.RAISED);
      case shaka.config.CharacterEdgeStyle.DEPRESSED:
        return this.localization.resolve(LocIds.DEPRESSED);
      case shaka.config.CharacterEdgeStyle.OUTLINE:
        return this.localization.resolve(LocIds.OUTLINE);
    }
    return '';
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextCharacterEdgeStyle.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextCharacterEdgeStyle(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-character-edge-style',
    new shaka.ui.TextCharacterEdgeStyle.Factory());

shaka.ui.Controls.registerElement(
    'captions-character-edge-style',
    new shaka.ui.TextCharacterEdgeStyle.Factory());
