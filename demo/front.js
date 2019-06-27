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


goog.provide('shakaDemo.Front');


/** @type {?shakaDemo.Front} */
let shakaDemoFront;


/**
 * Shaka Player demo, front page layout.
 */
shakaDemo.Front = class {
  /**
   * Register the page configuration.
   */
  static init() {
    const container = shakaDemoMain.addNavButton('front');
    shakaDemoFront = new shakaDemo.Front(container);
  }

  /** @param {!Element} container */
  constructor(container) {
    /** @private {!Array.<!shakaDemo.AssetCard>} */
    this.assetCards_ = [];

    /** @private {!Element} */
    this.messageDiv_ = document.createElement('div');

    /** @private {!Element} */
    this.assetCardDiv_ = document.createElement('div');

    container.appendChild(this.messageDiv_);
    this.makeMessage_();

    container.appendChild(this.assetCardDiv_);

    document.addEventListener('shaka-main-selected-asset-changed', () => {
      this.updateSelected_();
    });
    document.addEventListener('shaka-main-offline-progress', () => {
      this.updateOfflineProgress_();
    });
    document.addEventListener('shaka-main-page-changed', () => {
      if (!this.assetCardDiv_.childNodes.length &&
          !container.classList.contains('hidden')) {
        // Now that the page is showing, create the contents that we deferred
        // until now.
        this.remakeAssetCards_();
      }
    });
  }

  /** @private */
  makeMessage_() {
    const hideName = 'shakaPlayerHideFrontMessage';
    if (window.localStorage.getItem(hideName)) {
      return;
    }

    // Add in a message telling you what to do.
    const makeMessage = (textClass, text) => {
      const textElement = document.createElement('h2');
      textElement.classList.add('mdl-typography--' + textClass);
      // TODO: Localize these messages.
      textElement.textContent = text;
      this.messageDiv_.appendChild(textElement);
    };
    makeMessage('body-2',
                'This is a demo of Google\'s Shaka Player, a JavaScript ' +
                'library for adaptive video streaming.');
    makeMessage('body-1',
                'Choose a video to playback; more assets are available via ' +
                'the search tab.');

    const hideButton = document.createElement('button');
    hideButton.classList.add('mdl-button');
    hideButton.classList.add('mdl-button--colored');
    hideButton.classList.add('mdl-js-button');
    hideButton.classList.add('mdl-js-ripple-effect');
    hideButton.textContent = 'Dismiss'; // TODO: localize
    hideButton.addEventListener('click', () => {
      shaka.ui.Utils.removeAllChildren(this.messageDiv_);
      window.localStorage.setItem(hideName, 'true');
    });
    this.messageDiv_.appendChild(hideButton);
  }

  /** @private */
  remakeAssetCards_() {
    shaka.ui.Utils.removeAllChildren(this.assetCardDiv_);

    const assets = shakaAssets.testAssets.filter((asset) => {
      return asset.isFeatured && !asset.disabled;
    });
    this.assetCards_ = assets.map((asset) => {
      return this.createAssetCardFor_(asset, this.assetCardDiv_);
    });

    this.updateSelected_();
  }

  /**
   * @param {!ShakaDemoAssetInfo} asset
   * @param {!Element} container
   * @return {!shakaDemo.AssetCard}
   * @private
   */
  createAssetCardFor_(asset, container) {
    const isFeatured = true;
    return new shakaDemo.AssetCard(container, asset, isFeatured, (c) => {
      const unsupportedReason = shakaDemoMain.getAssetUnsupportedReason(
          asset, /* needOffline= */ false);
      if (unsupportedReason) {
        c.markAsUnsupported(unsupportedReason);
      } else {
        c.addButton('Play', () => {
          shakaDemoMain.loadAsset(asset);
          this.updateSelected_();
        });
        c.addStoreButton();
      }
    });
  }

  /**
   * Updates progress bars on asset cards.
   * @private
   */
  updateOfflineProgress_() {
    for (const card of this.assetCards_) {
      card.updateProgress();
    }
  }

  /**
   * Updates which asset card is selected.
   * @private
   */
  updateSelected_() {
    for (const card of this.assetCards_) {
      card.selectByAsset(shakaDemoMain.selectedAsset);
    }
  }
};


document.addEventListener('shaka-main-loaded', shakaDemo.Front.init);
