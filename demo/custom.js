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


goog.provide('shakaDemo.Custom');


/** @type {?shakaDemo.Custom} */
let shakaDemoCustom;


/**
 * Shaka Player demo, custom asset page layout.
 */
shakaDemo.Custom = class {
  /**
   * Register the page configuration.
   */
  static init() {
    const elements = shakaDemoMain.addNavButton('custom');
    shakaDemoCustom = new shakaDemo.Custom(elements.container);
  }

  /** @param {!Element} container */
  constructor(container) {
    /** @private {!Element} */
    this.dialog_ = document.createElement('dialog');
    this.dialog_.classList.add('mdl-dialog');
    container.appendChild(this.dialog_);
    if (!this.dialog_.showModal) {
      dialogPolyfill.registerDialog(this.dialog_);
    }

    /** @private {!Set.<!ShakaDemoAssetInfo>} */
    this.assets_ = this.loadAssetInfos_();

    /** @private {!Array.<!shakaDemo.AssetCard>} */
    this.assetCards_ = [];
    this.savedList_ = document.createElement('div');
    container.appendChild(this.savedList_);

    // Add the "new" button, which shows the dialog.
    const addButtonContainer = document.createElement('div');
    addButtonContainer.classList.add('add-button-container');
    container.appendChild(addButtonContainer);
    // Style it as an MDL Floating Action Button (FAB).
    const addButton = this.makeButton_('add', /* isFAB = */ true, () => {
      this.showAssetDialog_(ShakaDemoAssetInfo.makeBlankAsset());
    });
    addButtonContainer.appendChild(addButton);

    document.addEventListener('shaka-main-selected-asset-changed', () => {
      this.updateSelected_();
    });
    document.addEventListener('shaka-main-offline-progress', () => {
      this.updateOfflineProgress_();
    });
    document.addEventListener('shaka-main-page-changed', () => {
      if (!this.savedList_.childNodes.length &&
          !container.classList.contains('hidden')) {
        // Now that the page is showing, create the contents that we deferred
        // until now.
        this.remakeSavedList_();
      }
    });
  }

  /** @return {!Array.<!ShakaDemoAssetInfo>} */
  assets() {
    return Array.from(this.assets_);
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
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @private
   */
  showAssetDialog_(assetInProgress) {
    // Remove buttons for any previous assets.
    shaka.ui.Utils.removeAllChildren(this.dialog_);

    const inputDiv = document.createElement('div');
    this.dialog_.appendChild(inputDiv);

    const iconDiv = document.createElement('div');
    this.dialog_.appendChild(iconDiv);

    // An array of inputs which have validity checks which we care about.
    const inputsToCheck = [];

    // The license server and drm system fields need to know each others
    // contents, and react to each others changes, to work.
    // To simplify things, this method picks out the process of setting license
    // server URLs; it can be called within both fields.
    let licenseServerUrlInput;
    let customDrmSystemInput;
    const setLicenseServerURLs = () => {
      const licenseServerURL = licenseServerUrlInput.value;
      const customDRMSystem = customDrmSystemInput.value;
      if (licenseServerURL) {
        // Make a license server entry for every common DRM plugin.
        assetInProgress.licenseServers.clear();
        for (const drmSystem of shakaDemo.Main.commonDrmSystems) {
          assetInProgress.licenseServers.set(drmSystem, licenseServerURL);
        }
        if (customDRMSystem) {
          // Make a custom entry too.
          assetInProgress.licenseServers.set(customDRMSystem, licenseServerURL);
        }
      } else {
        assetInProgress.licenseServers.clear();
      }
    };

    const containerStyle = shakaDemo.InputContainer.Style.VERTICAL;
    const container = new shakaDemo.InputContainer(
        inputDiv, /* headerText = */ null, containerStyle,
        /* docLink = */ null);

    /**
     * A utility to simplify the creation of fields on the dialog.
     * @param {string} name
     * @param {function(!Element, !Element)} setup
     * @param {function(!Element)} onChange
     */
    const makeField = (name, setup, onChange) => {
      container.addRow(null, null);
      const input = new shakaDemo.TextInput(container, name, onChange);
      input.extra().textContent = name;
      setup(input.input(), input.container());
    };

    // Make the manifest URL field.
    const manifestSetup = (input, container) => {
      input.value = assetInProgress.manifestUri;
      inputsToCheck.push(input);

      // Make an error that shows up if you did not provide an URL.
      const error = document.createElement('span');
      error.classList.add('mdl-textfield__error');
      error.textContent = 'Must have a manifest URL.';
      container.appendChild(error);

      // Add a regex that will detect empty strings.
      input.required = true;
      input.pattern = '^(?!([\r\n\t\f\v ]+)$).*$';
    };
    const manifestOnChange = (input) => {
      assetInProgress.manifestUri = input.value;
    };
    makeField('Manifest URL', manifestSetup, manifestOnChange);

    // Make the license server URL field.
    const licenseSetup = (input, container) => {
      licenseServerUrlInput = input;
      const drmSystems = assetInProgress.licenseServers.keys();
      // Custom assets have only a single license server URL, no matter how
      // many key systems they have. Thus, it's safe to say that the license
      // server URL associated with the first key system is the asset's
      // over-all license server URL.
      const drmSystem = drmSystems.next();
      if (drmSystem && drmSystem.value) {
        input.value = assetInProgress.licenseServers.get(drmSystem.value);
      }
    };
    const licenseOnChange = (input) => {
      setLicenseServerURLs();
    };
    makeField('Custom License Server URL', licenseSetup, licenseOnChange);

    // Make the license certificate URL field.
    const certSetup = (input, container) => {
      if (assetInProgress.certificateUri) {
        input.value = assetInProgress.certificateUri;
      }
    };
    const certOnChange = (input) => {
      assetInProgress.certificateUri = input.value;
    };
    makeField('Custom License Certificate URL', certSetup, certOnChange);

    // Make the drm system field.
    const drmSetup = (input, container) => {
      customDrmSystemInput = input;
      const drmSystems = assetInProgress.licenseServers.keys();
      for (const drmSystem of drmSystems) {
        if (!shakaDemo.Main.commonDrmSystems.includes(drmSystem)) {
          input.value = drmSystem;
          break;
        }
      }
    };
    const drmOnChange = (input) => {
      setLicenseServerURLs();
    };
    makeField('Custom DRM System', drmSetup, drmOnChange);

    // Make the name field.
    const nameSetup = (input, container) => {
      input.value = assetInProgress.name;
      inputsToCheck.push(input);

      // Make an error that shows up if you have an empty/duplicate name.
      const error = document.createElement('span');
      error.classList.add('mdl-textfield__error');
      error.textContent = 'Must be a unique name.';
      container.appendChild(error);

      // Make a regex that will detect duplicates.
      input.required = true;
      input.pattern = '^(?!( *';
      for (const asset of this.assets_) {
        if (asset == assetInProgress) {
          // If editing an existing asset, it's okay if the name doesn't change.
          continue;
        }
        const escape = (input) => {
          return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        };
        input.pattern += '|' + escape(asset.name);
      }
      input.pattern += ')$).*$';
    };
    const nameOnChange = (input) => {
      assetInProgress.name = input.value;
    };
    makeField('Name', nameSetup, nameOnChange);

    // Make the icon field.
    const iconSetup = (input, container) => {
      if (assetInProgress.iconUri) {
        input.value = assetInProgress.iconUri;
        const img = document.createElement('img');
        img.src = input.value;
        img.alt = '';  // Not necessary to understand the page
        iconDiv.appendChild(img);
      }
    };
    const iconOnChange = (input) => {
      shaka.ui.Utils.removeAllChildren(iconDiv);
      assetInProgress.iconUri = input.value;
      if (input.value) {
        const img = document.createElement('img');
        img.src = input.value;
        img.alt = '';  // Not necessary to understand the page
        iconDiv.appendChild(img);
      }
    };
    makeField('Icon URL', iconSetup, iconOnChange);

    // Create the buttons at the bottom of the dialog.
    const buttonsDiv = document.createElement('tr');
    inputDiv.appendChild(buttonsDiv);
    buttonsDiv.appendChild(this.makeButton_('Save', /* isFAB = */ false, () => {
      for (const input of inputsToCheck) {
        if (!input.validity.valid) {
          return;
        }
      }
      shakaDemoMain.setupOfflineSupport(assetInProgress);
      this.assets_.add(assetInProgress);
      this.saveAssetInfos_(this.assets_);
      this.remakeSavedList_();
      this.dialog_.close();
    }));
    buttonsDiv.appendChild(this.makeButton_(
        'Cancel', /* isFAB = */ false, () => {
      this.dialog_.close();
    }));

    // Update the componentHandler, to account for the new MDL elements.
    componentHandler.upgradeDom();

    // Show the dialog last, so that it knows where to place it.
    this.dialog_.showModal();
  }

  /**
   * @return {!Set.<!ShakaDemoAssetInfo>}
   * @private
   */
  loadAssetInfos_() {
    const savedString = window.localStorage.getItem(shakaDemo.Custom.saveId_);
    if (savedString) {
      const assets = JSON.parse(savedString);
      return new Set(assets.map((json) => {
        const asset = ShakaDemoAssetInfo.fromJSON(json);
        shakaDemoMain.setupOfflineSupport(asset);
        return asset;
      }));
    }
    return new Set();
  }

  /**
   * @param {!Set.<!ShakaDemoAssetInfo>} assetInfos
   * @private
   */
  saveAssetInfos_(assetInfos) {
    const saveId = shakaDemo.Custom.saveId_;
    const assets = Array.from(assetInfos);
    window.localStorage.setItem(saveId, JSON.stringify(assets));
  }

  /**
   * @param {string} name
   * @param {boolean} isFAB Should this button be styled as a Material Design
   *   Floating Action Button (FAB)?
   * @param {function()} callback
   * @return {!Element}
   * @private
   */
  makeButton_(name, isFAB, callback) {
    const button = document.createElement('button');
    if (isFAB) {
      button.classList.add('mdl-button--fab');
      button.classList.add('mdl-button--colored');
      const icon = document.createElement('i');
      icon.classList.add('material-icons-round');
      icon.textContent = name;
      button.appendChild(icon);
    } else {
      button.textContent = name;
      button.classList.add('mdl-button--raised');
    }
    button.addEventListener('click', callback);
    button.classList.add('mdl-button');
    button.classList.add('mdl-js-button');
    button.classList.add('mdl-js-ripple-effect');
    return button;
  }

  /**
   * @param {!ShakaDemoAssetInfo} asset
   * @return {!shakaDemo.AssetCard}
   * @private
   */
  createAssetCardFor_(asset) {
    const savedList = this.savedList_;
    const isFeatured = false;
    return new shakaDemo.AssetCard(savedList, asset, isFeatured, (c) => {
      c.addButton('Play', () => {
        shakaDemoMain.loadAsset(asset);
        this.updateSelected_();
      });
      c.addButton('Edit', async () => {
        if (asset.unstoreCallback) {
          await asset.unstoreCallback();
        }
        this.showAssetDialog_(asset);
      });
      // TODO: Localize these messages.
      const deleteDialog = 'Delete this custom asset?';
      c.addButton('Delete', async () => {
        this.assets_.delete(asset);
        if (asset.unstoreCallback) {
          await asset.unstoreCallback();
        }
        this.saveAssetInfos_(this.assets_);
        this.remakeSavedList_();
      }, deleteDialog);
      c.addStoreButton();
    });
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
  remakeSavedList_() {
    shaka.ui.Utils.removeAllChildren(this.savedList_);

    if (this.assets_.size == 0) {
      // Add in a message telling you what to do.
      const makeMessage = (textClass, text) => {
        const textElement = document.createElement('h2');
        textElement.classList.add('mdl-typography--' + textClass);
        // TODO: Localize these messages.
        textElement.textContent = text;
        this.savedList_.appendChild(textElement);
      };
      makeMessage('title',
                  'Try Shaka Player with your own content!');
      makeMessage('body-2',
                  'Press the button below to add a custom asset.');
      makeMessage('body-1',
                  'Custom assets will remain even after reloading the page.');
    } else {
      // Make asset cards for the assets.
      this.assetCards_ = Array.from(this.assets_).map((asset) => {
        return this.createAssetCardFor_(asset);
      });
      this.updateSelected_();
    }
  }
};


/**
 * The name of the field in window.localStorage that is used to store a user's
 * custom assets.
 * @const {string}
 */
shakaDemo.Custom.saveId_ = 'shakaPlayerDemoSavedAssets';


document.addEventListener('shaka-main-loaded', shakaDemo.Custom.init);
document.addEventListener('shaka-main-cleanup', () => {
  shakaDemoCustom = null;
});
