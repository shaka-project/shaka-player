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

goog.require('shaka.log');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Uint8ArrayUtils');



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
   * In hex.
   * @type {!Array.<string>}
   * @expose
   */
  this.systemIds = [];

  /**
   * In hex.
   * @type {!Array.<string>}
   * @expose
   */
  this.cencKeyIds = [];

  // Parse the PSSH box.
  var reader = new shaka.util.DataViewReader(
      new DataView(psshBox.buffer),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  // There could be multiple boxes concatenated together.
  // If any of them throws, keep the data parsed from the earlier ones.
  try {
    while (reader.hasMoreData()) {
      var startPosition = reader.getPosition();
      var size = reader.readUint32();
      var type = reader.readUint32();
      if (size == 1) {
        size = reader.readUint64();
      } else if (size == 0) {
        size = reader.getLength() - startPosition;
      }

      if (type != shaka.util.Pssh.BOX_TYPE) {
        shaka.log.warning('Non-PSSH box found!');
        reader.skip(size - (reader.getPosition() - startPosition));
        continue;
      }

      var version = reader.readUint8();
      if (version > 1) {
        shaka.log.warning('Unrecognized PSSH version found!');
        reader.skip(size - (reader.getPosition() - startPosition));
        continue;
      }

      reader.skip(3);  // Skip flags.

      var systemId = shaka.util.Uint8ArrayUtils.toHex(reader.readBytes(16));
      var keyIds = [];
      if (version > 0) {
        var numKeyIds = reader.readUint32();
        for (var i = 0; i < numKeyIds; ++i) {
          var keyId = shaka.util.Uint8ArrayUtils.toHex(reader.readBytes(16));
          keyIds.push(keyId);
        }
      }

      var dataSize = reader.readUint32();
      reader.skip(dataSize);  // Ignore the data section.

      // Now that everything has been succesfully parsed from this box,
      // update member variables.
      this.cencKeyIds.push.apply(this.cencKeyIds, keyIds);
      this.systemIds.push(systemId);

      if (reader.getPosition() != startPosition + size) {
        shaka.log.warning('Mismatch between box size and data size!');
        reader.skip(size - (reader.getPosition() - startPosition));
      }
    }
  } catch (exception) {
    shaka.log.warning('PSSH parse failure!  Some data may be missing or ' +
                      'incorrect.');
  }
};


/** @const {number} */
shaka.util.Pssh.BOX_TYPE = 0x70737368;

