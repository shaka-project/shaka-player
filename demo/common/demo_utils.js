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


/** @namespace */
let ShakaDemoUtils = {};


/**
 * @param {shakaAssets.AssetInfo} asset
 * @param {shaka.Player} player
 */
ShakaDemoUtils.setupAssetMetadata = function(asset, player) {
  let config = /** @type {shaka.extern.PlayerConfiguration} */(
      {drm: {}, manifest: {dash: {}}});

  // Add config from this asset.
  if (asset.licenseServers) {
    config.drm.servers = asset.licenseServers;
  }
  if (asset.drmCallback) {
    config.manifest.dash.customScheme = asset.drmCallback;
  }
  if (asset.clearKeys) {
    config.drm.clearKeys = asset.clearKeys;
  }
  player.configure(config);

  // Configure network filters.
  let networkingEngine = player.getNetworkingEngine();
  networkingEngine.clearAllRequestFilters();
  networkingEngine.clearAllResponseFilters();

  if (asset.licenseRequestHeaders) {
    let filter = ShakaDemoUtils.addLicenseRequestHeaders_.bind(
        null, asset.licenseRequestHeaders);
    networkingEngine.registerRequestFilter(filter);
  }

  if (asset.requestFilter) {
    networkingEngine.registerRequestFilter(asset.requestFilter);
  }
  if (asset.responseFilter) {
    networkingEngine.registerResponseFilter(asset.responseFilter);
  }
  if (asset.extraConfig) {
    player.configure(
        /** @type {shaka.extern.PlayerConfiguration} */ (asset.extraConfig));
  }
};


/**
 * @param {!Object.<string, string>} headers
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shaka.extern.Request} request
 * @private
 */
ShakaDemoUtils.addLicenseRequestHeaders_ =
    function(headers, requestType, request) {
  if (requestType != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

  // Add these to the existing headers.  Do not clobber them!
  // For PlayReady, there will already be headers in the request.
  for (let k in headers) {
    request.headers[k] = headers[k];
  }
};


/**
 * Return true if the current content is in the Transport Stream format.
 * Used to decide if the caption button is shown all the time in the demo,
 * and whether to show 'Default Text' as a Text Track option.
 *
 * @param {shaka.Player} player
 * @return {boolean}
 */
ShakaDemoUtils.isTsContent = function(player) {
  let activeTracks = player.getVariantTracks().filter(function(track) {
    return track.active == true;
  });
  let activeTrack = activeTracks[0];
  if (activeTrack) {
    return activeTrack.mimeType == 'video/mp2t';
  }
  return false;
};


/**
 * Creates a number of asset buttons, with selection functionality.
 * Clicking one of these elements will add the "selected" tag to it, and remove
 * the "selected" tag from the previously selected element.
 * @param {!Element} parentDiv The div to place the buttons in.
 * @param {!Array.<shakaAssets.AssetInfo>} assets The assets that should be
 *   given buttons.
 * @param {?shakaAssets.AssetInfo} selectedAsset An asset that should start out
 *   selected.
 * @param {function(!Element, shakaAssets.AssetInfo)} layout A function that is
 *   called to lay out the contents of a button.
 * @param {function(shakaAssets.AssetInfo)} onclick A function that is called
 *   when a button is clicked. This is after giving the button the "selected"
 *   tag.
 */
ShakaDemoUtils.createAssetButtons = function(
    parentDiv, assets, selectedAsset, layout, onclick) {
  let assetButtons = [];
  for (let asset of assets) {
    let button = document.createElement('div');
    layout(button, asset);
    button.onclick = () => {
      onclick(asset);
      for (let button of assetButtons) {
        button.removeAttribute('selected');
      }
      button.setAttribute('selected', '');
    };
    parentDiv.appendChild(button);
    assetButtons.push(button);

    if (asset == selectedAsset) {
      button.setAttribute('selected', '');
    }
  }
};

/**
 * Goes through the various values in shaka.extern.PlayerConfiguration, and
 * calls the given callback on them so that they can be stored to or read from
 * an URL hash.
 * @param {function(string, string)} callback A callback to call on each config
 *   value that can be automatically handled. The first parameter is the
 *   hashName (desired name in the hash). The second parameter is the configName
 *   (the full path of the value, as found in the config object).
 * @param {!shaka.extern.PlayerConfiguration} config A config object to use for
 *   reference. Note that the exact config values in this are not used; it is
 *   checked only to determine the shape and structure of a PlayerConfiguration
 *   object.
 */
ShakaDemoUtils.runThroughHashParams = (callback, config) => {
  // Override the "natural" name for a config value in the hash.
  // This exists for legacy reasons; the previous demo page had some hash values
  // set to names that did not match the names of their corresonding config
  // object name.
  let overridden = [];
  let configOverride = (hashName, configName) => {
    overridden.push(configName);
    callback(hashName, configName);
  };

  // Override config values with custom names.
  configOverride('audiolang', 'preferredAudioLanguage');
  configOverride('textlang', 'preferredTextLanguage');
  configOverride('channels', 'preferredAudioChannelCount');

  // Override config values that are handled manually.
  overridden.push('abr.enabled');
  overridden.push('streaming.jumpLargeGaps');

  // Determine which config values should be given full namespace names.
  // This is to remove ambiguity in situations where there are two objects in
  // the config that share a key with the same name, without wasting space by
  // pointlessly adding namespace information to every value.
  let added = [];
  let collisions = [];
  let findCollisions = (object) => {
    for (let key in object) {
      if (added.includes(key) && !collisions.includes(key)) {
        collisions.push(key);
      }
      added.push(key);

      let value = object[key];
      if (typeof value != 'number' && typeof value != 'string' &&
          typeof value != 'boolean') {
        findCollisions(value);
      }
    }
  };
  findCollisions(config);

  // TODO: This system for handling name collisions does mean that, if a new
  // collision appears later on, old hashes will become invalid.
  // E.g. if we add 'manifest.bufferBehind', then suddenly the page will
  // discard any 'bufferBehind=' values from old hashes.

  // Now automatically do other config values.
  let handleConfig = (object, accumulated) => {
    for (let key in object) {
      let hashName = key;
      let configName = accumulated + key;
      if (overridden.includes(configName)) continue;
      if (collisions.includes(key)) {
        hashName = configName;
      }

      let value = object[key];
      if (typeof value == 'number' || typeof value == 'string' ||
          typeof value == 'boolean') {
        callback(hashName, configName);
      } else {
        handleConfig(value, configName + '.');
      }
    }
  };
  handleConfig(config, '');
};


/**
 * @return {boolean} True if the browser would support the uncompiled build.
 */
ShakaDemoUtils.browserSupportsUncompiledMode = () => {
  // Check if ES6 arrow function syntax and ES7 async are usable.  Both are
  // needed for uncompiled builds to work.
  try {
    eval('async ()=>{}');
    return true;
  } catch (e) {
    return false;
  }
};
