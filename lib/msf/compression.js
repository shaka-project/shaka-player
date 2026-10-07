/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Compression');

goog.require('shaka.msf.Utils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Undoes the payload compression MSF signals with the MSF_COMPRESSION
 * property (draft-ietf-moq-msf, "Compression Signaling").
 *
 * The property has one type, 0x78, and two places it can be carried, which a
 * publisher must not combine on one track:
 *
 *  - as a Track Property, in SUBSCRIBE_OK or FETCH_OK, when every Object of
 *    the track is compressed;
 *  - as an Object Property, on each compressed Object, when only some are --
 *    a catalog whose complete document is compressed but whose delta updates
 *    are not, say.
 *
 * It applies to the JSON tracks: the catalog, media timeline tracks and event
 * timeline tracks.
 *
 * @final
 */
shaka.msf.Compression = class {
  /**
   * The compression algorithm an Object's payload is in. The Track Property
   * wins when both are somehow present, since it covers every Object.
   *
   * @param {!shaka.extern.MsfObject} obj
   * @param {!shaka.extern.MsfCodec} codec The negotiated draft's primitive
   *   codec, which the property blocks are encoded with.
   * @return {number} A shaka.msf.Compression.Algorithm value, or whatever
   *   other value the publisher sent.
   */
  static getAlgorithm(obj, codec) {
    const Compression = shaka.msf.Compression;
    for (const block of [obj.trackProperties, obj.extensions]) {
      if (!block || !block.byteLength) {
        continue;
      }
      const value = shaka.msf.Utils.parseProperties(block, codec).get(
          BigInt(Compression.PROPERTY_TYPE_));
      if (typeof value === 'bigint') {
        return Number(value);
      }
    }
    return Compression.Algorithm.NONE;
  }

  /**
   * Returns an Object's payload with its compression undone.
   *
   * An uncompressed payload comes back as is and synchronously, so a caller
   * that has nothing waiting ahead of it can go on handling it in the same
   * turn. A compressed one comes back as a promise.
   *
   * @param {!shaka.extern.MsfObject} obj
   * @param {!shaka.extern.MsfCodec} codec
   * @return {!Uint8Array|!Promise<!Uint8Array>}
   * @throws {shaka.util.Error} MSF_UNSUPPORTED_COMPRESSION when the algorithm
   *   is one this player does not know, or the browser cannot decompress it.
   *   MSF forbids processing such a payload.
   */
  static decode(obj, codec) {
    const Compression = shaka.msf.Compression;
    const algorithm = Compression.getAlgorithm(obj, codec);
    if (algorithm == Compression.Algorithm.NONE) {
      return obj.data;
    }
    if (algorithm == Compression.Algorithm.GZIP) {
      try {
        return Compression.gunzip_(obj.data);
      } catch (error) {
        // The browser cannot decompress GZIP: DecompressionStream is newer
        // than the rest of what MSF needs (Chromium 80, Firefox 113, Safari
        // 16.4).
      }
    }
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.MSF_UNSUPPORTED_COMPRESSION,
        algorithm);
  }

  /**
   * Not async on purpose: the stream is created before returning, so a browser
   * that cannot create it throws to the caller synchronously rather than
   * through the returned promise, which is left for a payload that fails to
   * decompress.
   *
   * @param {!Uint8Array} data
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  static gunzip_(data) {
    const stream = new DecompressionStream('gzip');
    return shaka.msf.Compression.readAll_(stream, data);
  }

  /**
   * @param {!DecompressionStream} stream
   * @param {!Uint8Array} data
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  static async readAll_(stream, data) {
    // The writes are not awaited: the writable side only drains as the
    // readable side is read, so waiting for them first would never finish. A
    // failure on them fails the reads below too, which is where it surfaces.
    const writer = stream.writable.getWriter();
    writer.write(data).catch(() => {});
    writer.close().catch(() => {});

    const reader = stream.readable.getReader();
    /** @type {!Array<!Uint8Array>} */
    const chunks = [];
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const {value, done} = await reader.read();
      if (done) {
        break;
      }
      chunks.push(/** @type {!Uint8Array} */ (value));
    }
    return shaka.util.Uint8ArrayUtils.concat(...chunks);
  }
};


/**
 * The MSF_COMPRESSION values, from the "MSF Compression Algorithms" registry.
 *
 * @enum {number}
 */
shaka.msf.Compression.Algorithm = {
  NONE: 0,
  GZIP: 1,
};


/**
 * The MSF_COMPRESSION Property Type, used both as a Track Property and as an
 * Object Property. Even, so its value is a bare var int.
 *
 * Declared as a number and widened with BigInt() at the lookup: a BigInt()
 * call here would run at load time and throw on platforms without BigInt
 * (Tizen 3), abandoning the whole test run.
 *
 * @private @const {number}
 */
shaka.msf.Compression.PROPERTY_TYPE_ = 0x78;
