/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft18.Codec');


/**
 * The draft-18 primitive codec.
 *
 * Draft-17 replaced the QUIC variable-length integer encoding with one that
 * uses the number of leading 1 bits of the first byte as the length, giving 1
 * to 9 bytes and a full 64-bit range (draft-18 section 1.4.1):
 *
 *   0        1 byte    7 usable bits
 *   10       2 bytes   14
 *   110      3 bytes   21
 *   ...
 *   11111110 8 bytes   56
 *   11111111 9 bytes   64
 *
 * Two consequences worth noting. The one-byte range doubles to 0-127, so the
 * byte sequences differ from draft-16 even for small values. And the
 * specification explicitly permits non-minimal encodings -- 0x25 and 0x8025
 * both decode to 37 -- so decoding must not assume the shortest form, though
 * we always emit it.
 *
 * @implements {shaka.extern.MsfCodec}
 * @final
 */
shaka.msf.draft18.Codec = class {
  /** @override */
  varIntLength(firstByte) {
    // The length is the count of leading 1 bits plus one, except that eight
    // leading ones (0xff) means nine bytes rather than the nonexistent form
    // with a ninth prefix bit.
    if (firstByte == 0xff) {
      return 9;
    }
    let leadingOnes = 0;
    for (let mask = 0x80; (firstByte & mask) != 0; mask >>= 1) {
      leadingOnes++;
    }
    return leadingOnes + 1;
  }

  /** @override */
  decodeVarInt(bytes) {
    const length = bytes.byteLength;
    if (length < 1 || length > 9) {
      throw new Error(`invalid var int length: ${length}`);
    }

    // A nine-byte encoding spends its whole first byte on the prefix; every
    // shorter form keeps the low (8 - length) bits of it.
    let value = length == 9 ?
        BigInt(0) :
        BigInt(bytes[0] & ((1 << (8 - length)) - 1));

    for (let i = 1; i < length; i++) {
      value = (value << BigInt(8)) | BigInt(bytes[i]);
    }
    return value;
  }

  /** @override */
  decodeVarIntAt(bytes, offset) {
    const bytesRead = this.varIntLength(bytes[offset]);
    return {
      value: this.decodeVarInt(bytes.subarray(offset, offset + bytesRead)),
      bytesRead,
    };
  }

  /** @override */
  encodeVarInt(writer, value) {
    if (value < BigInt(0)) {
      throw new Error(`Underflow: ${value}`);
    }
    if (value > BigInt('0xffffffffffffffff')) {
      throw new Error(`Overflow: ${value}`);
    }

    // Pick the shortest length whose usable bits hold the value: 7 per byte
    // up to eight bytes, then a full 64 at nine.
    let length = 1;
    while (length < 9 && value >= (BigInt(1) << BigInt(7 * length))) {
      length++;
    }

    if (length == 9) {
      writer.writeUint8(0xff);
    } else {
      // (length - 1) leading ones followed by a zero, then the top bits of
      // the value.
      const prefix = (0xff << (9 - length)) & 0xff;
      writer.writeUint8(
          prefix | Number((value >> BigInt(8 * (length - 1))) & BigInt(0xff)));
    }

    for (let i = length - 2; i >= 0; i--) {
      writer.writeUint8(Number((value >> BigInt(8 * i)) & BigInt(0xff)));
    }
  }
};
