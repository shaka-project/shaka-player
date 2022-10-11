/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @summary
 * A helper class used to generate ID3 metadata.
 */
shaka.test.Id3Generator = class {
  /**
   * Generate an ID3 from a frames.
   *
   * @param {!Uint8Array} frames
   * @param {boolean=} extendedHeader
   * @return {!Uint8Array}
   */
  static generateId3(frames, extendedHeader = false) {
    const Id3Generator = shaka.test.Id3Generator;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    let result = Uint8ArrayUtils.concat(
        Id3Generator.stringToInts_('ID3'),
        new Uint8Array([
          0x03, 0x00,             // version 3.0 of ID3v2 (aka ID3v.2.3.0)
          0x40,                   // flags. include an extended header
          0x00, 0x00, 0x00, 0x00, // size. set later
          // extended header
          0x00, 0x00, 0x00, 0x06, // extended header size. no CRC
          0x00, 0x00,             // extended flags
          0x00, 0x00, 0x00, 0x02,  // size of padding
        ]),
        frames);
    if (!extendedHeader) {
      result = Uint8ArrayUtils.concat(
          Id3Generator.stringToInts_('ID3'),
          new Uint8Array([
            0x03, 0x00,             // version 3.0 of ID3v2 (aka ID3v.2.3.0)
            0x00,                   // flags
            0x00, 0x00, 0x00, 0x00, // size. set later
          ]),
          frames);
    }

    // size is stored as a sequence of four 7-bit integers with the
    // high bit of each byte set to zero
    const size = result.length - 10;

    result[6] = (size >>> 21) & 0x7f;
    result[7] = (size >>> 14) & 0x7f;
    result[8] = (size >>> 7) & 0x7f;
    result[9] = size & 0x7f;

    return result;
  }

  /**
   * Generate an ID3 frame from a type and value.
   *
   * @param {string} type
   * @param {!Uint8Array} value
   * @return {!Uint8Array}
   */
  static generateId3Frame(type, value) {
    goog.asserts.assert(type, 'type must be non-null');
    goog.asserts.assert(type.length == 4, 'type must contain 4 characters');
    const Id3Generator = shaka.test.Id3Generator;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const result = Uint8ArrayUtils.concat(
        Id3Generator.stringToInts_(type),
        new Uint8Array([
          0x00, 0x00, 0x00, 0x00, // size
          0xe0, 0x00,             // flags
        ]),
        value);

    // set the size
    const size = result.length - 10;

    result[4] = (size >>> 21) & 0x7f;
    result[5] = (size >>> 14) & 0x7f;
    result[6] = (size >>> 7) & 0x7f;
    result[7] = size & 0x7f;

    return result;
  }

  /**
   * @param {string} string
   * @return {!Uint8Array}
   * @private
   */
  static stringToInts_(string) {
    const result = [];
    for (let i = 0; i < string.length; i++) {
      result[i] = string.charCodeAt(i);
    }
    return new Uint8Array(result);
  }
};
