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


goog.provide('shaka.ui.AdManager');

goog.require('shaka.ui.ClientSideAdManager');


/**
 * A class responsible for ad-related interactions.
 * @export
 */
shaka.ui.AdManager = class {
  /**
   * @param {!shaka.ui.Controls} controls
   */
  constructor(controls) {
    this.csAdManager_ =
      new shaka.ui.ClientSideAdManager(controls);

    // TODO: Server side
  }


  /**
   * @param {!google.ima.AdsRequest} imaRequest
   */
  requestClientSideAds(imaRequest) {
    this.csAdManager_.requestAds(imaRequest);
  }


  /**
   * @param {string} assetKey
   * @param {string} assetId
   * @param {boolean} isLive
   * @param {string=} backupUrl
   */
  loadServerSideStream(assetKey, assetId, isLive, backupUrl) {
    // TODO
  }
};
