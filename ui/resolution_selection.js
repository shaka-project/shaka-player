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


goog.provide('shaka.ui.ResolutionSelection');

goog.require('shaka.ui.Enums');
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
shaka.ui.ResolutionSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignIcons.RESOLUTION);

    this.button.classList.add('shaka-resolution-button');
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

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();
  }


  /** @private */
  updateResolutionSelection_() {
    /** @type {!Array.<shaka.extern.Track>} */
    let tracks = this.player.getVariantTracks();

    // Hide resolution menu and button for audio-only content and src= content
    // without resolution information.
    // TODO: for audio-only content, this should be a bitrate selection menu
    // instead.
    if (tracks.length && !tracks[0].height) {
      shaka.ui.Utils.setDisplay(this.menu, false);
      shaka.ui.Utils.setDisplay(this.button, false);
      return;
    }
    // Otherwise, restore it.
    shaka.ui.Utils.setDisplay(this.button, true);

    tracks.sort((t1, t2) => {
      return t2.height - t1.height;
    });

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

    // Remove duplicate entries with the same height.  This can happen if
    // we have multiple resolutions of audio.  Pick an arbitrary one.
    tracks = tracks.filter((track, idx) => {
      // Keep the first one with the same height.
      const otherIdx = tracks.findIndex((t) => t.height == track.height);
      return otherIdx == idx;
    });

    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.ui.Utils.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    const abrEnabled = this.player.getConfiguration().abr.enabled;

    // Add new ones
    tracks.forEach((track) => {
      const button = shaka.util.Dom.createHTMLElement('button');
      button.classList.add('explicit-resolution');
      this.eventManager.listen(button, 'click',
          this.onTrackSelected_.bind(this, track));

      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = track.height + 'p';
      button.appendChild(span);

      if (!abrEnabled && track == selectedTrack) {
        // If abr is disabled, mark the selected track's resolution.
        button.setAttribute('aria-selected', 'true');
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        this.currentSelection.textContent = span.textContent;
      }
      this.menu.appendChild(button);
    });

    // Add the Auto button
    const autoButton = shaka.util.Dom.createHTMLElement('button');
    autoButton.classList.add('shaka-enable-abr-button');
    this.eventManager.listen(autoButton, 'click', function() {
      const config = {abr: {enabled: true}};
      this.player.configure(config);
      this.updateResolutionSelection_();
    }.bind(this));

    /** @private {!HTMLElement}*/
    this.abrOnSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.abrOnSpan_.classList.add('shaka-auto-span');
    this.abrOnSpan_.textContent =
        this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    autoButton.appendChild(this.abrOnSpan_);

    // If abr is enabled reflect it by marking 'Auto' as selected.
    if (abrEnabled) {
      autoButton.setAttribute('aria-selected', 'true');
      autoButton.appendChild(shaka.ui.Utils.checkmarkIcon());

      this.abrOnSpan_.classList.add('shaka-chosen-item');

      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    }

    this.menu.appendChild(autoButton);
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('resolutionselectionupdated'));
  }


  /**
   * @param {!shaka.extern.Track} track
   * @private
   */
  onTrackSelected_(track) {
    // Disable abr manager before changing tracks.
    let config = {abr: {enabled: false}};
    this.player.configure(config);
    const clearBuffer = this.controls.getConfig().clearBufferOnQualityChange;
    this.player.selectVariantTrack(track, clearBuffer);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.button.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.RESOLUTION));
    this.backButton.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.RESOLUTION));
    this.backSpan.textContent =
        this.localization.resolve(LocIds.RESOLUTION);
    this.nameSpan.textContent =
        this.localization.resolve(LocIds.RESOLUTION);
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
