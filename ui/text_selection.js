/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shaka.ui.TextSelection');

goog.require('shaka.ui.Enums');
goog.require('shaka.ui.LanguageUtils');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.util.Dom');


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
        controls, shaka.ui.Enums.MaterialDesignIcons.CLOSED_CAPTIONS);

    this.button.classList.add('shaka-caption-button');
    this.menu.classList.add('shaka-text-languages');

    if (this.player && this.player.isTextTrackVisible()) {
      this.button.setAttribute('aria-pressed', 'true');
    } else {
      this.button.setAttribute('aria-pressed', 'false');
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

    this.eventManager.listen(this.player, 'texttrackvisibility', () => {
      this.onCaptionStateChange_();
      if (this.player.isTextTrackVisible()) {
        // If the track is becoming visible, it's possible that the text track
        // has changed "invisibly", so handle that just in case.
        this.onTracksChanged_();
      }
    });

    this.eventManager.listen(this.player, 'textchanged', () => {
      this.updateTextLanguages_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.onTracksChanged_();
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
    const off = shaka.util.Dom.createHTMLElement('button');
    off.setAttribute('aria-selected', 'true');
    this.menu.appendChild(off);

    off.appendChild(shaka.ui.Utils.checkmarkIcon());

    /** @private {!HTMLElement} */
    this.captionsOffSpan_ = shaka.util.Dom.createHTMLElement('span');

    this.captionsOffSpan_.classList.add('shaka-auto-span');
    off.appendChild(this.captionsOffSpan_);
  }


  /** @private */
  onCaptionStateChange_() {
    if (this.player.isTextTrackVisible()) {
      this.icon.classList.add('shaka-captions-on');
      this.icon.classList.remove('shaka-captions-off');
      this.button.setAttribute('aria-pressed', 'true');
    } else {
      this.icon.classList.add('shaka-captions-off');
      this.icon.classList.remove('shaka-captions-on');
      this.button.setAttribute('aria-pressed', 'false');
    }

    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('captionselectionupdated'));
  }

  /** @private */
  updateTextLanguages_() {
    const tracks = this.player.getTextTracks();

    shaka.ui.LanguageUtils.updateTracks(tracks, this.menu,
        (track) => this.onTextTrackSelected_(track),

        // Don't mark current text language as chosen unless captions are
        // enabled
        this.player.isTextTrackVisible(),
        this.currentSelection,
        this.localization,
        this.controls.getConfig().trackLabelFormat);

    // Add the Off button
    const offButton = shaka.util.Dom.createHTMLElement('button');
    offButton.classList.add('shaka-turn-captions-off-button');
    this.eventManager.listen(offButton, 'click', () => {
      const p = this.player.setTextTrackVisibility(false);
      p.catch(() => {});  // TODO(#1993): Handle possible errors.
      this.updateTextLanguages_();
    });

    offButton.appendChild(this.captionsOffSpan_);

    this.menu.appendChild(offButton);

    if (!this.player.isTextTrackVisible()) {
      offButton.setAttribute('aria-selected', 'true');
      offButton.appendChild(shaka.ui.Utils.checkmarkIcon());
      this.captionsOffSpan_.classList.add('shaka-chosen-item');
      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.OFF);
    }

    shaka.ui.Utils.focusOnTheChosenItem(this.menu);

    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('captionselectionupdated'));
  }


  /**
   * @param {!shaka.extern.Track} track
   * @return {!Promise}
   * @private
   */
  async onTextTrackSelected_(track) {
    await this.player.setTextTrackVisibility(true);
    if (this.player) {  // May have become null while awaiting
      this.player.selectTextLanguage(track.language, track.roles[0]);
    }
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.button.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.CAPTIONS));
    this.backButton.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.BACK));
    this.nameSpan.textContent =
        this.localization.resolve(LocIds.CAPTIONS);
    this.backSpan.textContent =
        this.localization.resolve(LocIds.CAPTIONS);
    this.captionsOffSpan_.textContent =
        this.localization.resolve(LocIds.OFF);
  }


  /** @private */
  onTracksChanged_() {
    const hasText = this.player.getTextTracks().length > 0;
    shaka.ui.Utils.setDisplay(this.button, hasText);
    this.updateTextLanguages_();
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
