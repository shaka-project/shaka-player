/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ChapterSelection');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
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
shaka.ui.ChapterSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons.CHAPTER);

    this.button.classList.add('shaka-chapter-button');
    this.menu.classList.add('shaka-chapters');
    this.button.classList.add('shaka-tooltip-status');

    /** @type {!Array<shaka.extern.Chapter>} */
    this.chapters_ = [];

    this.chaptersLanguage_ = 'und';

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
          this.updateChapters_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
          this.updateChapters_();
        });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.deletePreviousChapters_();
      this.chaptersLanguage_ = 'und';
      this.chapters_ = [];
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateChapters_();
    });

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();

    this.updateChapters_();
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.button.ariaLabel = this.localization.resolve(LocIds.CHAPTERS);
    this.nameSpan.textContent = this.localization.resolve(LocIds.CHAPTERS);
    this.backSpan.textContent = this.localization.resolve(LocIds.CHAPTERS);
  }

  /**
   * @private
   */
  deletePreviousChapters_() {
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    // 4. Hidden button
    shaka.ui.Utils.setDisplay(this.button, false);
  }

  /**
   * @private
   */
  async updateChapters_() {
    /**
     * Does a value compare on chapters.
     * @param {shaka.extern.Chapter} a
     * @param {shaka.extern.Chapter} b
     * @return {boolean}
     */
    const chaptersEqual = (a, b) => {
      return (!a && !b) || (a.id === b.id && a.title === b.title &&
          a.startTime === b.startTime && a.endTime === b.endTime);
    };

    let nextLanguage = 'und';
    /** @type {!Array<shaka.extern.Chapter>} */
    let nextChapters = [];

    const currentLocales = this.localization.getCurrentLocales();
    for (const locale of Array.from(currentLocales)) {
      nextLanguage = locale;
      // If player is a proxy, and the cast receiver doesn't support this
      // method, you get back undefined.
      if (this.player) {
        // eslint-disable-next-line no-await-in-loop
        nextChapters = (await this.player.getChaptersAsync(nextLanguage)) || [];
      }
      if (nextChapters.length) {
        break;
      }
    }
    if (!nextChapters.length) {
      nextLanguage = 'und';
      if (this.player) {
        // If player is a proxy, and the cast receiver doesn't support this
        // method, you get back undefined.
        nextChapters = (await this.player.getChaptersAsync(nextLanguage)) || [];
      }
    }

    const languageChanged = nextLanguage !== this.chaptersLanguage_;
    const chaptersChanged = this.chapters_.length !== nextChapters.length ||
      !this.chapters_.some((c, idx) => {
        const n = nextChapters.at(idx);
        return chaptersEqual(c, n) ||
          nextChapters.some((n) => chaptersEqual(c, n));
      });

    this.chaptersLanguage_ = nextLanguage;
    this.chapters_ = nextChapters;
    if (!nextChapters.length) {
      this.deletePreviousChapters_();
    } else if (languageChanged || chaptersChanged) {
      for (const chapter of this.chapters_) {
        const button = shaka.util.Dom.createButton();
        const span = shaka.util.Dom.createHTMLElement('span');
        span.classList.add('shaka-chapter');
        span.textContent = chapter.title;
        button.appendChild(span);

        this.eventManager.listen(button, 'click', () => {
          if (!this.controls.isOpaque()) {
            return;
          }
          this.video.currentTime = chapter.startTime;
        });

        this.menu.appendChild(button);
      }
      shaka.ui.Utils.setDisplay(this.button, true);
      shaka.ui.Utils.focusOnTheChosenItem(this.menu);
    }
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.ChapterSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.ChapterSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'chapter', new shaka.ui.ChapterSelection.Factory());

shaka.ui.Controls.registerElement(
    'chapter', new shaka.ui.ChapterSelection.Factory());
