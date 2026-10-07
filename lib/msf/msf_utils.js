/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Utils');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');


shaka.msf.Utils = class {
  /**
   * Parses a block of MoQT Properties into a property map. Object Properties
   * and Track Properties share this layout, so it serves both.
   *
   * Wire format — a flat sequence of MOQT Key-Value-Pairs
   * (draft-ietf-moq-transport-18 §1.4.3) running to the end of the buffer;
   * whatever length prefix the block had was already consumed by the
   * transport layer:
   *
   *   delta type (vi64)
   *   value: vi64           when the resolved type is even
   *          length (vi64) + bytes  when the resolved type is odd
   *
   * Types are DELTA encoded against the previous type in the block, starting
   * from 0. Reading them as absolute is worse than dropping the trailing
   * properties: a delta can collide with a real type and bind an unrelated
   * property's value to it. With the LOC Timestamp and Timescale present the
   * deltas are 6 and 2, so an absolute read loses Timescale entirely.
   *
   * If parsing throws at any point the partial map built so far is returned,
   * so callers always receive a valid (possibly empty) map.
   *
   * @param {!Uint8Array} data
   * @param {!shaka.extern.MsfCodec} codec The negotiated draft's primitive
   *   codec. Draft-17 changed the var int encoding, so the same property
   *   bytes mean different numbers depending on which draft delivered them.
   * @return {!Map<bigint, bigint|!Uint8Array>}
   */
  static parseProperties(data, codec) {
    /** @type {!Map<bigint, bigint|!Uint8Array>} */
    const props = new Map();

    if (data.byteLength === 0) {
      return props;
    }

    /** @type {function(number):{value: bigint, bytesRead: number}} */
    const readVi64At =
        (offset) => shaka.msf.Utils.readVi64At(data, offset, codec);

    try {
      let offset = 0;
      /** @type {bigint} */
      let previousType = BigInt(0);
      while (offset < data.byteLength) {
        const deltaResult = readVi64At(offset);
        offset += deltaResult.bytesRead;
        const type = previousType + deltaResult.value;
        previousType = type;

        if (type % BigInt(2) === BigInt(0)) {
          // Even type → single vi64 value
          const valResult = readVi64At(offset);
          offset += valResult.bytesRead;
          props.set(type, valResult.value);
        } else {
          // Odd type → length-prefixed byte sequence
          const lenResult = readVi64At(offset);
          offset += lenResult.bytesRead;
          const len = Number(lenResult.value);
          props.set(type, shaka.util.BufferUtils.toUint8(data, offset, len));
          offset += len;
        }
      }
    } catch (e) {
      shaka.log.v2('Failed to parse MoQT properties, returning partial map',
          e);
    }

    return props;
  }

  /**
   * Reads one variable-length integer from `buffer` at byte `offset`, in
   * whichever encoding the negotiated draft uses. Draft-17 replaced the QUIC
   * two-bit size tag with a leading-ones count, so the same bytes mean
   * different numbers under the two.
   *
   * Synchronous equivalent of `Reader.u62WithSize()` in msf_classes.js.
   *
   * @param {!Uint8Array} buffer
   * @param {number} offset
   * @param {!shaka.extern.MsfCodec} codec
   * @return {{value: bigint, bytesRead: number}}
   */
  static readVi64At(buffer, offset, codec) {
    if (offset >= buffer.length) {
      throw new Error(`readVi64At: underflow at offset ${offset}`);
    }

    const bytesRead = codec.varIntLength(buffer[offset]);
    if (offset + bytesRead > buffer.length) {
      throw new Error(`readVi64At: need ${bytesRead} bytes`);
    }
    return {value: codec.decodeVarInt(
        buffer.subarray(offset, offset + bytesRead)), bytesRead};
  }
};

/**
 * @enum {number}
 */
shaka.msf.Utils.SetupOption = {
  AUTHORIZATION_TOKEN: 0x3,
  MAX_AUTH_TOKEN_CACHE_SIZE: 0x4,
  IMPLEMENTATION: 0x7,
};

/**
 * @typedef {{
 *   type: bigint,
 *   value: (bigint|!Uint8Array),
 * }}
 */
shaka.msf.Utils.KeyValuePair;


/**
 * Where an Object sits in a track. Defined in externs as
 * shaka.extern.MsfLocation, since it is part of the dialect plugin contract
 * and externs are compiled into builds that omit MSF entirely.
 *
 * @typedef {shaka.extern.MsfLocation}
 */
shaka.msf.Utils.Location;


/**
 * The shape delivered to subscription and fetch callbacks. Defined in externs
 * as shaka.extern.MsfObject, since it is part of the dialect plugin contract
 * and externs are compiled into builds that omit MSF entirely.
 *
 * @typedef {shaka.extern.MsfObject}
 */
shaka.msf.Utils.MOQObject;


/**
 * @typedef {shaka.extern.MsfObjectCallback}
 */
shaka.msf.Utils.ObjectCallback;


/**
 * @typedef {{
 *   namespace: Array<string>,
 *   trackName: string,
 *   trackAlias: bigint,
 *   requestId: bigint,
 *   callbacks: !Array<shaka.msf.Utils.ObjectCallback>,
 *   closed: boolean,
 * }}
 */
shaka.msf.Utils.TrackInfo;
