/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.LOCParser');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');

goog.requireType('shaka.msf.Utils');


/**
 * Parser for Low Overhead Container (LOC) media objects.
 *
 * ## Timing strategy
 *
 * LOC defines an optional Timestamp property and an optional Timescale
 * property (ID 0x08), carried as LOC Public Properties inside the MOQ Object
 * Properties. `parse()` resolves `startTime` from two sources in priority
 * order:
 *
 *   1. **Public properties** — `obj.extensions` (MOQ Object Properties).
 *      Readable by relays; preferred when present.
 *
 *   2. **Fallback** — `Number(obj.location.group) × frameDuration`.
 *      Used when no Timestamp is carried.
 *
 * The Timestamp property was renumbered from 0x06 to 0x10 between
 * draft-ietf-moq-loc-02 and -04, so both IDs are accepted: publishers of both
 * vintages are deployed, and 0x06 additionally collides with MOQT's own
 * SUBGROUP_DELIVERY_TIMEOUT (a Track property, so it does not appear here in
 * practice). When both are present the current ID wins.
 *
 * When a Timestamp is found, `startTime` is computed as:
 *
 *   startTime = Number(timestamp) / Number(timescale)
 *
 * where `timescale` defaults to 1 000 000 (microseconds) per the spec when
 * the Timescale property is absent (§2.3.1.1).
 *
 * `frameDuration` — a fixed per-frame duration in seconds computed from
 * the MSF catalog fields (framerate / samplerate / codec). Callers use
 * `LOCParser.frameDurationFromTrack(track)` to obtain this value.
 *
 * Every call to `parse()` is stateless and always returns a non-null result.
 *
 * ## Payload extraction
 *
 * The MOQ Object Payload is handed through unchanged as `result.payload`.
 *
 * LOC-02 §2.2 also allowed a LOC Private Properties block (a count vi64
 * followed by key-value pairs) to precede the bitstream, and this parser used
 * to strip it. That block cannot be told apart from raw codec data — the
 * first byte of a stereo AAC-LC `raw_data_block` reads as a count of 32 or 33
 * — so the strip could silently truncate perfectly good media. LOC-04
 * §3.1.3 drops the ad-hoc block entirely and delegates private metadata to
 * the [SecureObjects] Private properties mechanism (type 0xA), so nothing is
 * stripped here until that is implemented.
 *
 * @see https://www.ietf.org/archive/id/draft-ietf-moq-loc-04.html
 * @final
 */
shaka.msf.LOCParser = class {
  /**
   * @param {number} frameDuration
   */
  constructor(frameDuration) {
    /** @private {number} */
    this.frameDuration_ = frameDuration;
  }

  /**
   * Parses a single LOC MoQ object.
   *
   * Resolves `startTime` in priority order:
   *   1. Timestamp property in public properties (`obj.extensions`)
   *   2. Fallback: `groupId × frameDuration`
   *
   * @param {!shaka.msf.Utils.MOQObject} obj
   * @return {!{startTime: number, duration: number, payload: !Uint8Array}}
   */
  parse(obj) {
    const LOCParser = shaka.msf.LOCParser;

    const payload = shaka.util.BufferUtils.toUint8(obj.data);

    // Public properties (MOQ Object Properties).
    // obj.extensions is a raw Uint8Array of length-bounded property bytes
    // (the total-length prefix was already consumed by the transport layer).
    // Parse it as a flat sequence of type+value pairs (no count prefix).
    if (obj.extensions && obj.extensions.byteLength > 0) {
      const pubProps = this.parseExtensions_(obj.extensions);
      // draft-04 renumbered Timestamp from 0x06 to 0x10; accept both, current
      // ID first, because publishers of both vintages are deployed.
      let pubTs = pubProps.get(LOCParser.TIMESTAMP_ID_);
      if (typeof pubTs !== 'bigint') {
        pubTs = pubProps.get(LOCParser.TIMESTAMP_ID_LEGACY_);
      }
      if (typeof pubTs === 'bigint') {
        const pubScale = pubProps.get(LOCParser.TIMESCALE_ID_);
        const startTime = this.timestampToSeconds_(pubTs,
            typeof pubScale === 'bigint' ? pubScale : undefined);
        return {startTime, duration: this.frameDuration_, payload};
      }
    }

    // Fallback: GroupID × frameDuration
    return {
      startTime: Number(obj.location.group) * this.frameDuration_,
      duration: this.frameDuration_,
      payload,
    };
  }

  /**
   * Converts a raw LOC Timestamp value to presentation seconds.
   *
   * Per LOC §2.3.1.1–§2.3.1.2:
   *  - When `timescale` is present:  `seconds = timestamp / timescale`
   *  - When `timescale` is absent:   the timestamp is wall-clock µs since the
   *    Unix epoch, so the implicit timescale is 1 000 000.
   *
   * @param {bigint} timestamp  Raw vi64 timestamp value.
   * @param {bigint|undefined} timescale  Raw vi64 timescale, or `undefined`
   *     if the Timescale property was absent.
   * @return {number}
   * @private
   */
  timestampToSeconds_(timestamp, timescale) {
    const scale = timescale !== undefined ? Number(timescale) : 1e6;
    return Number(timestamp) / scale;
  }

  /**
   * Parses the raw MOQ Object Properties buffer into a property map.
   *
   * Wire format — a flat sequence of MOQT Key-Value-Pairs
   * (draft-ietf-moq-transport-18 §1.4.3) running to the end of the buffer;
   * the total-length prefix was already consumed by the transport layer
   * before storing the bytes in `obj.extensions`:
   *
   *   delta type (vi64)
   *   value: vi64           when the resolved type is even
   *          length (vi64) + bytes  when the resolved type is odd
   *
   * Types are DELTA encoded against the previous type in the block, starting
   * from 0. Reading them as absolute is worse than dropping the trailing
   * properties: a delta can collide with a real type and bind an unrelated
   * property's value to it. With Timestamp and Timescale present the deltas
   * are 6 and 2, so an absolute read loses Timescale entirely and
   * timestampToSeconds_ silently falls back to its microsecond default.
   *
   * If parsing throws at any point the partial map built so far is returned,
   * so callers always receive a valid (possibly empty) map.
   *
   * @param {!Uint8Array} data  Raw bytes from `obj.extensions`.
   * @return {!Map<bigint, bigint|!Uint8Array>}
   * @private
   */
  parseExtensions_(data) {
    /** @type {!Map<bigint, bigint|!Uint8Array>} */
    const props = new Map();

    if (data.byteLength === 0) {
      return props;
    }

    try {
      let offset = 0;
      /** @type {bigint} */
      let previousType = BigInt(0);
      while (offset < data.byteLength) {
        const deltaResult = this.readVi64At_(data, offset);
        offset += deltaResult.bytesRead;
        const type = previousType + deltaResult.value;
        previousType = type;

        if (type % BigInt(2) === BigInt(0)) {
          // Even type → single vi64 value
          const valResult = this.readVi64At_(data, offset);
          offset += valResult.bytesRead;
          props.set(type, valResult.value);
        } else {
          // Odd type → length-prefixed byte sequence
          const lenResult = this.readVi64At_(data, offset);
          offset += lenResult.bytesRead;
          const len = Number(lenResult.value);
          props.set(type, shaka.util.BufferUtils.toUint8(data, offset, len));
          offset += len;
        }
      }
    } catch (e) {
      shaka.log.v2('LOCParser: failed to parse object properties, ' +
          'returning partial map', e);
    }

    return props;
  }

  /**
   * Reads one QUIC variable-length integer (vi64, up to 62 bits) from
   * `buffer` at byte `offset`.
   *
   * Top-two-bit size tag:
   *   00 → 1 byte  (6-bit value,  mask 0x3f)
   *   01 → 2 bytes (14-bit value, mask 0x3fff)
   *   10 → 4 bytes (30-bit value, mask 0x3fffffff)
   *   11 → 8 bytes (62-bit value, mask 0x3fffffffffffffff)
   *
   * Synchronous equivalent of `Reader.u62WithSize()` in msf_classes.js.
   *
   * @param {!Uint8Array} buffer
   * @param {number} offset
   * @return {{value: bigint, bytesRead: number}}
   * @private
   */
  readVi64At_(buffer, offset) {
    if (offset >= buffer.length) {
      throw new Error(
          `LOCParser.readVi64At: underflow at offset ${offset}`);
    }

    const tag = (buffer[offset] & 0xc0) >> 6;

    if (tag === 0) {
      return {value: BigInt(buffer[offset] & 0x3f), bytesRead: 1};
    }
    if (tag === 1) {
      if (offset + 2 > buffer.length) {
        throw new Error('LOCParser.readVi64At: need 2 bytes');
      }
      const view = shaka.util.BufferUtils.toDataView(buffer, offset, 2);
      return {
        value: BigInt(view.getUint16(0)) & BigInt('0x3fff'),
        bytesRead: 2,
      };
    }
    if (tag === 2) {
      if (offset + 4 > buffer.length) {
        throw new Error('LOCParser.readVi64At: need 4 bytes');
      }
      const view = shaka.util.BufferUtils.toDataView(buffer, offset, 4);
      return {
        value: BigInt(view.getUint32(0)) & BigInt('0x3fffffff'),
        bytesRead: 4,
      };
    }
    // tag === 3
    if (offset + 8 > buffer.length) {
      throw new Error('LOCParser.readVi64At: need 8 bytes');
    }
    const view = shaka.util.BufferUtils.toDataView(buffer, offset, 8);
    return {
      value: view.getBigUint64(0) & BigInt('0x3fffffffffffffff'),
      bytesRead: 8,
    };
  }

  /**
   * Computes the fixed frame duration (seconds) for a LOC track from MSF
   * catalog fields.
   *
   * Rules:
   *  - Video: `1 / track.framerate`
   *  - Audio AAC (`mp4a.40.2`, AAC-LC): `1024 / track.samplerate`
   *    (AAC-LC always uses 1024 samples per frame per ISO 14496-3)
   *  - Audio Opus: `960 / track.samplerate`
   *    (standard 20 ms Opus frame at any sample rate)
   *
   * @param {msfCatalog.Track} track
   * @return {?number}
   */
  static frameDurationFromTrack(track) {
    const codec = (track.codec || '').toLowerCase();

    // Video
    if (track.framerate) {
      return 1 / track.framerate;
    }

    // Audio
    if (!track.samplerate) {
      shaka.log.warning('LOCParser.frameDurationFromTrack: ' +
          `track "${track.name}" has no samplerate`);
      return null;
    }

    // AAC (mp4a.40.x family — AAC-LC, HE-AAC, etc.)
    // All AAC-LC profiles encode 1024 PCM samples per frame.
    if (codec.startsWith('mp4a.40')) {
      return 1024 / track.samplerate;
    }

    // Opus — RFC 6716 §2.1.2 defines the standard frame size as 20 ms
    // (960 samples at 48 kHz).
    if (codec === 'opus') {
      return 960 / track.samplerate;
    }

    shaka.log.warning('LOCParser.frameDurationFromTrack: ' +
        `unrecognised codec "${track.codec}" for track "${track.name}"`);
    return null;
  }
};


/**
 * ID of the LOC Timestamp property (draft-ietf-moq-loc-04 §2.3.1.1).
 *
 * Even, so the value is a bare vi64.
 *
 * @private @const {bigint}
 */
shaka.msf.LOCParser.TIMESTAMP_ID_ = BigInt(0x10);


/**
 * ID the LOC Timestamp property used up to draft-ietf-moq-loc-02.
 *
 * Accepted alongside the current ID because publishers of both vintages are
 * deployed. It is read only when the current ID is absent, so a publisher
 * that sends 0x10 is never affected by it.
 *
 * @private @const {bigint}
 */
shaka.msf.LOCParser.TIMESTAMP_ID_LEGACY_ = BigInt(0x06);


/**
 * ID of the LOC Timescale property (draft-ietf-moq-loc-04 §2.3.1.2).
 *
 * Unchanged across draft-02 and draft-04. Even, so the value is a bare vi64.
 *
 * @private @const {bigint}
 */
shaka.msf.LOCParser.TIMESCALE_ID_ = BigInt(0x08);
