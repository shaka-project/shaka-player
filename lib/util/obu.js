/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Obu');

goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Open Bitstream Unit parsing.
 *
 * AV1 and IAMF both carry their data as a flat sequence of OBUs, each
 * self-delimiting through its own header.  There are no start codes, no length
 * prefixes and — unlike H.264/H.265 — no emulation prevention bytes, so an OBU
 * payload can be read as a raw bit stream.
 *
 * MPEG-2 TS is the exception: it wraps every OBU in start codes and escapes
 * it, so its payloads have to go through parseAv1Ts() first.
 *
 * The two formats share the leb128() encoding but NOT the header layout, and
 * their obu_size fields have opposite meanings: in AV1 it excludes the header,
 * while in IAMF it covers the optional fields that follow it.  They therefore
 * get one parser each, sharing only the primitives below.
 *
 * @see https://aomediacodec.github.io/av1-spec/av1-spec.pdf (section 5.3)
 * @see https://aomediacodec.github.io/iamf/ (section 3.2)
 * @see https://aomediacodec.github.io/av1-mpeg2-ts/ (section 3.2)
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
   * Converts an AV1 access unit carried in MPEG-2 TS into the low overhead
   * bitstream format, which is what both parseAv1() and an `av01` sample
   * expect.  Returns null when the access unit cannot be read.
   *
   * MPEG-2 TS does not carry the low overhead format directly: each OBU is
   * wrapped in a ts_open_bitstream_unit(), which prefixes it with a 0x000001
   * start code and escapes the byte sequences that would emulate one, in the
   * same way H.264 does.  On top of that, obu_size is only recommended there,
   * not required, so an OBU that relies on the start code to delimit it has
   * to get its size field back before anything else can read it.
   *
   * @param {!Uint8Array} data
   * @return {?Uint8Array}
   */
  static parseAv1Ts(data) {
    const Obu = shaka.util.Obu;

    /** @type {!Array<!Uint8Array>} */
    const pieces = [];

    // Offset of the first byte of the escaped OBU being read, i.e. just past
    // its start code.  A start code is three bytes and no more: an OBU
    // payload may end in a zero — a temporal delimiter is 0x12 0x00 — and the
    // zeros ahead of the 0x01 that it does not need are its own.
    let obuStart = -1;
    let numZeros = 0;
    for (let i = 0; i < data.byteLength; i++) {
      const value = data[i];
      if (!value) {
        numZeros++;
        continue;
      }
      if (value == 1 && numZeros >= 2) {
        if (obuStart >= 0) {
          const piece = Obu.normalizeTsObu_(data.subarray(obuStart, i - 2));
          if (!piece) {
            return null;
          }
          pieces.push(...piece);
        }
        obuStart = i + 1;
      }
      numZeros = 0;
    }

    if (obuStart < 0) {
      // No start code at all: this is not an AV1 access unit.
      return null;
    }

    const piece = Obu.normalizeTsObu_(data.subarray(obuStart));
    if (!piece) {
      return null;
    }
    pieces.push(...piece);

    return shaka.util.Uint8ArrayUtils.concatRange(pieces);
  }

  /**
   * Turns one escaped ts_open_bitstream_unit() payload, with its start code
   * already stripped, into the pieces of the equivalent low overhead OBU.
   * Returns null if the OBU header cannot be read.
   *
   * @param {!Uint8Array} data
   * @return {?Array<!Uint8Array>}
   * @private
   */
  static normalizeTsObu_(data) {
    const Obu = shaka.util.Obu;

    const unescaped = Obu.unescapeTsObu_(data);
    if (!unescaped.byteLength) {
      // An empty OBU carries nothing; dropping it keeps the rest readable.
      return [];
    }

    const headerByte = unescaped[0];
    // obu_forbidden_bit must be 0.  Anything else means the start code we
    // synced on was not one, and the whole access unit is suspect.
    if (headerByte & 0x80) {
      return null;
    }
    if (headerByte & 0x02) {
      // obu_size is already there, so the OBU is low overhead as it stands.
      return [unescaped];
    }

    // obu_extension_flag: the extension byte sits between the header and the
    // size field, so it has to stay ahead of the size we are inserting.
    const headerSize = (headerByte & 0x04) ? 2 : 1;
    if (unescaped.byteLength < headerSize) {
      return null;
    }

    const header = unescaped.slice(0, headerSize);
    // Set obu_has_size_field now that we are writing one.
    header[0] |= 0x02;

    return [
      header,
      Obu.writeLeb128_(unescaped.byteLength - headerSize),
      unescaped.subarray(headerSize),
    ];
  }

  /**
   * Removes the emulation prevention bytes from one escaped OBU.  Returns the
   * input untouched when there are none, which is the common case.
   *
   * @param {!Uint8Array} data
   * @return {!Uint8Array}
   * @private
   */
  static unescapeTsObu_(data) {
    /** @type {?Uint8Array} */
    let unescaped = null;
    let outOffset = 0;
    let numZeros = 0;

    for (let i = 0; i < data.byteLength; i++) {
      const value = data[i];
      if (numZeros == 2 && value == 0x03) {
        if (!unescaped) {
          // First escape of this OBU: copy what we have read so far, and keep
          // filling the copy from here on.
          unescaped = new Uint8Array(data.byteLength - 1);
          unescaped.set(data.subarray(0, i));
          outOffset = i;
        }
        numZeros = 0;
        continue;
      }
      numZeros = value ? 0 : numZeros + 1;
      if (unescaped) {
        unescaped[outOffset++] = value;
      }
    }

    if (!unescaped) {
      return data;
    }
    return unescaped.subarray(0, outOffset);
  }

  /**
   * Encodes a value as an unsigned leb128().
   *
   * @param {number} value
   * @return {!Uint8Array}
   * @private
   */
  static writeLeb128_(value) {
    /** @type {!Array<number>} */
    const bytes = [];
    do {
      const byte = value % 128;
      // Divide rather than shift: a leb128() can hold more significant bits
      // than JavaScript's bitwise operators keep.
      value = Math.floor(value / 128);
      bytes.push(value ? (byte | 0x80) : byte);
    } while (value);
    return new Uint8Array(bytes);
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
