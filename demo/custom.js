/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Custom');


goog.require('ShakaDemoAssetInfo');
goog.require('shakaDemo.AssetCard');
goog.require('shakaDemo.Input');
goog.require('shakaDemo.InputContainer');
goog.require('shakaDemo.MessageIds');
goog.require('shakaDemo.TextInput');

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
    /** @private {!HTMLDialogElement} */
    this.dialog_ =
      /** @type {!HTMLDialogElement} */(document.createElement('dialog'));

    this.dialog_.classList.add('mdl-dialog');
    container.appendChild(this.dialog_);
    if (!this.dialog_.showModal) {
      dialogPolyfill.registerDialog(this.dialog_);
    }

    /** @private {!Set.<!ShakaDemoAssetInfo>} */
    this.assets_ = this.loadAssetInfos_();

    /** @private {!HTMLInputElement} */
    this.manifestField_;

    /** @private {!Array.<!shakaDemo.AssetCard>} */
    this.assetCards_ = [];
    this.savedList_ = document.createElement('div');
    container.appendChild(this.savedList_);

    // Add the "new" button, which shows the dialog.
    const addButtonContainer = document.createElement('div');
    addButtonContainer.classList.add('add-button-container');
    container.appendChild(addButtonContainer);
    // Style it as an MDL Floating Action Button (FAB).
    const buttonStyle = shakaDemo.Custom.ButtonStyle_.FAB;
    const addButton = this.makeButton_('add', buttonStyle, () => {
      this.showAssetDialog_(ShakaDemoAssetInfo.makeBlankAsset());
    });
    addButtonContainer.appendChild(addButton);

    document.addEventListener('shaka-main-selected-asset-changed', () => {
      this.updateSelected_();
    });
    document.addEventListener('shaka-main-offline-progress', () => {
      this.updateOfflineProgress_();
    });
    document.addEventListener('shaka-main-locale-changed', () => {
      this.remakeSavedList_();
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
   * A utility to simplify the creation of fields on the dialog.
   * @param {!shakaDemo.InputContainer} container
   * @param {string} name
   * @param {function(!HTMLInputElement, !Element)} setup
   * @param {function(!Element, !shakaDemo.Input)} onChange
   * @param {boolean=} isTextArea
   * @private
   */
  makeField_(container, name, setup, onChange, isTextArea) {
    container.addRow(/* labelString= */ null, /* tooltipString= */ null);
    const input =
        new shakaDemo.TextInput(container, name, onChange, isTextArea);
    input.extra().textContent = name;
    setup(input.input(), input.container());
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsHeaders_(assetInProgress, inputsToCheck) {
    const headersDiv = document.createElement('div');

    // Because this field can theoretically contain an unlimited number of
    // values, it has to take up an entire section by itself.
    const makeEmptyRow = () => {
      makePreFilledRow(/* headerName= */ null, /* headerValue= */ null);
    };
    /**
     * @type {!Array.<{
     *   headerName: ?string,
     *   div: !Element,
     * }>}
     */
    const collisionCheckEntries = [];
    /** @type {function(?string, ?string)} */
    const makePreFilledRow = (headerName, headerValue) => {
      const div = document.createElement('div');
      headersDiv.appendChild(div);
      const containerStyle = shakaDemo.InputContainer.Style.VERTICAL;
      const headerText = shakaDemo.MessageIds.LICENSE_HEADER_TITLE;
      const container = new shakaDemo.InputContainer(
          div, headerText, containerStyle,
          /* docLink= */ null);

      const collisionCheckEntry = {
        headerName,
        div,
      };
      collisionCheckEntries.push(collisionCheckEntry);

      // Don't add a new row for a row that was pre-filled.
      let firstTime = !headerName;
      const onChange = (newHeaderName, newHeaderValue) => {
        if (headerName) {
          // In case the header named changed, remove the old header.
          assetInProgress.licenseRequestHeaders.delete(headerName);
        }
        // Set the new values.
        headerName = newHeaderName;
        collisionCheckEntry.headerName = newHeaderName;
        headerValue = newHeaderValue;
        if (!headerName || !headerValue) {
          if (!firstTime) {
            // The user has set a field that used to be filled to empty.
            // This signals that they probably want to remove this header.
            headersDiv.removeChild(div);
          }
          return;
        }
        if (firstTime) {
          firstTime = false;
          // You have filled out this row for the first time; add a new row, in
          // case the user wants to add more headers.
          makeEmptyRow();
          // Update the componentHandler, to account for the new MDL elements.
          componentHandler.upgradeDom();
        }
        assetInProgress.addLicenseRequestHeader(headerName, headerValue);
        // Eliminate any OTHER header with the same name. Assume this newly
        // added/modified one is the "correct" one.
        for (const entry of collisionCheckEntries) {
          if (entry == collisionCheckEntry) {
            // You can't "collide" with yourself.
            continue;
          }
          if (headerName != entry.headerName) {
            // It's not a collision.
            continue;
          }
          // Remove the entry for the old field from the array.
          const idx = collisionCheckEntries.indexOf(entry);
          collisionCheckEntries.splice(idx, 1);
          // Remove the div for the old field from the overall headers div.
          headersDiv.removeChild(entry.div);
          break;
        }
      };

      const nameSetup = (input, container) => {
        if (headerName) {
          input.value = headerName;
        }
      };
      const nameOnChange = (input) => {
        onChange(input.value, headerValue);
      };
      const licenseHeaderName = shakaDemoMain.getLocalizedString(
          shakaDemo.MessageIds.LICENSE_HEADER_NAME);
      this.makeField_(container, licenseHeaderName, nameSetup, nameOnChange);

      const valueSetup = (input, container) => {
        if (headerValue) {
          input.value = headerValue;
        }
      };
      const valueOnChange = (input) => {
        onChange(headerName, input.value);
      };
      const licenseHeaderValue = shakaDemoMain.getLocalizedString(
          shakaDemo.MessageIds.LICENSE_HEADER_VALUE);
      this.makeField_(container, licenseHeaderValue, valueSetup, valueOnChange);
    };
    if (assetInProgress.licenseRequestHeaders.size == 0) {
      // It starts out with a single empty row, but each time you start filling
      // out one for the first time it adds a new one. Empty rows are ignored in
      // the actual data.
      makeEmptyRow();
    } else {
      // Make a row for each header.
      for (const headerName of assetInProgress.licenseRequestHeaders.keys()) {
        makePreFilledRow(
            headerName, assetInProgress.licenseRequestHeaders.get(headerName));
      }
      // ...and also an empty one at the end.
      makeEmptyRow();
    }

    return headersDiv;
  }


  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsHLS_(assetInProgress, inputsToCheck) {
    const mediaPlaylistDiv = document.createElement('div');
    const containerStyle = shakaDemo.InputContainer.Style.FLEX;
    const container = new shakaDemo.InputContainer(
        mediaPlaylistDiv, /* headerText= */ null, containerStyle,
        /* docLink= */ null);
    container.getClassList().add('wide-input');
    container.setDefaultRowClass('wide-input');

    const fullMimeTypeSetup = (input, container) => {
      if (assetInProgress.mediaPlaylistFullMimeType) {
        input.value = assetInProgress.mediaPlaylistFullMimeType;
      }
      const defaultConfig = shaka.util.PlayerConfiguration.createDefault();
      input.placeholder = defaultConfig.manifest.hls.mediaPlaylistFullMimeType;
    };
    const fullMimeTypeOnChange = (input) => {
      assetInProgress.setMediaPlaylistFullMimeType(input.value);
    };
    const fullMimeTypeName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.HLS_FULL_MIME_TYPE);
    this.makeField_(
        container, fullMimeTypeName, fullMimeTypeSetup, fullMimeTypeOnChange);

    return mediaPlaylistDiv;
  }


  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsAds_(assetInProgress, inputsToCheck) {
    const adsDiv = document.createElement('div');
    const containerStyle = shakaDemo.InputContainer.Style.VERTICAL;
    const container = new shakaDemo.InputContainer(
        adsDiv, /* headerText= */ null, containerStyle,
        /* docLink= */ null);

    // Make the ad tag URL field.
    const adTagSetup = (input, container) => {
      if (assetInProgress.adTagUri) {
        input.value = assetInProgress.adTagUri;
      }
    };
    const adTagOnChange = (input) => {
      assetInProgress.adTagUri = input.value;
    };
    const adTagURLName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.AD_TAG_URL);
    this.makeField_(
        container, adTagURLName, adTagSetup, adTagOnChange);

    // Make the content source id field.
    const contentSrcIdSetup = (input, container) => {
      if (assetInProgress.imaContentSrcId) {
        input.value = assetInProgress.imaContentSrcId;
      }

      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const contentSrcIdOnChange = (input) => {
      assetInProgress.imaContentSrcId = input.value;
      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const contentSrcIdName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.IMA_CONTENT_SRC_ID);
    this.makeField_(
        container, contentSrcIdName, contentSrcIdSetup, contentSrcIdOnChange);

    // Make the video id field.
    const videoIdSetup = (input, container) => {
      if (assetInProgress.imaVideoId) {
        input.value = assetInProgress.imaVideoId;
      }

      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const videoIdOnChange = (input) => {
      assetInProgress.imaVideoId = input.value;
      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const videoIdName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.IMA_VIDEO_ID);
    this.makeField_(
        container, videoIdName, videoIdSetup, videoIdOnChange);

    // Make the asset key field.
    const assetKeySetup = (input, container) => {
      if (assetInProgress.imaAssetKey) {
        input.value = assetInProgress.imaAssetKey;
      }

      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const assetKeyChange = (input) => {
      assetInProgress.imaAssetKey = input.value;
      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const assetKeyName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.IMA_ASSET_KEY);
    this.makeField_(
        container, assetKeyName, assetKeySetup, assetKeyChange);

    // Make the manifest type field.
    const manifestTypeSetup = (input, container) => {
      if (assetInProgress.imaManifestType) {
        input.value = assetInProgress.imaManifestType;
      }

      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const manifestTypeChange = (input) => {
      assetInProgress.imaManifestType = input.value;
      this.manifestField_.required =
        this.checkManifestRequired_(assetInProgress);
    };
    const manifestTypeName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.IMA_MANIFEST_TYPE);
    this.makeField_(
        container, manifestTypeName, manifestTypeSetup, manifestTypeChange);

    return adsDiv;
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsDrm_(assetInProgress, inputsToCheck) {
    const drmDiv = document.createElement('div');
    const containerStyle = shakaDemo.InputContainer.Style.VERTICAL;
    const container = new shakaDemo.InputContainer(
        drmDiv, /* headerText= */ null, containerStyle,
        /* docLink= */ null);

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
    const licenseServerURLName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.LICENSE_SERVER_URL);
    this.makeField_(
        container, licenseServerURLName, licenseSetup, licenseOnChange);

    // Make the license certificate URL field.
    const certSetup = (input, container) => {
      if (assetInProgress.certificateUri) {
        input.value = assetInProgress.certificateUri;
      }
    };
    const certOnChange = (input) => {
      assetInProgress.certificateUri = input.value;
    };
    const licenseCertificateURLName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.LICENSE_CERTIFICATE_URL);
    this.makeField_(
        container, licenseCertificateURLName, certSetup, certOnChange);

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
    const DRMSystemName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.DRM_SYSTEM);
    this.makeField_(
        container, DRMSystemName, drmSetup, drmOnChange);

    return drmDiv;
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsExtra_(assetInProgress, inputsToCheck) {
    const extraConfigDiv = document.createElement('div');
    const containerStyle = shakaDemo.InputContainer.Style.FLEX;
    const container = new shakaDemo.InputContainer(
        extraConfigDiv, /* headerText= */ null, containerStyle,
        /* docLink= */ null);
    container.getClassList().add('wide-input');
    container.setDefaultRowClass('wide-input');

    const extraSetup = (input, container) => {
      input.setAttribute('rows', 10);

      if (assetInProgress.extraConfig) {
        // Pretty-print the extra config.
        input.value = JSON.stringify(
            assetInProgress.extraConfig,
            /* replacer= */ null, /* spacing= */ 2);
      }

      inputsToCheck.push(input);

      // Make an error that shows up if you did not provide valid JSON.
      const error = document.createElement('span');
      error.classList.add('mdl-textfield__error');
      error.textContent = shakaDemoMain.getLocalizedString(
          shakaDemo.MessageIds.INVALID_JSON_CONFIG_ERROR);

      container.appendChild(error);
    };
    const extraOnChange = (inputElement, inputWrapper) => {
      try {
        if (!inputElement.value) {
          assetInProgress.extraConfig = null;
        } else {
          const config = /** @type {!Object} */(JSON.parse(inputElement.value));
          assetInProgress.extraConfig = config;
        }
        inputWrapper.setValid(true);
      } catch (exception) {
        inputWrapper.setValid(false);
      }
    };
    const extraConfigLabel = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.EXTRA_SHAKA_PLAYER_CONFIG);
    this.makeField_(
        container, extraConfigLabel, extraSetup, extraOnChange,
        /* isTextArea= */ true);

    return extraConfigDiv;
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @param {!Element} iconDiv
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsMain_(assetInProgress, inputsToCheck, iconDiv) {
    const mainDiv = document.createElement('div');
    const containerStyle = shakaDemo.InputContainer.Style.VERTICAL;
    const container = new shakaDemo.InputContainer(
        mainDiv, /* headerText= */ null, containerStyle,
        /* docLink= */ null);

    // Make the manifest URL field.
    const manifestSetup = (input, container) => {
      input.value = assetInProgress.manifestUri;
      inputsToCheck.push(input);

      // Make an error that shows up if you did not provide an URL.
      const error = document.createElement('span');
      error.classList.add('mdl-textfield__error');
      error.textContent = shakaDemoMain.getLocalizedString(
          shakaDemo.MessageIds.MANIFEST_URL_ERROR);
      container.appendChild(error);

      // Add a regex that will detect empty strings.
      input.required = this.checkManifestRequired_(assetInProgress);
      input.pattern = '^(?!([\r\n\t\f\v ]+)$).*$';
      this.manifestField_ = input;
    };
    const manifestOnChange = (input) => {
      assetInProgress.manifestUri = input.value;
    };
    const manifestURLName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.MANIFEST_URL);
    this.makeField_(
        container, manifestURLName, manifestSetup, manifestOnChange);

    // Make the name field.
    const nameSetup = (input, container) => {
      input.value = assetInProgress.name;
      inputsToCheck.push(input);

      // Make an error that shows up if you have an empty/duplicate name.
      const error = document.createElement('span');
      error.classList.add('mdl-textfield__error');
      error.textContent = shakaDemoMain.getLocalizedString(
          shakaDemo.MessageIds.NAME_ERROR);
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
    const nameName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.NAME);
    this.makeField_(
        container, nameName, nameSetup, nameOnChange);

    // Make the icon field.
    const iconSetup = (input, container) => {
      if (assetInProgress.iconUri) {
        input.value = assetInProgress.iconUri;

        const img =
          /** @type {!HTMLImageElement} */(document.createElement('img'));
        img.src = input.value;
        img.alt = '';  // Not necessary to understand the page
        iconDiv.appendChild(img);
      }
    };

    const iconOnChange = (input) => {
      shaka.util.Dom.removeAllChildren(iconDiv);
      assetInProgress.iconUri = input.value;

      if (input.value) {
        const img =
          /** @type {!HTMLImageElement} */(document.createElement('img'));
        img.src = input.value;
        img.alt = '';  // Not necessary to understand the page
        iconDiv.appendChild(img);
      }
    };

    const iconURLName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.ICON_URL);
    this.makeField_(
        container, iconURLName, iconSetup, iconOnChange);

    // Make the MIME type field.
    const mimeTypeSetup = (input, container) => {
      if (assetInProgress.mimeType) {
        input.value = assetInProgress.mimeType;
      }
    };

    const mimeTypeOnChange = (input) => {
      assetInProgress.mimeType = input.value || null;
    };

    const mimeTypeName = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.MIME_TYPE);
    this.makeField_(
        container, mimeTypeName, mimeTypeSetup, mimeTypeOnChange);

    return mainDiv;
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @private
   */
  checkManifestRequired_(assetInProgress) {
    // The manifest field is required unless we're getting the manifest
    // from the Google Ad Manager using IMA ids.
    const isDaiAdManifest = (assetInProgress.imaContentSrcId &&
        assetInProgress.imaVideoId) || assetInProgress.imaAssetKey != null;
    return !isDaiAdManifest;
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @param {!Array.<!HTMLInputElement>} inputsToCheck
   * @return {!Element} div
   * @private
   */
  makeAssetDialogContentsFinish_(assetInProgress, inputsToCheck) {
    const finishDiv = document.createElement('tr');

    const buttonStyle = shakaDemo.Custom.ButtonStyle_.RAISED;
    const saveString =
        shakaDemoMain.getLocalizedString(shakaDemo.MessageIds.SAVE_BUTTON);
    finishDiv.appendChild(this.makeButton_(saveString, buttonStyle, () => {
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
    const cancelString =
        shakaDemoMain.getLocalizedString(shakaDemo.MessageIds.CANCEL_BUTTON);
    finishDiv.appendChild(this.makeButton_(cancelString, buttonStyle, () => {
      this.dialog_.close();
    }));

    return finishDiv;
  }

  /**
   * @param {!ShakaDemoAssetInfo} assetInProgress
   * @private
   */
  showAssetDialog_(assetInProgress) {
    // Remove buttons for any previous assets.
    shaka.util.Dom.removeAllChildren(this.dialog_);

    // An array of inputs which have validity checks which we care about.
    /** @type {!Array.<!HTMLInputElement>} */
    const inputsToCheck = [];

    // Make the contents divs.
    const iconDiv = document.createElement('div');
    const mainDiv = this.makeAssetDialogContentsMain_(
        assetInProgress, inputsToCheck, iconDiv);
    const drmDiv = this.makeAssetDialogContentsDrm_(
        assetInProgress, inputsToCheck);
    const headersDiv = this.makeAssetDialogContentsHeaders_(
        assetInProgress, inputsToCheck);
    const adsDiv = this.makeAssetDialogContentsAds_(
        assetInProgress, inputsToCheck);
    const hlsDiv = this.makeAssetDialogContentsHLS_(
        assetInProgress, inputsToCheck);
    const extraConfigDiv = this.makeAssetDialogContentsExtra_(
        assetInProgress, inputsToCheck);
    const finishDiv = this.makeAssetDialogContentsFinish_(
        assetInProgress, inputsToCheck);

    // Make the buttons that control which tab is visible.
    const tabDiv = document.createElement('tr');
    const tabsToHide = [];
    const buttonsToSwitch = [];
    const addTabButton = (messageId, tabToShow, startOn) => {
      const buttonStyle = shakaDemo.Custom.ButtonStyle_.PLAIN;
      const name = shakaDemoMain.getLocalizedString(messageId);
      const button = this.makeButton_(name, buttonStyle, () => {
        for (const tab of tabsToHide) {
          tab.classList.add('hidden');
        }
        tabToShow.classList.remove('hidden');
        for (const button of buttonsToSwitch) {
          button.classList.remove('mdl-button--accent');
        }
        button.classList.add('mdl-button--accent');
      });
      tabDiv.appendChild(button);
      tabsToHide.push(tabToShow);
      buttonsToSwitch.push(button);
      if (startOn) {
        button.classList.add('mdl-button--accent');
      } else {
        tabToShow.classList.add('hidden');
      }
    };
    addTabButton(
        shakaDemo.MessageIds.MAIN_TAB, mainDiv, /* startOn= */ true);
    addTabButton(
        shakaDemo.MessageIds.DRM_TAB, drmDiv, /* startOn= */ false);
    addTabButton(
        shakaDemo.MessageIds.HEADERS_TAB, headersDiv, /* startOn= */ false);
    addTabButton(
        shakaDemo.MessageIds.ADS_TAB, adsDiv, /* startOn= */ false);
    addTabButton(
        shakaDemo.MessageIds.HLS_TAB, hlsDiv, /* startOn= */ false);
    addTabButton(
        shakaDemo.MessageIds.EXTRA_TAB, extraConfigDiv, /* startOn= */ false);

    // Append the divs in the desired order.
    this.dialog_.appendChild(tabDiv);
    this.dialog_.appendChild(mainDiv);
    this.dialog_.appendChild(drmDiv);
    this.dialog_.appendChild(headersDiv);
    this.dialog_.appendChild(adsDiv);
    this.dialog_.appendChild(hlsDiv);
    this.dialog_.appendChild(extraConfigDiv);
    this.dialog_.appendChild(finishDiv);
    this.dialog_.appendChild(iconDiv);

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
      const assets =
        /** @type {!Array.<!ShakaDemoAssetInfo>} */(JSON.parse(savedString));
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
   * @param {shakaDemo.Custom.ButtonStyle_} buttonStyle
   *   What style should this button be in?
   * @param {function()} callback
   * @return {!Element}
   * @private
   */
  makeButton_(name, buttonStyle, callback) {
    const button = document.createElement('button');
    switch (buttonStyle) {
      case shakaDemo.Custom.ButtonStyle_.FAB: {
        button.classList.add('mdl-button--fab');
        button.classList.add('mdl-button--colored');
        const icon = document.createElement('i');
        icon.classList.add('material-icons-round');
        icon.textContent = name;
        button.appendChild(icon);
      } break;
      case shakaDemo.Custom.ButtonStyle_.RAISED:
        button.textContent = name;
        button.classList.add('mdl-button--raised');
        break;
      case shakaDemo.Custom.ButtonStyle_.PLAIN:
        button.textContent = name;
        break;
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
      c.addButton(shakaDemo.MessageIds.PLAY, () => {
        shakaDemoMain.loadAsset(asset);
        this.updateSelected_();
      });
      c.addButton(shakaDemo.MessageIds.EDIT_CUSTOM, async () => {
        if (asset.unstoreCallback) {
          await asset.unstoreCallback();
        }
        this.showAssetDialog_(asset);
      });
      c.addButton(shakaDemo.MessageIds.DELETE_CUSTOM, async () => {
        this.assets_.delete(asset);
        if (asset.unstoreCallback) {
          await asset.unstoreCallback();
        }
        this.saveAssetInfos_(this.assets_);
        this.remakeSavedList_();
      }, shakaDemo.MessageIds.DELETE_CUSTOM);
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
    shaka.util.Dom.removeAllChildren(this.savedList_);

    if (this.assets_.size == 0) {
      // Add in a message telling you what to do.
      const makeMessage = (textClass, text) => {
        const textElement = document.createElement('h2');
        textElement.classList.add('mdl-typography--' + textClass);
        textElement.textContent = text;
        this.savedList_.appendChild(textElement);
      };
      makeMessage('title',
          shakaDemoMain.getLocalizedString(
              shakaDemo.MessageIds.CUSTOM_INTRO_ONE));
      makeMessage('body-2',
          shakaDemoMain.getLocalizedString(
              shakaDemo.MessageIds.CUSTOM_INTRO_TWO));
      makeMessage('body-1',
          shakaDemoMain.getLocalizedString(
              shakaDemo.MessageIds.CUSTOM_INTRO_THREE));
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
 * @enum {number}
 * @private
 */
shakaDemo.Custom.ButtonStyle_ = {
  RAISED: 0,
  FAB: 1,
  PLAIN: 2,
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
