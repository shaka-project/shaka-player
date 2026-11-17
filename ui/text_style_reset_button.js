/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextStyleResetButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextStyleMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * Restores the default subtitle style: the style given by the
 * captionsStyleDefaults configuration, or the default style of the player.
 *
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.TextStyleResetButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-caption-style-reset-button');
    this.button_.classList.add('shaka-tooltip');

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons['RESET']);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    /** @private {!HTMLElement} */
    this.nameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.nameSpan_);
    this.button_.appendChild(label);

    this.updateLocalizedStrings();

    this.parent.appendChild(this.button_);

    this.eventManager.listen(this.button_, 'click', () => {
      this.reset_();
    });

    this.eventManager.listenMulti(
        this.player,
        [
          'loading',
          'unloading',
          'trackschanged',
        ], () => {
          this.checkAvailability();
        });

    this.checkAvailability();
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(this.button_, !this.isSubMenuOpened &&
        shaka.ui.TextStyleMenu.isStyleAvailable(this.player, this.controls));
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.localization.resolve(LocIds.RESET);

    this.button_.ariaLabel = label;
    this.nameSpan_.textContent = label;
  }

  /** @private */
  reset_() {
    // A setting not given by the application is undefined, which restores the
    // default value of the player.
    const defaults = this.controls.getConfig().captionsStyleDefaults;
    const textDisplayer = {};
    for (const key of shaka.ui.TextStyleResetButton.STYLE_SETTINGS_) {
      textDisplayer[key] = defaults[key];
    }
    this.player.configure({textDisplayer});
  }
};


/**
 * The text displayer settings changed by the subtitle style menus.  Other
 * settings, like the subtitle delay, are not part of the style, and are
 * ignored in captionsStyleDefaults.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.ui.TextStyleResetButton.STYLE_SETTINGS_ = [
  'fontScaleFactor',
  'positionArea',
  'fontFamily',
  'fontVariant',
  'fontColor',
  'fontOpacity',
  'backgroundColor',
  'backgroundOpacity',
  'windowColor',
  'windowOpacity',
  'characterEdgeStyle',
];


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextStyleResetButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextStyleResetButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-style-reset', new shaka.ui.TextStyleResetButton.Factory());
