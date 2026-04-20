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
      if (shaka.drm.DrmUtils.isClearKeyWihRawKey(drm1)) {
        return true;
      }
      for (const drm2 of drms2) {
        if (drm1.keySystem === drm2.keySystem ||
            shaka.drm.DrmUtils.isClearKeyWihRawKey(drm2)) {
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
          if (shaka.drm.DrmUtils.isClearKeyWihRawKey(drm1)) {
            commonDrms.push(drm1);
          } else if (shaka.drm.DrmUtils.isClearKeyWihRawKey(drm2)) {
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
   */
  static isClearKeyWihRawKey(drmInfo) {
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
   * @param {!Array<string>} encryptionSchemes
   * @return {string}
   * @private
   */
  static generateKeySystemCacheKey_(videoCodec, audioCodec, keySystem,
      encryptionSchemes) {
    const uniqueSchemes = new Set(encryptionSchemes);
    const schemeKey = [...uniqueSchemes].sort().join('#');
    return `${videoCodec}#${audioCodec}#${keySystem}#${schemeKey}`;
  }

  /**
   * Check does MediaKeySystemAccess cache contains something for following
   * attributes.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @param {!Array<string>} encryptionSchemes
   * @return {boolean}
   */
  static hasMediaKeySystemAccess(videoCodec, audioCodec, keySystem,
      encryptionSchemes) {
    const DrmUtils = shaka.drm.DrmUtils;
    const key = DrmUtils.generateKeySystemCacheKey_(
        videoCodec, audioCodec, keySystem, encryptionSchemes);
    return DrmUtils.memoizedMediaKeySystemAccessRequests_.has(key);
  }

  /**
   * Get MediaKeySystemAccess object for following attributes.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @param {!Array<string>} encryptionSchemes
   * @return {?MediaKeySystemAccess}
   */
  static getMediaKeySystemAccess(videoCodec, audioCodec, keySystem,
      encryptionSchemes) {
    const DrmUtils = shaka.drm.DrmUtils;
    const key = DrmUtils.generateKeySystemCacheKey_(
        videoCodec, audioCodec, keySystem, encryptionSchemes);
    return DrmUtils.memoizedMediaKeySystemAccessRequests_.get(key) || null;
  }

  /**
   * Store MediaKeySystemAccess object associated with specified attributes.
   *
   * @param {string} videoCodec
   * @param {string} audioCodec
   * @param {string} keySystem
   * @param {!Array<string>} encryptionSchemes
   * @param {!MediaKeySystemAccess} mksa
   */
  static setMediaKeySystemAccess(videoCodec, audioCodec, keySystem,
      encryptionSchemes, mksa) {
    const DrmUtils = shaka.drm.DrmUtils;
    const key = DrmUtils.generateKeySystemCacheKey_(
        videoCodec, audioCodec, keySystem, encryptionSchemes);
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

  /**
   * Returns a mapping between DRM system UUIDs and their corresponding
   * EME key system identifiers used.
   *
   * @param {boolean=} withoutDashes
   * @param {boolean=} useUrnFormat
   * @return {!Object<string, string>}
   */
  static getUuidMap(withoutDashes = false, useUrnFormat = false) {
    const baseMap = {
      '1077efec-c0b2-4d02-ace3-3c1e52e2fb4b': 'org.w3.clearkey',
      'e2719d58-a985-b3c9-781a-b030af78d30e': 'org.w3.clearkey',
      'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed': 'com.widevine.alpha',
      '9a04f079-9840-4286-ab92-e65be0885f95': 'com.microsoft.playready',
      '79f0049a-4098-8642-ab92-e65be0885f95': 'com.microsoft.playready',
      '94ce86fb-07ff-4f43-adb8-93d2fa968ca2': 'com.apple.fps',
      '3d5e6d35-9b9a-41e8-b843-dd3c6e72c42c': 'com.huawei.wiseplay',
    };

    if (!withoutDashes && !useUrnFormat) {
      return baseMap;
    }

    /** @type {!Object<string, string>} */
    const result = {};

    for (const key in baseMap) {
      const value = baseMap[key];

      let finalKey = key;
      if (useUrnFormat) {
        finalKey = 'urn:uuid:' + key;
      } else if (withoutDashes) {
        finalKey = key.replace(/-/g, '');
      }

      result[finalKey] = value;
    }

    return result;
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
