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

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.ResolutionSelection = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.addResolutionButton_();

    this.addResolutionMenu_();

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateLocalizedStrings_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateLocalizedStrings_();
      });

    this.eventManager.listen(this.resolutionButton_, 'click', () => {
          this.onResolutionClick_();
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


  /**
   * @private
   */
  addResolutionButton_() {
    /** @private {!HTMLElement}*/
    this.resolutionButton_ = shaka.util.Dom.createHTMLElement('button');

    this.resolutionButton_.classList.add('shaka-resolution-button');

    const icon = shaka.util.Dom.createHTMLElement('i');
    icon.classList.add('material-icons');
    icon.textContent = shaka.ui.Enums.MaterialDesignIcons.RESOLUTION;
    this.resolutionButton_.appendChild(icon);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');

    /** @private {!HTMLElement}*/
    this.resolutionNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.resolutionNameSpan_);

    /** @private {!HTMLElement}*/
    this.currentResolution_ = shaka.util.Dom.createHTMLElement('span');
    this.currentResolution_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentResolution_);
    this.resolutionButton_.appendChild(label);

    this.parent.appendChild(this.resolutionButton_);
  }


  /**
   * @private
   */
   addResolutionMenu_() {
    /** @private {!HTMLElement}*/
    this.resolutionMenu_ = shaka.util.Dom.createHTMLElement('div');
    this.resolutionMenu_.classList.add('shaka-resolutions');
    this.resolutionMenu_.classList.add('shaka-no-propagation');
    this.resolutionMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.resolutionMenu_.classList.add('shaka-settings-menu');

    /** @private {!HTMLElement}*/
    this.backFromResolutionButton_ =
      shaka.util.Dom.createHTMLElement('button');
    this.backFromResolutionButton_.classList.add(
      'shaka-back-to-overflow-button');
    this.resolutionMenu_.appendChild(this.backFromResolutionButton_);

    const backIcon = shaka.util.Dom.createHTMLElement('i');
    backIcon.classList.add('material-icons');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.BACK;
    this.backFromResolutionButton_.appendChild(backIcon);

    /** @private {!HTMLElement}*/
    this.backFromResolutionSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.backFromResolutionButton_.appendChild(this.backFromResolutionSpan_);

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.resolutionMenu_);
  }


  /** @private */
  updateResolutionSelection_() {
    let tracks = this.player.getVariantTracks();

    // Hide resolution menu and button for audio-only content and src= content
    // without resolution information.
    if (tracks.length && !tracks[0].height) {
      shaka.ui.Utils.setDisplay(this.resolutionMenu_, false);
      shaka.ui.Utils.setDisplay(this.resolutionButton_, false);
      return;
    }
    // Otherwise, restore it.
    shaka.ui.Utils.setDisplay(this.resolutionButton_, true);

    tracks.sort(function(t1, t2) {
      return t1.height - t2.height;
    });
    tracks.reverse();

    // If there is a selected variant track, then we filter out any tracks in
    // a different language.  Then we use those remaining tracks to display the
    // available resolutions.
    const selectedTrack = tracks.find((track) => track.active);
    if (selectedTrack) {
      const language = selectedTrack.language;
      // Filter by current audio language.
      tracks = tracks.filter((track) => track.language == language);
    }

    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.resolutionMenu_, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.ui.Utils.removeAllChildren(this.resolutionMenu_);

    // 3. Add the backTo Menu button back
    this.resolutionMenu_.appendChild(backButton);

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
        this.currentResolution_.textContent = span.textContent;
      }
      this.resolutionMenu_.appendChild(button);
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

      this.currentResolution_.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    }

    this.resolutionMenu_.appendChild(autoButton);
    shaka.ui.Utils.focusOnTheChosenItem(this.resolutionMenu_);
    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('resolutionselectionupdated'));
  }


  /** @private */
  onResolutionClick_() {
    this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuopen'));
    shaka.ui.Utils.setDisplay(this.resolutionMenu_, true);
    shaka.ui.Utils.focusOnTheChosenItem(this.resolutionMenu_);
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
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.resolutionButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.RESOLUTION));
    this.backFromResolutionButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.RESOLUTION));
    this.backFromResolutionSpan_.textContent =
        this.localization.resolve(LocIds.RESOLUTION);
    this.resolutionNameSpan_.textContent =
        this.localization.resolve(LocIds.RESOLUTION);
    this.abrOnSpan_.textContent =
        this.localization.resolve(LocIds.AUTO_QUALITY);

    if (this.player.getConfiguration().abr.enabled) {
      this.currentResolution_.textContent =
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
