/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SkipQueueButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * Queue-navigation button that skips forward or backward one item.
 * Pass isNext=true for skip-next behaviour, false for skip-previous.
 *
 * @extends {shaka.ui.Element}
 * @export
 */
shaka.ui.SkipQueueButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {boolean} isNext  true → skip forward; false → skip backward
   * @param {boolean=} showWhenUnavailable
   */
  constructor(parent, controls, isNext, showWhenUnavailable = false) {
    super(parent, controls);

    /** @private {boolean} */
    this.isNext_ = isNext;

    /** @private {boolean} */
    this.showWhenUnavailable_ = showWhenUnavailable;

    /** @private {?shaka.extern.IQueueManager} */
    this.queueManager_ = this.controls.getQueueManager();

    if (!this.queueManager_) {
      return;
    }

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add(
        isNext ? 'shaka-skip-next-button' : 'shaka-skip-previous-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    new shaka.ui.Icon(this.button_).use(
        shaka.ui.Enums.MaterialDesignSVGIcons[isNext ? 'SKIP_NEXT' :
          'SKIP_PREVIOUS']);
    this.parent.appendChild(this.button_);

    this.updateLocalizedStrings();
    this.checkAvailability();

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      const delta = this.isNext_ ? 1 : -1;
      this.queueManager_.playItem(
          this.queueManager_.getCurrentItemIndex() + delta);
    });

    this.eventManager.listenMulti(
        this.queueManager_,
        [
          'currentitemchanged',
          'itemsinserted',
          'itemsremoved',
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listen(this.player, 'loading', () => {
      this.checkAvailability();
    });
  }

  /** @override */
  updateLocalizedStrings() {
    this.button_.ariaLabel = this.localization.resolve(
        this.isNext_ ? shaka.ui.Locales.Ids.SKIP_NEXT :
          shaka.ui.Locales.Ids.SKIP_PREVIOUS);
  }

  /** @override */
  checkAvailability() {
    const itemsLength = this.queueManager_.getItems().length;
    const currentIndex = this.queueManager_.getCurrentItemIndex();
    const hasItem = itemsLength > 1 && (this.isNext_ ?
        (currentIndex + 1) < itemsLength :
        currentIndex > 0);

    if (this.showWhenUnavailable_) {
      shaka.ui.Utils.setDisplay(this.button_, itemsLength > 1);
      this.button_.disabled = !hasItem;
    } else {
      shaka.ui.Utils.setDisplay(this.button_, hasItem);
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipQueueButton.SkipNextFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipQueueButton(
        rootElement, controls, /* isNext= */ true);
  }
};

shaka.ui.Controls.registerElement(
    'skip_next', new shaka.ui.SkipQueueButton.SkipNextFactory());

shaka.ui.Controls.registerBigElement(
    'skip_next', new shaka.ui.SkipQueueButton.SkipNextFactory());


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipQueueButton.SkipNextAlwaysFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipQueueButton(
        rootElement, controls, /* isNext= */ true,
        /* showWhenUnavailable= */ true);
  }
};

shaka.ui.Controls.registerElement(
    'skip_next_always', new shaka.ui.SkipQueueButton.SkipNextAlwaysFactory());

shaka.ui.Controls.registerBigElement(
    'skip_next_always', new shaka.ui.SkipQueueButton.SkipNextAlwaysFactory());


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipQueueButton.SkipPreviousFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipQueueButton(
        rootElement, controls, /* isNext= */ false);
  }
};

shaka.ui.Controls.registerElement(
    'skip_previous', new shaka.ui.SkipQueueButton.SkipPreviousFactory());

shaka.ui.Controls.registerBigElement(
    'skip_previous', new shaka.ui.SkipQueueButton.SkipPreviousFactory());


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SkipQueueButton.SkipPreviousAlwaysFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SkipQueueButton(
        rootElement, controls, /* isNext= */ false,
        /* showWhenUnavailable= */ true);
  }
};

shaka.ui.Controls.registerElement(
    'skip_previous_always',
    new shaka.ui.SkipQueueButton.SkipPreviousAlwaysFactory());

shaka.ui.Controls.registerBigElement(
    'skip_previous_always',
    new shaka.ui.SkipQueueButton.SkipPreviousAlwaysFactory());
