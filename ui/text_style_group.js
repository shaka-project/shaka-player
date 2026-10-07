/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextStyleGroup');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.MenuGroup');
goog.require('shaka.ui.OverflowMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Groups the subtitle style options given by the captionsStyleElements
 * configuration.
 *
 * @extends {shaka.ui.MenuGroup}
 * @final
 * @export
 */
shaka.ui.TextStyleGroup = class extends shaka.ui.MenuGroup {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_STYLE']);

    this.button.classList.add('shaka-caption-style-button');
  }

  /** @override */
  getName() {
    const LocIds = shaka.ui.Locales.Ids;
    // Inside a menu group, the group already names the context.
    return this.localization.resolve(
        this.isInMenuGroup ? LocIds.STYLE : LocIds.SUBTITLE_STYLE);
  }

  /** @override */
  getChildElementNames() {
    return this.controls.getConfig().captionsStyleElements;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextStyleGroup.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextStyleGroup(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-style', new shaka.ui.TextStyleGroup.Factory());

shaka.ui.Controls.registerElement(
    'captions-style', new shaka.ui.TextStyleGroup.Factory());
