/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.drm.PlayReady');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A set of functions for parsing Microsoft Playready Objects.
 */
shaka.drm.PlayReady = class {
  /**
   * Parses an Array buffer starting at byteOffset for PlayReady Object Records.
   * Each PRO Record is preceded by its PlayReady Record type and length in
   * bytes.
   *
   * PlayReady Object Record format: https://goo.gl/FTcu46
   *
   * @param {!DataView} view
   * @param {number} byteOffset
   * @return {!Array<shaka.drm.PlayReady.PlayReadyRecord>}
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
   * @return {!Array<shaka.drm.PlayReady.PlayReadyRecord>}
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
    return shaka.drm.PlayReady.parseMsProRecords_(view, byteOffset);
  }

  /**
   * PlayReady Header format: https://goo.gl/dBzxNA
   *
   * @param {!shaka.extern.xml.Node} xml
   * @return {string}
   * @private
   */
  static getLaurl_(xml) {
    const TXml = shaka.util.TXml;
    // LA_URL element is optional and no more than one is
    // allowed inside the DATA element. Only absolute URLs are allowed.
    // If the LA_URL element exists, it must not be empty.
    for (const elem of TXml.getElementsByTagName(xml, 'DATA')) {
      if (elem.children) {
        for (const child of elem.children) {
          if (child.tagName == 'LA_URL') {
            return /** @type {string} */(
              shaka.util.TXml.getTextContents(child));
          }
        }
      }
    }

    // Not found
    return '';
  }

  /**
   * Gets a PlayReady Header Object
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {?shaka.extern.xml.Node}
   * @private
   */
  static getPlayReadyHeaderObject_(element) {
    const PLAYREADY_RECORD_TYPES = shaka.drm.PlayReady.PLAYREADY_RECORD_TYPES;

    const bytes = shaka.util.Uint8ArrayUtils.fromBase64(
        /** @type {string} */ (shaka.util.TXml.getTextContents(element)));
    const records = shaka.drm.PlayReady.parseMsPro_(bytes);
    const record = records.filter((record) => {
      return record.type === PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT;
    })[0];

    if (!record) {
      return null;
    }

    const xml = shaka.util.StringUtils.fromUTF16(record.value, true);
    const rootElement = shaka.util.TXml.parseXmlString(xml, 'WRMHEADER');
    if (!rootElement) {
      return null;
    }
    return rootElement;
  }

  /**
   * Gets a PlayReady license URL from a PlayReady Header Object
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {string}
   */
  static getLicenseUrl(element) {
    try {
      const headerObject =
          shaka.drm.PlayReady.getPlayReadyHeaderObject_(element);
      if (!headerObject) {
        return '';
      }

      return shaka.drm.PlayReady.getLaurl_(headerObject);
    } catch (e) {
      return '';
    }
  }

  /**
   * Gets a PlayReady KID from a protection element containing a
   * PlayReady Header Object
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {?string}
   */
  static getPlayReadyKID(element) {
    const rootElement = shaka.drm.PlayReady.getPlayReadyHeaderObject_(element);
    if (!rootElement) {
      return null;
    }

    const TXml = shaka.util.TXml;
    // KID element is optional and no more than one is
    // allowed inside the DATA element.
    for (const elem of TXml.getElementsByTagName(rootElement, 'DATA')) {
      const kid = TXml.findChild(elem, 'KID');
      if (kid) {
        // GUID: [DWORD, WORD, WORD, 8-BYTE]
        const guidBytes =
            shaka.util.Uint8ArrayUtils.fromBase64(
                /** @type {string} */ (shaka.util.TXml.getTextContents(kid)));
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
};

/**
 * @typedef {{
 *   type: number,
 *   value: !Uint8Array,
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
shaka.drm.PlayReady.PlayReadyRecord;

/**
 * Enum for PlayReady record types.
 * @enum {number}
 */
shaka.drm.PlayReady.PLAYREADY_RECORD_TYPES = {
  RIGHTS_MANAGEMENT: 0x001,
  RESERVED: 0x002,
  EMBEDDED_LICENSE: 0x003,
};
