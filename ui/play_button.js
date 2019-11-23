/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlayButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @export
 */
shaka.ui.PlayButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    const AdManager = shaka.ads.AdManager;

    /** @protected {!HTMLElement} */
    this.button = shaka.util.Dom.createHTMLElement('button');
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

    this.eventManager.listen(this.adManager, AdManager.AD_PAUSED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.adManager, AdManager.AD_RESUMED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.adManager, AdManager.AD_STARTED, () => {
      this.updateAriaLabel();
      this.updateIcon();
    });

    this.eventManager.listen(this.button, 'click', () => {
      if (this.ad) {
        this.controls.playPauseAd();
      } else {
        this.controls.playPausePresentation();
      }
    });
  }

  /**
   * @return {boolean}
   * @protected
   */
  isPaused() {
    if (this.ad) {
      return this.ad.isPaused();
    }

    return this.controls.presentationIsPaused();
  }

  /** @protected */
  updateAriaLabel() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.isPaused() ? LocIds.PLAY : LocIds.PAUSE;

    this.button.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(label));
  }

  /**
   * Called when the button's icon needs to change.
   * To be overridden by subclasses.
   */
  updateIcon() {}
};
