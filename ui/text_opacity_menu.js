/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextOpacityMenu');

goog.require('shaka.ui.Locales');
goog.require('shaka.ui.TextStyleMenu');
goog.requireType('shaka.ui.Controls');
goog.requireType('shaka.ui.TextStylePreview');


/**
 * Abstract base for the menus that select a subtitle opacity.  The first
 * item, NaN, keeps the opacity defined by the subtitle.
 *
 * @extends {shaka.ui.TextStyleMenu<number>}
 * @abstract
 * @export
 */
shaka.ui.TextOpacityMenu = class extends shaka.ui.TextStyleMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {string} icon
   * @param {string} configName The name of the opacity in the text displayer
   *   configuration.
   * @param {!Array<number>} opacities
   * @param {string} nameId The localized name of the menu inside a menu
   *   group.
   * @param {string} longNameId The localized name of the menu elsewhere.
   */
  constructor(parent, controls, icon, configName, opacities, nameId,
      longNameId) {
    super(parent, controls, icon);

    /** @private {string} */
    this.configName_ = configName;

    /** @private {!Array<number>} */
    this.opacities_ = opacities;

    /** @private {string} */
    this.nameId_ = nameId;

    /** @private {string} */
    this.longNameId_ = longNameId;

    this.menu.classList.add('shaka-text-opacities');

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  getItems() {
    return [NaN, ...this.opacities_];
  }

  /** @override */
  getLabelForItem(opacity) {
    if (isNaN(opacity)) {
      return this.localization.resolve(shaka.ui.Locales.Ids.DEFAULT);
    }
    return Math.round(opacity * 100) + '%';
  }

  /** @override */
  onItemSelected(opacity) {
    this.player.configure('textDisplayer.' + this.configName_, opacity);
  }

  /** @override */
  getPreviewConfigForItem(opacity) {
    const config = {};
    config[this.configName_] = opacity;
    return /** @type {!shaka.ui.TextStylePreview.Configuration} */(config);
  }

  /** @override */
  getCurrentValueLabel() {
    const textDisplayer = /** @type {!Object} */(
      this.player.getConfiguration().textDisplayer);
    return this.getLabelForItem(
        /** @type {number} */(textDisplayer[this.configName_]));
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
