/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VideoTypeSelection');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.LanguageUtils');
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
shaka.ui.VideoTypeSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['VIDEO_TYPE']);

    this.button.classList.add('shaka-playbackrate-button');
    this.menu.classList.add('shaka-video-type');
    this.button.classList.add('shaka-tooltip-status');

    this.eventManager.listenMulti(
        this.player,
        [
          'loading',
          'loaded',
          'unloading',
          'variantchanged',
          'trackschanged',
          'abrstatuschanged',
          'adaptation',
        ], () => {
          this.updateVideoRoles_();
        });

    this.updateLocalizedStrings();
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const label = this.localization.resolve(LocIds.VIDEO_TYPE);
    this.button.ariaLabel = label;
    this.nameSpan.textContent = label;
    this.backSpan.textContent = label;

    this.updateVideoRoles_();
  }

  /** @override */
  checkAvailability() {
    this.updateVideoRoles_();
  }

  /**
   * @private
   */
  updateVideoRoles_() {
    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);


    /** @type {!Array<shaka.extern.VideoTrack>} */
    const tracks = this.player.getVideoTracks() || [];

    const selectedTrack = tracks.find((track) => track.active);

    const isSelectedTrack = (role, language, label) => {
      if (!selectedTrack) {
        return false;
      }
      if (language != selectedTrack.language) {
        return false;
      }
      if (label != selectedTrack.label) {
        return false;
      }
      if (role == '' && !selectedTrack.roles.length) {
        return true;
      }
      return selectedTrack.roles.includes(role);
    };

    /**
     * @type {!Map<string, {role: string, language: string, label: ?string}>}
     */
    const options = new Map();
    for (const track of tracks) {
      const roles = track.roles.slice();
      if (!roles.length) {
        roles.push('');
      }
      for (const role of roles) {
        const key = role + '\0' + track.language + '\0' + track.label;
        if (!options.has(key)) {
          options.set(key, {
            role,
            language: track.language,
            label: track.label,
          });
        }
      }
    }

    // Only surface the video language in the label when it actually helps
    // distinguish the options (i.e. more than one option has a real,
    // non-'und' language).  Otherwise, keep the previous role-only behavior.
    const realLanguages = new Set();
    const distinctRoles = new Set();
    for (const option of options.values()) {
      if (option.language) {
        realLanguages.add(option.language);
      }
      if (option.label) {
        realLanguages.add(option.label);
      }
      distinctRoles.add(option.role);
    }
    const showLanguage = realLanguages.size > 1;
    // If every option shares the same role, the role adds no information
    // (it's identical on every button); show the language alone instead of
    // repeating a redundant role prefix on each entry.
    const roleIsRedundant = showLanguage && distinctRoles.size == 1;

    if (options.size > 1) {
      for (const {role, language, label} of options.values()) {
        const button = shaka.util.Dom.createButton();
        // ARIA: single-select menu item
        button.setAttribute('role', 'menuitemradio');
        button.setAttribute('aria-checked', 'false');
        this.eventManager.listen(button, 'click',
            () => this.onVideoRoleSelected_(role, language, label));

        const span = shaka.util.Dom.createHTMLElement('span');
        const hasRealLanguage = (language && language != 'und') || label;
        if (roleIsRedundant && hasRealLanguage) {
          span.textContent = this.getLanguageLabel_(language, label);
        } else {
          span.textContent = this.getRoleLabel_(role);
          if (showLanguage && hasRealLanguage) {
            span.textContent +=
                ' (' + this.getLanguageLabel_(language, label) + ')';
          }
        }
        button.appendChild(span);

        if (isSelectedTrack(role, language, label)) {
          button.appendChild(shaka.ui.Utils.checkmarkIcon());
          shaka.ui.Utils.setChosenItem(button, span);
          this.currentSelection.textContent = span.textContent;
        }
        this.menu.appendChild(button);
      }
    }

    shaka.ui.Utils.setDisplay(
        this.button, options.size > 1 && !this.isSubMenuOpened);
  }

  /**
   * @param {string} role
   * @return {string}
   * @private
   */
  getRoleLabel_(role) {
    const LocIds = shaka.ui.Locales.Ids;
    switch (role) {
      case 'main':
      case '':
        return this.localization.resolve(LocIds.VIDEO_MAIN);
      case 'sign':
        return this.localization.resolve(LocIds.VIDEO_SIGN);
      default:
        return role;
    }
  }

  /**
   * @param {string} language
   * @param {?string} label
   * @return {string}
   * @private
   */
  getLanguageLabel_(language, label) {
    if (label) {
      return label;
    }
    const preferIntlDisplayNames =
        this.controls.getConfig().preferIntlDisplayNames;
    const name = shaka.ui.LanguageUtils.getLanguageName(
        language, this.localization, preferIntlDisplayNames);
    if (name) {
      return name;
    }
    return this.localization.resolve(
        shaka.ui.Locales.Ids.UNRECOGNIZED_LANGUAGE) + ' (' + language + ')';
  }

  /**
   * @param {string} role
   * @param {string} language
   * @param {?string} label
   * @private
   */
  onVideoRoleSelected_(role, language, label) {
    this.player.configure({
      preferredVideo: [{
        role,
        label: label || '',
        language: language || '',
        codec: '',
        hdrLevel: '',
        layout: '',
      }],
    });
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.VideoTypeSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.VideoTypeSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'video_type', new shaka.ui.VideoTypeSelection.Factory());

shaka.ui.Controls.registerElement(
    'video_type', new shaka.ui.VideoTypeSelection.Factory());
