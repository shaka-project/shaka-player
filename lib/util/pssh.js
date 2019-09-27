/**
 * @license
 * Copyright 2016 Google Inc.
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
   * @param {boolean=} extractMoov boolean to extract pssh from moov atom
   */
  constructor(psshBox, extractMoov) {
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

    /*
    * Array of tuples that define the startIndex + size for each
    * discrete pssh within |psshBox|
    * */
    this.dataBoundaries = [];

    if (extractMoov) {
      new shaka.util.Mp4Parser()
          .box('moov', shaka.util.Mp4Parser.children)
          .fullBox('pssh', (box) => this.parseBox_(box))
          .parse(psshBox);
    } else {
      new shaka.util.Mp4Parser()
          .fullBox('pssh', (box) => this.parseBox_(box))
          .parse(psshBox);
    }

    if (this.dataBoundaries.length == 0) {
      shaka.log.warning('No pssh box found!');
    }
  }


  /**
   * @param {!shaka.extern.ParsedBox} box
   * @private
   */
  parseBox_(box) {
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

    const systemId = shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16));
    const keyIds = [];
    if (box.version > 0) {
      const numKeyIds = box.reader.readUint32();
      for (const _ of shaka.util.Iterables.range(numKeyIds)) {
        shaka.util.Functional.ignored(_);
        const keyId =
            shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16));
        keyIds.push(keyId);
      }
    }

    const dataSize = box.reader.readUint32();
    box.reader.skip(dataSize);  // Ignore the data section.

    // Now that everything has been successfully parsed from this box,
    // update member variables.
    this.cencKeyIds.push(...keyIds);
    this.systemIds.push(systemId);
    this.dataBoundaries.push({
      start: box.start,
      end: box.start + box.size - 1,
    });

    if (box.reader.getPosition() != box.reader.getLength()) {
      shaka.log.warning('Mismatch between box size and data size!');
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

    goog.asserts.assert(byteCursor === psshSize, 'MS PRO invalid length.');
    return psshBox;
  }


  /**
   * Normalise the initData array. This is to apply browser specific
   * work-arounds, e.g. removing duplicates which appears to occur
   * intermittently when the native msneedkey event fires (i.e. event.initData
   * contains dupes).
   *
   * @param {!Uint8Array} initData
   * @param {boolean=} extractMoov
   * @return {!Uint8Array}
   */
  static normaliseInitData(initData, extractMoov) {
    if (!initData) {
      return initData;
    }

    const pssh = new shaka.util.Pssh(initData);

    // If there is only a single pssh, return the original array.
    if (pssh.dataBoundaries.length <= 1) {
      return initData;
    }

    const unfilteredInitDatas = [];
    for (const dataBoundary of pssh.dataBoundaries) {
      const currPssh = initData.subarray(
          // we skip the header of the moov atom
          // Happens when there is a native msneedkey event
          dataBoundary.start + (extractMoov ? 8 : 0),
          // End is exclusive, hence the +1.
          dataBoundary.end + 1 + (extractMoov ? 8 : 0));
      unfilteredInitDatas.push(currPssh);
    }

    // Dedupe psshData.
    /** @type {!Array.<!Uint8Array>} */
    const dedupedInitDatas = [];
    for (const initData of unfilteredInitDatas) {
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
