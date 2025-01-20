/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Pssh');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
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
     * @type {!Array<string>}
     */
    this.systemIds = [];

    /**
     * In hex.
     * @type {!Array<string>}
     */
    this.cencKeyIds = [];

    /**
     * Array with the pssh boxes found.
     * @type {!Array<!Uint8Array>}
     */
    this.data = [];

    new shaka.util.Mp4Parser()
        .box('moov', shaka.util.Mp4Parser.children)
        .box('moof', shaka.util.Mp4Parser.children)
        .fullBox('pssh', (box) => this.parsePsshBox_(box))
        .parse(psshBox);

    if (this.data.length == 0) {
      shaka.log.v2('No pssh box found!');
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
      for (let i = 0; i < numKeyIds; i++) {
        const keyId =
            shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16));
        this.cencKeyIds.push(keyId);
      }
    }
  }

  /**
   * Creates a pssh blob from the given system ID, data, keyIds and version.
   *
   * @param {!Uint8Array} data
   * @param {!Uint8Array} systemId
   * @param {!Set<string>} keyIds
   * @param {number} version
   * @return {!Uint8Array}
   */
  static createPssh(data, systemId, keyIds, version) {
    goog.asserts.assert(systemId.byteLength == 16, 'Invalid system ID length');
    const dataLength = data.length;
    let psshSize = 0x4 + 0x4 + 0x4 + systemId.length + 0x4 + dataLength;
    if (version > 0) {
      psshSize += 0x4 + (16 * keyIds.size);
    }

    /** @type {!Uint8Array} */
    const psshBox = new Uint8Array(psshSize);
    /** @type {!DataView} */
    const psshData = shaka.util.BufferUtils.toDataView(psshBox);

    let byteCursor = 0;
    psshData.setUint32(byteCursor, psshSize);
    byteCursor += 0x4;
    psshData.setUint32(byteCursor, 0x70737368);  // 'pssh'
    byteCursor += 0x4;
    (version < 1) ? psshData.setUint32(byteCursor, 0) :
        psshData.setUint32(byteCursor, 0x01000000); // version + flags
    byteCursor += 0x4;
    psshBox.set(systemId, byteCursor);
    byteCursor += systemId.length;

    // if version > 0, add KID count and kid values.
    if (version > 0) {
      psshData.setUint32(byteCursor, keyIds.size); // KID_count
      byteCursor += 0x4;
      const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
      for (const keyId of keyIds) {
        const KID = Uint8ArrayUtils.fromHex(keyId);
        psshBox.set(KID, byteCursor);
        byteCursor += KID.length;
      }
    }

    psshData.setUint32(byteCursor, dataLength);
    byteCursor += 0x4;
    psshBox.set(data, byteCursor);
    byteCursor += dataLength;

    goog.asserts.assert(byteCursor === psshSize, 'PSSH invalid length.');
    return psshBox;
  }

  /**
   * Returns just the data portion of a single PSSH
   *
   * @param {!Uint8Array} pssh
   * @return {!Uint8Array}
   */
  static getPsshData(pssh) {
    let offset = 8; // Box size and type fields

    /** @type {!DataView} */
    const view = shaka.util.BufferUtils.toDataView(pssh);

    // Read version
    const version = view.getUint8(offset);

    // Version (1), flags (3), system ID (16)
    offset += 20;

    if (version > 0) {
      // Key ID count (4) and All key IDs (16*count)
      offset += 4 + (16 * view.getUint32(offset));
    }

    // Data size
    offset += 4;

    return shaka.util.BufferUtils.toUint8(view, offset);
  }

  /**
   * Normalise the initData array. This is to apply browser specific
   * workarounds, e.g. removing duplicates which appears to occur
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
    /** @type {!Array<!Uint8Array>} */
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

