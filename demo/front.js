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


/** @type {?ShakaDemoFront} */
let shakaDemoFront;


/**
 * Shaka Player demo, front page layout.
 */
class ShakaDemoFront {
  /**
   * Register the page configuration.
   */
  static init() {
    const container = shakaDemoMain.addNavButton('front');
    shakaDemoFront = new ShakaDemoFront(container);
  }

  /** @param {!Element} container */
  constructor(container) {
    /** @private {!Array.<!AssetCard>} */
    this.assetCards_ = [];

    /** @private {!Element} */
    this.messageDiv_ = document.createElement('div');

    /** @private {!Element} */
    this.assetCardDiv_ = document.createElement('div');

    container.appendChild(this.messageDiv_);
    this.makeMessage_();

    container.appendChild(this.assetCardDiv_);
    this.remakeAssetCards_();

    document.addEventListener('shaka-main-selected-asset-changed', () => {
      this.updateSelected_();
    });
    document.addEventListener('shaka-main-offline-progress', () => {
      this.updateOfflineProgress_();
    });
    document.addEventListener('shaka-main-offline-changed', () => {
      this.remakeAssetCards_();
    });
  }

  /** @private */
  makeMessage_() {
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
  }

  /**
   * @param {!ShakaDemoAssetInfo} asset
   * @param {!Element} container
   * @return {!AssetCard}
   * @private
   */
  createAssetCardFor_(asset, container) {
    const card = new AssetCard(container, asset, /* isFeatured = */ true);
    const unsupportedReason = shakaDemoMain.getAssetUnsupportedReason(
        asset, /* needOffline= */ false);
    if (unsupportedReason) {
      card.markAsUnsupported(unsupportedReason);
    } else {
      card.addButton('Play', () => {
        shakaDemoMain.loadAsset(asset);
        this.updateSelected_();
      });
      card.addStoreButton();
    }
    return card;
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
}


document.addEventListener('shaka-main-loaded', ShakaDemoFront.init);
