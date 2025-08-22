/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AudioLanguageSelection');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.LanguageUtils');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.AudioLanguageSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons.LANGUAGE);

    this.button.classList.add('shaka-language-button');
    this.button.classList.add('shaka-tooltip-status');
    this.menu.classList.add('shaka-audio-languages');

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });


    this.eventManager.listen(this.player, 'loading', () => {
      this.onAudioTracksChanged_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.onAudioTracksChanged_();
    });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.onAudioTracksChanged_();
    });

    this.eventManager.listen(this.player, 'audiotrackschanged', () => {
      this.onAudioTracksChanged_();
    });

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();

    this.onAudioTracksChanged_();
  }


  /** @private */
  onAudioTracksChanged_() {
    const audioTracks = this.player.getAudioTracks() || [];

    shaka.ui.LanguageUtils.updateAudioTracks(audioTracks, this.menu,
        (track) => this.onAudioTrackSelected_(track),
        /* updateChosen= */ true, this.currentSelection, this.localization,
        this.controls.getConfig().trackLabelFormat,
        this.controls.getConfig().showAudioChannelCountVariants,
        this.controls.getConfig().showAudioCodec);
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);

    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('languageselectionupdated'));

    this.button.setAttribute('shaka-status', this.currentSelection.innerText);

    const numberOfItems = this.menu.getElementsByTagName('button').length;
    shaka.ui.Utils.setDisplay(this.button, numberOfItems > 2);
  }

  /**
   * @param {!shaka.extern.AudioTrack} audioTrack
   * @private
   */
  onAudioTrackSelected_(audioTrack) {
    this.player.selectAudioTrack(audioTrack);

    // Set audio preference for when reloading the stream (e.g. casting), keep
    // this selection.
    this.player.configure('preferredAudioLanguage', audioTrack.language);
    if (audioTrack.label) {
      this.player.configure('preferredAudioLabel', audioTrack.label);
    }
    if (audioTrack.channelsCount) {
      this.player.configure('preferredAudioChannelCount',
          audioTrack.channelsCount);
    }
    this.player.configure('preferSpatialAudio', audioTrack.spatialAudio);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.button.ariaLabel = this.localization.resolve(LocIds.LANGUAGE);
    this.nameSpan.textContent =
        this.localization.resolve(LocIds.LANGUAGE);
    this.backSpan.textContent =
        this.localization.resolve(LocIds.LANGUAGE);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.AudioLanguageSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.AudioLanguageSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'language', new shaka.ui.AudioLanguageSelection.Factory());

shaka.ui.Controls.registerElement(
    'language', new shaka.ui.AudioLanguageSelection.Factory());
