/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlayButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @implements {shaka.extern.IUIPlayButton}
 * @export
 */
shaka.ui.PlayButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @protected {!HTMLButtonElement} */
    this.button = shaka.util.Dom.createButton();
    this.parent.appendChild(this.button);

    const LOCALE_UPDATED = shaka.ui.Localization.LOCALE_UPDATED;
    this.eventManager.listen(this.localization, LOCALE_UPDATED, () => {
      this.updateAriaLabel();
    });

    const LOCALE_CHANGED = shaka.ui.Localization.LOCALE_CHANGED;
    this.eventManager.listen(this.localization, LOCALE_CHANGED, () => {
      this.updateAriaLabel();
    });

    this.eventManager.listen(this.video, 'play', () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.video, 'pause', () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.video, 'seeking', () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.adManager, shaka.ads.Utils.AD_PAUSED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.adManager, shaka.ads.Utils.AD_RESUMED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.adManager, shaka.ads.Utils.AD_STARTED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.adManager, shaka.ads.Utils.AD_STOPPED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.button, 'click', () => {
      this.controls.playPausePresentation();
    });

    if (this.ad) {
      // There was already an ad.
      this.updateAriaLabel();
      this.updateIcon();
    }
  }

  /**
   * @return {boolean}
   * @protected
   * @override
   */
  isPaused() {
    if (this.ad && this.ad.isLinear()) {
      return this.ad.isPaused();
    }

    return this.controls.presentationIsPaused();
  }

  /**
   * @return {boolean}
   * @protected
   * @override
   */
  isEnded() {
    if (this.ad && this.ad.isLinear()) {
      return false;
    }

    return this.player ? this.player.isEnded() : true;
  }

  /**
   * Called when the button's aria label needs to change.
   * To be overridden by subclasses.
   */
  updateAriaLabel() {}

  /**
   * Called when the button's icon needs to change.
   * To be overridden by subclasses.
   */
  updateIcon() {}
};
