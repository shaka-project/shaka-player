/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.PlayReady');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A set of functions for parsing Microsoft Playready Objects.
 */
shaka.util.PlayReady = class {

  /**
   * Parses an Array buffer starting at byteOffset for PlayReady Object Records.
   * Each PRO Record is preceded by its PlayReady Record type and length in
   * bytes.
   *
   * PlayReady Object Record format: https://goo.gl/FTcu46
   *
   * @param {!DataView} view
   * @param {number} byteOffset
   * @return {!Array.<shaka.util.PlayReady.PlayReadyRecord>}
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
   * @return {!Array.<shaka.util.PlayReady.PlayReadyRecord>}
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
    return shaka.util.PlayReady.parseMsProRecords_(view, byteOffset);
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
            return /** @type{string} */(shaka.util.TXml.getTextContents(child));
          }
        }
      }
    }

    // Not found
    return '';
  }


  /**
   * Gets a PlayReady license URL from a PlayReady Header Object
   *
   * @param {Uint8Array} element
   * @return {string}
   */
  static getPlayReadyLicenseUrl(bytes) {
    const records = shaka.util.PlayReady.parseMsPro_(bytes);
    const record = records.filter((record) => {
      return record.type === shaka.util.PlayReady.PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT;
    })[0];

    if (!record) {
      return '';
    }

    const xml = shaka.util.StringUtils.fromUTF16(record.value, true);
    const rootElement = shaka.util.TXml.parseXmlString(xml, 'WRMHEADER');
    if (!rootElement) {
      return '';
    }

    return shaka.util.PlayReady.getLaurl_(rootElement);
  }

  /**
   * Gets a PlayReady initData from a PlayReady Pro Object
   *
   * @param {Uint8Array} element
   * @return {?Array.<shaka.extern.InitDataOverride>}
   * @private
   */
  static getInitDataFromPro_(data) {
    const systemId = new Uint8Array([
      0x9a, 0x04, 0xf0, 0x79, 0x98, 0x40, 0x42, 0x86,
      0xab, 0x92, 0xe6, 0x5b, 0xe0, 0x88, 0x5f, 0x95,
    ]);
    const keyIds = new Set();
    const psshVersion = 0;
    const pssh =
        shaka.util.Pssh.createPssh(data, systemId, keyIds, psshVersion);
    return [
      {
        initData: pssh,
        initDataType: 'cenc',
        keyId: element.keyId,
      },
    ];
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
shaka.util.PlayReady.PlayReadyRecord;

/**
 * Enum for PlayReady record types.
 * @enum {number}
 */
shaka.util.PlayReady.PLAYREADY_RECORD_TYPES = {
  RIGHTS_MANAGEMENT: 0x001,
  RESERVED: 0x002,
  EMBEDDED_LICENSE: 0x003,
};
