/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.player.DrmSchemeInfo');

goog.require('shaka.asserts');
goog.require('shaka.player.DrmInfo');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * An object which is an interpreted form of a ContentProtection object.
 *
 * @param {string} keySystem The key system, e.g., "com.widevine.alpha".
 * @param {string} licenseServerUrl The license server URL.
 * @param {boolean} withCredentials True if the request should include cookies
 *     when sent cross-domain.  See http://goo.gl/pzY9F7 for more information.
 * @param {?{initData: !Uint8Array, initDataType: string}} initData If non-null,
 *     this overrides the initData from EME 'encrypted' events in the Player.
 *     Note that initDataType values and the formats they correspond to are
 *     {@link http://goo.gl/hKBdff specified here}.
 * @param {?shaka.player.DrmInfo.LicensePostProcessor=}
 *     opt_licensePostProcessor An optional post-processor for license
 *     responses.
 * @param {?shaka.player.DrmInfo.LicensePreProcessor=}
 *     opt_licensePreProcessor An optional pre-processor for license requests.
 * @param {shaka.player.DrmSchemeInfo.DistinctiveIdentifier=}
 *    opt_distinctiveIdentifier True indicates that the key system must
 *    support distinctive identifiers.
 * @param {shaka.player.DrmSchemeInfo.PersistentState=}
 *     opt_persistentState True indicates that the key system must
 *     support access to persistent storage.
 * @param {string=} opt_audioRobustness A key system specific string that
 *     specifies an audio decryption security level.
 * @param {string=} opt_videoRobustness A key system specific string that
 *     specifies a video decryption security level.
 * @param {?Uint8Array=} opt_serverCertificate A server certificate to be used
 *     to encrypt messages to the license server.
 * @constructor
 * @struct
 * @export
 * @deprecated Please use the new-style ContentProtection interpretation API.
 *     See {@link shaka.player.DashVideoSource.ContentProtectionCallback}.
 */
shaka.player.DrmSchemeInfo = function(
    keySystem,
    licenseServerUrl,
    withCredentials,
    initData,
    opt_licensePostProcessor,
    opt_licensePreProcessor,
    opt_distinctiveIdentifier,
    opt_persistentState,
    opt_audioRobustness,
    opt_videoRobustness,
    opt_serverCertificate) {
  /** @const {string} */
  this.keySystem = keySystem;

  /** @const {string} */
  this.licenseServerUrl = licenseServerUrl;

  /** @const {boolean} */
  this.withCredentials = withCredentials;

  /** @type {!Array.<{initData: !Uint8Array, initDataType: string}>} */
  this.initDatas = [];

  /** @const {?shaka.player.DrmInfo.LicensePostProcessor} */
  this.licensePostProcessor = opt_licensePostProcessor || null;

  /** @const {?shaka.player.DrmInfo.LicensePreProcessor} */
  this.licensePreProcessor = opt_licensePreProcessor || null;

  /** @const {boolean} */
  this.distinctiveIdentifierRequired =
      opt_distinctiveIdentifier ==
      shaka.player.DrmSchemeInfo.DistinctiveIdentifier.REQUIRED;

  /** @const {boolean} */
  this.persistentStateRequired =
      opt_persistentState ==
      shaka.player.DrmSchemeInfo.PersistentState.REQUIRED;

  /** @const {string} */
  this.audioRobustness = opt_audioRobustness || '';

  /** @const {string} */
  this.videoRobustness = opt_videoRobustness || '';

  /** @type {?Uint8Array} */
  this.serverCertificate = opt_serverCertificate || null;

  if (initData) {
    this.initDatas.push(initData);
  }
};


/**
 * @enum
 * @export
 */
shaka.player.DrmSchemeInfo.DistinctiveIdentifier = {
  'OPTIONAL': 0,
  'REQUIRED': 1
};


/**
 * @enum
 * @export
 */
shaka.player.DrmSchemeInfo.PersistentState = {
  'OPTIONAL': 0,
  'REQUIRED': 1
};


/**
 * Return a DrmSchemeInfo object for unencrypted contents.
 *
 * @return {!shaka.player.DrmSchemeInfo}
 * @export
 */
shaka.player.DrmSchemeInfo.createUnencrypted = function() {
  return new shaka.player.DrmSchemeInfo('', '', false, null);
};

