/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextSelection');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.LanguageUtils');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.TextSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent,
        controls, shaka.ui.Enums.MaterialDesignSVGIcons.CLOSED_CAPTIONS);

    this.button.classList.add('shaka-caption-button');
    this.button.classList.add('shaka-tooltip-status');
    this.menu.classList.add('shaka-text-languages');

    if (this.player && this.player.isTextTrackVisible()) {
      this.button.ariaPressed = 'true';
    } else {
      this.button.ariaPressed = 'false';
    }

    this.addOffOption_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
          // If captions/subtitles are off, this string needs localization.
          // TODO: is there a more efficient way of updating just the strings
          // we need instead of running the whole language update?
          this.updateTextLanguages_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
          // If captions/subtitles are off, this string needs localization.
          // TODO: is there a more efficient way of updating just the strings
          // we need instead of running the whole language update?
          this.updateTextLanguages_();
        });

    this.eventManager.listen(this.player, 'loading', () => {
      this.onCaptionStateChange_();
      this.updateTextLanguages_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.onCaptionStateChange_();
      this.updateTextLanguages_();
    });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.onCaptionStateChange_();
      this.updateTextLanguages_();
    });

    this.eventManager.listen(this.player, 'texttrackvisibility', () => {
      this.onCaptionStateChange_();
      this.updateTextLanguages_();
    });

    this.eventManager.listen(this.player, 'textchanged', () => {
      this.updateTextLanguages_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateTextLanguages_();
    });

    // Initialize caption state with a fake event.
    this.onCaptionStateChange_();

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();

    this.updateTextLanguages_();
  }


  /**
   * @private
   */
  addOffOption_() {
    const off = shaka.util.Dom.createButton();
    off.ariaSelected = 'true';
    this.menu.appendChild(off);

    off.appendChild(shaka.ui.Utils.checkmarkIcon());

    /** @private {!HTMLElement} */
    this.captionsOffSpan_ = shaka.util.Dom.createHTMLElement('span');

    off.appendChild(this.captionsOffSpan_);
  }


  /** @private */
  onCaptionStateChange_() {
    if (this.player.isTextTrackVisible()) {
      this.icon.use(shaka.ui.Enums.MaterialDesignSVGIcons.CLOSED_CAPTIONS);
      this.button.ariaPressed = 'true';
    } else {
      this.icon.use(shaka.ui.Enums.MaterialDesignSVGIcons.CLOSED_CAPTIONS_OFF);
      this.button.ariaPressed = 'false';
    }

    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('captionselectionupdated'));
  }

  /** @private */
  updateTextLanguages_() {
    const tracks = this.player.getTextTracks() || [];

    shaka.ui.LanguageUtils.updateTextTracks(tracks, this.menu,
        (track) => this.onTextTrackSelected_(track),

        // Don't mark current text language as chosen unless captions are
        // enabled
        this.player.isTextTrackVisible(),
        this.currentSelection,
        this.localization,
        this.controls.getConfig().textTrackLabelFormat);

    // Add the Off button
    const offButton = shaka.util.Dom.createButton();
    offButton.classList.add('shaka-turn-captions-off-button');
    this.eventManager.listen(offButton, 'click', () => {
      this.player.setTextTrackVisibility(false);
      this.updateTextLanguages_();
    });

    offButton.appendChild(this.captionsOffSpan_);

    this.menu.appendChild(offButton);

    if (!this.player.isTextTrackVisible()) {
      offButton.ariaSelected = 'true';
      offButton.appendChild(shaka.ui.Utils.checkmarkIcon());
      this.captionsOffSpan_.classList.add('shaka-chosen-item');
      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.OFF);
    } else {
      this.captionsOffSpan_.classList.remove('shaka-chosen-item');
    }

    this.button.setAttribute('shaka-status', this.currentSelection.textContent);

    shaka.ui.Utils.focusOnTheChosenItem(this.menu);

    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('captionselectionupdated'));

    shaka.ui.Utils.setDisplay(this.button, tracks.length > 0);
  }


  /**
   * @param {!shaka.extern.TextTrack} track
   * @return {!Promise}
   * @private
   */
  async onTextTrackSelected_(track) {
    // setTextTrackVisibility should be called after selectTextTrack.
    // selectTextTrack sets a text stream, and setTextTrackVisibility(true)
    // will set a text stream if it isn't already set. Consequently, reversing
    // the order of these calls makes two languages display simultaneously
    // if captions are turned off -> on in a different language.
    this.player.selectTextTrack(track);
    await this.player.setTextTrackVisibility(true);

    // Set text preference for when reloading the stream (e.g. casting), keep
    // this selection.
    this.player.configure('preferredTextLanguage', track.language);
    this.player.configure('preferForcedSubs', track.forced);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.button.ariaLabel = this.localization.resolve(LocIds.CAPTIONS);
    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.nameSpan.textContent =
        this.localization.resolve(LocIds.CAPTIONS);
    this.backSpan.textContent =
        this.localization.resolve(LocIds.CAPTIONS);
    this.captionsOffSpan_.textContent =
        this.localization.resolve(LocIds.OFF);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions', new shaka.ui.TextSelection.Factory());

shaka.ui.Controls.registerElement(
    'captions', new shaka.ui.TextSelection.Factory());
