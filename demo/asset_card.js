/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shakaDemo.AssetCard');

goog.require('goog.asserts');
goog.require('shakaAssets');
goog.require('shakaDemo.Tooltips');
goog.requireType('ShakaDemoAssetInfo');

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
    const svgNs = 'http://www.w3.org/2000/svg';
    /** @private {!Element} */
    this.progressCircleSvg_ = document.createElementNS(svgNs, 'svg');
    /** @private {!Element} */
    this.progressCircleBack_ = document.createElementNS(svgNs, 'circle');
    /** @private {!Element} */
    this.progressCircleBar_ = document.createElementNS(svgNs, 'circle');
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

      const webpSource =
        /** @type {!HTMLSourceElement} */(document.createElement('source'));
      webpSource.srcset = asset.iconUri.replace(/.png$/, '.webp');
      webpSource.type = 'image/webp';

      const pngSource =
        /** @type {!HTMLSourceElement} */(document.createElement('source'));
      pngSource.srcset = asset.iconUri;
      pngSource.type = 'image/png';

      const img =
        /** @type {!HTMLImageElement} */(document.createElement('img'));
      img.src = asset.iconUri;
      img.alt = '';  // Not necessary to understand the page

      // It can only be guaranteed that they have a webp version if they are on
      // our server.
      if (asset.iconUri.startsWith('https://storage.googleapis.com')) {
        picture.appendChild(webpSource);
      }
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
    this.progressCircleSvg_.classList.add('progress-circle-svg');
    this.progressCircleBack_.classList.add('progress-circle-back');
    this.progressCircleBar_.classList.add('progress-circle-bar');

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
        .set(Feature.ADS, 'ad')
        .set(Feature.AUDIO_ONLY, 'audio_only');

    for (const feature of asset.features) {
      const icon = icons.get(feature);
      if (icon) {
        this.addFeatureIcon_(icon, feature);
      }
    }

    for (const drm of asset.drm) {
      switch (drm) {
        case KeySystem.WIDEVINE:
          this.addFeatureIcon_('widevine', drm);
          break;
        case KeySystem.CLEAR_KEY:
          this.addFeatureIcon_('clear_key', drm);
          break;
        case KeySystem.PLAYREADY:
          this.addFeatureIcon_('playready', drm);
          break;
        case KeySystem.FAIRPLAY:
          this.addFeatureIcon_('fairplay', drm);
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
   * @param {?string} buttonName
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
    shaka.util.Dom.removeAllChildren(this.actions_);
    this.remakeButtonsFn_(this);
  }

  /** Adds basic buttons to the card ("play" and "preload"). */
  addBaseButtons() {
    let disableButtons = false;
    this.addButton('Play', async () => {
      if (disableButtons) {
        return;
      }
      disableButtons = true;
      await shakaDemoMain.loadAsset(this.asset_);
      this.remakeButtons();
    });
    this.addButton('Add to queue', async () => {
      if (disableButtons) {
        return;
      }
      disableButtons = true;
      if (shakaDemoMain.isPlaying()) {
        await shakaDemoMain.addToQueue(this.asset_);
      } else {
        await shakaDemoMain.loadAsset(this.asset_);
      }
      this.remakeButtons();
    });
    let preloadName = 'Start Preload';
    if (this.asset_.preloadManager) {
      preloadName = this.asset_.preloaded ? 'Preloaded!' : 'Preloading...';
    } else if (this.asset_.preloadFailed) {
      preloadName = 'Failed to Preload!';
    }
    const preloadButton = this.addButton(preloadName, async () => {
      if (disableButtons) {
        return;
      }
      disableButtons = true;
      this.asset_.preloaded = false;
      if (this.asset_.preloadManager) {
        await this.asset_.preloadManager.destroy();
        this.asset_.preloadManager = null;
        this.remakeButtons();
      } else {
        try {
          await shakaDemoMain.preloadAsset(this.asset_);
          this.remakeButtons();
          if (this.asset_.preloadManager) {
            await this.asset_.preloadManager.waitForFinish();
            this.asset_.preloaded = true;
          } else {
            this.asset_.preloadFailed = true;
          }
        } catch (error) {
          this.asset_.preloadManager = null;
          this.asset_.preloadFailed = true;
          throw error;
        } finally {
          this.remakeButtons();
        }
      }
    });
    if (this.asset_.preloadFailed) {
      preloadButton.disabled = true;
    }
  }

  /**
   * Adds a button to the bottom of the card that controls storage behavior.
   * This is a separate function because it involves a significant amount of
   * custom behavior, such as the download bar.
   */
  addStoreButton() {
    /**
     * Makes the contents of the button into an MDL icon, and moves it into the
     * upper-right-hand corner with CSS styles.
     * @param {!Element} button
     * @param {!Element} attachPoint If there is no attach point, just pass the
     *  button in here.
     * @param {string} iconText
     */
    const styleAsDownloadButton = (button, attachPoint, iconText) => {
      attachPoint.classList.add('asset-card-corner-button');
      const icon = document.createElement('i');
      icon.textContent = iconText;
      icon.classList.add('material-icons-round');
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
      const button = this.makeUnsupportedButton_(null, unsupportedReason);
      // As this is a unsupported button, it is wrapped in an "attach point";
      // that is the element this has to move with CSS, otherwise the tooltip
      // will end up coming out of the wrong place.
      const attachPoint = button.parentElement || button;
      styleAsDownloadButton(button, attachPoint, 'get_app');
      return;
    }
    if (this.asset_.isStored()) {
      const deleteButton = this.addButton(null, () => {
        this.attachDeleteDialog_(deleteButton);
      });
      styleAsDownloadButton(deleteButton, deleteButton, 'offline_pin');
    } else {
      const downloadButton = this.addButton(null, async () => {
        downloadButton.disabled = true;
        await this.asset_.storeCallback();
        this.remakeButtons();
      });
      styleAsDownloadButton(downloadButton, downloadButton, 'get_app');
    }
  }

  /**
   * @param {!HTMLButtonElement} deleteButton
   * @private
   */
  attachDeleteDialog_(deleteButton) {
    const parentDiv = this.card_.parentElement;
    if (!parentDiv) {
      return;
    }

    this.makeYesNoDialogue_(parentDiv, 'Delete the offline copy?', async () => {
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
    const dialog =
      /** @type {!HTMLDialogElement} */(document.createElement('dialog'));
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
        if (button instanceof HTMLButtonElement) {
          button.disabled = true;
        }
      }
    } else {
      this.progressCircle_.classList.add('hidden');
      for (const button of this.actions_.childNodes) {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
        }
      }
    }
    this.styleProgressCircle_(this.asset_.storedProgress);
  }

  /**
   * Adds a button to the bottom of the card that will call |onClick| when
   * clicked. For example, a play or delete button.
   * @param {?string} name
   * @param {function()} onclick
   * @param {string=} yesNoDialogText
   * @return {!HTMLButtonElement}
   */
  addButton(name, onclick, yesNoDialogText) {
    const button =
      /** @type {!HTMLButtonElement} */(document.createElement('button'));
    button.classList.add('mdl-button');
    button.classList.add('mdl-button--colored');
    button.classList.add('mdl-js-button');
    button.classList.add('mdl-js-ripple-effect');
    button.textContent = name || '';
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
