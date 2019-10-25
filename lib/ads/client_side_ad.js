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


goog.provide('shaka.ads.ClientSideAd');

/**
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.ClientSideAd = class {
  /**
   * @param {!google.ima.Ad} imaAd
   * @param {!google.ima.AdsManager} imaAdManager
   */
  constructor(imaAd, imaAdManager) {
    /** @private {google.ima.Ad} */
    this.ad_ = imaAd;

    /** @private {google.ima.AdsManager} */
    this.manager_ = imaAdManager;
  }

  /**
   * @override
   * @export
   */
  getDuration() {
    return this.ad_.getDuration();
  }

  /**
   * @override
   * @export
   */
  getRemainingTime() {
    return this.manager_.getRemainingTime();
  }

  /**
   * @override
   * @export
   */
  release() {
    this.ad_ = null;
    this.manager_ = null;
  }
};
