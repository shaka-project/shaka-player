/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlayButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
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

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.icon_ = new shaka.ui.MaterialSVGIcon(this.button);

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

    this.eventManager.listen(this.player, 'loaded', () => {
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
      if (!this.controls.isOpaque()) {
        return;
      }
      this.controls.playPausePresentation();
    });

    this.updateAriaLabel();
    this.updateIcon();
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
   * To be overridden by subclasses, if necessary
   */
  updateAriaLabel() {
    const LocIds = shaka.ui.Locales.Ids;
    if (this.isEnded() && this.video.duration) {
      this.button.ariaLabel = this.localization.resolve(LocIds.REPLAY);
    } else {
      const label = this.isPaused() ? LocIds.PLAY : LocIds.PAUSE;
      this.button.ariaLabel = this.localization.resolve(label);
    }
  }

  /**
   * Called when the button's icon needs to change.
   * To be overridden by subclasses.
   */
  updateIcon() {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    if (this.isEnded() && this.video.duration) {
      this.icon_.use(Icons.REPLAY);
    } else {
      this.icon_.use(this.isPaused() ? Icons.PLAY : Icons.PAUSE);
    }
  }
};
