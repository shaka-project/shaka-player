/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.drm.DrmUtils');

goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Lazy');


shaka.drm.DrmUtils = class {
  /**
   * Returns true if the browser has recent EME APIs.
   *
   * @return {boolean}
   */
  static isBrowserSupported() {
    const basic =
        !!window.MediaKeys &&
        !!window.navigator &&
        !!window.navigator.requestMediaKeySystemAccess &&
        !!window.MediaKeySystemAccess &&
        // eslint-disable-next-line no-restricted-syntax
        !!window.MediaKeySystemAccess.prototype.getConfiguration;

    return basic;
  }

  /**
   * Checks if two DrmInfos can be decrypted using the same key system.
   * Clear content is considered compatible with every key system.
   *
   * @param {!Array<!shaka.extern.DrmInfo>} drms1
   * @param {!Array<!shaka.extern.DrmInfo>} drms2
   * @return {boolean}
   */
  static areDrmCompatible(drms1, drms2) {
    if (drms1 === drms2 || !drms1.length || !drms2.length) {
      return true;
    }

    for (const drm1 of drms1) {
      if (shaka.drm.DrmUtils.isClearKeyWihRawKey_(drm1)) {
        return true;
      }
      for (const drm2 of drms2) {
        if (drm1.keySystem === drm2.keySystem ||
            shaka.drm.DrmUtils.isClearKeyWihRawKey_(drm2)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Returns an array of drm infos that are present in both input arrays.
   * If one of the arrays is empty, returns the other one since clear
   * content is considered compatible with every drm info.
   *
   * @param {!Array<!shaka.extern.DrmInfo>} drms1
   * @param {!Array<!shaka.extern.DrmInfo>} drms2
   * @return {!Array<!shaka.extern.DrmInfo>}
   */
  static getCommonDrmInfos(drms1, drms2) {
    if (!drms1.length) {
      return drms2;
    }
    if (!drms2.length) {
      return drms1;
    }

    const commonDrms = [];

    for (const drm1 of drms1) {
      for (const drm2 of drms2) {
        if (drm1.keySystem == drm2.keySystem) {
          const initDataMap = new Map();
          const bothInitDatas = (drm1.initData || [])
              .concat(drm2.initData || []);
          for (const d of bothInitDatas) {
            initDataMap.set(d.keyId, d);
          }
          const initData = Array.from(initDataMap.values());

          const keyIds = drm1.keyIds && drm2.keyIds ?
              new Set([...drm1.keyIds, ...drm2.keyIds]) :
              drm1.keyIds || drm2.keyIds;
          const mergedDrm = {
            keySystem: drm1.keySystem,
            licenseServerUri: drm1.licenseServerUri || drm2.licenseServerUri,
            distinctiveIdentifierRequired: drm1.distinctiveIdentifierRequired ||
                drm2.distinctiveIdentifierRequired,
            persistentStateRequired: drm1.persistentStateRequired ||
                drm2.persistentStateRequired,
            videoRobustness: drm1.videoRobustness || drm2.videoRobustness,
            audioRobustness: drm1.audioRobustness || drm2.audioRobustness,
            serverCertificate: drm1.serverCertificate || drm2.serverCertificate,
            serverCertificateUri: drm1.serverCertificateUri ||
                drm2.serverCertificateUri,
            initData,
            keyIds,
          };
          commonDrms.push(mergedDrm);
          break;
        } else {
          if (shaka.drm.DrmUtils.isClearKeyWihRawKey_(drm1)) {
            commonDrms.push(drm1);
          } else if (shaka.drm.DrmUtils.isClearKeyWihRawKey_(drm2)) {
            commonDrms.push(drm2);
          }
        }
      }
    }

    return commonDrms;
  }

  /**
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @return {string}
   */
  static keySystem(drmInfo) {
    return drmInfo ? drmInfo.keySystem : '';
  }

  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isClearKeySystem(keySystem) {
    return keySystem === 'org.w3.clearkey';
  }

  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isWidevineKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.widevine\.alpha/);
    }

    return false;
  }

  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isPlayReadyKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.(microsoft|chromecast)\.playready/);
    }

    return false;
  }

  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isFairPlayKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.apple\.fps/);
    }

    return false;
  }

  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isWisePlayKeySystem(keySystem) {
    return keySystem === 'com.huawei.wiseplay';
  }

  /**
   * @param {shaka.extern.DrmInfo} drmInfo
   * @return {boolean}
   * @private
   */
  static isClearKeyWihRawKey_(drmInfo) {
    const licenseServerUri = drmInfo.licenseServerUri;
    if (!licenseServerUri) {
      return false;
    }
    return licenseServerUri.startsWith('data:application/json;base64,');
  }

  /**
   * A method for generating a key for the MediaKeySystemAccessRequests cache.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @return {string}
   * @private
   */
  static generateKeySystemCacheKey_(videoCodec, audioCodec, keySystem) {
    return `${videoCodec}#${audioCodec}#${keySystem}`;
  }

  /**
   * Check does MediaKeySystemAccess cache contains something for following
   * attributes.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @return {boolean}
   */
  static hasMediaKeySystemAccess(videoCodec, audioCodec, keySystem) {
    const DrmUtils = shaka.drm.DrmUtils;
    const key = DrmUtils.generateKeySystemCacheKey_(
        videoCodec, audioCodec, keySystem);
    return DrmUtils.memoizedMediaKeySystemAccessRequests_.has(key);
  }

  /**
   * Get MediaKeySystemAccess object for following attributes.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @return {?MediaKeySystemAccess}
   */
  static getMediaKeySystemAccess(videoCodec, audioCodec, keySystem) {
    const DrmUtils = shaka.drm.DrmUtils;
    const key = DrmUtils.generateKeySystemCacheKey_(
        videoCodec, audioCodec, keySystem);
    return DrmUtils.memoizedMediaKeySystemAccessRequests_.get(key) || null;
  }

  /**
   * Store MediaKeySystemAccess object associated with specified attributes.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @param {!MediaKeySystemAccess} mksa
   */
  static setMediaKeySystemAccess(videoCodec, audioCodec, keySystem, mksa) {
    const DrmUtils = shaka.drm.DrmUtils;
    const key = DrmUtils.generateKeySystemCacheKey_(
        videoCodec, audioCodec, keySystem);
    DrmUtils.memoizedMediaKeySystemAccessRequests_.set(key, mksa);
  }

  /**
   * Clears underlying cache.
   */
  static clearMediaKeySystemAccessMap() {
    shaka.drm.DrmUtils.memoizedMediaKeySystemAccessRequests_.clear();
  }

  /**
   * Returns true if MediaKeys is polyfilled by the specified polyfill.
   *
   * @param {string} polyfillType
   * @return {boolean}
   */
  static isMediaKeysPolyfilled(polyfillType) {
    return polyfillType === window.shakaMediaKeysPolyfill;
  }
};


/**
 * Contains the suggested "default" key ID used by EME polyfills that do not
 * have a per-key key status. See w3c/encrypted-media#32.
 * @type {!shaka.util.Lazy<!ArrayBuffer>}
 */
shaka.drm.DrmUtils.DUMMY_KEY_ID = new shaka.util.Lazy(
    () => shaka.util.BufferUtils.toArrayBuffer(new Uint8Array([0])));


/**
 * A cache that stores the MediaKeySystemAccess result of calling
 * `navigator.requestMediaKeySystemAccess` by a key combination of
 * video/audio codec and key system string.
 *
 * @private {!Map<string, !MediaKeySystemAccess>}
 */
shaka.drm.DrmUtils.memoizedMediaKeySystemAccessRequests_ = new Map();
