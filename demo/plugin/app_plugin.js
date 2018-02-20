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

/**
 * Dictionary of plugin constructors.
 *
 * @type {!Object.<string, shakaDemo.AppPlugin>}
 */
var appPlugins = {};

/**
 * Register a plugin constructor by name.
 *
 * @param {string} name
 * @param {shakaDemo.AppPlugin} plugin
 */
shakaDemo.AppPlugin.registerPlugin = function (name, plugin) {
  if (appPlugins[name]) {
    throw Error('Already a plugin registered with name ' + name);
  }

  appPlugins[name] = plugin;
};

/**
 * Get an instance of a registered plugin by name.
 *
 * @param {string} name
 * @param {shaka.Player} player
 */
shakaDemo.AppPlugin.getPluginInstance = function (name, player) {
  var plugin = appPlugins[name];

  if (typeof plugin != 'function') {
    throw Error('No plugin with the name ' + name);
  }

  return new plugin(player);
};

/**
 * Provides integration with third-party content services.
 *
 * @param {shaka.Player} player
 */
shakaDemo.AppPlugin = function(player) {};

/**
 * Invoked at application startup to perform a one-time action (e.g. user login),
 * and obtain a reference to the player.
 *
 * @param {string} params Arbitrary params to be interpreted by the plugin.
 * @returns {Promise}
 */
shakaDemo.AppPlugin.prototype.onStart = function(params) {};

/**
 * Called before Player#load, to allow the application to populate the
 * AssetInfo, and configure the player.
 *
 * @param {shakaAssets.AssetInfo} asset The asset to populate.
 * @param {string} params Arbitrary params to be interpreted by the plugin.
 * @returns {Promise}
 */
shakaDemo.AppPlugin.prototype.onBeforeLoad = function(asset, params) {};

/**
 * This is registered as a request filter with NetworkingEngine.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shakaExtern.Request} request
 */
shakaDemo.AppPlugin.prototype.onRequest = function(requestType, request) {};

/**
 * This is registered as a response filter with NetworkingEngine.
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shakaExtern.Response} response
 */
shakaDemo.AppPlugin.prototype.onResponse = function (requestType, response) {};

/**
 * Returns an object with Player event names as keys, event listeners as
 * values.
 *
 * @returns {Object<string,Function>}
 */
shakaDemo.AppPlugin.prototype.getListeners = function () {};

