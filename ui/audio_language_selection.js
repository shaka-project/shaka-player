/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AudioLanguageSelection');

goog.require('shaka.Player');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.LanguageUtils');
goog.require('shaka.ui.Locales');
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
shaka.ui.AudioLanguageSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons['LANGUAGE']);

    this.button.classList.add('shaka-language-button');
    this.button.classList.add('shaka-tooltip-status');
    this.menu.classList.add('shaka-audio-languages');

    /**
     * True if adaptation was disabled to turn the audio off, so that it is
     * enabled again when the audio comes back.
     * @private {boolean}
     */
    this.abrDisabledForOff_ = false;

    /** @private {boolean} */
    this.audioOff_ = false;

    this.eventManager.listenMulti(
        this.player,
        [
          'loading',
          'loaded',
          'unloading',
          'audiotrackschanged',
          'variantchanged',
          'adaptation',
        ], () => {
          this.onAudioTracksChanged_();
        });

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings();

    this.onAudioTracksChanged_();
  }

  /** @private */
  onAudioTracksChanged_() {
    const audioTracks = this.player.getAudioTracks() || [];
    const offTrack = audioTracks.length ? this.getOffTrack_() : null;
    const audioOff = !!offTrack && offTrack.active;
    if (this.audioOff_ && !audioOff) {
      // The audio came back some other way, e.g. a quality selection.
      this.abrDisabledForOff_ = false;
    }
    this.audioOff_ = audioOff;

    shaka.ui.LanguageUtils.updateAudioTracks(audioTracks, this.menu,
        (track) => this.onAudioTrackSelected_(track),
        /* updateChosen= */ !audioOff, this.currentSelection,
        this.localization, this.controls.getConfig());
    if (offTrack) {
      this.addOffButton_(offTrack);
    }
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);

    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('languageselectionupdated'));

    this.button.setAttribute('shaka-status', this.currentSelection.innerText);

    const numberOfItems = this.menu.getElementsByTagName('button').length;
    shaka.ui.Utils.setDisplay(
        this.button, numberOfItems > 2 && !this.isSubMenuOpened);
  }

  /**
   * @param {!shaka.extern.AudioTrack} audioTrack
   * @private
   */
  onAudioTrackSelected_(audioTrack) {
    this.player.selectAudioTrack(audioTrack);
    if (this.abrDisabledForOff_) {
      this.abrDisabledForOff_ = false;
      this.player.configure('abr.enabled', true);
    }

    // Set audio preference for when reloading the stream (e.g. casting), keep
    // this selection.
    /** @type {shaka.extern.AudioPreference} */
    const pref = {
      language: audioTrack.language,
      role: '',
      label: audioTrack.label || '',
      channelCount: audioTrack.channelsCount || 0,
      codec: '',
      spatialAudio: audioTrack.spatialAudio,
    };
    this.player.configure({preferredAudio: [pref]});
  }

  /**
   * Gets the variant without audio that turns the audio off, i.e. the one
   * playing, or the best one with the current video.  Such video-only
   * variants are mixed with audio-video ones, and only selected manually.
   *
   * @return {?shaka.extern.Track}
   * @private
   */
  getOffTrack_() {
    if (this.player.getLoadMode() != shaka.Player.LoadMode.MEDIA_SOURCE ||
        this.player.isRemotePlayback() || this.player.isVideoOnly()) {
      return null;
    }
    const tracks = this.player.getVariantTracks() || [];
    const active = tracks.find((t) => t.active);
    if (!active) {
      return null;
    }
    const isVideoOnly = (t) => t.audioId == null && t.videoId != null &&
        !(t.videoCodec || '').includes(',');
    if (isVideoOnly(active)) {
      return active;
    }
    const videoOnly = tracks.filter(isVideoOnly);
    const sameVideo = videoOnly.find((t) => t.videoId == active.videoId);
    if (sameVideo) {
      return sameVideo;
    }
    return videoOnly.reduce((best, track) => {
      return !best || track.bandwidth > best.bandwidth ? track : best;
    }, /** @type {?shaka.extern.Track} */ (null));
  }

  /**
   * @param {!shaka.extern.Track} track
   * @private
   */
  addOffButton_(track) {
    const button = shaka.util.Dom.createButton();
    // ARIA: single-select menu item
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', 'false');
    button.classList.add('shaka-audio-off-button');
    this.eventManager.listen(button, 'click', () => this.onOffSelected_(track));

    const span = shaka.util.Dom.createHTMLElement('span');
    span.textContent = this.localization.resolve(shaka.ui.Locales.Ids.OFF);
    button.appendChild(span);

    if (track.active) {
      button.appendChild(shaka.ui.Utils.checkmarkIcon());
      shaka.ui.Utils.setChosenItem(button, span);
      this.currentSelection.textContent = span.textContent;
    }
    this.menu.appendChild(button);
  }

  /**
   * @param {!shaka.extern.Track} track
   * @private
   */
  onOffSelected_(track) {
    if (track.active) {
      return;
    }
    // Adaptation never chooses a variant without audio.
    if (this.player.getConfiguration().abr.enabled) {
      this.abrDisabledForOff_ = true;
      this.player.configure('abr.enabled', false);
    }
    // Stop the audio right away, instead of playing out its buffer.
    this.player.selectVariantTrack(track, /* clearBuffer= */ true);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const label = this.localization.resolve(LocIds.LANGUAGE);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;
  }

  /** @override */
  checkAvailability() {
    this.onAudioTracksChanged_();
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
