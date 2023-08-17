/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mss.ContentProtection');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @summary A set of functions for parsing and interpreting Protection
 *   elements.
 */
shaka.mss.ContentProtection = class {
  /**
   * Parses info from the Protection elements.
   *
   * @param {!Array.<!Element>} elems
   * @param {!Object.<string, string>} keySystemsBySystemId
   * @return {!Array.<shaka.extern.DrmInfo>}
   */
  static parseFromProtection(elems, keySystemsBySystemId) {
    const ContentProtection = shaka.mss.ContentProtection;
    const XmlUtils = shaka.util.XmlUtils;

    /** @type {!Array.<!Element>} */
    let protectionHeader = [];
    for (const elem of elems) {
      protectionHeader = protectionHeader.concat(
          XmlUtils.findChildren(elem, 'ProtectionHeader'));
    }
    if (!protectionHeader.length) {
      return [];
    }
    return ContentProtection.convertElements_(
        protectionHeader, keySystemsBySystemId);
  }

  /**
   * Parses an Array buffer starting at byteOffset for PlayReady Object Records.
   * Each PRO Record is preceded by its PlayReady Record type and length in
   * bytes.
   *
   * PlayReady Object Record format: https://goo.gl/FTcu46
   *
   * @param {!DataView} view
   * @param {number} byteOffset
   * @return {!Array.<shaka.mss.ContentProtection.PlayReadyRecord>}
   * @private
   */
  static parseMsProRecords_(view, byteOffset) {
    const records = [];

    while (byteOffset < view.byteLength - 1) {
      const type = view.getUint16(byteOffset, true);
      byteOffset += 2;

      const byteLength = view.getUint16(byteOffset, true);
      byteOffset += 2;

      if ((byteLength & 1) != 0 || byteLength + byteOffset > view.byteLength) {
        shaka.log.warning('Malformed MS PRO object');
        return [];
      }

      const recordValue = shaka.util.BufferUtils.toUint8(
          view, byteOffset, byteLength);
      records.push({
        type: type,
        value: recordValue,
      });

      byteOffset += byteLength;
    }

    return records;
  }

  /**
   * Parses a buffer for PlayReady Objects.  The data
   * should contain a 32-bit integer indicating the length of
   * the PRO in bytes.  Following that, a 16-bit integer for
   * the number of PlayReady Object Records in the PRO.  Lastly,
   * a byte array of the PRO Records themselves.
   *
   * PlayReady Object format: https://goo.gl/W8yAN4
   *
   * @param {BufferSource} data
   * @return {!Array.<shaka.mss.ContentProtection.PlayReadyRecord>}
   * @private
   */
  static parseMsPro_(data) {
    let byteOffset = 0;
    const view = shaka.util.BufferUtils.toDataView(data);

    // First 4 bytes is the PRO length (DWORD)
    const byteLength = view.getUint32(byteOffset, /* littleEndian= */ true);
    byteOffset += 4;

    if (byteLength != data.byteLength) {
      // Malformed PRO
      shaka.log.warning('PlayReady Object with invalid length encountered.');
      return [];
    }

    // Skip PRO Record count (WORD)
    byteOffset += 2;

    // Rest of the data contains the PRO Records
    const ContentProtection = shaka.mss.ContentProtection;
    return ContentProtection.parseMsProRecords_(view, byteOffset);
  }

  /**
   * Parse a PlayReady Header format: https://goo.gl/dBzxNA
   * a try to find the LA_URL value.
   *
   * @param {!Element} xml
   * @return {string}
   * @private
   */
  static getLaurl_(xml) {
    // LA_URL element is optional and no more than one is
    // allowed inside the DATA element. Only absolute URLs are allowed.
    // If the LA_URL element exists, it must not be empty.
    for (const elem of xml.getElementsByTagName('DATA')) {
      const laUrl = shaka.util.XmlUtils.findChild(elem, 'LA_URL');
      if (laUrl) {
        return laUrl.textContent;
      }
    }

    // Not found
    // We return a empty string instead null because is the default value for
    // a License in our model.
    return '';
  }

  /**
   * Gets a PlayReady license URL from a protection element
   * containing a PlayReady Header Object
   *
   * @param {!Element} element
   * @return {string}
   */
  static getPlayReadyLicenseUrl(element) {
    const ContentProtection = shaka.mss.ContentProtection;
    const rootElement = ContentProtection.getPlayReadyHeaderObject_(element);
    if (!rootElement) {
      return '';
    }

    return ContentProtection.getLaurl_(rootElement);
  }

  /**
   * Parse a PlayReady Header format: https://goo.gl/dBzxNA
   * a try to find the KID value.
   *
   * @param {!Element} xml
   * @return {?string}
   * @private
   */
  static getKID_(xml) {
    // KID element is optional and no more than one is
    // allowed inside the DATA element.
    for (const elem of xml.getElementsByTagName('DATA')) {
      const kid = shaka.util.XmlUtils.findChild(elem, 'KID');
      if (kid) {
        // GUID: [DWORD, WORD, WORD, 8-BYTE]
        const guidBytes =
            shaka.util.Uint8ArrayUtils.fromBase64(kid.textContent);
        // Reverse byte order from little-endian to big-endian
        const kidBytes = new Uint8Array([
          guidBytes[3], guidBytes[2], guidBytes[1], guidBytes[0],
          guidBytes[5], guidBytes[4],
          guidBytes[7], guidBytes[6],
          ...guidBytes.slice(8),
        ]);
        return shaka.util.Uint8ArrayUtils.toHex(kidBytes);
      }
    }

    // Not found
    return null;
  }

  /**
   * Gets a PlayReady KID from a protection element
   * containing a PlayReady Header Object
   *
   * @param {!Element} element
   * @return {?string}
   * @private
   */
  static getPlayReadyKID_(element) {
    const ContentProtection = shaka.mss.ContentProtection;
    const rootElement = ContentProtection.getPlayReadyHeaderObject_(element);
    if (!rootElement) {
      return null;
    }

    return ContentProtection.getKID_(rootElement);
  }

  /**
   * Gets a PlayReady Header Object from a protection element
   *
   * @param {!Element} element
   * @return {?Element}
   * @private
   */
  static getPlayReadyHeaderObject_(element) {
    const ContentProtection = shaka.mss.ContentProtection;
    const PLAYREADY_RECORD_TYPES = ContentProtection.PLAYREADY_RECORD_TYPES;

    const bytes = shaka.util.Uint8ArrayUtils.fromBase64(element.textContent);
    const records = ContentProtection.parseMsPro_(bytes);
    const record = records.filter((record) => {
      return record.type === PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT;
    })[0];

    if (!record) {
      return null;
    }

    const xml = shaka.util.StringUtils.fromUTF16(record.value, true);
    const rootElement = shaka.util.XmlUtils.parseXmlString(xml, 'WRMHEADER');
    if (!rootElement) {
      return null;
    }
    return rootElement;
  }

  /**
   * Gets a initData from a protection element.
   *
   * @param {!Element} element
   * @param {string} systemID
   * @param {?string} keyId
   * @return {?Array.<shaka.extern.InitDataOverride>}
   * @private
   */
  static getInitDataFromPro_(element, systemID, keyId) {
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const data = Uint8ArrayUtils.fromBase64(element.textContent);
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
   * @param {!Array.<!Element>} elements
   * @param {!Object.<string, string>} keySystemsBySystemId
   * @return {!Array.<shaka.extern.DrmInfo>}
   * @private
   */
  static convertElements_(elements, keySystemsBySystemId) {
    const ContentProtection = shaka.mss.ContentProtection;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const licenseUrlParsers = ContentProtection.licenseUrlParsers_;

    /** @type {!Array.<shaka.extern.DrmInfo>} */
    const out = [];

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const systemID = element.getAttribute('SystemID').toLowerCase();
      const keySystem = keySystemsBySystemId[systemID];
      if (keySystem) {
        const KID = ContentProtection.getPlayReadyKID_(element);
        const initData = ContentProtection.getInitDataFromPro_(
            element, systemID, KID);

        const info = ManifestParserUtils.createDrmInfo(keySystem, initData);
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
 * @typedef {{
 *   type: number,
 *   value: !Uint8Array
 * }}
 *
 * @description
 * The parsed result of a PlayReady object record.
 *
 * @property {number} type
 *   Type of data stored in the record.
 * @property {!Uint8Array} value
 *   Record content.
 */
shaka.mss.ContentProtection.PlayReadyRecord;

/**
 * Enum for PlayReady record types.
 * @enum {number}
 */
shaka.mss.ContentProtection.PLAYREADY_RECORD_TYPES = {
  RIGHTS_MANAGEMENT: 0x001,
  RESERVED: 0x002,
  EMBEDDED_LICENSE: 0x003,
};

/**
 * A map of key system name to license server url parser.
 *
 * @const {!Map.<string, function(!Element)>}
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

