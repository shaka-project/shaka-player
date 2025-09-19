/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VideoTypeSelection');

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

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
          this.updateVideoRoles_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
          this.updateVideoRoles_();
        });


    this.eventManager.listen(this.player, 'loading', () => {
      this.updateVideoRoles_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.updateVideoRoles_();
    });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.updateVideoRoles_();
    });

    this.eventManager.listen(this.player, 'variantchanged', () => {
      this.updateVideoRoles_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateVideoRoles_();
    });

    this.eventManager.listen(this.player, 'abrstatuschanged', () => {
      this.updateVideoRoles_();
    });

    this.eventManager.listen(this.player, 'adaptation', () => {
      this.updateVideoRoles_();
    });

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();
    this.updateVideoRoles_();
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.button.ariaLabel = this.localization.resolve(LocIds.VIDEO_TYPE);
    this.nameSpan.textContent = this.localization.resolve(LocIds.VIDEO_TYPE);
    this.backSpan.textContent = this.localization.resolve(LocIds.VIDEO_TYPE);
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

    const roles = new Set();
    for (const track of tracks) {
      for (const role of track.roles) {
        if (role) {
          roles.add(role);
        }
      }
    };

    if (roles.size <= 1) {
      shaka.ui.Utils.setDisplay(this.button, false);
      return;
    }

    for (const role of roles) {
      const button = shaka.util.Dom.createButton();
      this.eventManager.listen(button, 'click',
          () => this.onVideoRoleSelected_(role));

      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = this.getRoleLabel_(role);
      button.appendChild(span);

      if (selectedTrack.roles.includes(role)) {
        button.ariaSelected = 'true';
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        this.currentSelection.textContent = span.textContent;
      }
      this.menu.appendChild(button);
    }

    shaka.ui.Utils.setDisplay(this.button, true);
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
   * @param {string} role
   * @private
   */
  onVideoRoleSelected_(role) {
    this.player.configure('preferredVideoRole', role);
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
