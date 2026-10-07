/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.CaptionsSettingsGroup');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.MenuGroup');
goog.require('shaka.ui.OverflowMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Groups the subtitle settings: the language and the style.  Its button shows
 * the current language.
 *
 * @extends {shaka.ui.MenuGroup}
 * @final
 * @export
 */
shaka.ui.CaptionsSettingsGroup = class extends shaka.ui.MenuGroup {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS']);

    this.button.classList.add('shaka-captions-settings-button');
  }

  /** @override */
  getName() {
    return this.localization.resolve(shaka.ui.Locales.Ids.CAPTIONS);
  }

  /** @override */
  getChildElementNames() {
    return ['captions', 'captions-style'];
  }

  /** @override */
  getSummaryElementName() {
    return 'captions';
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.CaptionsSettingsGroup.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.CaptionsSettingsGroup(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-settings', new shaka.ui.CaptionsSettingsGroup.Factory());

shaka.ui.Controls.registerElement(
    'captions-settings', new shaka.ui.CaptionsSettingsGroup.Factory());
