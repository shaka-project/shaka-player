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
var ShakaDemoUtils = {};


/**
 * @param {shakaAssets.AssetInfo} asset
 * @param {shaka.Player} player
 */
ShakaDemoUtils.setupAssetMetadata = function(asset, player) {
  var config = /** @type {shakaExtern.PlayerConfiguration} */(
      { drm: {}, manifest: { dash: {} } });

  // Add config from this asset.
  if (asset.licenseServers)
    config.drm.servers = asset.licenseServers;
  if (asset.drmCallback)
    config.manifest.dash.customScheme = asset.drmCallback;
  if (asset.clearKeys)
    config.drm.clearKeys = asset.clearKeys;
  player.configure(config);

  // Configure network filters.
  var networkingEngine = player.getNetworkingEngine();
  networkingEngine.clearAllRequestFilters();
  networkingEngine.clearAllResponseFilters();

  if (asset.licenseRequestHeaders) {
    var filter = ShakaDemoUtils.addLicenseRequestHeaders_.bind(
        null, asset.licenseRequestHeaders);
    networkingEngine.registerRequestFilter(filter);
  }

  if (asset.requestFilter)
    networkingEngine.registerRequestFilter(asset.requestFilter);
  if (asset.responseFilter)
    networkingEngine.registerResponseFilter(asset.responseFilter);
  if (asset.extraConfig)
    player.configure(/** @type {shakaExtern.PlayerConfiguration} */(
        asset.extraConfig));
};


/**
 * @param {!Object.<string, string>} headers
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shakaExtern.Request} request
 * @private
 */
ShakaDemoUtils.addLicenseRequestHeaders_ =
    function(headers, requestType, request) {
  if (requestType != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

  // Add these to the existing headers.  Do not clobber them!
  // For PlayReady, there will already be headers in the request.
  for (var k in headers) {
    request.headers[k] = headers[k];
  }
};
