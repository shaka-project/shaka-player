/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.QuicVarIntCodec');

goog.require('shaka.util.BufferUtils');


/**
 * The draft-16 primitive codec.
 *
 * Draft-16 reuses the QUIC variable-length integer encoding (RFC 9000 section
 * 16): the two most significant bits of the first byte select a length of 1, 2,
 * 4 or 8 bytes, and the remaining 6, 14, 30 or 62 bits hold the value.
 *
 * @implements {shaka.extern.MsfCodec}
 * @final
 */
shaka.msf.QuicVarIntCodec = class {
  /** @override */
  varIntLength(firstByte) {
    return 1 << ((firstByte & 0xc0) >> 6);
  }

  /** @override */
  decodeVarInt(bytes) {
    const view = shaka.util.BufferUtils.toDataView(bytes);
    switch (bytes.byteLength) {
      case 1:
        return BigInt(bytes[0] & 0x3f);
      case 2:
        return BigInt(view.getUint16(0)) & BigInt(0x3fff);
      case 4:
        return BigInt(view.getUint32(0)) & BigInt(0x3fffffff);
      case 8:
        return view.getBigUint64(0) & BigInt('0x3fffffffffffffff');
      default:
        throw new Error(`invalid var int length: ${bytes.byteLength}`);
    }
  }

  /** @override */
  decodeVarIntAt(bytes, offset) {
    const bytesRead = this.varIntLength(bytes[offset]);
    const slice =
        shaka.util.BufferUtils.toUint8(bytes, offset, bytesRead);
    return {value: this.decodeVarInt(slice), bytesRead};
  }

  /** @override */
  encodeVarInt(writer, value) {
    if (value < BigInt(0)) {
      throw new Error(`Underflow: ${value}`);
    }

    if (value <= BigInt(0x3f)) {
      writer.writeUint8(Number(value));
      return;
    }

    const maskFF = BigInt(0xff);
    if (value <= BigInt(0x3fff)) {
      writer.writeUint8(Number((value >> BigInt(8)) & maskFF) | 0x40);
      writer.writeUint8(Number(value & maskFF));
      return;
    }

    if (value <= BigInt(0x3fffffff)) {
      writer.writeUint8(Number((value >> BigInt(24)) & maskFF) | 0x80);
      writer.writeUint8(Number((value >> BigInt(16)) & maskFF));
      writer.writeUint8(Number((value >> BigInt(8)) & maskFF));
      writer.writeUint8(Number(value & maskFF));
      return;
    }

    if (value > BigInt('0x3fffffffffffffff')) {
      throw new Error(`Overflow: ${value}`);
    }

    writer.writeUint8(Number((value >> BigInt(56)) & maskFF) | 0xc0);
    for (const shift of [48, 40, 32, 24, 16, 8]) {
      writer.writeUint8(Number((value >> BigInt(shift)) & maskFF));
    }
    writer.writeUint8(Number(value & maskFF));
  }
};
