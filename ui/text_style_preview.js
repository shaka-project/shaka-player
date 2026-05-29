/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextStylePreview');

goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.EventManager');
goog.requireType('shaka.config.PositionArea');
goog.requireType('shaka.Player');


/**
 * Manages the temporary subtitle style preview shown while subtitle style
 * settings are hovered or focused.
 *
 * @final
 */
shaka.ui.TextStylePreview = class {
  /**
   * @param {!shaka.Player} player
   * @param {!shaka.ui.Localization} localization
   */
  constructor(player, localization) {
    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {?shaka.ui.Localization} */
    this.localization_ = localization;

    /** @private {?shaka.extern.TextDisplayerConfiguration} */
    this.baseConfig_ = null;

    /** @private {!shaka.ui.TextStylePreview.Configuration} */
    this.previewConfig_ = {};

    /** @private {boolean} */
    this.shown_ = false;

    /** @private {?shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(player, 'configurationchanged', () => {
      this.updateBaseConfig_();
    });

    this.eventManager_.listenMulti(
        localization,
        [
          shaka.ui.Localization.LOCALE_UPDATED,
          shaka.ui.Localization.LOCALE_CHANGED,
        ], () => {
          this.apply_();
        });
  }

  /** Releases all resources owned by this preview. */
  release() {
    this.hide();
    this.eventManager_?.release();
    this.eventManager_ = null;
    this.player_ = null;
    this.localization_ = null;
  }

  /** Shows a temporary subtitle with the current text displayer style. */
  show() {
    if (!this.player_) {
      return;
    }

    this.shown_ = true;
    this.previewConfig_ = {};
    this.updateBaseConfig_();
  }

  /**
   * Updates the temporary subtitle style without changing player config.
   *
   * @param {!shaka.ui.TextStylePreview.Configuration=} config
   */
  update(config = {}) {
    if (!this.player_) {
      return;
    }

    if (!this.shown_) {
      this.show();
    }

    this.previewConfig_ = Object.assign({}, config);
    this.apply_();
  }

  /** Reverts the temporary subtitle to the style captured when shown. */
  reset() {
    if (!this.shown_) {
      return;
    }

    this.previewConfig_ = {};
    this.apply_();
  }

  /** Removes the temporary subtitle style preview. */
  hide() {
    if (!this.shown_) {
      return;
    }

    this.shown_ = false;
    this.baseConfig_ = null;
    this.previewConfig_ = {};
    const displayer = this.getTextDisplayer_();
    if (displayer &&
        typeof displayer['clearTextStylePreview'] == 'function') {
      displayer['clearTextStylePreview']();
    }
  }

  /** @private */
  updateBaseConfig_() {
    if (!this.shown_ || !this.player_) {
      return;
    }

    this.baseConfig_ = this.getCurrentTextDisplayerConfig_();
    this.apply_();
  }

  /**
   * @return {!shaka.extern.TextDisplayerConfiguration}
   * @private
   */
  getCurrentTextDisplayerConfig_() {
    const player = /** @type {!shaka.Player} */(this.player_);
    return /** @type {!shaka.extern.TextDisplayerConfiguration} */(
      Object.assign({}, player.getConfiguration().textDisplayer));
  }

  /** @private */
  apply_() {
    if (!this.shown_ || !this.player_ || !this.baseConfig_) {
      return;
    }

    const previewConfig =
    /** @type {!shaka.extern.TextDisplayerConfiguration} */(
        Object.assign({}, this.baseConfig_, this.previewConfig_));
    const displayer = this.getTextDisplayer_();
    if (displayer && typeof displayer['setTextStylePreview'] == 'function') {
      displayer['setTextStylePreview'](
          previewConfig, this.getLocalizedExampleText_());
    }
  }

  /**
   * @return {?}
   * @private
   */
  getTextDisplayer_() {
    const player = /** @type {?} */(this.player_);
    if (!player || typeof player.getTextDisplayer != 'function') {
      return null;
    }

    return player.getTextDisplayer();
  }

  /**
   * @return {string}
   * @private
   */
  getLocalizedExampleText_() {
    if (!this.localization_) {
      return '';
    }

    return this.localization_.resolve(
        shaka.ui.Locales.Ids.SUBTITLES_EXAMPLE);
  }
};


/**
 * @typedef {{
 *   fontScaleFactor: (number|undefined),
 *   positionArea: (shaka.config.PositionArea|undefined),
 * }}
 *
 * @description
 *   Text displayer fields that the style preview can temporarily override.
 */
shaka.ui.TextStylePreview.Configuration;
