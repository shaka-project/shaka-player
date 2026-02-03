/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlayButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
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
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-play-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    this.parent.appendChild(this.button_);

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_);

    this.eventManager.listenMulti(
        this.localization,
        [
          shaka.ui.Localization.LOCALE_UPDATED,
          shaka.ui.Localization.LOCALE_CHANGED,
        ], () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listenMulti(
        this.video,
        [
          'play',
          'pause',
          'seeking',
        ], () => {
          this.updateAriaLabel_();
          this.updateIcon_();
        });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.updateAriaLabel_();
      this.updateIcon_();
    });

    this.eventManager.listenMulti(
        this.adManager,
        [
          shaka.ads.Utils.AD_PAUSED,
          shaka.ads.Utils.AD_RESUMED,
          shaka.ads.Utils.AD_STARTED,
          shaka.ads.Utils.AD_STOPPED,
        ], () => {
          this.updateAriaLabel_();
          this.updateIcon_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.controls.playPausePresentation();
    });

    this.updateAriaLabel_();
    this.updateIcon_();
  }

  /**
   * @return {boolean}
   * @private
   */
  isPaused_() {
    if (this.ad && this.ad.isLinear()) {
      return this.ad.isPaused();
    }

    return this.controls.presentationIsPaused();
  }

  /**
   * @return {boolean}
   * @private
   */
  isEnded_() {
    if (this.ad && this.ad.isLinear()) {
      return false;
    }

    return this.player ? this.player.isEnded() : true;
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    if (this.isEnded_() && this.video.duration) {
      this.button_.ariaLabel = this.localization.resolve(LocIds.REPLAY);
    } else {
      const label = this.isPaused_() ? LocIds.PLAY : LocIds.PAUSE;
      this.button_.ariaLabel = this.localization.resolve(label);
    }
  }


  /**
   * @private
   */
  updateIcon_() {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    if (this.isEnded_() && this.video.duration) {
      this.icon_.use(Icons['REPLAY']);
    } else {
      this.icon_.use(this.isPaused_() ? Icons['PLAY'] : Icons['PAUSE']);
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.PlayButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.PlayButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'play_pause', new shaka.ui.PlayButton.Factory());

shaka.ui.Controls.registerBigElement(
    'play_pause', new shaka.ui.PlayButton.Factory());
