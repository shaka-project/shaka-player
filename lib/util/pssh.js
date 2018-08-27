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
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Parse a PSSH box and extract the system IDs.
 *
 * @param {!Uint8Array} psshBox
 * @param {boolean=} extractMoov boolean to extract pssh from moov atom
 * @constructor
 * @struct
 * @throws {shaka.util.Error} if a PSSH box is truncated or contains a size
 *   field over 53 bits.
 */
shaka.util.Pssh = function(psshBox, extractMoov) {
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
      .fullBox('pssh', this.parseBox_.bind(this)).parse(psshBox.buffer);
  } else {
    new shaka.util.Mp4Parser()
      .fullBox('pssh', this.parseBox_.bind(this)).parse(psshBox.buffer);
  }

  if (this.dataBoundaries.length == 0) {
    shaka.log.warning('No pssh box found!');
  }
};


/**
 * @param {!shaka.util.Mp4Parser.ParsedBox} box
 * @private
 */
shaka.util.Pssh.prototype.parseBox_ = function(box) {
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

  let systemId = shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16));
  let keyIds = [];
  if (box.version > 0) {
    let numKeyIds = box.reader.readUint32();
    for (let i = 0; i < numKeyIds; ++i) {
      let keyId = shaka.util.Uint8ArrayUtils.toHex(box.reader.readBytes(16));
      keyIds.push(keyId);
    }
  }

  let dataSize = box.reader.readUint32();
  box.reader.skip(dataSize);  // Ignore the data section.

  // Now that everything has been succesfully parsed from this box,
  // update member variables.
  this.cencKeyIds.push.apply(this.cencKeyIds, keyIds);
  this.systemIds.push(systemId);
  this.dataBoundaries.push({
    start: box.start,
    end: box.start + box.size - 1,
  });

  if (box.reader.getPosition() != box.reader.getLength()) {
    shaka.log.warning('Mismatch between box size and data size!');
  }
};


/**
 * Normalise the initData array. This is to apply browser specific work-arounds,
 * e.g. removing duplicates which appears to occur intermittently when the
 * native msneedkey event fires (i.e. event.initData contains dupes).
 *
 * @param {?Uint8Array} initData
 * @param {boolean=} extractMoov boolean to extract pssh from moov atom
 * @return {?Uint8Array}
 */
shaka.util.Pssh.normaliseInitData = function(initData, extractMoov) {
  if (!initData) {
    return initData;
  }

  let pssh = new shaka.util.Pssh(initData, extractMoov);

  // If there is only a single pssh, return the original array.
  if (pssh.dataBoundaries.length <= 1) {
    return initData;
  }

  let unfilteredInitDatas = [];
  for (let i = 0; i < pssh.dataBoundaries.length; i++) {
    let currPssh = initData.subarray(
        pssh.dataBoundaries[i].start + (extractMoov ? 8 : 0),
        // End is exclusive, hence the +1.
        pssh.dataBoundaries[i].end + 1 + (extractMoov ? 8 : 0));
    unfilteredInitDatas.push(currPssh);
  }

  // Dedupe psshData.
  let dedupedInitDatas = shaka.util.ArrayUtils.removeDuplicates(
      unfilteredInitDatas,
      shaka.util.Pssh.compareInitDatas);

  let targetLength = 0;
  for (let i = 0; i < dedupedInitDatas.length; i++) {
    targetLength += dedupedInitDatas[i].length;
  }

  // Flatten the array of Uint8Arrays back into a single Uint8Array.
  let normalisedInitData = new Uint8Array(targetLength);
  let offset = 0;
  for (let i = 0; i < dedupedInitDatas.length; i++) {
    normalisedInitData.set(dedupedInitDatas[i], offset);
    offset += dedupedInitDatas[i].length;
  }

  return normalisedInitData;
};

/**
 * @param {!Uint8Array} initDataA
 * @param {!Uint8Array} initDataB
 * @return {boolean}
 */
shaka.util.Pssh.compareInitDatas =
    function(initDataA, initDataB) {
  return shaka.util.Uint8ArrayUtils.equal(initDataA, initDataB);
};
