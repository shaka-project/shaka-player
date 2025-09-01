/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SkipPreviousButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.SkipPreviousButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.queueManager_ = this.player.getQueueManager();

    if (!this.queueManager_) {
      return;
    }

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-skip-previous-button');
    this.button_.classList.add('shaka-tooltip');
    new shaka.ui.MaterialSVGIcon(this.button_).use(
        shaka.ui.Enums.MaterialDesignSVGIcons.SKIP_PREVIOUS);
    this.parent.appendChild(this.button_);

    this.updateAriaLabel_();
    this.checkAvailability_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.queueManager_.playItem(this.queueManager_.getCurrentItemIndex() - 1);
    });

    this.eventManager.listen(this.queueManager_, 'currentitemchanged', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.queueManager_, 'itemsinserted', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.queueManager_, 'itemsremoved', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'loading', () => {
      this.checkAvailability_();
    });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    this.button_.ariaLabel =
        this.localization.resolve(shaka.ui.Locales.Ids.SKIP_PREVIOUS);
  }

  /** @private */
  checkAvailability_() {
    const available = this.queueManager_.getItems().length > 1 &&
      this.queueManager_.getCurrentItemIndex() > 0;
    shaka.ui.Utils.setDisplay(this.button_, available);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipPreviousButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipPreviousButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'skip_previous', new shaka.ui.SkipPreviousButton.Factory());
