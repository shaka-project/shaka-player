/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.FullscreenButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.FullscreenButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.button_ = shaka.util.Dom.createHTMLElement('button');
    this.button_.classList.add('shaka-fullscreen-button');
    this.button_.classList.add('material-icons');

    // Don't show the button if fullscreen is not supported
    if (!document.fullscreenEnabled) {
      this.button_.classList.add('shaka-hidden');
    }

    this.button_.textContent = shaka.ui.Enums.MaterialDesignIcons.FULLSCREEN;
    this.parent.appendChild(this.button_);
    this.updateAriaLabel_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(this.button_, 'click', async () => {
      await this.controls.toggleFullScreen();
    });

    this.eventManager.listen(document, 'fullscreenchange', () => {
      this.updateIcon_();
      this.updateAriaLabel_();
    });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = document.fullscreenElement ?
        LocIds.EXIT_FULL_SCREEN : LocIds.FULL_SCREEN;

    this.button_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(label));
  }

  /**
   * @private
   */
  updateIcon_() {
    this.button_.textContent =
      document.fullscreenElement ?
      shaka.ui.Enums.MaterialDesignIcons.EXIT_FULLSCREEN :
      shaka.ui.Enums.MaterialDesignIcons.FULLSCREEN;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.FullscreenButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.FullscreenButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'fullscreen', new shaka.ui.FullscreenButton.Factory());

