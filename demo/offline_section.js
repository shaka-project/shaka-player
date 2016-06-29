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


/** @suppress {duplicate} */
var shakaDemo = shakaDemo || {};


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
  var assetList = document.getElementById('assetList');
  var inProgress = shakaDemo.offlineOperationInProgress_;

  document.getElementById('progressDiv').style.display =
      canHide && !inProgress ? 'none' : 'block';

  var option = assetList.options[assetList.selectedIndex];
  var storedContent = option.storedContent;
  // True if there is no DRM or if the browser supports persistent licenses for
  // any given DRM system.
  var supportsDrm = !option.asset || !option.asset.drm ||
      !option.asset.drm.length || option.asset.drm.some(function(drm) {
        return shakaDemo.support_.drm[drm] &&
            shakaDemo.support_.drm[drm].persistentState;
      });

  // Only show when the custom asset option is selected.
  document.getElementById('offlineNameDiv').style.display =
      option.asset ? 'none' : 'block';

  var button = document.getElementById('storeDelete');
  button.disabled = (inProgress || !supportsDrm || option.isStored);
  button.innerText = storedContent ? 'Delete' : 'Store';
  if (inProgress)
    button.title = 'There is already an operation in progress';
  else if (!supportsDrm)
    button.title = 'This browser does not support persistent licenses';
  else if (button.disabled)
    button.title = 'Selected asset is already stored offline';
  else
    button.title = '';
};


/** @private */
shakaDemo.setupOffline_ = function() {
  document.getElementById('storeDelete')
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
  var Storage = shaka.offline.Storage;
  if (!Storage.support()) {
    var section = document.getElementById('offlineSection');
    section.style.display = 'none';
    return Promise.resolve();
  }

  /** @type {!HTMLOptGroupElement} */
  var group;
  var assetList = document.getElementById('assetList');
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

  var db = new Storage(shakaDemo.localPlayer_);
  return db.list().then(function(storedContents) {
    storedContents.forEach(function(storedContent) {
      for (var i = 0; i < assetList.options.length; i++) {
        var option = assetList.options[i];
        if (option.asset &&
            option.asset.manifestUri == storedContent.originalManifestUri) {
          option.isStored = true;
          break;
        }
      }
      var asset = {manifestUri: storedContent.offlineUri};

      var option = document.createElement('option');
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

  var assetList = document.getElementById('assetList');
  var progress = document.getElementById('progress');
  var option = assetList.options[assetList.selectedIndex];

  progress.textContent = '0';

  var storage = new shaka.offline.Storage(shakaDemo.player_);
  storage.configure(/** @type {shakaExtern.OfflineConfiguration} */ ({
    progressCallback: function(data, percent) {
      progress.textContent = (percent * 100).toFixed(2);
    }
  }));

  var p;
  if (option.storedContent) {
    var originalManifestUri = option.storedContent.originalManifestUri;
    p = storage.remove(option.storedContent).then(function() {
      for (var i = 0; i < assetList.options.length; i++) {
        var option = assetList.options[i];
        if (option.asset && option.asset.manifestUri == originalManifestUri)
          option.isStored = false;
      }
      shakaDemo.refreshAssetList_();
    });
  } else {
    var asset = shakaDemo.preparePlayer_(option.asset);
    var nameField = document.getElementById('offlineName').value;
    var assetName = asset.name ? asset.name + ' (offline)' : null;
    var metadata = {name: assetName || nameField || asset.manifestUri};
    p = storage.store(asset.manifestUri, metadata).then(function() {
      shakaDemo.refreshAssetList_();
      if (option.asset)
        option.isStored = true;
    });
  }

  p.catch(function(reason) {
    var error = /** @type {!shaka.util.Error} */(reason);
    shakaDemo.onError_(error);
  }).then(function() {
    shakaDemo.offlineOperationInProgress_ = false;
    shakaDemo.updateButtons_(false);
    return storage.destroy();
  });
};


/** @private */
shakaDemo.refreshAssetList_ = function() {
  // Remove all child elements.
  var group = shakaDemo.offlineOptGroup_;
  while (group.firstChild) {
    group.removeChild(group.firstChild);
  }

  shakaDemo.setupOfflineAssets_();
};


/**
 * @param {boolean} connected
 * @private
 */
shakaDemo.onCastStatusChange_ = function(connected) {
  // When we are casting, offline assets become unavailable.
  shakaDemo.offlineOptGroup_.disabled = connected;

  if (connected) {
    var assetList = document.getElementById('assetList');
    var option = assetList.options[assetList.selectedIndex];
    if (option.storedContent) {
      // This is an offline asset.  Select something else.
      assetList.selectedIndex = 0;
    }
  }
};
