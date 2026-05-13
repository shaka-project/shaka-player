/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SkipNextButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.SkipNextButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {boolean=} showWhenUnavailable
   */
  constructor(parent, controls, showWhenUnavailable = false) {
    super(parent, controls);

    /** @private {boolean} */
    this.showWhenUnavailable_ = showWhenUnavailable;

    this.queueManager_ = this.controls.getQueueManager();

    if (!this.queueManager_) {
      return;
    }

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-skip-next-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    new shaka.ui.Icon(this.button_).use(
        shaka.ui.Enums.MaterialDesignSVGIcons['SKIP_NEXT']);
    this.parent.appendChild(this.button_);

    this.updateAriaLabel_();
    this.checkAvailability_();

    this.eventManager.listenMulti(
        this.localization,
        [
          shaka.ui.Localization.LOCALE_UPDATED,
          shaka.ui.Localization.LOCALE_CHANGED,
        ], () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.queueManager_.playItem(this.queueManager_.getCurrentItemIndex() + 1);
    });

    this.eventManager.listenMulti(
        this.queueManager_,
        [
          'currentitemchanged',
          'itemsinserted',
          'itemsremoved',
        ], () => {
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
        this.localization.resolve(shaka.ui.Locales.Ids.SKIP_NEXT);
  }

  /** @private */
  checkAvailability_() {
    const itemsLength = this.queueManager_.getItems().length;
    const hasNext = itemsLength > 1 &&
      (this.queueManager_.getCurrentItemIndex() + 1) < itemsLength;

    if (this.showWhenUnavailable_) {
      // Always visible when queue has more than one item; disabled if no next.
      const hasQueue = itemsLength > 1;
      shaka.ui.Utils.setDisplay(this.button_, hasQueue);
      this.button_.disabled = !hasNext;
    } else {
      shaka.ui.Utils.setDisplay(this.button_, hasNext);
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipNextButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipNextButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'skip_next', new shaka.ui.SkipNextButton.Factory());

shaka.ui.Controls.registerBigElement(
    'skip_next', new shaka.ui.SkipNextButton.Factory());


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipNextButton.AlwaysFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipNextButton(
        rootElement, controls, /* showDisabled= */ true);
  }
};

shaka.ui.Controls.registerElement(
    'skip_next_always', new shaka.ui.SkipNextButton.AlwaysFactory());

shaka.ui.Controls.registerBigElement(
    'skip_next_always', new shaka.ui.SkipNextButton.AlwaysFactory());
