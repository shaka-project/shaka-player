/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mss.ContentProtection');

goog.require('shaka.drm.PlayReady');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A set of functions for parsing and interpreting Protection
 *   elements.
 */
shaka.mss.ContentProtection = class {
  /**
   * Parses info from the Protection elements.
   *
   * @param {!Array<!shaka.extern.xml.Node>} elements
   * @param {!Object<string, string>} keySystemsBySystemId
   * @return {!Array<shaka.extern.DrmInfo>}
   */
  static parseFromProtection(elements, keySystemsBySystemId) {
    const ContentProtection = shaka.mss.ContentProtection;
    const TXml = shaka.util.TXml;

    /** @type {!Array<!shaka.extern.xml.Node>} */
    let protectionHeader = [];
    for (const element of elements) {
      protectionHeader = protectionHeader.concat(
          TXml.findChildren(element, 'ProtectionHeader'));
    }
    if (!protectionHeader.length) {
      return [];
    }
    return ContentProtection.convertElements_(
        protectionHeader, keySystemsBySystemId);
  }

  /**
   * Gets a PlayReady license URL from a protection element
   * containing a PlayReady Header Object
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {string}
   */
  static getPlayReadyLicenseUrl(element) {
    return shaka.drm.PlayReady.getLicenseUrl(element);
  }

  /**
   * Gets a PlayReady KID from a protection element
   * containing a PlayReady Header Object
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {?string}
   * @private
   */
  static getPlayReadyKID_(element) {
    return shaka.drm.PlayReady.getPlayReadyKID(element);
  }

  /**
   * Gets a initData from a protection element.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {string} systemID
   * @param {?string} keyId
   * @return {?Array<shaka.extern.InitDataOverride>}
   * @private
   */
  static getInitDataFromPro_(element, systemID, keyId) {
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const data = Uint8ArrayUtils.fromBase64(
        /** @type {string} */ (shaka.util.TXml.getTextContents(element)));
    const systemId = Uint8ArrayUtils.fromHex(systemID.replace(/-/g, ''));
    const keyIds = new Set();
    const psshVersion = 0;
    const pssh =
        shaka.util.Pssh.createPssh(data, systemId, keyIds, psshVersion);
    return [
      {
        initData: pssh,
        initDataType: 'cenc',
        keyId: keyId,
      },
    ];
  }

  /**
   * Creates DrmInfo objects from an array of elements.
   *
   * @param {!Array<!shaka.extern.xml.Node>} elements
   * @param {!Object<string, string>} keySystemsBySystemId
   * @return {!Array<shaka.extern.DrmInfo>}
   * @private
   */
  static convertElements_(elements, keySystemsBySystemId) {
    const ContentProtection = shaka.mss.ContentProtection;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const licenseUrlParsers = ContentProtection.licenseUrlParsers_;

    /** @type {!Array<shaka.extern.DrmInfo>} */
    const out = [];

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const systemID = element.attributes['SystemID'].toLowerCase();
      const keySystem = keySystemsBySystemId[systemID];
      if (keySystem) {
        const KID = ContentProtection.getPlayReadyKID_(element);
        const initData = ContentProtection.getInitDataFromPro_(
            element, systemID, KID);

        const info = ManifestParserUtils.createDrmInfo(
            keySystem, /* encryptionScheme= */ 'cenc', initData);
        if (KID) {
          info.keyIds.add(KID);
        }

        const licenseParser = licenseUrlParsers.get(keySystem);
        if (licenseParser) {
          info.licenseServerUri = licenseParser(element);
        }

        out.push(info);
      }
    }

    return out;
  }
};

/**
 * A map of key system name to license server url parser.
 *
 * @const {!Map<string, function(!shaka.extern.xml.Node)>}
 * @private
 */
shaka.mss.ContentProtection.licenseUrlParsers_ = new Map()
    .set('com.microsoft.playready',
        shaka.mss.ContentProtection.getPlayReadyLicenseUrl)
    .set('com.microsoft.playready.recommendation',
        shaka.mss.ContentProtection.getPlayReadyLicenseUrl)
    .set('com.microsoft.playready.software',
        shaka.mss.ContentProtection.getPlayReadyLicenseUrl)
    .set('com.microsoft.playready.hardware',
        shaka.mss.ContentProtection.getPlayReadyLicenseUrl);

