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
   * @param {boolean=} supressWarning Supresses no Pssh box found warning
   * @throws {shaka.util.Error} if a PSSH box is truncated or contains a size
   *   field over 53 bits.
   */
  constructor(psshBox, extractMoov, supressWarning) {
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
          .parse(psshBox.buffer);
    } else {
      new shaka.util.Mp4Parser()
          .fullBox('pssh', (box) => this.parseBox_(box))
          .parse(psshBox.buffer);
    }

    if (this.dataBoundaries.length == 0 && !supressWarning) {
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

    // Now that everything has been succesfully parsed from this box,
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
   * Check if inidata contains Pssh
   * @param {!Uint8Array} initData
   * @param {!boolean=} extractMoov boolean to extract pssh from moov atom
   * @returns {boolean}
   */
  static containsPssh(initData, extractMoov) {
    const pssh = new shaka.util.Pssh(initData, extractMoov, true);
    return pssh.dataBoundaries.length !== 0;
  }

  /**
  * Normalise the initData array. This is to apply browser specific
  * work-arounds, e.g. removing duplicates which appears to occur
  * intermittently when the native msneedkey event fires (i.e. event.initData
  * contains dupes).
  *
  * @param {!Uint8Array} initData
  * @param {!boolean=} extractMoov
  * @return {?Uint8Array}
  * */
  static normaliseInitData(initData, extractMoov) {
    if (!initData) {
      return initData;
    }

    const pssh = new shaka.util.Pssh(initData, extractMoov);

    // If there is only a single pssh, return the original array.
    if (pssh.dataBoundaries.length <= 1) {
      return initData;
    }

    const unfilteredInitDatas = [];
    for (let i = 0; i < pssh.dataBoundaries.length; i++) {
      const currPssh = initData.subarray(
          // we skip the header of the moov atom
          // Happens when there is a native msneedkey event
          pssh.dataBoundaries[i].start + (extractMoov ? 8 : 0),
          // End is exclusive, hence the +1.
          pssh.dataBoundaries[i].end + 1 + (extractMoov ? 8 : 0));
      unfilteredInitDatas.push(currPssh);
    }

    // Dedupe psshData.
    const dedupedInitDatas = unfilteredInitDatas.filter((a, b) => {
      return !shaka.util.Pssh.compareInitDatas(a, b);
    });

    let targetLength = 0;
    for (let i = 0; i < dedupedInitDatas.length; i++) {
      targetLength += dedupedInitDatas[i].length;
    }

    // Flatten the array of Uint8Arrays back into a single Uint8Array.
    const normalisedInitData = new Uint8Array(targetLength);
    let offset = 0;
    for (let i = 0; i < dedupedInitDatas.length; i++) {
      normalisedInitData.set(dedupedInitDatas[i], offset);
      offset += dedupedInitDatas[i].length;
    }

    return normalisedInitData;
  }

  /**
  * @param {!Uint8Array} initDataA
  * @param {!Uint8Array} initDataB
  * @return {?boolean}
  * */
  static compareInitDatas(initDataA, initDataB) {
    return shaka.util.Uint8ArrayUtils.equal(initDataA, initDataB);
  }
};
