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

 shakaDemo.appPlugin = {

  /**
   * Invoked at application startup to perform a one-time action (e.g. user login),
   * and obtain a reference to the player.
   * @param {shaka.Player} player
   * @returns {Promise}
   */
  onStart: function(player) {
    return Promise.resolve();
  },

  /**
   * Called before Player#load, to allow the application to populate the AssetInfo,
   * and configure the player.
   * @param {shakaAssets.AssetInfo} asset
   * @returns {Promise}
   */
  onBeforeLoad: function(asset) {
    return Promise.resolve();
  },

  /**
   * This is registered as a request filter with NetworkingEngine.
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shakaExtern.Request} request
   */
  onRequest: function(requestType, request) {},

  /**
   * This is registered as a response filter with NetworkingEngine.
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shakaExtern.Response} response
   */
  onResponse: function(requestType, response) {},

  /**
   * Player event names as keys, event listeners as values
   * @type {Object<string,Function>}
   */
  listeners: {}

};

