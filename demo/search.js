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


goog.provide('shakaDemo.Search');


/** @type {?shakaDemo.Search} */
let shakaDemoSearch;


/**
 * Shaka Player demo, feature discovery page layout.
 */
shakaDemo.Search = class {
  /**
   * Register the page configuration.
   */
  static init() {
    const elements = shakaDemoMain.addNavButton('search');
    shakaDemoSearch = new shakaDemo.Search(elements.container, elements.button);
  }

  /**
   * @param {!Element} container
   * @param {!Element} button
   */
  constructor(container, button) {
    /** @private {!Array.<!shakaAssets.Feature>} */
    this.desiredFeatures_ = [];

    /** @private {?shakaAssets.Source} */
    this.desiredSource_;

    /** @private {?shakaAssets.KeySystem} */
    this.desiredDRM_;

    /** @private {!Element} */
    this.button_ = button;

    /** @private {!Element} */
    this.resultsDiv_ = document.createElement('div');

    /** @private {!Array.<!shakaDemo.AssetCard>} */
    this.assetCards_ = [];

    document.addEventListener('shaka-main-selected-asset-changed', () => {
      this.updateSelected_();
    });
    document.addEventListener('shaka-main-offline-progress', () => {
      this.updateOfflineProgress_();
    });
    document.addEventListener('shaka-main-page-changed', () => {
      if (!this.resultsDiv_.childNodes.length &&
          !container.classList.contains('hidden')) {
        // Now that the page is showing, create the contents that we deferred
        // until now.
        this.remakeResultsDiv_();
      }
    });

    this.readHashParameters_();
    this.updateHashParameters_();
    this.remakeSearchDiv_(container);
  }

  /** @private */
  readHashParameters_() {
    const hashValues = this.button_.getAttribute('tab-hash');
    if (hashValues) {
      for (const valueRaw of hashValues.split(',')) {
        if (valueRaw.startsWith('drm:')) {
          const key = valueRaw.split('drm:')[1];
          const value = shakaAssets.KeySystem[key];
          if (value) {
            this.desiredDRM_ = value;
          }
        } else if (valueRaw.startsWith('source:')) {
          const key = valueRaw.split('source:')[1];
          const value = shakaAssets.Source[key];
          if (value) {
            this.desiredSource_ = value;
          }
        } else {
          const value = shakaAssets.Feature[valueRaw];
          if (value) {
            this.desiredFeatures_.push(value);
          }
        }
      }
    }
  }

  /** @private */
  updateHashParameters_() {
    const hashValues = [];
    if (this.desiredSource_) {
      for (const key in shakaAssets.Source) {
        if (shakaAssets.Source[key] == this.desiredSource_) {
          hashValues.push('source:' + key);
        }
      }
    }
    if (this.desiredDRM_) {
      for (const key in shakaAssets.KeySystem) {
        if (shakaAssets.KeySystem[key] == this.desiredDRM_) {
          hashValues.push('drm:' + key);
        }
      }
    }
    for (const feature of this.desiredFeatures_) {
      for (const key in shakaAssets.Feature) {
        if (shakaAssets.Feature[key] == feature) {
          hashValues.push(key);
        }
      }
    }
    if (hashValues.length > 0) {
      this.button_.setAttribute('tab-hash', hashValues.join(','));
    } else {
      this.button_.removeAttribute('tab-hash');
    }
    shakaDemoMain.remakeHash();
  }

  /**
   * @param {!ShakaDemoAssetInfo} asset
   * @return {!shakaDemo.AssetCard}
   * @private
   */
  createAssetCardFor_(asset) {
    const resultsDiv = this.resultsDiv_;
    const isFeatured = false;
    return new shakaDemo.AssetCard(resultsDiv, asset, isFeatured, (c) => {
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

  /** @private */
  remakeResultsDiv_() {
    shaka.ui.Utils.removeAllChildren(this.resultsDiv_);

    const assets = this.searchResults_();
    this.assetCards_ = assets.map((asset) => this.createAssetCardFor_(asset));
    this.updateSelected_();
  }

  /**
   * @param {!shakaDemo.Search.SearchTerm} term
   * @param {shakaDemo.Search.TermType} type
   * @return {boolean}
   * @private
   */
  checkDesiredTerm_(term, type) {
    switch (type) {
      case shakaDemo.Search.TermType.DRM:
        return this.desiredDRM_ == term;
      case shakaDemo.Search.TermType.SOURCE:
        return this.desiredSource_ == term;
      case shakaDemo.Search.TermType.FEATURE:
        return this.desiredFeatures_.includes(
            /** @type {!shakaAssets.Feature} */ (term));
      default:
        return false;
    }
  }

  /**
   * @param {!shakaDemo.Search.SearchTerm} term
   * @param {shakaDemo.Search.TermType} type
   * @param {!Array.<!shakaDemo.Search.SearchTerm>} others
   * @private
   */
  addDesiredTerm_(term, type, others) {
    switch (type) {
      case shakaDemo.Search.TermType.DRM:
        this.desiredDRM_ = /** @type {shakaAssets.KeySystem} */ (term);
        break;
      case shakaDemo.Search.TermType.SOURCE:
        this.desiredSource_ = /** @type {shakaAssets.Source} */ (term);
        break;
      case shakaDemo.Search.TermType.FEATURE:
        // Only this term should be in the desired features.
        for (let term of others) {
          const index = this.desiredFeatures_.indexOf(
              /** @type {shakaAssets.Feature} */ (term));
          if (index != -1) {
            this.desiredFeatures_.splice(index, 1);
          }
        }
        this.desiredFeatures_.push(/** @type {shakaAssets.Feature} */ (term));
        break;
    }
  }

  /**
   * @param {!shakaDemo.Search.SearchTerm} term
   * @param {shakaDemo.Search.TermType} type
   * @private
   */
  removeDesiredTerm_(term, type) {
    let index;
    switch (type) {
      case shakaDemo.Search.TermType.DRM:
        this.desiredDRM_ = null;
        break;
      case shakaDemo.Search.TermType.SOURCE:
        this.desiredSource_ = null;
        break;
      case shakaDemo.Search.TermType.FEATURE:
        index = this.desiredFeatures_.indexOf(
            /** @type {shakaAssets.Feature} */ (term));
        if (index != -1) {
          this.desiredFeatures_.splice(index, 1);
        }
        break;
    }
  }

  /**
   * Creates an input for a single search term.
   * @param {!shakaDemo.InputContainer} searchContainer
   * @param {!shakaDemo.Search.SearchTerm} choice
   * The term this represents.
   * @param {shakaDemo.Search.TermType} type
   * The type of term that this term is.
   * @param {string} tooltip
   * @private
   */
  makeBooleanInput_(searchContainer, choice, type, tooltip) {
    // Give the container a significant amount of right padding, to make
    // it clearer which toggle corresponds to which label.
    searchContainer.addRow(choice, tooltip, 'significant-right-padding');
    const onChange = (input) => {
      if (input.checked) {
        this.addDesiredTerm_(choice, type, [choice]);
      } else {
        this.removeDesiredTerm_(choice, type);
      }
      this.remakeResultsDiv_();
      // Update the componentHandler, to account for any new MDL elements
      // added. Notably, tooltips.
      componentHandler.upgradeDom();
      // Update the hash.
      this.updateHashParameters_();
    };
    const input = new shakaDemo.BoolInput(searchContainer, choice, onChange);
    input.input().checked = this.checkDesiredTerm_(choice, type);
  }

  /**
   * Creates an input for a group of related but mutually-exclusive search
   * terms.
   * @param {!shakaDemo.InputContainer} searchContainer
   * @param {string} name
   * @param {!Array.<!shakaDemo.Search.SearchTerm>} choices
   * An array of the terms in this term group.
   * @param {shakaDemo.Search.TermType} type
   * The type of term that this term group contains. All of the
   * terms in the "choices" array must be of this type.
   * @private
   */
  makeSelectInput_(searchContainer, name, choices, type) {
    searchContainer.addRow(null, null);
    const nullOption = '---';
    const valuesObject = {};
    for (let term of choices) {
      if (type == 'DRM') {
        // The internal names of the keysystems aren't very readable, so use a
        // common name instead.
        // However, as we are basing this off of the key name, we have to remove
        // any underscores, so that the user isn't presented with a button
        // labeled CLEAR_KEY.
        for (const key in shakaAssets.KeySystem) {
          if (shakaAssets.KeySystem[key] == term) {
            // TODO: It'd be better to have some table of "translations",
            // instead of making a readable name here with string operations.
            valuesObject[term] = key.split('_').map((name) => {
              // Return everything but first character to lower-case.
              return name[0] + name.substr(1).toLowerCase();
            }).join(' ');
            break;
          }
        }
      } else {
        valuesObject[term] = term;
      }
    }
    valuesObject[nullOption] = nullOption;
    let lastValue = nullOption;
    const onChange = (input) => {
      if (input.value != nullOption) {
        this.addDesiredTerm_(input.value, type, choices);
      } else {
        this.removeDesiredTerm_(lastValue, type);
      }
      lastValue = input.value;
      this.remakeResultsDiv_();
      // Update the componentHandler, to account for any new MDL elements added.
      // Notably, tooltips.
      componentHandler.upgradeDom();
      // Update the hash.
      this.updateHashParameters_();
    };
    const input = new shakaDemo.SelectInput(
        searchContainer, name, onChange, valuesObject);
    input.extra().textContent = name;
    input.input().value = nullOption;
    for (const choice of choices) {
      if (this.checkDesiredTerm_(choice, type)) {
        input.input().value = choice;
        lastValue = choice;
        break;
      }
    }
  }

  /**
   * @param {!Element} container
   * @private
   */
  remakeSearchDiv_(container) {
    shaka.ui.Utils.removeAllChildren(container);

    const Feature = shakaAssets.Feature;
    const FEATURE = shakaDemo.Search.TermType.FEATURE;
    const DRM = shakaDemo.Search.TermType.DRM;
    const SOURCE = shakaDemo.Search.TermType.SOURCE;

    // Core term inputs.
    const coreContainer = new shakaDemo.InputContainer(
        container, /* headerText = */ null, shakaDemo.InputContainer.Style.FLEX,
        /* docLink = */ null);
    this.makeSelectInput_(coreContainer, 'Manifest',
        [Feature.DASH, Feature.HLS], FEATURE);
    this.makeSelectInput_(coreContainer, 'Container',
        [Feature.MP4, Feature.MP2TS, Feature.WEBM], FEATURE);
    this.makeSelectInput_(coreContainer, 'DRM',
        Object.values(shakaAssets.KeySystem), DRM);
    this.makeSelectInput_(coreContainer, 'Source',
        Object.values(shakaAssets.Source).filter((term) => {
          return term != shakaAssets.Source.CUSTOM;
        }), SOURCE);
    this.makeSelectInput_(coreContainer, 'Live',
        [Feature.LIVE, Feature.VOD], FEATURE);

    // Special terms.
    const containerStyle = shakaDemo.InputContainer.Style.FLEX;
    const specialContainer = new shakaDemo.InputContainer(
        container, /* headerText = */ null, containerStyle,
        /* docLink = */ null);
    this.makeBooleanInput_(specialContainer, Feature.HIGH_DEFINITION, FEATURE,
        'Filters for assets with at least one high-definition video stream.');
    this.makeBooleanInput_(specialContainer, Feature.XLINK, FEATURE,
        'Filters for assets that have XLINK tags in their manifests, ' +
        'so that they can be broken into multiple files.');
    this.makeBooleanInput_(specialContainer, Feature.SUBTITLES, FEATURE,
        'Filters for assets with caption tracks, or embedded captions.');
    this.makeBooleanInput_(specialContainer, Feature.TRICK_MODE, FEATURE,
        'Filters for assets that have special video tracks to be used in ' +
        'trick mode playback (aka fast-forward).');
    this.makeBooleanInput_(specialContainer, Feature.SURROUND, FEATURE,
        'Filters for assets with at least one surround sound audio track.');
    this.makeBooleanInput_(specialContainer, Feature.OFFLINE, FEATURE,
        'Filters for assets that can be stored offline.');
    this.makeBooleanInput_(specialContainer, Feature.STORED, FEATURE,
        'Filters for assets that have been stored offline.');

    container.appendChild(this.resultsDiv_);
  }

  /**
   * @return {!Array.<!ShakaDemoAssetInfo>}
   * @private
   */
  searchResults_() {
    return shakaAssets.testAssets.filter((asset) => {
      if (asset.disabled) {
        return false;
      }
      if (this.desiredDRM_ && !asset.drm.includes(this.desiredDRM_)) {
        return false;
      }
      if (this.desiredSource_ && asset.source != this.desiredSource_) {
        return false;
      }
      for (let feature of this.desiredFeatures_) {
        if (feature == shakaAssets.Feature.STORED) {
          if (!asset.isStored()) {
            return false;
          }
        } else if (!asset.features.includes(feature)) {
          return false;
        }
      }
      return true;
    });
  }
};


/** @typedef {shakaAssets.Feature|shakaAssets.Source} */
shakaDemo.Search.SearchTerm;


/** @enum {string} */
shakaDemo.Search.TermType = {
  FEATURE: 'Feature',
  DRM: 'DRM',
  SOURCE: 'Source',
};


document.addEventListener('shaka-main-loaded', shakaDemo.Search.init);
document.addEventListener('shaka-main-cleanup', () => {
  shakaDemoSearch = null;
});
