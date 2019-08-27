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


goog.provide('shakaDemo.AssetCard');


/**
 * Creates and contains an MDL card that presents info about the given asset.
 * @final
 */
shakaDemo.AssetCard = class {
  /**
   * @param {!Element} parentDiv
   * @param {!ShakaDemoAssetInfo} asset
   * @param {boolean} isFeatured True if this card should use the "featured"
   *   style, which use the asset's short name and have descriptions.
   * @param {function(!shakaDemo.AssetCard)} remakeButtonsFn
   */
  constructor(parentDiv, asset, isFeatured, remakeButtonsFn) {
    /** @private {!Element} */
    this.card_ = document.createElement('div');
    /** @private {!ShakaDemoAssetInfo} */
    this.asset_ = asset;
    /** @private {!Element} */
    this.actions_ = document.createElement('div');
    /** @private {!Element} */
    this.featureIconsContainer_ = document.createElement('div');
    /** @private {!Element} */
    this.progressCircle_ = document.createElement('div');
    const svgns = 'http://www.w3.org/2000/svg';
    /** @private {!Element} */
    this.progressCircleSvg_ = document.createElementNS(svgns, 'svg');
    /** @private {!Element} */
    this.progressCircleBack_ = document.createElementNS(svgns, 'circle');
    /** @private {!Element} */
    this.progressCircleBar_ = document.createElementNS(svgns, 'circle');
    /** @private {function(!shakaDemo.AssetCard)} */
    this.remakeButtonsFn_ = remakeButtonsFn;

    // Lay out the card.
    this.card_.classList.add('mdl-card-wide');
    this.card_.classList.add('mdl-card');
    this.card_.classList.add('mdl-shadow--2dp');
    this.card_.classList.add('asset-card');

    const titleDiv = document.createElement('div');
    titleDiv.classList.add('mdl-card__title');
    this.card_.appendChild(titleDiv);
    const titleText = document.createElement('h2');
    titleText.classList.add('mdl-card__title-text');
    titleText.textContent =
        isFeatured ? (asset.shortName || asset.name) : asset.name;
    titleDiv.appendChild(titleText);

    if (asset.iconUri) {
      const picture = document.createElement('picture');

      const webpSource = document.createElement('source');
      webpSource.srcset = asset.iconUri.replace(/.png$/, '.webp');
      webpSource.type = 'image/webp';

      const pngSource = document.createElement('source');
      pngSource.srcset = asset.iconUri;
      pngSource.type = 'image/png';

      const img = document.createElement('img');
      img.src = asset.iconUri;
      img.alt = '';  // Not necessary to understand the page

      picture.appendChild(webpSource);
      picture.appendChild(pngSource);
      picture.appendChild(img);

      this.card_.appendChild(picture);
    }

    if (asset.description && isFeatured) {
      const supportingText = document.createElement('div');
      supportingText.classList.add('mdl-card__supporting-text');
      supportingText.textContent = asset.description;
      this.card_.appendChild(supportingText);
    }

    this.card_.appendChild(this.featureIconsContainer_);
    this.addFeatureIcons_(asset);

    this.actions_.classList.add('mdl-card__actions');
    this.actions_.classList.add('mdl-card--border');
    this.card_.appendChild(this.actions_);

    this.progressCircle_.classList.add('hidden');
    this.progressCircle_.classList.add('progress-circle');
    this.card_.appendChild(this.progressCircle_);
    this.progressCircleSvg_.appendChild(this.progressCircleBack_);
    this.progressCircleSvg_.appendChild(this.progressCircleBar_);
    this.progressCircle_.appendChild(this.progressCircleSvg_);
    // You can't use access the classList of an svg on IE, so set the class
    // attribute instead.
    this.progressCircleSvg_.setAttribute('class', 'progress-circle-svg');
    this.progressCircleBack_.setAttribute('class', 'progress-circle-back');
    this.progressCircleBar_.setAttribute('class', 'progress-circle-bar');

    parentDiv.appendChild(this.card_);
    // Remake buttons AFTER appending to parent div, so that any tooltips can
    // be placed.
    this.remakeButtons();
  }

  /**
   * @param {number} progress
   * @private
   */
  styleProgressCircle_(progress) {
    const svg = this.progressCircleSvg_;
    const bar = this.progressCircleBar_;
    const circleSize = 45;
    const circleThickness = 5;
    const circleRadius = (circleSize - circleThickness) / 2;
    const circumference = 2 * Math.PI * circleRadius;

    svg.setAttribute('viewBox', '0 0 ' + circleSize + ' ' + circleSize);
    bar.setAttribute('stroke-dasharray', circumference);
    bar.setAttribute('stroke-dashoffset', (circumference * (1 - progress)));
  }

  /**
   * @param {string} icon
   * @param {string} title
   * @private
   */
  addFeatureIcon_(icon, title) {
    const iconDiv = document.createElement('div');
    iconDiv.classList.add('feature-icon');
    iconDiv.setAttribute('icon', icon);
    this.featureIconsContainer_.appendChild(iconDiv);

    shakaDemo.Tooltips.make(iconDiv, title);
  }

  /**
   * @param {!ShakaDemoAssetInfo} asset
   * @private
   */
  addFeatureIcons_(asset) {
    const Feature = shakaAssets.Feature;
    const KeySystem = shakaAssets.KeySystem;

    const icons = new Map()
        .set(Feature.SUBTITLES, 'subtitles')
        .set(Feature.CAPTIONS, 'closed_caption')
        .set(Feature.LIVE, 'live')
        .set(Feature.TRICK_MODE, 'trick_mode')
        .set(Feature.HIGH_DEFINITION, 'high_definition')
        .set(Feature.ULTRA_HIGH_DEFINITION, 'ultra_high_definition')
        .set(Feature.SURROUND, 'surround_sound')
        .set(Feature.MULTIPLE_LANGUAGES, 'multiple_languages')
        .set(Feature.AUDIO_ONLY, 'audio_only');

    for (const feature of asset.features) {
      const icon = icons.get(feature);
      if (icon) {
        this.addFeatureIcon_(icon, feature);
      }
    }

    for (let drm of asset.drm) {
      switch (drm) {
        case KeySystem.WIDEVINE:
          this.addFeatureIcon_('widevine', 'Widevine DRM');
          break;
        case KeySystem.CLEAR_KEY:
          this.addFeatureIcon_('clear_key', 'Clear Key DRM');
          break;
        case KeySystem.PLAYREADY:
          this.addFeatureIcon_('playready', 'PlayReady DRM');
          break;
      }
    }
  }

  /**
   * Modify an asset to make it clear that it is unsupported.
   * @param {string} unsupportedReason
   */
  markAsUnsupported(unsupportedReason) {
    this.card_.classList.add('asset-card-unsupported');
    this.makeUnsupportedButton_('Not Available', unsupportedReason);
  }

  /**
   * Make a button that represents the lack of a working button.
   * @param {string} buttonName
   * @param {string} unsupportedReason
   * @return {!Element}
   * @private
   */
  makeUnsupportedButton_(buttonName, unsupportedReason) {
    const button = this.addButton(buttonName, () => {});
    button.setAttribute('disabled', '');

    // Tooltips don't work on disabled buttons (on some platforms), so
    // the button itself has to be "uprooted" and placed in a synthetic div
    // specifically to attach the tooltip to.
    const attachPoint = document.createElement('div');
    if (button.parentElement) {
      button.parentElement.removeChild(button);
    }
    attachPoint.classList.add('tooltip-attach-point');
    attachPoint.appendChild(button);
    this.actions_.appendChild(attachPoint);
    shakaDemo.Tooltips.make(attachPoint, unsupportedReason);

    return button;
  }

  /**
   * Select this card if the card's asset matches |asset|.
   * Used to simplify the implementation of "shaka-main-selected-asset-changed"
   * handlers.
   * @param {ShakaDemoAssetInfo} asset
   */
  selectByAsset(asset) {
    this.card_.classList.remove('selected');
    if (this.asset_ == asset) {
      this.card_.classList.add('selected');
    }
  }

  /** Remake the buttons of the card. */
  remakeButtons() {
    shaka.ui.Utils.removeAllChildren(this.actions_);
    this.remakeButtonsFn_(this);
  }

  /**
   * Adds a button to the bottom of the card that controls storage behavior.
   * This is a separate function because it involves a significant amount of
   * custom behavior, such as the download bar.
   */
  addStoreButton() {
    /**
     * Makes the contents of the button into an MDL icon, and moves it into the
     * upper-righthand corner with CSS styles.
     * @param {!Element} button
     * @param {!Element} attachPoint If there is no attach point, just pass the
     *  button in here.
     * @param {string} iconText
     */
    const styleAsDownloadButton = (button, attachPoint, iconText) => {
      attachPoint.classList.add('asset-card-corner-button');
      const icon = document.createElement('i');
      icon.textContent = iconText;
      icon.classList.add('material-icons');
      button.appendChild(icon);
    };

    const unsupportedReason = shakaDemoMain.getAssetUnsupportedReason(
        this.asset_, /* needOffline= */ true);
    if (!unsupportedReason) {
      goog.asserts.assert(this.asset_.storeCallback,
          'A storage callback is expected for all supported assets!');
    }
    if (unsupportedReason) {
      // This can't be stored.
      const button = this.makeUnsupportedButton_('', unsupportedReason);
      // As this is a unsupported button, it is wrapped in an "attach point";
      // that is the element this has to move with CSS, otherwise the tooltip
      // will end up coming out of the wrong place.
      const attachPoint = button.parentElement || button;
      styleAsDownloadButton(button, attachPoint, 'get_app');
      return;
    }
    if (this.asset_.isStored()) {
      const deleteButton = this.addButton('', () => {
        this.attachDeleteDialog_(deleteButton);
      });
      styleAsDownloadButton(deleteButton, deleteButton, 'offline_pin');
    } else {
      const downloadButton = this.addButton('', async () => {
        downloadButton.disabled = true;
        await this.asset_.storeCallback();
        this.remakeButtons();
      });
      styleAsDownloadButton(downloadButton, downloadButton, 'get_app');
    }
  }

  /**
   * @param {!Element} deleteButton
   * @private
   */
  attachDeleteDialog_(deleteButton) {
    const parentDiv = this.card_.parentElement;
    if (!parentDiv) {
      return;
    }

    // TODO: Localize these messages.
    const deleteMessage = 'Delete the offline copy?';
    this.makeYesNoDialogue_(parentDiv, deleteMessage, async () => {
      deleteButton.disabled = true;
      await this.asset_.unstoreCallback();
    });
  }

  /**
   * @param {!Element} parentDiv
   * @param {string} text
   * @param {function():Promise} callback
   * @private
   */
  makeYesNoDialogue_(parentDiv, text, callback) {
    const dialog = document.createElement('dialog');
    dialog.classList.add('mdl-dialog');
    parentDiv.appendChild(dialog);
    if (!dialog.showModal) {
      dialogPolyfill.registerDialog(dialog);
    }

    const textElement = document.createElement('h2');
    textElement.classList.add('mdl-typography--title');
    textElement.textContent = text;
    dialog.appendChild(textElement);

    const buttonsDiv = document.createElement('div');
    dialog.appendChild(buttonsDiv);
    const makeButton = (text, fn) => {
      const button = document.createElement('button');
      button.textContent = text;
      button.classList.add('mdl-button');
      button.classList.add('mdl-button--colored');
      button.classList.add('mdl-js-button');
      button.classList.add('mdl-js-ripple-effect');
      button.addEventListener('click', () => {
        fn();
      });
      buttonsDiv.appendChild(button);
      button.blur();
    };
    // TODO: Localize these messages.
    makeButton('Yes', async () => {
      dialog.close();
      await callback();
      this.remakeButtons();
    });
    makeButton('No', () => {
      dialog.close();
    });

    dialog.showModal();
  }

  /**
   * Updates the progress bar on the card.
   */
  updateProgress() {
    if (this.asset_.storedProgress < 1) {
      this.progressCircle_.classList.remove('hidden');
      for (const button of this.actions_.childNodes) {
        button.disabled = true;
      }
    } else {
      this.progressCircle_.classList.add('hidden');
      for (const button of this.actions_.childNodes) {
        button.disabled = false;
      }
    }
    this.styleProgressCircle_(this.asset_.storedProgress);
  }

  /**
   * Adds a button to the bottom of the card that will call |onClick| when
   * clicked. For example, a play or delete button.
   * @param {string} name
   * @param {function()} onclick
   * @param {string=} yesNoDialogText
   * @return {!Element}
   */
  addButton(name, onclick, yesNoDialogText) {
    const button = document.createElement('button');
    button.classList.add('mdl-button');
    button.classList.add('mdl-button--colored');
    button.classList.add('mdl-js-button');
    button.classList.add('mdl-js-ripple-effect');
    button.textContent = name;
    button.addEventListener('click', () => {
      if (!button.hasAttribute('disabled')) {
        if (yesNoDialogText) {
          this.makeYesNoDialogue_(this.actions_, yesNoDialogText, onclick);
        } else {
          onclick();
        }
      }
    });
    this.actions_.appendChild(button);
    return button;
  }
};
