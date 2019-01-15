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

/**
 * @fileoverview Shaka Player demo, main section.
 *
 * @suppress {visibility} to work around compiler errors until we can
 *   refactor the demo into classes that talk via public method.  TODO
 */


/** @suppress {duplicate} */
var shakaDemo = shakaDemo || {};  // eslint-disable-line no-var


/** @private {?HTMLOptGroupElement} */
shakaDemo.offlineOptGroup_ = null;


/** @private {boolean} */
shakaDemo.offlineOperationInProgress_ = false;


/**
 * @param {boolean} canHide True to hide the progress value if there isn't an
 *   operation going.
 * @private
 */
shakaDemo.updateButtons_ = function(canHide) {
  let assetList = document.getElementById('assetList');
  let inProgress = shakaDemo.offlineOperationInProgress_;

  document.getElementById('progressDiv').style.display =
      canHide && !inProgress ? 'none' : 'block';

  let option = assetList.options[assetList.selectedIndex];
  let storedContent = option.storedContent;
  let supportsPersistentStateForAsset = true;
  let supportsPersistentState = true;
  let supportsOfflineStorage = true;
  // Persistent state support only matters if the asset has DRM.
  if (option.asset && option.asset.drm && option.asset.drm.length) {
    supportsPersistentStateForAsset = option.asset.drm.some(function(drm) {
          return shakaDemo.support_.drm[drm] &&
              shakaDemo.support_.drm[drm].persistentState;
        });
    supportsPersistentState =
        Object.keys(shakaDemo.support_.drm).some((drm) => {
      return shakaDemo.support_.drm[drm] &&
             shakaDemo.support_.drm[drm].persistentState;
    });
  }
  if (option.asset && option.asset.features) {
    if (!option.asset.features.includes(shakaAssets.Feature.OFFLINE)) {
      // For whatever reason, this asset can't handle offline storage.
      supportsOfflineStorage = false;
    }
  }

  // Only show when the custom asset option is selected.
  document.getElementById('offlineNameDiv').style.display =
      option.asset ? 'none' : 'block';

  let button = document.getElementById('storeDeleteButton');
  button.disabled = false;
  button.textContent = storedContent ? 'Delete' : 'Store';
  let helpText = document.getElementById('storeDeleteHelpText');
  if (inProgress) {
    button.disabled = true;
    helpText.textContent = 'Operation is in progress...';
  } else if (!supportsPersistentState) {
    button.disabled = true;
    helpText.textContent = 'This browser does not support persistent licenses.';
  } else if (!supportsPersistentStateForAsset) {
    button.disabled = true;
    helpText.textContent = 'This browser does not support persistent ' +
                           'licenses for any DRM system in this asset.';
  } else if (option.isStored) {
    button.disabled = true;
    helpText.textContent = 'The asset is stored offline. ' +
        'Checkout the "Offline" section in the "Asset" list';
  } else if (!supportsOfflineStorage) {
    button.disabled = true;
    helpText.textContent = 'The asset does not support offline storage.';
  } else {
    helpText.textContent = '';
  }
};


/** @private */
shakaDemo.setupOffline_ = function() {
  document.getElementById('storeDeleteButton')
      .addEventListener('click', shakaDemo.storeDeleteAsset_);
  document.getElementById('assetList')
      .addEventListener('change', shakaDemo.updateButtons_.bind(null, true));
  shakaDemo.updateButtons_(true);
};


/**
 * @return {!Promise}
 * @private
 */
shakaDemo.setupOfflineAssets_ = function() {
  const Storage = shaka.offline.Storage;
  if (!Storage.support()) {
    let section = document.getElementById('offlineSection');
    section.style.display = 'none';
    return Promise.resolve();
  }

  /** @type {!HTMLOptGroupElement} */
  let group;
  let assetList = document.getElementById('assetList');
  if (!shakaDemo.offlineOptGroup_) {
    group =
        /** @type {!HTMLOptGroupElement} */ (
            document.createElement('optgroup'));
    shakaDemo.offlineOptGroup_ = group;
    group.label = 'Offline';
    assetList.appendChild(group);
  } else {
    group = shakaDemo.offlineOptGroup_;
  }

  let db = new Storage(shakaDemo.localPlayer_);
  return db.list().then(function(storedContents) {
    storedContents.forEach(function(storedContent) {
      for (let i = 0; i < assetList.options.length; i++) {
        let option = assetList.options[i];
        if (option.asset &&
            option.asset.manifestUri == storedContent.originalManifestUri) {
          option.isStored = true;
          break;
        }
      }
      let asset = {manifestUri: storedContent.offlineUri};

      let option = document.createElement('option');
      option.textContent =
          storedContent.appMetadata ? storedContent.appMetadata.name : '';
      option.asset = asset;
      option.storedContent = storedContent;
      group.appendChild(option);
    });

    shakaDemo.updateButtons_(true);
    return db.destroy();
  });
};


/** @private */
shakaDemo.storeDeleteAsset_ = function() {
  shakaDemo.closeError();
  shakaDemo.offlineOperationInProgress_ = true;
  shakaDemo.updateButtons_(false);

  let assetList = document.getElementById('assetList');
  let progress = document.getElementById('progress');
  let option = assetList.options[assetList.selectedIndex];

  progress.textContent = '0';

  let storage = new shaka.offline.Storage(shakaDemo.localPlayer_);
  storage.configure(/** @type {shakaExtern.OfflineConfiguration} */ ({
    progressCallback: function(data, percent) {
      progress.textContent = (percent * 100).toFixed(2);
    }
  }));

  let p;
  if (option.storedContent) {
    let offlineUri = option.storedContent.offlineUri;
    let originalManifestUri = option.storedContent.originalManifestUri;

    // If this is a stored demo asset, we'll need to configure the player with
    // license server authentication so we can delete the offline license.
    for (let i = 0; i < shakaAssets.testAssets.length; i++) {
      let originalAsset = shakaAssets.testAssets[i];
      if (originalManifestUri == originalAsset.manifestUri) {
        shakaDemo.preparePlayer_(originalAsset);
        break;
      }
    }

    p = storage.remove(offlineUri).then(function() {
      for (let i = 0; i < assetList.options.length; i++) {
        let option = assetList.options[i];
        if (option.asset && option.asset.manifestUri == originalManifestUri) {
          option.isStored = false;
        }
      }
      return shakaDemo.refreshAssetList_();
    });
  } else {
    let asset = shakaDemo.preparePlayer_(option.asset);
    let nameField = document.getElementById('offlineName').value;
    let assetName = asset.name ? '[OFFLINE] ' + asset.name : null;
    let metadata = {name: assetName || nameField || asset.manifestUri};
    p = storage.store(asset.manifestUri, metadata).then(function() {
      if (option.asset) {
        option.isStored = true;
      }
      return shakaDemo.refreshAssetList_().then(function() {
        // Auto-select offline copy of asset after storing.
        let group = shakaDemo.offlineOptGroup_;
        for (let i = 0; i < group.childNodes.length; i++) {
          let option = group.childNodes[i];
          if (option.textContent == assetName) {
            assetList.selectedIndex = option.index;
          }
        }
      });
    });
  }

  p.catch(function(reason) {
    let error = /** @type {!shaka.util.Error} */(reason);
    shakaDemo.onError_(error);
  }).then(function() {
    shakaDemo.offlineOperationInProgress_ = false;
    shakaDemo.updateButtons_(true /* canHide */);
    return storage.destroy();
  });
};


/**
 * @return {!Promise}
 * @private
 */
shakaDemo.refreshAssetList_ = function() {
  // Remove all child elements.
  let group = shakaDemo.offlineOptGroup_;
  while (group.firstChild) {
    group.removeChild(group.firstChild);
  }

  return shakaDemo.setupOfflineAssets_();
};


/**
 * @param {boolean} connected
 * @private
 */
shakaDemo.onCastStatusChange_ = function(connected) {
  if (!shakaDemo.offlineOptGroup_) {
    // No offline support.
    return;
  }

  // When we are casting, offline assets become unavailable.
  shakaDemo.offlineOptGroup_.disabled = connected;

  if (connected) {
    let assetList = document.getElementById('assetList');
    let option = assetList.options[assetList.selectedIndex];
    if (option.storedContent) {
      // This is an offline asset.  Select something else.
      assetList.selectedIndex = 0;
    }
  }
};
