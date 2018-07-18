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
var shakaDemo = shakaDemo || {}; // eslint-disable-line no-var

/**
 * Provides integration with third-party content services.
 *
 * @constructor
 * @param {shaka.Player} player
 * @return {shakaDemo.AppPlugin}
 */
shakaDemo.AppPlugin = function(player) {};

/**
 * Registered plugin instance
 *
 * @private
 */
shakaDemo.AppPlugin.Plugin_;

/**
 * Register a plugin constructor. Expects a constructor that can either override
 * default method implementations of shakaDemo.AppPlugin on its prototype or as
 * object methods assigned in the constructor. The registered plugin will always
 * ineherit from shakaDemo.AppPlugin.
 *
 * @param {function(!shaka.Player)} plugin
 */
shakaDemo.AppPlugin.registerPlugin = function(plugin) {
  if (typeof plugin !== 'function') {
    throw new Error(`Provided plugin constructor ${plugin} is not a function`);
  }
  // use shakaDemo.AppPlugin.prototype as base clase for plugin
  let proto = Object.create(shakaDemo.AppPlugin.prototype);
  // mixin plugin class with shakaDemo.AppPlugin in case there
  // are overriding methods on the plugin prototype
  if (plugin.prototype) {
    Object.assign(proto, plugin.prototype);
  }
  // reassign plugin prototype
  plugin.prototype = proto;
  plugin.prototype.constructor = plugin;
  shakaDemo.AppPlugin.Plugin_ = plugin;
};

/**
 * Get an instance of the derived plugin class.
 *
 * @param {shaka.Player} player
 * @return {shakaDemo.AppPlugin}
 */
shakaDemo.AppPlugin.getPluginInstance = function(player) {
  if (shakaDemo.AppPlugin.Plugin_) {
    return new shakaDemo.AppPlugin.Plugin_(player);
  } else {
    return null;
  }
};

/**
 * Invoked at application startup to perform a one-time action
 * (e.g. user login), and obtain a reference to the player.
 *
 * @param {!Object.<string,string>|string} params Arbitrary plugin params.
 * @return {Promise}
 */
shakaDemo.AppPlugin.prototype.onStart = function(params) {};

/**
 * Called before Player#load, to allow the application to populate the
 * AssetInfo, and configure the player.
 *
 * @param {shakaAssets.AssetInfo} asset The asset to populate.
 * @param {!Object.<string,string>|string} params Arbitrary plugin params.
 * @return {Promise}
 */
shakaDemo.AppPlugin.prototype.onBeforeLoad = function(asset, params) {};

/**
 * This is registered as a request filter with NetworkingEngine.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shaka.extern.Request} request
 */
shakaDemo.AppPlugin.prototype.onRequest = function(requestType, request) {};

/**
 * This is registered as a response filter with NetworkingEngine.
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shaka.extern.Response} response
 */
shakaDemo.AppPlugin.prototype.onResponse = function(requestType, response) {};

/**
 * Returns an object with Player event names as keys, event listeners as
 * values.
 *
 * @return {Object<string,Function>}
 */
shakaDemo.AppPlugin.prototype.getListeners = function() {};

