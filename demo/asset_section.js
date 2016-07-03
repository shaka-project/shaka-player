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


/** @private */
shakaDemo.setupAssets_ = function() {
  // Populate the asset list.
  var assetList = document.getElementById('assetList');
  /** @type {!Object.<string, !HTMLOptGroupElement>} */
  var groups = {};
  var first = null;
  shakaAssets.testAssets.forEach(function(asset) {
    if (asset.disabled) return;

    var group = groups[asset.source];
    if (!group) {
      group = /** @type {!HTMLOptGroupElement} */(
          document.createElement('optgroup'));
      group.label = asset.source;
      groups[asset.source] = group;
      assetList.appendChild(group);
    }

    var option = document.createElement('option');
    option.textContent = asset.name;
    option.asset = asset;  // custom attribute to map back to the asset
    group.appendChild(option);

    if (asset.drm.length && !asset.drm.some(
        function(keySystem) { return shakaDemo.support_.drm[keySystem]; })) {
      option.disabled = true;
    }

    var mimeTypes = [];
    if (asset.features.indexOf(shakaAssets.Feature.WEBM) >= 0)
      mimeTypes.push('video/webm');
    if (asset.features.indexOf(shakaAssets.Feature.MP4) >= 0)
      mimeTypes.push('video/mp4');
    if (!mimeTypes.some(
        function(type) { return shakaDemo.support_.media[type]; })) {
      option.disabled = true;
    }

    if (!option.disabled) {
      first = first || option;
      if (asset.focus) first = option;
    }
  });

  if (first) {
    first.selected = true;
  }

  shakaDemo.setupOfflineAssets_();

  // Add an extra option for custom assets.
  var option = document.createElement('option');
  option.textContent = '(custom asset)';
  assetList.appendChild(option);

  // Show/hide the custom asset fields based on the selection.
  assetList.addEventListener('change', function() {
    var asset = assetList.options[assetList.selectedIndex].asset;
    var customAsset = document.getElementById('customAsset');
    customAsset.style.display = asset ? 'none' : 'block';
  });

  document.getElementById('loadButton').addEventListener(
      'click', shakaDemo.load);
  document.getElementById('licenseServerInput').addEventListener(
      'keyup', shakaDemo.onAssetKeyUp_);
  document.getElementById('manifestInput').addEventListener(
      'keyup', shakaDemo.onAssetKeyUp_);
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAssetKeyUp_ = function(event) {
  // Load the asset if the user presses enter.
  if (event.keyCode != 13) return;
  shakaDemo.load();
};


/**
 * Prepares the Player to load the given assets by setting the configuration
 * values.  This does not load the asset.
 *
 * @param {?shakaAssets.AssetInfo} asset
 * @return {shakaAssets.AssetInfo}
 * @private
 */
shakaDemo.preparePlayer_ = function(asset) {
  shakaDemo.closeError();

  var player = shakaDemo.player_;

  var config = /** @type {shakaExtern.PlayerConfiguration} */(
      { abr: {}, manifest: { dash: {} } });
  config.manifest.dash.clockSyncUri =
      '//shaka-player-demo.appspot.com/time.txt';

  if (!asset) {
    // Use the custom fields.
    var licenseServer = document.getElementById('licenseServerInput').value;
    asset = /** @type {shakaAssets.AssetInfo} */ ({
      manifestUri: document.getElementById('manifestInput').value,
      // Use the custom license server for all key systems.
      // This simplifies configuration for the user.
      // They will simply fill in a Widevine license server on Chrome, etc.
      licenseServers: {
        'com.widevine.alpha': licenseServer,
        'com.microsoft.playready': licenseServer,
        'com.adobe.primetime': licenseServer
      }
    });
  }

  player.resetConfiguration();

  // Add config from this asset.
  ShakaDemoUtils.setupAssetMetadata(asset, player);
  shakaDemo.castProxy_.setAppData({
    'asset': asset,
    'isYtDrm': asset.drmCallback == shakaAssets.YouTubeCallback
  });

  // Add configuration from the UI.
  config.preferredAudioLanguage =
      document.getElementById('preferredAudioLanguage').value;
  config.preferredTextLanguage =
      document.getElementById('preferredTextLanguage').value;
  config.abr.enabled =
      document.getElementById('enableAdaptation').checked;

  player.configure(config);

  return asset;
};


/** Load the selected asset. */
shakaDemo.load = function() {
  var assetList = document.getElementById('assetList');
  var option = assetList.options[assetList.selectedIndex];
  var player = shakaDemo.player_;

  var asset = shakaDemo.preparePlayer_(option.asset);

  // Load the manifest.
  player.load(asset.manifestUri).then(function() {
    // Update control state in case autoplay is disabled.
    shakaDemo.controls_.loadComplete();

    // Disallow casting of offline content.
    var isOffline = asset.manifestUri.indexOf('offline:') == 0;
    shakaDemo.controls_.allowCast(!isOffline);

    (asset.extraText || []).forEach(function(extraText) {
      player.addTextTrack(extraText.uri, extraText.language, extraText.kind,
                          extraText.mime, extraText.codecs);
    });
  }, function(reason) {
    var error = /** @type {!shaka.util.Error} */(reason);
    if (error.code == shaka.util.Error.Code.LOAD_INTERRUPTED) {
      shaka.log.debug('load() interrupted');
    } else {
      shakaDemo.onError_(error);
    }
  });
};
