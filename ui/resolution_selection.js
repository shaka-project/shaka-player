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
        // If abr is enabled, the 'Auto' string needs localization.
        // TODO: is there a more efficient way of updating just the strings
        // we need instead of running the whole resolution update?
        this.updateResolutionSelection_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateLocalizedStrings_();
        // If abr is enabled, the 'Auto' string needs localization.
        // TODO: is there a more efficient way of updating just the strings
        // we need instead of running the whole resolution update?
        this.updateResolutionSelection_();
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

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();
  }


  /**
   * @private
   */
  addResolutionButton_() {
    /** @private {!HTMLElement}*/
    this.resolutionButton_ = shaka.ui.Utils.createHTMLElement('button');

    this.resolutionButton_.classList.add('shaka-resolution-button');

    const icon = shaka.ui.Utils.createHTMLElement('i');
    icon.classList.add('material-icons');
    icon.textContent = shaka.ui.Enums.MaterialDesignIcons.RESOLUTION;
    this.resolutionButton_.appendChild(icon);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');

    /** @private {!HTMLElement}*/
    this.resolutionNameSpan_ = shaka.ui.Utils.createHTMLElement('span');
    label.appendChild(this.resolutionNameSpan_);

    /** @private {!HTMLElement}*/
    this.currentResolution_ = shaka.ui.Utils.createHTMLElement('span');
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
    this.resolutionMenu_ = shaka.ui.Utils.createHTMLElement('div');
    this.resolutionMenu_.classList.add('shaka-resolutions');
    this.resolutionMenu_.classList.add('shaka-no-propagation');
    this.resolutionMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.resolutionMenu_.classList.add('shaka-settings-menu');

    /** @private {!HTMLElement}*/
    this.backFromResolutionButton_ =
      shaka.ui.Utils.createHTMLElement('button');
    this.backFromResolutionButton_.classList.add(
      'shaka-back-to-overflow-button');
    this.resolutionMenu_.appendChild(this.backFromResolutionButton_);

    const backIcon = shaka.ui.Utils.createHTMLElement('i');
    backIcon.classList.add('material-icons');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.BACK;
    this.backFromResolutionButton_.appendChild(backIcon);

    /** @private {!HTMLElement}*/
    this.backFromResolutionSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.backFromResolutionButton_.appendChild(this.backFromResolutionSpan_);


    // Add the abr option
    const auto = shaka.ui.Utils.createHTMLElement('button');
    auto.setAttribute('aria-selected', 'true');
    this.resolutionMenu_.appendChild(auto);

    auto.appendChild(shaka.ui.Utils.checkmarkIcon());

    /** @private {!HTMLElement}*/
    this.abrOnSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.abrOnSpan_.classList.add('shaka-auto-span');
    auto.appendChild(this.abrOnSpan_);

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.resolutionMenu_);
  }


  /** @private */
  updateResolutionSelection_() {
    let tracks = this.player.getVariantTracks();
    // Hide resolution menu and button for audio-only content.
    if (tracks.length && !tracks[0].height) {
      shaka.ui.Utils.setDisplay(this.resolutionMenu_, false);
      shaka.ui.Utils.setDisplay(this.resolutionButton_, false);
      return;
    }
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
        // If abr is disabled, mark the selected track's resolution.
        button.setAttribute('aria-selected', 'true');
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
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

    // If abr is enabled reflect it by marking 'Auto' as selected.
    if (abrEnabled) {
      autoButton.setAttribute('aria-selected', 'true');
      autoButton.appendChild(shaka.ui.Utils.checkmarkIcon());

      autoSpan.classList.add('shaka-chosen-item');

      this.currentResolution_.textContent =
        this.localization.resolve(shaka.ui.Locales.Ids.LABEL_AUTO_QUALITY);
    }

    this.resolutionMenu_.appendChild(autoButton);
    shaka.ui.Utils.focusOnTheChosenItem(this.resolutionMenu_);
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
        this.localization.resolve(LocIds.ARIA_LABEL_RESOLUTION));
    this.backFromResolutionButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.ARIA_LABEL_RESOLUTION));
    this.backFromResolutionSpan_.textContent =
      this.localization.resolve(LocIds.LABEL_RESOLUTION);
    this.resolutionNameSpan_.textContent =
      this.localization.resolve(LocIds.LABEL_RESOLUTION);
    this.abrOnSpan_.textContent =
      this.localization.resolve(LocIds.LABEL_AUTO_QUALITY);
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
