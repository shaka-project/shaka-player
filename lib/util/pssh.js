/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Pssh');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary
 * Parse a PSSH box and extract the system IDs.
 */
shaka.util.Pssh = class {
  /**
   * @param {!Uint8Array} psshBox
   */
  constructor(psshBox) {
    /**
     * In hex.
     * @type {!Array.<string>}
     */
    this.systemIds = [];

    /**
     * In hex.
     * @type {!Array.<string>}
     */
    this.cencKeyIds = [];

    /**
     * Array with the pssh boxes found.
     * @type {!Array.<!Uint8Array>}
     */
    this.data = [];

    new shaka.util.Mp4Parser()
        .box('moov', shaka.util.Mp4Parser.children)
        .fullBox('pssh', (box) => this.parsePsshBox_(box))
        .parse(psshBox);

    if (this.data.length == 0) {
      shaka.log.warning('No pssh box found!');
    }
  }


  /**
   * @param {!shaka.extern.ParsedBox} box
   * @private
   */
  parsePsshBox_(box) {
    goog.asserts.assert(
        box.version != null,
        'PSSH boxes are full boxes and must have a valid version');

    goog.asserts.assert(
        box.flags != null,
        'PSSH boxes are full boxes and must have a valid flag');

    if (box.version > 1) {
      shaka.log.warning('Unrecognized PSSH version found!');
      return;
    }

    // The "reader" gives us a view on the payload of the box.  Create a new
    // view that contains the whole box.
    const dataView = box.reader.getDataView();
    goog.asserts.assert(
        dataView.byteOffset >= 12, 'DataView at incorrect position');
    const pssh = shaka.util.BufferUtils.toUint8(dataView, -12, box.size);
    this.data.push(pssh);

    this.systemIds.push(
        shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16)));
    if (box.version > 0) {
      const numKeyIds = box.reader.readUint32();
      for (const _ of shaka.util.Iterables.range(numKeyIds)) {
        shaka.util.Functional.ignored(_);
        const keyId =
            shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16));
        this.cencKeyIds.push(keyId);
      }
    }
  }

  /**
   * Creates a pssh blob from the given system ID and data.
   *
   * @param {!Uint8Array} data
   * @param {!Uint8Array} systemId
   * @return {!Uint8Array}
   */
  static createPssh(data, systemId) {
    goog.asserts.assert(systemId.byteLength == 16, 'Invalid system ID length');
    const dataLength = data.length;
    const psshSize = 0x4 + 0x4 + 0x4 + systemId.length + 0x4 + dataLength;

    /** @type {!Uint8Array} */
    const psshBox = new Uint8Array(psshSize);
    /** @type {!DataView} */
    const psshData = shaka.util.BufferUtils.toDataView(psshBox);

    let byteCursor = 0;
    psshData.setUint32(byteCursor, psshSize);
    byteCursor += 0x4;
    psshData.setUint32(byteCursor, 0x70737368);  // 'pssh'
    byteCursor += 0x4;
    psshData.setUint32(byteCursor, 0);  // flags
    byteCursor += 0x4;
    psshBox.set(systemId, byteCursor);
    byteCursor += systemId.length;
    psshData.setUint32(byteCursor, dataLength);
    byteCursor += 0x4;
    psshBox.set(data, byteCursor);
    byteCursor += dataLength;

    goog.asserts.assert(byteCursor === psshSize, 'PSSH invalid length.');
    return psshBox;
  }


  /**
   * Normalise the initData array. This is to apply browser specific
   * work-arounds, e.g. removing duplicates which appears to occur
   * intermittently when the native msneedkey event fires (i.e. event.initData
   * contains dupes).
   *
   * @param {!Uint8Array} initData
   * @return {!Uint8Array}
   */
  static normaliseInitData(initData) {
    if (!initData) {
      return initData;
    }

    const pssh = new shaka.util.Pssh(initData);

    // If there is only a single pssh, return the original array.
    if (pssh.data.length <= 1) {
      return initData;
    }

    // Dedupe psshData.
    /** @type {!Array.<!Uint8Array>} */
    const dedupedInitDatas = [];
    for (const initData of pssh.data) {
      const found = dedupedInitDatas.some((x) => {
        return shaka.util.BufferUtils.equal(x, initData);
      });

      if (!found) {
        dedupedInitDatas.push(initData);
      }
    }

    return shaka.util.Uint8ArrayUtils.concat(...dedupedInitDatas);
  }
};


shaka.util.Pssh.defaultSystemIds_ = new Map()
    .set('org.w3.clearkey', '1077efecc0b24d02ace33c1e52e2fb4b')
    .set('com.widevine.alpha', 'edef8ba979d64acea3c827dcd51d21ed')
    .set('com.microsoft.playready', '9a04f07998404286ab92e65be0885f95')
    .set('com.adobe.primetime', 'f239e769efa348509c16a903c6932efb');

