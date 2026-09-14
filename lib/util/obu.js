/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Obu');


/**
 * Open Bitstream Unit parsing.
 *
 * AV1 and IAMF both carry their data as a flat sequence of OBUs, each
 * self-delimiting through its own header.  There are no start codes, no length
 * prefixes and — unlike H.264/H.265 — no emulation prevention bytes, so an OBU
 * payload can be read as a raw bit stream.
 *
 * The two formats share the leb128() encoding but NOT the header layout, and
 * their obu_size fields have opposite meanings: in AV1 it excludes the header,
 * while in IAMF it covers the optional fields that follow it.  They therefore
 * get one parser each, sharing only the primitives below.
 *
 * @see https://aomediacodec.github.io/av1-spec/av1-spec.pdf (section 5.3)
 * @see https://aomediacodec.github.io/iamf/ (section 3.2)
 */
shaka.util.Obu = class {
  /**
   * Reads an unsigned leb128() at the given offset.  Returns null if the value
   * is truncated or malformed, in which case the rest of the data cannot be
   * trusted either.
   *
   * @param {!Uint8Array} data
   * @param {number} offset
   * @return {?{value: number, size: number}}
   */
  static readLeb128(data, offset) {
    let value = 0;

    // A leb128() is at most 8 bytes, each holding 7 bits of the value plus a
    // continuation bit.
    for (let i = 0; i < 8; i++) {
      if (offset + i >= data.byteLength) {
        return null;
      }
      const byte = data[offset + i];
      // Multiply rather than shift: the value can hold up to 56 significant
      // bits, and JavaScript's bitwise operators would truncate to 32.
      value += (byte & 0x7f) * Math.pow(2, i * 7);
      if (!(byte & 0x80)) {
        return {value, size: i + 1};
      }
    }

    // More than 8 bytes is malformed.
    return null;
  }

  /**
   * Splits an AV1 temporal unit into its OBUs.
   *
   * @param {!Uint8Array} data
   * @return {!Array<shaka.util.Obu.Unit>}
   */
  static parseAv1(data) {
    const Obu = shaka.util.Obu;

    /** @type {!Array<shaka.util.Obu.Unit>} */
    const obus = [];
    let offset = 0;

    while (offset < data.byteLength) {
      const start = offset;
      // obu_header(): 1 forbidden bit, 4 bits obu_type, obu_extension_flag,
      // obu_has_size_field, and 1 reserved bit.
      const headerByte = data[offset++];

      // obu_forbidden_bit must be 0.  Anything else means we have lost sync,
      // and continuing would emit garbage OBUs.
      if (headerByte & 0x80) {
        break;
      }

      const type = (headerByte & 0x78) >> 3;
      const hasExtension = (headerByte & 0x04) != 0;
      const hasSizeField = (headerByte & 0x02) != 0;

      if (hasExtension) {
        if (offset >= data.byteLength) {
          break;
        }
        // obu_extension_header() is a single byte we have no use for.
        offset++;
      }

      let payloadSize;
      if (hasSizeField) {
        const leb128 = Obu.readLeb128(data, offset);
        if (!leb128) {
          break;
        }
        payloadSize = leb128.value;
        offset += leb128.size;
      } else {
        // Only the last OBU of a temporal unit may omit its size field, in
        // which case it runs to the end of the unit.
        payloadSize = data.byteLength - offset;
      }

      const payloadEnd = offset + payloadSize;
      if (payloadEnd > data.byteLength) {
        // Malformed: the declared size runs past the temporal unit.
        break;
      }

      obus.push({
        type,
        data: data.subarray(offset, payloadEnd),
        fullData: data.subarray(start, payloadEnd),
      });
      offset = payloadEnd;
    }

    return obus;
  }

  /**
   * Splits a sequence of IAMF OBUs.
   *
   * @param {!Uint8Array} data
   * @return {!Array<shaka.util.Obu.Unit>}
   */
  static parseIamf(data) {
    const Obu = shaka.util.Obu;

    /** @type {!Array<shaka.util.Obu.Unit>} */
    const obus = [];
    let offset = 0;

    while (offset < data.byteLength) {
      const start = offset;
      // obu_header(): 5 bits obu_type, obu_redundant_copy,
      // obu_trimming_status_flag and obu_extension_flag.
      const headerByte = data[offset++];
      const type = headerByte >> 3;
      const hasTrimming = (headerByte & 0x02) != 0;
      const hasExtension = (headerByte & 0x01) != 0;

      // obu_size is always present, and covers the optional fields below it.
      const leb128 = Obu.readLeb128(data, offset);
      if (!leb128) {
        break;
      }
      offset += leb128.size;
      const obuEnd = offset + leb128.value;
      if (obuEnd > data.byteLength) {
        // Malformed: the declared size runs past the data.
        break;
      }

      if (hasTrimming) {
        const trimAtEnd = Obu.readLeb128(data, offset);
        if (!trimAtEnd) {
          break;
        }
        offset += trimAtEnd.size;
        const trimAtStart = Obu.readLeb128(data, offset);
        if (!trimAtStart) {
          break;
        }
        offset += trimAtStart.size;
      }

      if (hasExtension) {
        const extensionHeaderSize = Obu.readLeb128(data, offset);
        if (!extensionHeaderSize) {
          break;
        }
        offset += extensionHeaderSize.size + extensionHeaderSize.value;
      }

      if (offset > obuEnd) {
        // Malformed: the optional fields overran the OBU they belong to.
        break;
      }

      obus.push({
        type,
        data: data.subarray(offset, obuEnd),
        fullData: data.subarray(start, obuEnd),
      });
      offset = obuEnd;
    }

    return obus;
  }
};


/**
 * One Open Bitstream Unit.
 *
 * `data` is the OBU payload alone, with the header and every field that
 * precedes the payload already skipped; `fullData` also covers the header,
 * which is what an `av1C` configOBUs entry needs.  `type` is the obu_type
 * field, whose meaning depends on the format the OBU was parsed from.
 *
 * @typedef {{
 *   type: number,
 *   data: !Uint8Array,
 *   fullData: !Uint8Array,
 * }}
 */
shaka.util.Obu.Unit;
