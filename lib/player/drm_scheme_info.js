/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Defines DRM scheme information.
 */

goog.provide('shaka.player.DrmSchemeInfo');

goog.require('shaka.asserts');
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
 * @param {?shaka.player.DrmSchemeInfo.LicensePostProcessor}
 *     licensePostProcessor An optional post-processor for license responses.
 * @constructor
 * @struct
 * @export
 */
shaka.player.DrmSchemeInfo =
    function(keySystem, licenseServerUrl, withCredentials, initData,
             licensePostProcessor) {
  /** @type {string} */
  this.keySystem = keySystem;

  /** @type {string} */
  this.licenseServerUrl = licenseServerUrl;

  /** @type {boolean} */
  this.withCredentials = withCredentials;

  /** @type {!Array.<{initData: !Uint8Array, initDataType: string}>} */
  this.initDatas = [];

  /** @type {?shaka.player.DrmSchemeInfo.LicensePostProcessor} */
  this.licensePostProcessor = licensePostProcessor;

  if (initData) {
    this.initDatas.push(initData);
  }
};


/**
 * A callback which does application-specific post-processing on license
 * responses before they are passed to the CDM.
 *
 * Returns the raw license after application-specific headers have been removed.
 *
 * @typedef {function(!Uint8Array):!Uint8Array}
 */
shaka.player.DrmSchemeInfo.LicensePostProcessor;



/**
 * A set of basic restrictions on playback.
 *
 * The video source will not adapt to a video track which exceeds any
 * limitations set here.
 *
 * @constructor
 * @struct
 */
shaka.player.DrmSchemeInfo.Restrictions = function() {
  /**
   * If set, specifies a maximum height for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.maxHeight = null;

  /**
   * If set, specifies a maximum width for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.maxWidth = null;

  /**
   * If set, specifies a maximum bandwidth for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.maxBandwidth = null;

  /**
   * If set, specifies a minimum bandwidth for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.minBandwidth = null;
};


/**
 * @return {!shaka.player.DrmSchemeInfo.Restrictions}
 *     A copy of the current restrictions
 */
shaka.player.DrmSchemeInfo.Restrictions.prototype.clone = function() {
  var restrictions = new shaka.player.DrmSchemeInfo.Restrictions();
  restrictions.maxHeight = this.maxHeight;
  restrictions.maxWidth = this.maxWidth;
  restrictions.maxBandwidth = this.maxBandwidth;
  restrictions.minBandwidth = this.minBandwidth;
  return restrictions;
};


/**
 * Return a DrmSchemeInfo object for unencrypted contents.
 * @return {!shaka.player.DrmSchemeInfo}
 * @export
 */
shaka.player.DrmSchemeInfo.createUnencrypted = function() {
  return new shaka.player.DrmSchemeInfo('', '', false, null, null);
};


/**
 * Combine two DrmSchemeInfos.  Their |keySystem| and |withCredentials| members
 * must match.
 *
 * The |licenseServerUrl| and |licensePostProcessor| of the combined
 * DrmSchemeInfo will be taken from |a|.
 *
 * @param {!shaka.player.DrmSchemeInfo} a
 * @param {!shaka.player.DrmSchemeInfo} b
 * @return {!shaka.player.DrmSchemeInfo}
 * @export
 */
shaka.player.DrmSchemeInfo.combine = function(a, b) {
  shaka.asserts.assert(a.keySystem == b.keySystem, 'key system mismatch');
  shaka.asserts.assert(a.withCredentials == b.withCredentials,
                       'credentials mismatch');

  var c = new shaka.player.DrmSchemeInfo(
      a.keySystem, a.licenseServerUrl, a.withCredentials, null,
      a.licensePostProcessor);

  var initDatas = a.initDatas.concat(b.initDatas);

  /**
   * @param {{initData: !Uint8Array, initDataType: string}} o
   * @return {string}
   */
  var initDataKey = function(o) {
    return shaka.util.Uint8ArrayUtils.key(o.initData);
  };
  c.initDatas = shaka.util.ArrayUtils.removeDuplicates(initDatas, initDataKey);

  return c;
};


/**
 * Generate a key for this DrmSchemeInfo.
 * If two DrmSchemeInfos are equal, they should generate the same key.
 * @return {string}
 */
shaka.player.DrmSchemeInfo.prototype.key = function() {
  return JSON.stringify(this);
};

