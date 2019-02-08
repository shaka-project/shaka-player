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


goog.provide('shaka.ui.OverflowMenu');

goog.require('mozilla.LanguageMapping');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
 shaka.ui.OverflowMenu = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    /** @private {!HTMLMediaElement} */
    this.localVideo_ = this.controls.getLocalVideo();

    /** @private {!shaka.cast.CastProxy} */
    this.castProxy_ = this.controls.getCastProxy();

    this.initOptionalElementsToNull_();

    /** @private {!Map.<string, !Function>} */
    this.elementNamesToFunctions_ = new Map([
      ['captions', () => { this.addCaptionButton_(); }],
      ['cast', () => { this.addCastButton_(); }],
      ['quality', () => { this.addResolutionButton_(); }],
      ['language', () => { this.addLanguagesButton_(); }],
      ['picture_in_picture', () => { this.addPipButton_(); }],
    ]);

    /** @private {!HTMLElement} */
    this.controlsContainer_ = this.controls.getControlsContainer();

    this.addOverflowMenuButton_();

    this.addOverflowMenu_();

    /** @private {!NodeList.<!Element>} */
    this.backToOverflowMenuButtons_ = this.controls.getVideoContainer().
        getElementsByClassName('shaka-back-to-overflow-button');


    for (let i = 0; i < this.backToOverflowMenuButtons_.length; i++) {
      let button = this.backToOverflowMenuButtons_[i];
      button.addEventListener('click', () => {
        // Hide the submenus, display the overflow menu
        this.controls.hideSettingsMenus();
        shaka.ui.Controls.setDisplay(this.overflowMenu_, true);

        // If there are back to overflow menu buttons, there must be
        // overflow menu buttons, but oh well
        if (this.overflowMenu_.childNodes.length) {
          /** @type {!HTMLElement} */ (this.overflowMenu_.childNodes[0])
            .focus();
        }

        // Make sure controls are displayed
        this.controls.overrideCssShowControls();
      });
    }

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateLocalizedStrings_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateLocalizedStrings_();
      });

    this.eventManager.listen(
      this.localVideo_, 'enterpictureinpicture', () => {
        this.onEnterPictureInPicture_();
      });

    this.eventManager.listen(
      this.localVideo_, 'leavepictureinpicture', () => {
        this.onLeavePictureInPicture_();
      });

    if (this.castButton_) {
      this.eventManager.listen(
        this.castButton_, 'click', () => {
          this.onCastClick_();
        });
    }

    if (this.captionButton_) {
      this.eventManager.listen(
        this.captionButton_, 'click', () => {
          this.onCaptionClick_();
        });
    }

    if (this.pipButton_) {
      this.eventManager.listen(
        this.pipButton_, 'click', () => {
          this.onPipClick_();
        });
    }

    this.eventManager.listen(
      this.player, 'texttrackvisibility', () => {
        this.onCaptionStateChange_();
      });

    this.eventManager.listen(
      this.player, 'trackschanged', () => {
        this.onTracksChange_();
      });

    this.eventManager.listen(
      this.player, 'variantchanged', () => {
        this.onVariantChange_();
      });

    this.eventManager.listen(
      this.player, 'textchanged', () => {
        this.updateTextLanguages_();
      });

    this.eventManager.listen(
      this.overflowMenu_, 'touchstart', (event) => {
        this.controls.setLastTouchEventTime(Date.now());
        event.stopPropagation();
      });

    this.eventManager.listen(
      this.overflowMenuButton_, 'click', () => {
        this.onOverflowMenuButtonClick_();
      });

    if (this.resolutionButton_) {
      this.eventManager.listen(
        this.resolutionButton_, 'click', () => {
          this.onResolutionClick_();
        });
    }

    if (this.languagesButton_) {
      this.eventManager.listen(
        this.languagesButton_, 'click', () => {
          this.onLanguagesClick_();
        });
    }

    this.eventManager.listen(
      this.controls, 'caststatuschange', (e) => {
        this.onCastStatusChange_(e);
      });


    this.eventManager.listen(
      this.controlsContainer_, 'touchstart', (event) => {
        // If the overflow menu is showing, hide it on a touch event
        if (this.overflowMenu_.classList.contains('shaka-displayed')) {
          shaka.ui.Controls.setDisplay(this.overflowMenu_, false);
          // Stop this event from becoming a click event.
          event.preventDefault();
        }
      });

    // Initialize caption state with a fake event.
    this.onCaptionStateChange_();

    const LocIds = shaka.ui.Locales.Ids;

    /** @private {!Map.<HTMLElement, string>} */
    this.ariaLabels_ = new Map()
      .set(this.captionButton_, LocIds.ARIA_LABEL_CAPTIONS)
      .set(this.backFromCaptionsButton_, LocIds.ARIA_LABEL_BACK)
      .set(this.backFromResolutionButton_, LocIds.ARIA_LABEL_BACK)
      .set(this.backFromLanguageButton_, LocIds.ARIA_LABEL_BACK)
      .set(this.resolutionButton_, LocIds.ARIA_LABEL_RESOLUTION)
      .set(this.languagesButton_, LocIds.ARIA_LABEL_LANGUAGE)
      .set(this.castButton_, LocIds.ARIA_LABEL_CAST)
      .set(this.overflowMenuButton_, LocIds.ARIA_LABEL_MORE_SETTINGS);

    /** @private {!Map.<HTMLElement, string>} */
    this.textContentToLocalize_ = new Map()
      .set(this.captionsNameSpan_, LocIds.LABEL_CAPTIONS)
      .set(this.backFromCaptionsSpan_, LocIds.LABEL_CAPTIONS)
      .set(this.captionsOffSpan_, LocIds.LABEL_CAPTIONS_OFF)
      .set(this.castNameSpan_, LocIds.LABEL_CAST)
      .set(this.backFromResolutionSpan_, LocIds.LABEL_RESOLUTION)
      .set(this.resolutionNameSpan_, LocIds.LABEL_RESOLUTION)
      .set(this.abrOnSpan_, LocIds.LABEL_AUTO_QUALITY)
      .set(this.languageNameSpan_, LocIds.LABEL_LANGUAGE)
      .set(this.backFromLanguageSpan_, LocIds.LABEL_LANGUAGE)
      .set(this.pipNameSpan_, LocIds.LABEL_PICTURE_IN_PICTURE);

    // Set all the localized strings with currently preferred language
    this.updateLocalizedStrings_();
  }


  /**
   * @private
   */
  initOptionalElementsToNull_() {
    /** @private {HTMLElement} */
    this.captionButton_ = null;

      /** @private {HTMLElement} */
    this.captionIcon_ = null;

    /** @private {HTMLElement} */
    this.castButton_ = null;

    /** @private {HTMLElement} */
    this.castIcon_ = null;

    /** @private {HTMLElement} */
    this.overflowMenuButton_ = null;

    /** @private {HTMLElement} */
    this.resolutionButton_ = null;

    /** @private {HTMLElement} */
    this.languagesButton_ = null;

    /** @private {HTMLElement} */
    this.resolutionMenu_ = null;

    /** @private {HTMLElement} */
    this.audioLangMenu_ = null;

    /** @private {HTMLElement} */
    this.textLangMenu_ = null;

    /** @private {HTMLElement} */
    this.currentResolution_ = null;

    /** @private {HTMLElement} */
    this.castNameSpan_ = null;

    /** @private {HTMLElement} */
    this.currentAudioLanguage_ = null;

    /** @private {HTMLElement} */
    this.currentCaptions_ = null;

    /** @private {HTMLElement} */
    this.captionsNameSpan_ = null;

    /** @private {HTMLElement} */
    this.backFromCaptionsSpan_ = null;

    /** @private {HTMLElement} */
    this.backFromResolutionButton_ = null;

    /** @private {HTMLElement} */
    this.backFromLanguageButton_ = null;

    /** @private {HTMLElement} */
    this.captionsOffSpan_ = null;

    /** @private {HTMLElement} */
    this.castCurrentSelectionSpan_ = null;

    /** @private {HTMLElement} */
    this.backFromResolutionSpan_ = null;

    /** @private {HTMLElement} */
    this.resolutionNameSpan_ = null;

    /** @private {HTMLElement} */
    this.languageNameSpan_ = null;

    /** @private {HTMLElement} */
    this.backFromLanguageSpan_ = null;

    /** @private {HTMLElement} */
    this.abrOnSpan_ = null;

    /** @private {HTMLElement} */
    this.backFromCaptionsButton_ = null;

    /** @private {HTMLElement} */
    this.pipButton_ = null;

    /** @private {HTMLElement} */
    this.pipNameSpan_ = null;

    /** @private {HTMLElement} */
    this.currentPipState_ = null;

    /** @private {HTMLElement} */
    this.pipIcon_ = null;
  }


  /**
   * @private
   */
  addOverflowMenu_() {
    /** @private {!HTMLElement} */
    this.overflowMenu_ = shaka.ui.Utils.createHTMLElement('div');
    this.overflowMenu_.classList.add('shaka-overflow-menu');
    this.overflowMenu_.classList.add('shaka-no-propagation');
    this.overflowMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.overflowMenu_.classList.add('shaka-settings-menu');
    this.controlsContainer_.appendChild(this.overflowMenu_);

    for (let i = 0; i < this.config_.overflowMenuButtons.length; i++) {
      const name = this.config_.overflowMenuButtons[i];
      if (this.elementNamesToFunctions_.get(name)) {
        this.elementNamesToFunctions_.get(name)();
      }
    }

    // Add settings menus
    if (this.config_.overflowMenuButtons.indexOf('quality') > -1) {
      this.addResolutionMenu_();
    }

    if (this.config_.overflowMenuButtons.indexOf('language') > -1) {
      this.addAudioLangMenu_();
    }

    if (this.config_.overflowMenuButtons.indexOf('captions') > -1) {
      this.addTextLangMenu_();
    }
  }


  /**
   * @private
   */
  addOverflowMenuButton_() {
    this.overflowMenuButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.overflowMenuButton_.classList.add('shaka-overflow-menu-button');
    this.overflowMenuButton_.classList.add('shaka-no-propagation');
    this.overflowMenuButton_.classList.add('material-icons');
    this.overflowMenuButton_.textContent =
      shaka.ui.Enums.MaterialDesignIcons.OPEN_OVERFLOW;
    this.parent.appendChild(this.overflowMenuButton_);
  }


  /**
   * @private
   */
  addCaptionButton_() {
    this.captionButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.captionButton_.classList.add('shaka-caption-button');
    this.captionIcon_ = shaka.ui.Utils.createHTMLElement('i');
    this.captionIcon_.classList.add('material-icons');
    this.captionIcon_.textContent =
      shaka.ui.Enums.MaterialDesignIcons.CLOSED_CAPTIONS;

    this.captionButton_.appendChild(this.captionIcon_);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');

    this.captionsNameSpan_ = shaka.ui.Utils.createHTMLElement('span');

    label.appendChild(this.captionsNameSpan_);

    this.currentCaptions_ = shaka.ui.Utils.createHTMLElement('span');
    this.currentCaptions_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentCaptions_);
    this.captionButton_.appendChild(label);
    this.overflowMenu_.appendChild(this.captionButton_);
  }


  /**
   * @private
   */
  addTextLangMenu_() {
    this.textLangMenu_ = shaka.ui.Utils.createHTMLElement('div');
    this.textLangMenu_.classList.add('shaka-text-languages');
    this.textLangMenu_.classList.add('shaka-no-propagation');
    this.textLangMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.textLangMenu_.classList.add('shaka-settings-menu');

    this.backFromCaptionsButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.backFromCaptionsButton_.classList.add('shaka-back-to-overflow-button');
    this.textLangMenu_.appendChild(this.backFromCaptionsButton_);

    const backIcon = shaka.ui.Utils.createHTMLElement('i');
    backIcon.classList.add('material-icons');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.BACK;
    this.backFromCaptionsButton_.appendChild(backIcon);

    this.backFromCaptionsSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.backFromCaptionsButton_.appendChild(this.backFromCaptionsSpan_);

    // Add the off option
    const off = shaka.ui.Utils.createHTMLElement('button');
    off.setAttribute('aria-selected', 'true');
    this.textLangMenu_.appendChild(off);

    const chosenIcon = shaka.ui.Utils.createHTMLElement('i');
    chosenIcon.classList.add('material-icons');
    chosenIcon.classList.add('shaka-chosen-item');
    // This text content is actually a material design icon.
    chosenIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.CHECKMARK;
    // Screen reader should ignore 'done'.
    chosenIcon.setAttribute('aria-hidden', 'true');
    off.appendChild(chosenIcon);

    this.captionsOffSpan_ = shaka.ui.Utils.createHTMLElement('span');

    this.captionsOffSpan_.classList.add('shaka-auto-span');
    off.appendChild(this.captionsOffSpan_);

    this.controlsContainer_.appendChild(this.textLangMenu_);
  }


  /**
   * @private
   */
  addCastButton_() {
    this.castButton_ = shaka.ui.Utils.createHTMLElement('button');

    this.castButton_.classList.add('shaka-cast-button');
    this.castButton_.classList.add('shaka-hidden');
    this.castButton_.setAttribute('aria-pressed', 'false');

    this.castIcon_ = shaka.ui.Utils.createHTMLElement('i');
    this.castIcon_.classList.add('material-icons');
    // This text content is actually a material design icon.
    this.castIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.CAST;
    this.castButton_.appendChild(this.castIcon_);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    this.castNameSpan_ = shaka.ui.Utils.createHTMLElement('span');
    label.appendChild(this.castNameSpan_);

    this.castCurrentSelectionSpan_ =
      shaka.ui.Utils.createHTMLElement('span');
    this.castCurrentSelectionSpan_.classList.add(
      'shaka-current-selection-span');
    label.appendChild(this.castCurrentSelectionSpan_);
    this.castButton_.appendChild(label);
    this.overflowMenu_.appendChild(this.castButton_);
  }


  /**
   * @private
   */
   addResolutionMenu_() {
    this.resolutionMenu_ = shaka.ui.Utils.createHTMLElement('div');
    this.resolutionMenu_.classList.add('shaka-resolutions');
    this.resolutionMenu_.classList.add('shaka-no-propagation');
    this.resolutionMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.resolutionMenu_.classList.add('shaka-settings-menu');

    this.backFromResolutionButton_ =
      shaka.ui.Utils.createHTMLElement('button');
    this.backFromResolutionButton_.classList.add(
      'shaka-back-to-overflow-button');
    this.resolutionMenu_.appendChild(this.backFromResolutionButton_);

    const backIcon = shaka.ui.Utils.createHTMLElement('i');
    backIcon.classList.add('material-icons');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.BACK;
    this.backFromResolutionButton_.appendChild(backIcon);

    this.backFromResolutionSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.backFromResolutionButton_.appendChild(this.backFromResolutionSpan_);


    // Add the abr option
    const auto = shaka.ui.Utils.createHTMLElement('button');
    auto.setAttribute('aria-selected', 'true');
    this.resolutionMenu_.appendChild(auto);

    const chosenIcon = shaka.ui.Utils.createHTMLElement('i');
    chosenIcon.classList.add('material-icons');
    chosenIcon.classList.add('shaka-chosen-item');
    chosenIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.CHECKMARK;
    // Screen reader should ignore the checkmark.
    chosenIcon.setAttribute('aria-hidden', 'true');
    auto.appendChild(chosenIcon);

    this.abrOnSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.abrOnSpan_.classList.add('shaka-auto-span');
    auto.appendChild(this.abrOnSpan_);

    this.controlsContainer_.appendChild(this.resolutionMenu_);
  }


  /**
   * @private
   */
  addResolutionButton_() {
    this.resolutionButton_ = shaka.ui.Utils.createHTMLElement('button');

    this.resolutionButton_.classList.add('shaka-resolution-button');

    const icon = shaka.ui.Utils.createHTMLElement('i');
    icon.classList.add('material-icons');
    icon.textContent = shaka.ui.Enums.MaterialDesignIcons.RESOLUTION;
    this.resolutionButton_.appendChild(icon);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    this.resolutionNameSpan_ = shaka.ui.Utils.createHTMLElement('span');
    label.appendChild(this.resolutionNameSpan_);

    this.currentResolution_ = shaka.ui.Utils.createHTMLElement('span');
    this.currentResolution_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentResolution_);
    this.resolutionButton_.appendChild(label);

    this.overflowMenu_.appendChild(this.resolutionButton_);
  }


  /**
   * @private
   */
  addAudioLangMenu_() {
    this.audioLangMenu_ = shaka.ui.Utils.createHTMLElement('div');
    this.audioLangMenu_.classList.add('shaka-audio-languages');
    this.audioLangMenu_.classList.add('shaka-no-propagation');
    this.audioLangMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.audioLangMenu_.classList.add('shaka-settings-menu');

    this.backFromLanguageButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.backFromLanguageButton_.classList.add('shaka-back-to-overflow-button');
    this.audioLangMenu_.appendChild(this.backFromLanguageButton_);

    const backIcon = shaka.ui.Utils.createHTMLElement('i');
    backIcon.classList.add('material-icons');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.BACK;
    this.backFromLanguageButton_.appendChild(backIcon);

    this.backFromLanguageSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.backFromLanguageButton_.appendChild(this.backFromLanguageSpan_);

    this.controlsContainer_.appendChild(this.audioLangMenu_);
  }


  /**
   * @private
   */
  addLanguagesButton_() {
    this.languagesButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.languagesButton_.classList.add('shaka-language-button');

    const icon = shaka.ui.Utils.createHTMLElement('i');
    icon.classList.add('material-icons');
    icon.textContent = shaka.ui.Enums.MaterialDesignIcons.LANGUAGE;
    this.languagesButton_.appendChild(icon);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    this.languageNameSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.languageNameSpan_.classList.add('languageSpan');
    label.appendChild(this.languageNameSpan_);

    this.currentAudioLanguage_ = shaka.ui.Utils.createHTMLElement('span');
    this.currentAudioLanguage_.classList.add('shaka-current-selection-span');
    const language = this.player.getConfiguration().preferredAudioLanguage;
    this.currentAudioLanguage_.textContent = this.getLanguageName_(language);
    label.appendChild(this.currentAudioLanguage_);

    this.languagesButton_.appendChild(label);

    this.overflowMenu_.appendChild(this.languagesButton_);
  }


  /**
   * @private
   */
  addPipButton_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.pipButton_.classList.add('shaka-pip-button');

    this.pipIcon_ = shaka.ui.Utils.createHTMLElement('i');
    this.pipIcon_.classList.add('material-icons');
    // This text content is actually a material design icon.
    // DO NOT LOCALIZE
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.PIP;
    this.pipButton_.appendChild(this.pipIcon_);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    this.pipNameSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.pipNameSpan_.textContent =
      this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE);
    label.appendChild(this.pipNameSpan_);

    this.currentPipState_ = shaka.ui.Utils.createHTMLElement('span');
    this.currentPipState_.classList.add('shaka-current-selection-span');
    this.currentPipState_.textContent =
      this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE_OFF);
    label.appendChild(this.currentPipState_);

    this.pipButton_.appendChild(label);

    this.overflowMenu_.appendChild(this.pipButton_);

    // Don't display the button if PiP is not supported or not allowed
    // TODO: Can this ever change? Is it worth creating the button if the below
    // condition is true?
    if (!this.isPipAllowed_()) {
      shaka.ui.Controls.setDisplay(this.pipButton_, false);
    }
  }


  /**
   * @return {boolean}
   * @private
   */
  isPipAllowed_() {
    return document.pictureInPictureEnabled &&
        !this.video.disablePictureInPicture;
  }


  /** @private */
  onCaptionClick_() {
    shaka.ui.Controls.setDisplay(this.overflowMenu_, false);
    shaka.ui.Controls.setDisplay(this.textLangMenu_, true);
    // Focus on the currently selected language button.
    this.focusOnTheChosenItem_(this.textLangMenu_);
  }


  /** @private */
  onResolutionClick_() {
    shaka.ui.Controls.setDisplay(this.overflowMenu_, false);
    shaka.ui.Controls.setDisplay(this.resolutionMenu_, true);
    // Focus on the currently selected resolution button.
    this.focusOnTheChosenItem_(this.resolutionMenu_);
  }


  /** @private */
  onLanguagesClick_() {
    shaka.ui.Controls.setDisplay(this.overflowMenu_, false);
    shaka.ui.Controls.setDisplay(this.audioLangMenu_, true);
    // Focus on the currently selected language button.
    this.focusOnTheChosenItem_(this.audioLangMenu_);
  }


  /** @private */
  onTracksChange_() {
    // TS content might have captions embedded in video stream, we can't know
    // until we start transmuxing. So, always show caption button if we're
    // playing TS content.
    if (this.captionButton_) {
      if (shaka.ui.Utils.isTsContent(this.player)) {
        shaka.ui.Controls.setDisplay(this.captionButton_, true);
      } else {
        let hasText = this.player.getTextTracks().length;
        shaka.ui.Controls.setDisplay(this.captionButton_, hasText > 0);
      }
    }

    // Update language and resolution selections
    this.updateResolutionSelection_();
    this.updateAudioLanguages_();
    this.updateTextLanguages_();
  }


  /** @private */
  onVariantChange_() {
    // Update language and resolution selections
    this.updateResolutionSelection_();
    this.updateAudioLanguages_();
  }


  /** @private */
  updateResolutionSelection_() {
    // Only applicable if resolution button is a part of the UI
    if (!this.resolutionButton_ || !this.resolutionMenu_) {
      return;
    }

    let tracks = this.player.getVariantTracks();
    // Hide resolution menu and button for audio-only content.
    if (tracks.length && !tracks[0].height) {
      shaka.ui.Controls.setDisplay(this.resolutionMenu_, false);
      shaka.ui.Controls.setDisplay(this.resolutionButton_, false);
      return;
    }
    tracks.sort(function(t1, t2) {
      return t1.height - t2.height;
    });
    tracks.reverse();

    // If there is a selected variant track, then we filtering out any tracks in
    // a different language.  Then we use those remaining tracks to display the
    // available resolutions.
    const selectedTrack = tracks.find((track) => track.active);
    if (selectedTrack) {
      const language = selectedTrack.language;
      // Filter by current audio language.
      tracks = tracks.filter(function(track) {
        return track.language == language;
      });
    }

    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.resolutionMenu_, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    while (this.resolutionMenu_.firstChild) {
      this.resolutionMenu_.removeChild(this.resolutionMenu_.firstChild);
    }

    // 3. Add the backTo Menu button back
    this.resolutionMenu_.appendChild(backButton);

    const abrEnabled = this.player.getConfiguration().abr.enabled;

    // Add new ones
    tracks.forEach((track) => {
      let button = shaka.ui.Utils.createHTMLElement('button');
      button.classList.add('explicit-resolution');
      button.addEventListener('click',
          this.onTrackSelected_.bind(this, track));

      let span = shaka.ui.Utils.createHTMLElement('span');
      span.textContent = track.height + 'p';
      button.appendChild(span);

      if (!abrEnabled && track == selectedTrack) {
        // If abr is disabled, mark the selected track's
        // resolution.
        button.setAttribute('aria-selected', 'true');
        button.appendChild(this.chosenIcon_());
        span.classList.add('shaka-chosen-item');
        this.currentResolution_.textContent = span.textContent;
      }
      this.resolutionMenu_.appendChild(button);
    });

    // Add the Auto button
    let autoButton = shaka.ui.Utils.createHTMLElement('button');
    autoButton.addEventListener('click', function() {
      let config = {abr: {enabled: true}};
      this.player.configure(config);
      this.updateResolutionSelection_();
    }.bind(this));

    let autoSpan = shaka.ui.Utils.createHTMLElement('span');
    autoSpan.textContent =
      this.localization.resolve(shaka.ui.Locales.Ids.LABEL_AUTO_QUALITY);
    autoButton.appendChild(autoSpan);

    // If abr is enabled reflect it by marking 'Auto'
    // as selected.
    if (abrEnabled) {
      autoButton.setAttribute('aria-selected', 'true');
      autoButton.appendChild(this.chosenIcon_());

      autoSpan.classList.add('shaka-chosen-item');

      this.currentResolution_.textContent =
        this.localization.resolve(shaka.ui.Locales.Ids.LABEL_AUTO_QUALITY);
    }

    this.resolutionMenu_.appendChild(autoButton);
    this.focusOnTheChosenItem_(this.resolutionMenu_);
  }


  /** @private */
  updateAudioLanguages_() {
    // Only applicable if language button is a part of the UI
    if (!this.languagesButton_ ||
        !this.audioLangMenu_ || !this.currentAudioLanguage_) {
      return;
    }

    const tracks = this.player.getVariantTracks();

    const languagesAndRoles = this.player.getAudioLanguagesAndRoles();
    const languages = languagesAndRoles.map((langAndRole) => {
      return langAndRole.language;
    });

    this.updateLanguages_(tracks, this.audioLangMenu_, languages,
      this.onAudioLanguageSelected_, /* updateChosen */ true,
      this.currentAudioLanguage_);
    this.focusOnTheChosenItem_(this.audioLangMenu_);
  }


  /** @private */
  updateTextLanguages_() {
    // Only applicable if captions button is a part of the UI
    if (!this.captionButton_ || !this.textLangMenu_ ||
        !this.currentCaptions_) {
      return;
    }

    const tracks = this.player.getTextTracks();

    const languagesAndRoles = this.player.getTextLanguagesAndRoles();
    const languages = languagesAndRoles.map((langAndRole) => {
      return langAndRole.language;
    });

    this.updateLanguages_(tracks, this.textLangMenu_, languages,
      this.onTextLanguageSelected_,
      /* Don't mark current text language as chosen unless
      captions are enabled */
      this.player.isTextTrackVisible(),
      this.currentCaptions_);

    // Add the Off button
    let offButton = shaka.ui.Utils.createHTMLElement('button');
    offButton.addEventListener('click', () => {
      this.player.setTextTrackVisibility(false);
      this.updateTextLanguages_();
    });

    offButton.appendChild(this.captionsOffSpan_);

    this.textLangMenu_.appendChild(offButton);

    if (!this.player.isTextTrackVisible()) {
      offButton.setAttribute('aria-selected', 'true');
      offButton.appendChild(this.chosenIcon_());
      this.captionsOffSpan_.classList.add('shaka-chosen-item');
      this.currentCaptions_.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.LABEL_CAPTIONS_OFF);
    }

    this.focusOnTheChosenItem_(this.textLangMenu_);
  }


  /**
   * @param {!Array.<shaka.extern.Track>} tracks
   * @param {!HTMLElement} langMenu
   * @param {!Array.<string>} languages
   * @param {function(string)} onLanguageSelected
   * @param {boolean} updateChosen
   * @param {!HTMLElement} currentSelectionElement
   * @private
   */
  updateLanguages_(tracks, langMenu, languages, onLanguageSelected,
      updateChosen, currentSelectionElement) {
    // Using array.filter(f)[0] as an alternative to array.find(f) which is
    // not supported in IE11.
    const activeTracks = tracks.filter(function(track) {
      return track.active == true;
    });
    const selectedTrack = activeTracks[0];

    // Remove old languages
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
      langMenu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    while (langMenu.firstChild) {
      langMenu.removeChild(langMenu.firstChild);
    }

    // 3. Add the backTo Menu button back
    langMenu.appendChild(backButton);

    // 4. Add new buttons
    languages.forEach((language) => {
      let button = shaka.ui.Utils.createHTMLElement('button');
      button.addEventListener('click', onLanguageSelected.bind(this, language));

      let span = shaka.ui.Utils.createHTMLElement('span');
      span.textContent = this.getLanguageName_(language);
      button.appendChild(span);

      if (updateChosen && (language == selectedTrack.language)) {
        button.appendChild(this.chosenIcon_());
        span.classList.add('shaka-chosen-item');
        button.setAttribute('aria-selected', 'true');
        currentSelectionElement.textContent = span.textContent;
      }
      langMenu.appendChild(button);
    });
  }


  /**
   * Returns the language's name for itself in its own script (autoglottonym),
   *  if we have it.
   *
   * If the locale, including region, can be mapped to a name, we return a very
   * specific name including the region.  For example, "de-AT" would map to
   * "Deutsch (Österreich)" or Austrian German.
   *
   * If only the language part of the locale is in our map, we append the locale
   * itself for specificity.  For example, "ar-EG" (Egyptian Arabic) would map
   * to "ﺎﻠﻋﺮﺒﻳﺓ (ar-EG)".  In this way, multiple versions of Arabic whose
   * regions are not in our map would not all look the same in the language
   * list, but could be distinguished by their locale.
   *
   * Finally, if language part of the locale is not in our map, we label it
   * "unknown", as translated to the UI locale, and we append the locale itself
   * for specificity.  For example, "sjn" would map to "Unknown (sjn)".  In this
   * way, multiple unrecognized languages would not all look the same in the
   * language list, but could be distinguished by their locale.
   *
   * @param {string} locale
   * @return {string} The language's name for itself in its own script, or as
   *   close as we can get with the information we have.
   * @private
   */
  getLanguageName_(locale) {
    if (!locale) {
      return '';
    }

    // Shorthand for resolving a localization ID.
    const resolve = (id) => this.localization.resolve(id);

    // Handle some special cases first.  These are reserved language tags that
    // are used to indicate something that isn't one specific language.
    switch (locale) {
      case 'mul':
        return resolve(shaka.ui.Locales.Ids.LABEL_MULTIPLE_LANGUAGES);
      case 'zxx':
        return resolve(shaka.ui.Locales.Ids.LABEL_NOT_APPLICABLE);
    }

    // Extract the base language from the locale as a fallback step.
    const language = shaka.util.LanguageUtils.getBase(locale);

    // First try to resolve the full language name.
    // If that fails, try the base.
    // Finally, report "unknown".
    // When there is a loss of specificity (either to a base language or to
    // "unknown"), we should append the original language code.
    // Otherwise, there may be multiple identical-looking items in the list.
    if (locale in mozilla.LanguageMapping) {
      return mozilla.LanguageMapping[locale].nativeName;
    } else if (language in mozilla.LanguageMapping) {
      return mozilla.LanguageMapping[language].nativeName +
          ' (' + locale + ')';
    } else {
      return resolve(shaka.ui.Locales.Ids.LABEL_UNKNOWN_LANGUAGE) +
          ' (' + locale + ')';
    }
  }


  /**
   * @param {!shaka.extern.Track} track
   * @private
   */
  onTrackSelected_(track) {
    // Disable abr manager before changing tracks.
    let config = {abr: {enabled: false}};
    this.player.configure(config);

    this.player.selectVariantTrack(track, /* clearBuffer */ true);
  }


  /**
   * @param {string} language
   * @private
   */
  onAudioLanguageSelected_(language) {
    this.player.selectAudioLanguage(language);
  }


  /**
   * @param {string} language
   * @return {!Promise}
   * @private
   */
  async onTextLanguageSelected_(language) {
    await this.player.setTextTrackVisibility(true);
    this.player.selectTextLanguage(language);
  }


  /**
   * @param {HTMLElement} menu
   * @private
   */
  focusOnTheChosenItem_(menu) {
    if (!menu) return;
    const chosenItem = shaka.ui.Utils.getDescendantIfExists(
      menu, 'shaka-chosen-item');
    if (chosenItem) {
      chosenItem.parentElement.focus();
    }
  }


  /**
   * @return {!Element}
   * @private
   */
  chosenIcon_() {
    let chosenIcon = shaka.ui.Utils.createHTMLElement('i');
    chosenIcon.classList.add('material-icons');
    chosenIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.CHECKMARK;
    // Screen reader should ignore 'done'.
    chosenIcon.setAttribute('aria-hidden', 'true');
    return chosenIcon;
  }


  /** @private */
  onCaptionStateChange_() {
    if (this.captionIcon_) {
      if (this.player.isTextTrackVisible()) {
        this.captionIcon_.classList.add('shaka-captions-on');
        this.captionIcon_.classList.remove('shaka-captions-off');
      } else {
        this.captionIcon_.classList.add('shaka-captions-off');
        this.captionIcon_.classList.remove('shaka-captions-on');
      }
    }
  }


  /** @private */
  async onCastClick_() {
    if (this.castProxy_.isCasting()) {
      this.castProxy_.suggestDisconnect();
    } else {
      this.castButton_.disabled = true;
      this.castProxy_.cast().then(function() {
        this.castButton_.disabled = false;
        // Success!
      }.bind(this), function(error) {
        this.castButton_.disabled = false;
        if (error.code != shaka.util.Error.Code.CAST_CANCELED_BY_USER) {
          this.controls.dispatchEvent(new shaka.util.FakeEvent('error', {
            errorDetails: error,
          }));
        }
      }.bind(this));

      // If we're in picture-in-picture state, exit
      if (document.pictureInPictureElement && this.pipButton_ != null) {
        await this.onPipClick_();
      }
    }
  }


  /**
   * @return {!Promise}
   * @private
   */
  async onPipClick_() {
    try {
      if (!document.pictureInPictureElement) {
        await this.video.requestPictureInPicture();
      } else {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      this.controls.dispatchEvent(new shaka.util.FakeEvent('error', {
        errorDetails: error,
      }));
    }
  }


  /** @private */
  onEnterPictureInPicture_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.EXIT_PIP;
    this.pipButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.ARIA_LABEL_EXIT_PICTURE_IN_PICTURE));
    this.currentPipState_.textContent =
        this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE_ON);
  }


  /** @private */
  onLeavePictureInPicture_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.PIP;
    this.pipButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.ARIA_LABEL_ENTER_PICTURE_IN_PICTURE));
    this.currentPipState_.textContent =
        this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE_OFF);
  }


  /** @private */
  onOverflowMenuButtonClick_() {
    if (this.controls.anySettingsMenusAreOpen()) {
      this.controls.hideSettingsMenus();
    } else {
      shaka.ui.Controls.setDisplay(this.overflowMenu_, true);
      this.controls.overrideCssShowControls();
      // If overflow menu has currently visible buttons, focus on the
      // first one, when the menu opens.
      const isDisplayed = function(element) {
        return element.classList.contains('shaka-hidden') == false;
      };

      const Iterables = shaka.util.Iterables;
      if (Iterables.some(this.overflowMenu_.childNodes, isDisplayed)) {
        // Focus on the first visible child of the overflow menu
        const visibleElements =
          Iterables.filter(this.overflowMenu_.childNodes, isDisplayed);
        /** @type {!HTMLElement} */ (visibleElements[0]).focus();
      }
    }
  }


  /**
   * @private
   */
  setCurrentCastSelection_() {
    if (!this.castCurrentSelectionSpan_) {
      return;
    }

    if (this.castProxy_.isCasting()) {
      this.castCurrentSelectionSpan_.textContent =
          this.castProxy_.receiverName();
    } else {
      this.castCurrentSelectionSpan_.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.LABEL_NOT_CASTING);
    }
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    // Localize aria labels
    let elements = this.ariaLabels_.keys();
    for (const element of elements) {
      if (element == null) {
        continue;
      }

      const id = this.ariaLabels_.get(element);
      element.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization.resolve(id));
    }

    // Localize state-dependant labels
    if (this.pipButton_) {
      const pipAriaLabel = document.pictureInPictureElement ?
                           LocIds.ARIA_LABEL_EXIT_PICTURE_IN_PICTURE :
                           LocIds.ARIA_LABEL_ENTER_PICTURE_IN_PICTURE;
      this.pipButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
          this.localization.resolve(pipAriaLabel));

      const currentPipState = document.pictureInPictureElement ?
                              LocIds.LABEL_PICTURE_IN_PICTURE_ON :
                              LocIds.LABEL_PICTURE_IN_PICTURE_OFF;

      this.currentPipState_.textContent =
          this.localization.resolve(currentPipState);
    }

    // If we're not casting, string "not casting" will be displayed,
    // which needs localization.
    this.setCurrentCastSelection_();

    // If we're at "auto" resolution, this string needs localization.
    this.updateResolutionSelection_();

    // If captions/subtitles are off, this string needs localization.
    this.updateTextLanguages_();

    // Localize text
    elements = this.textContentToLocalize_.keys();
    for (const element of elements) {
      if (element == null) {
        continue;
      }

      const id = this.textContentToLocalize_.get(element);
      element.textContent = this.localization.resolve(id);
    }
  }

  /**
   * @param {Event} e
   * @private
   */
  onCastStatusChange_(e) {
    const canCast = this.castProxy_.canCast() && this.controls.isCastAllowed();
    const isCasting = e['newStatus'];
    if (this.castButton_) {
      const materialDesignIcons = shaka.ui.Enums.MaterialDesignIcons;
      shaka.ui.Controls.setDisplay(this.castButton_, canCast);
      this.castIcon_.textContent = isCasting ?
                                   materialDesignIcons.EXIT_CAST :
                                   materialDesignIcons.CAST;

      // Aria-pressed set to true when casting, set to false otherwise.
      if (canCast) {
        if (isCasting) {
          this.castButton_.setAttribute('aria-pressed', 'true');
        } else {
          this.castButton_.setAttribute('aria-pressed', 'false');
        }
      }
    }

    this.setCurrentCastSelection_();

    const pipIsEnabled = (this.isPipAllowed_() && (this.pipButton_ != null));
    if (isCasting) {
      // Picture-in-picture is not applicable if we're casting
      if (pipIsEnabled) {
        shaka.ui.Controls.setDisplay(this.pipButton_, false);
      }
    } else {
      if (pipIsEnabled) {
        shaka.ui.Controls.setDisplay(this.pipButton_, true);
      }
    }
  }


  /**
   * Resolve a special language code to a name/description enum.
   *
   * @param {string} lang
   * @return {string}
   */
  resolveSpecialLanguageCode_(lang) {
    if (lang == 'mul') {
      return shaka.ui.Locales.Ids.LABEL_MULTIPLE_LANGUAGES;
    } else if (lang == 'zxx') {
      return shaka.ui.Locales.Ids.LABEL_NOT_APPLICABLE;
    } else {
      return shaka.ui.Locales.Ids.LABEL_UNKNOWN_LANGUAGE;
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.OverflowMenu.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.OverflowMenu(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
  'overflow_menu', new shaka.ui.OverflowMenu.Factory());

