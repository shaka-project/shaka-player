/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextColorMenu');

goog.require('shaka.ui.Locales');
goog.require('shaka.ui.TextStyleMenu');
goog.requireType('shaka.ui.Controls');
goog.requireType('shaka.ui.TextStylePreview');


/**
 * Abstract base for the menus that select a subtitle color.  The first item,
 * an empty string, keeps the color defined by the subtitle.
 *
 * @extends {shaka.ui.TextStyleMenu<string>}
 * @abstract
 * @export
 */
shaka.ui.TextColorMenu = class extends shaka.ui.TextStyleMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {string} icon
   * @param {string} configName The name of the color in the text displayer
   *   configuration.
   * @param {string} nameId The localized name of the menu inside a menu
   *   group.
   * @param {string} longNameId The localized name of the menu elsewhere.
   */
  constructor(parent, controls, icon, configName, nameId, longNameId) {
    super(parent, controls, icon);

    /** @private {string} */
    this.configName_ = configName;

    /** @private {string} */
    this.nameId_ = nameId;

    /** @private {string} */
    this.longNameId_ = longNameId;

    this.menu.classList.add('shaka-text-colors');

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  getItems() {
    return ['', ...shaka.ui.TextColorMenu.COLORS.keys()];
  }

  /** @override */
  getLabelForItem(color) {
    if (!color) {
      return this.localization.resolve(shaka.ui.Locales.Ids.DEFAULT);
    }
    const nameId = shaka.ui.TextColorMenu.COLORS.get(color);
    // Colors given by the application are shown as they are.
    return nameId ? this.localization.resolve(nameId) : color;
  }

  /** @override */
  getSwatchColorForItem(color) {
    return color || null;
  }

  /** @override */
  onItemSelected(color) {
    this.player.configure('textDisplayer.' + this.configName_, color);
  }

  /** @override */
  getPreviewConfigForItem(color) {
    const config = {};
    config[this.configName_] = color;
    return /** @type {!shaka.ui.TextStylePreview.Configuration} */(config);
  }

  /** @override */
  getCurrentValueLabel() {
    const textDisplayer = /** @type {!Object} */(
      this.player.getConfiguration().textDisplayer);
    return this.getLabelForItem(
        /** @type {string} */(textDisplayer[this.configName_]));
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    // Inside a menu group, the group already names the context.
    const label = this.localization.resolve(
        this.isInMenuGroup ? this.nameId_ : this.longNameId_);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;

    this.rebuildMenu();
  }
};


/**
 * The colors of the menu, with their localized names.
 *
 * @const {!Map<string, string>}
 */
shaka.ui.TextColorMenu.COLORS = new Map([
  ['#fff', shaka.ui.Locales.Ids.WHITE],
  ['#ff0', shaka.ui.Locales.Ids.YELLOW],
  ['#0f0', shaka.ui.Locales.Ids.GREEN],
  ['#0ff', shaka.ui.Locales.Ids.CYAN],
  ['#00f', shaka.ui.Locales.Ids.BLUE],
  ['#f0f', shaka.ui.Locales.Ids.MAGENTA],
  ['#f00', shaka.ui.Locales.Ids.RED],
  ['#080808', shaka.ui.Locales.Ids.BLACK],
]);
