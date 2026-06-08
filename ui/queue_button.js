/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.QueueButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.QueueButton = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons['QUEUE']);

    this.button.classList.add('shaka-queue-button');
    this.menu.classList.add('shaka-queue-menu');
    this.button.classList.add('shaka-tooltip');

    /** @private {shaka.extern.IQueueManager} */
    this.queueManager_ = this.controls.getQueueManager();

    this.eventManager.listenMulti(
        this.queueManager_,
        [
          'itemsinserted',
          'itemsremoved',
        ], () => {
          this.updateQueueItems_();
        });

    this.eventManager.listen(this.queueManager_, 'currentitemchanged', () => {
      this.updateCurrentItem_();
    });

    this.updateLocalizedStrings();
    this.updateQueueItems_();
  }

  /**
   * Returns only those queue items that have enough metadata to be worth
   * showing (at minimum a title).
   *
   * @return {!Array<shaka.extern.QueueItem>}
   * @private
   */
  getDisplayableItems_() {
    if (!this.queueManager_) {
      return [];
    }
    return this.queueManager_.getItems().filter(
        (item) => item.metadata?.title);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const label = this.localization.resolve(LocIds.QUEUE);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;
  }

  /**
   * Rebuilds the full submenu list from scratch.
   * Only called when items are inserted or removed.
   * @private
   */
  updateQueueItems_() {
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    const displayableItems = this.getDisplayableItems_();

    if (displayableItems.length > 1) {
      const currentIndex = this.queueManager_.getCurrentItemIndex();
      const allItems = this.queueManager_.getItems();

      // If at least one item has a poster, every row must reserve the same
      // poster slot so titles stay left-aligned across all rows.  If no item
      // has a poster at all, the column is omitted entirely.
      const anyHasPoster = displayableItems.some(
          (item) => item.metadata && item.metadata.poster);

      for (const item of displayableItems) {
        const itemIndex = allItems.indexOf(item);
        const isCurrent = itemIndex === currentIndex;

        const button = shaka.util.Dom.createButton();
        button.setAttribute('role', 'menuitem');
        button.classList.add('shaka-queue-item');
        // Store the index as a data attribute so updateCurrentItem_() can
        // locate this button in O(1) without iterating the whole list.
        button.setAttribute('data-queue-index', String(itemIndex));
        if (isCurrent) {
          button.classList.add('shaka-queue-item-current');
        }

        if (anyHasPoster) {
          const container = shaka.util.Dom.createHTMLElement('div');
          container.classList.add('shaka-queue-poster');

          if (item.metadata.poster) {
            const img = /** @type {!HTMLImageElement} */ (
              shaka.util.Dom.createHTMLElement('img'));
            img.draggable = false;
            img.setAttribute('loading', 'lazy');
            img.alt = item.metadata.title || '';
            img.src = item.metadata.poster;
            container.appendChild(img);
          }

          button.appendChild(container);
        }

        const textBlock = shaka.util.Dom.createHTMLElement('div');
        textBlock.classList.add('shaka-queue-item-text');

        const titleSpan = shaka.util.Dom.createHTMLElement('span');
        titleSpan.classList.add('shaka-queue-item-title');
        titleSpan.textContent = item.metadata.title;
        textBlock.appendChild(titleSpan);

        if (isCurrent) {
          textBlock.appendChild(shaka.ui.Utils.checkmarkIcon());
        }

        button.appendChild(textBlock);

        this.eventManager.listen(button, 'click', () => {
          if (!this.controls.isOpaque()) {
            return;
          }
          this.queueManager_.playItem(itemIndex);
        });

        this.menu.appendChild(button);
      }

      shaka.ui.Utils.setDisplay(this.button, !this.isSubMenuOpened);
      shaka.ui.Utils.focusOnTheChosenItem(this.menu);
    } else {
      shaka.ui.Utils.setDisplay(this.button, false);
    }
  }

  /**
   * @private
   */
  updateCurrentItem_() {
    // Remove styling from the previously active button (if any).
    const prevButton =
        this.menu.querySelector('.shaka-queue-item-current');
    if (prevButton) {
      prevButton.classList.remove('shaka-queue-item-current');
      const prevCheck =
          prevButton.querySelector('.shaka-ui-icon.shaka-chosen-item');
      if (prevCheck) {
        prevCheck.remove();
      }
    }

    // Apply styling to the newly active button.
    const newIndex = this.queueManager_.getCurrentItemIndex();
    const newButton =
        this.menu.querySelector(`[data-queue-index="${newIndex}"]`);
    if (newButton) {
      newButton.classList.add('shaka-queue-item-current');
      const textBlock =
          newButton.querySelector('.shaka-queue-item-text');
      if (textBlock) {
        textBlock.appendChild(shaka.ui.Utils.checkmarkIcon());
        shaka.ui.Utils.focusOnTheChosenItem(this.menu);
      }
    }
  }

  /** @override */
  checkAvailability() {
    const hasItems = this.getDisplayableItems_().length > 1;
    shaka.ui.Utils.setDisplay(this.button, hasItems && !this.isSubMenuOpened);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.QueueButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.QueueButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'queue', new shaka.ui.QueueButton.Factory());

shaka.ui.Controls.registerElement(
    'queue', new shaka.ui.QueueButton.Factory());
