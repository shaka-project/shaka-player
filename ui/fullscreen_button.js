/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.FullscreenButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
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

    /** @private {HTMLMediaElement} */
    this.localVideo_ = this.controls.getLocalVideo();

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-fullscreen-button');
    this.button_.classList.add('shaka-tooltip');

    /** @private {shaka.ui.MaterialSVGIcon} */
    this.icon_ = new shaka.ui.MaterialSVGIcon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons.FULLSCREEN);

    this.checkSupport_();

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
      if (!this.controls.isOpaque()) {
        return;
      }
      await this.controls.toggleFullScreen();
    });

    this.eventManager.listen(document, 'fullscreenchange', () => {
      this.updateIcon_();
      this.updateAriaLabel_();
    });

    this.eventManager.listen(this.localVideo_, 'loadedmetadata', () => {
      this.checkSupport_();
    });

    this.eventManager.listen(this.localVideo_, 'loadeddata', () => {
      this.checkSupport_();
    });

    this.eventManager.listen(this.adManager, shaka.ads.Utils.AD_STARTED, () => {
      this.checkSupport_();
    });

    this.eventManager.listen(this.adManager, shaka.ads.Utils.AD_STOPPED, () => {
      this.checkSupport_();
    });
  }

  /**
   * @private
   */
  checkSupport_() {
    // Don't show the button if fullscreen is not supported
    if (!this.controls.isFullScreenSupported()) {
      this.button_.classList.add('shaka-hidden');
    } else {
      this.button_.classList.remove('shaka-hidden');
    }
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.controls.isFullScreenEnabled() ?
        LocIds.EXIT_FULL_SCREEN : LocIds.FULL_SCREEN;

    this.button_.ariaLabel = this.localization.resolve(label);
  }

  /**
   * @private
   */
  updateIcon_() {
    this.icon_.use(this.controls.isFullScreenEnabled() ?
      shaka.ui.Enums.MaterialDesignSVGIcons.EXIT_FULLSCREEN :
      shaka.ui.Enums.MaterialDesignSVGIcons.FULLSCREEN,
    );
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

