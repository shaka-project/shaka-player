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
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.MediaElementEvent');


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
    this.button_.classList.add('shaka-no-propagation');

    /** @private {shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons['FULLSCREEN']);

    this.checkAvailability();

    this.parent.appendChild(this.button_);

    this.updateLocalizedStrings();

    this.eventManager.listen(this.button_, 'click', async () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      await this.controls.toggleFullScreen();
      this.button_.focus();
    });

    this.eventManager.listen(document, 'fullscreenchange', () => {
      this.updateIcon_();
      this.updateLocalizedStrings();
    });

    this.eventManager.listenMulti(
        this.localVideo_,
        [
          shaka.util.MediaElementEvent.LOADED_METADATA,
          shaka.util.MediaElementEvent.LOADED_DATA,
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listenMulti(
        this.adManager,
        [
          shaka.ads.Utils.AD_STARTED,
          shaka.ads.Utils.AD_STOPPED,
        ], () => {
          this.checkAvailability();
        });
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.controls.isFullScreenEnabled() ?
        LocIds.EXIT_FULL_SCREEN : LocIds.FULL_SCREEN;

    this.button_.ariaLabel = this.localization.resolve(label);
    this.button_.ariaPressed =
        this.controls.isFullScreenEnabled() ? 'true' : 'false';
  }

  /** @private */
  updateIcon_() {
    this.icon_.use(this.controls.isFullScreenEnabled() ?
      shaka.ui.Enums.MaterialDesignSVGIcons['EXIT_FULLSCREEN'] :
      shaka.ui.Enums.MaterialDesignSVGIcons['FULLSCREEN'],
    );
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(
        this.button_, this.controls.isFullScreenSupported());
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

shaka.ui.Controls.registerBigElement(
    'fullscreen', new shaka.ui.FullscreenButton.Factory());
