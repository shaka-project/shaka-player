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


/** @private */
shakaDemo.updateButtons_ = function() {
  var assetList = document.getElementById('assetList');

  var option = assetList.options[assetList.selectedIndex];
  var storedContent = option.storedContent;
  // True if there is no DRM or if the browser supports persistent licenses for
  // any given DRM system.
  var supportsDrm = !option.asset || !option.asset.drm ||
      !option.asset.drm.length || option.asset.drm.some(function(drm) {
        return shakaDemo.support_.drm[drm] &&
            shakaDemo.support_.drm[drm].persistentState;
      });

  var storeBtn = document.getElementById('storeOffline');
  storeBtn.disabled = (!supportsDrm || storedContent != null);
  storeBtn.title = !supportsDrm ?
      'This browser does not support persistent licenses' :
      (storeBtn.disabled ? 'Selected asset is already stored offline' : '');
  var deleteBtn = document.getElementById('deleteOffline');
  deleteBtn.disabled = (storedContent == null);
  deleteBtn.title =
      deleteBtn.disabled ? 'Selected asset is not stored offline' : '';
};


/** @private */
shakaDemo.setupOffline_ = function() {
  document.getElementById('storeOffline')
      .addEventListener('click', shakaDemo.storeAsset_);
  document.getElementById('deleteOffline')
      .addEventListener('click', shakaDemo.deleteAsset_);
  document.getElementById('assetList')
      .addEventListener('change', shakaDemo.updateButtons_);
  shakaDemo.updateButtons_();
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
  if (!shakaDemo.offlineOptGroup_) {
    var assetList = document.getElementById('assetList');
    group =
        /** @type {!HTMLOptGroupElement} */ (
            document.createElement('optgroup'));
    shakaDemo.offlineOptGroup_ = group;
    group.label = 'Offline';
    assetList.appendChild(group);
  } else {
    group = shakaDemo.offlineOptGroup_;
  }

  var db = new Storage(shakaDemo.player_);
  return db.list().then(function(storedContents) {
    storedContents.forEach(function(storedContent) {
      var asset = {manifestUri: storedContent.offlineUri};

      var option = document.createElement('option');
      option.textContent =
          storedContent.appMetadata ? storedContent.appMetadata.name : '';
      option.asset = asset;
      option.storedContent = storedContent;
      group.appendChild(option);
    });

    return db.destroy();
  });
};


/** @private */
shakaDemo.storeAsset_ = function() {
  shakaDemo.closeError();

  var assetList = document.getElementById('assetList');
  var progress = document.getElementById('progress');
  var storeBtn = document.getElementById('storeOffline');
  var deleteBtn = document.getElementById('deleteOffline');
  var option = assetList.options[assetList.selectedIndex];

  var asset = shakaDemo.preparePlayer_(option.asset);

  progress.textContent = '0';
  storeBtn.disabled = true;
  deleteBtn.disabled = true;

  var metadata = {name: asset.name || asset.manifestUri};
  var storage = new shaka.offline.Storage(shakaDemo.player_);
  storage.configure(/** @type {shakaExtern.OfflineConfiguration} */ ({
    progressCallback: function(data, percent) {
      var progress = document.getElementById('progress');
      progress.textContent = (percent * 100).toFixed(2);
    }
  }));

  storage.store(asset.manifestUri, metadata).then(function() {
    shakaDemo.refreshAssetList_();
  }, function(reason) {
    var error = /** @type {!shaka.util.Error} */(reason);
    shakaDemo.onError_(error);
  }).then(function() {
    shakaDemo.updateButtons_();
    return storage.destroy();
  });
};


/** @private */
shakaDemo.deleteAsset_ = function() {
  shakaDemo.closeError();

  var assetList = document.getElementById('assetList');
  var storeBtn = document.getElementById('storeOffline');
  var deleteBtn = document.getElementById('deleteOffline');
  var option = assetList.options[assetList.selectedIndex];

  storeBtn.disabled = true;
  deleteBtn.disabled = true;

  var storage = new shaka.offline.Storage(shakaDemo.player_);
  storage.configure(/** @type {shakaExtern.OfflineConfiguration} */ ({
    progressCallback: function(data, percent) {
      var progress = document.getElementById('progress');
      progress.textContent = (percent * 100).toFixed(2);
    }
  }));

  storage.remove(option.storedContent).then(function() {
    shakaDemo.refreshAssetList_();
  }, function(reason) {
    var error = /** @type {!shaka.util.Error} */(reason);
    shakaDemo.onError_(error);
  }).then(function() {
    shakaDemo.updateButtons_();
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
