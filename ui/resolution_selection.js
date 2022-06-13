/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ResolutionSelection');

goog.require('goog.asserts');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
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
shaka.ui.ResolutionSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignIcons.RESOLUTION);

    this.button.classList.add('shaka-resolution-button');
    this.button.classList.add('shaka-tooltip-status');
    this.menu.classList.add('shaka-resolutions');

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });


    this.eventManager.listen(this.player, 'variantchanged', () => {
      this.updateResolutionSelection_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateResolutionSelection_();
    });

    this.eventManager.listen(this.player, 'abrstatuschanged', () => {
      this.updateResolutionSelection_();
    });

    this.updateResolutionSelection_();
  }


  /** @private */
  updateResolutionSelection_() {
    /** @type {!Array.<shaka.extern.Track>} */
    let tracks = this.player.getVariantTracks();

    // If there is a selected variant track, then we filter out any tracks in
    // a different language.  Then we use those remaining tracks to display the
    // available resolutions.
    const selectedTrack = tracks.find((track) => track.active);
    if (selectedTrack) {
      // Filter by current audio language and channel count.
      tracks = tracks.filter(
          (track) => track.language == selectedTrack.language &&
              track.channelsCount == selectedTrack.channelsCount);
    }

    // Remove duplicate entries with the same resolution or quality depending
    // on content type.  Pick an arbitrary one.
    tracks = tracks.filter((track, idx) => {
      // Keep the first one with the same height or bandwidth.
      const otherIdx = this.player.isAudioOnly() ?
          tracks.findIndex((t) => t.bandwidth == track.bandwidth) :
          tracks.findIndex((t) => t.height == track.height);
      return otherIdx == idx;
    });

    // Sort the tracks by height or bandwidth depending on content type.
    if (this.player.isAudioOnly()) {
      tracks.sort((t1, t2) => {
        goog.asserts.assert(t1.bandwidth != null, 'Null bandwidth');
        goog.asserts.assert(t2.bandwidth != null, 'Null bandwidth');
        return t2.bandwidth - t1.bandwidth;
      });
    } else {
      tracks.sort((t1, t2) => {
        goog.asserts.assert(t1.height != null, 'Null height');
        goog.asserts.assert(t2.height != null, 'Null height');
        return t2.height - t1.height;
      });
    }

    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    const abrEnabled = this.player.getConfiguration().abr.enabled;

    // Add new ones
    for (const track of tracks) {
      const button = shaka.util.Dom.createButton();
      button.classList.add('explicit-resolution');
      this.eventManager.listen(button, 'click',
          () => this.onTrackSelected_(track));

      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = this.player.isAudioOnly() ?
          Math.round(track.bandwidth / 1000) + ' kbits/s' : track.height + 'p';
      button.appendChild(span);

      if (!abrEnabled && track == selectedTrack) {
        // If abr is disabled, mark the selected track's resolution.
        button.ariaSelected = 'true';
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        this.currentSelection.textContent = span.textContent;
      }
      this.menu.appendChild(button);
    }

    // Add the Auto button
    const autoButton = shaka.util.Dom.createButton();
    autoButton.classList.add('shaka-enable-abr-button');
    this.eventManager.listen(autoButton, 'click', () => {
      const config = {abr: {enabled: true}};
      this.player.configure(config);
      this.updateResolutionSelection_();
    });

    /** @private {!HTMLElement}*/
    this.abrOnSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.abrOnSpan_.classList.add('shaka-auto-span');
    this.abrOnSpan_.textContent =
        this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    autoButton.appendChild(this.abrOnSpan_);

    // If abr is enabled reflect it by marking 'Auto' as selected.
    if (abrEnabled) {
      autoButton.ariaSelected = 'true';
      autoButton.appendChild(shaka.ui.Utils.checkmarkIcon());

      this.abrOnSpan_.classList.add('shaka-chosen-item');

      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    }

    this.button.setAttribute('shaka-status', this.currentSelection.textContent);

    this.menu.appendChild(autoButton);
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('resolutionselectionupdated'));

    this.updateLocalizedStrings_();
  }


  /**
   * @param {!shaka.extern.Track} track
   * @private
   */
  onTrackSelected_(track) {
    // Disable abr manager before changing tracks.
    const config = {abr: {enabled: false}};
    this.player.configure(config);
    const clearBuffer = this.controls.getConfig().clearBufferOnQualityChange;
    this.player.selectVariantTrack(track, clearBuffer);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    const locId = this.player.isAudioOnly() ?
        LocIds.QUALITY : LocIds.RESOLUTION;

    this.button.ariaLabel = this.localization.resolve(locId);
    this.backButton.ariaLabel = this.localization.resolve(locId);
    this.backSpan.textContent =
        this.localization.resolve(locId);
    this.nameSpan.textContent =
        this.localization.resolve(locId);
    this.abrOnSpan_.textContent =
        this.localization.resolve(LocIds.AUTO_QUALITY);

    if (this.player.getConfiguration().abr.enabled) {
      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.ResolutionSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.ResolutionSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'quality', new shaka.ui.ResolutionSelection.Factory());

shaka.ui.Controls.registerElement(
    'quality', new shaka.ui.ResolutionSelection.Factory());
