/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements a PSSH parser.
 */

goog.provide('shaka.util.Pssh');

goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.StringUtils');



/**
 * Parse a PSSH box and extract the system IDs.
 *
 * @param {!Uint8Array} psshBox
 * @constructor
 * @throws {RangeError} in the unlikely event that a PSSH box contains a size
 *     field over 53 bits.
 */
shaka.util.Pssh = function(psshBox) {
  /**
   * @type {!Array.<string>}
   * @expose
   */
  this.systemIds = [];

  // Parse the PSSH box.
  var reader = new shaka.util.DataViewReader(
      new DataView(psshBox.buffer),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  // There could be multiple boxes concatenated together.
  while (reader.hasMoreData()) {
    var headerSize = 8;
    var size = reader.readUint32();
    var type = reader.readUint32();
    if (size == 1) {
      size = reader.readUint64();
      headerSize += 8;
    }

    if (type != shaka.util.Pssh.BOX_TYPE) {
      reader.skip(size - headerSize);
      continue;
    }

    var versionAndFlags = reader.readUint32();
    var systemId = shaka.util.StringUtils.fromUint8Array(reader.readBytes(16));
    var dataSize = reader.readUint32();
    reader.skip(dataSize);  // Ignore the data section.

    this.systemIds.push(systemId);
  }
};


/** @const {number} */
shaka.util.Pssh.BOX_TYPE = 0x70737368;

