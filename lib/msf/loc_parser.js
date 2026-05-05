/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
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
 * The LOC spec (draft-ietf-moq-loc-02 §2.3.1) defines an optional Timestamp
 * property (ID 0x06) and an optional Timescale property (ID 0x08).
 * `parse()` resolves `startTime` through three sources in priority order:
 *
 *   1. **Public properties** — `obj.extensions` (MOQ Object Header).
 *      Readable by relays; preferred when present.
 *
 *   2. **Private properties** — the key-value prefix of `obj.data`
 *      (LOC §2.2).  May be end-to-end encrypted.
 *
 *   3. **Fallback** — `Number(obj.location.group) × frameDuration`.
 *      Used when neither source carries a Timestamp.
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
 * Per LOC §2.2 the MOQ Object Payload layout is:
 *
 *   LOC Private Properties  (count vi64 + key-value pairs)  [optional]
 *   LOC Payload             (raw elementary bitstream)
 *
 * `parse()` strips the Private Properties prefix if present and returns
 * only the bare bitstream in `result.payload`. If parsing the prefix fails
 * (e.g. the buffer starts with raw codec data that looks like count=0) the
 * full buffer is returned unchanged.
 *
 * @see https://www.ietf.org/archive/id/draft-ietf-moq-loc-02.html
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
   *   1. Timestamp property (ID 0x06) in public extensions (`obj.extensions`)
   *   2. Timestamp property in private properties (LOC payload prefix)
   *   3. Fallback: `groupId × frameDuration`
   *
   * @param {!shaka.msf.Utils.MOQObject} obj
   * @return {!{startTime: number, duration: number, payload: !Uint8Array}}
   */
  parse(obj) {
    // ID of the LOC Timestamp property (§2.3.1.1, even → bigint value).
    const TIMESTAMP_ID = BigInt(0x06);
    // ID of the LOC Timescale property (§2.3.1.2, even → bigint value).
    const TIMESCALE_ID = BigInt(0x08);

    // Always parse private properties first so that we have the payload offset
    // (the Private Properties prefix must be stripped regardless of which
    // timing source we use).
    const {props: privateProps, payloadOffset} =
        this.parsePrivateProperties_(obj.data);
    const payload = shaka.util.BufferUtils.toUint8(obj.data, payloadOffset);

    // 1. Public properties (MOQ Object Header Extensions)
    // obj.extensions is a raw Uint8Array of length-bounded extension bytes
    // (the total-length prefix was already consumed by the transport layer).
    // Parse it as a flat sequence of type+value pairs (no count prefix).
    if (obj.extensions && obj.extensions.byteLength > 0) {
      const pubProps = this.parseExtensions_(obj.extensions);
      const pubTs = pubProps.get(TIMESTAMP_ID);
      if (typeof pubTs === 'bigint') {
        const pubScale = pubProps.get(TIMESCALE_ID);
        const startTime = this.timestampToSeconds_(pubTs,
            typeof pubScale === 'bigint' ? pubScale : undefined);
        return {startTime, duration: this.frameDuration_, payload};
      }
    }

    // 2. Private properties (LOC payload prefix)
    const privTs = privateProps.get(TIMESTAMP_ID);
    if (typeof privTs === 'bigint') {
      const privScale = privateProps.get(TIMESCALE_ID);
      const startTime = this.timestampToSeconds_(privTs,
          typeof privScale === 'bigint' ? privScale : undefined);
      return {startTime, duration: this.frameDuration_, payload};
    }

    // 3. Fallback: GroupID × frameDuration
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
   * Parses the raw MOQ Object Header Extensions buffer into a property map.
   *
   * Wire format — flat sequence of type+value pairs until buffer end
   * (no leading count field; the total-length prefix was already consumed
   * by the transport layer before storing the bytes in `obj.extensions`):
   *
   *   type  (vi64)
   *   value: vi64           when type is even
   *          length (vi64) + bytes  when type is odd
   *
   * This differs from `parsePrivateProperties_()`, whose buffer begins with
   * a count vi64.  Both share the same per-pair encoding.
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
      while (offset < data.byteLength) {
        const typeResult = this.readVi64At_(data, offset);
        offset += typeResult.bytesRead;
        const type = typeResult.value;

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
      shaka.log.v2('LOCParser: failed to parse extension headers, ' +
          'returning partial map', e);
    }

    return props;
  }

  /**
   * Parses the optional LOC Private Properties block at the start of the raw
   * MOQ Object Payload and returns the byte offset at which the actual media
   * bitstream begins together with the parsed properties map.
   *
   * Wire format (mirrors msf_classes.js Reader.keyValuePairs()):
   *   count  (vi64)
   *   For each of `count` pairs:
   *     type  (vi64)
   *     value: vi64           when type is even
   *            length (vi64) + bytes  when type is odd
   *   <LOC Payload starts here>
   *
   * If parsing throws at any point `payloadOffset` is reset to 0 so the full
   * buffer is returned as-is.
   *
   * @param {!Uint8Array} data  Raw MOQ Object Payload (obj.data).
   * @return {{
   *   props: !Map<bigint, bigint|!Uint8Array>,
   *   payloadOffset: number,
   * }}
   * @private
   */
  parsePrivateProperties_(data) {
    /** @type {!Map<bigint, bigint|!Uint8Array>} */
    const props = new Map();

    if (data.byteLength === 0) {
      return {props, payloadOffset: 0};
    }

    try {
      let offset = 0;

      const countResult = this.readVi64At_(data, offset);
      offset += countResult.bytesRead;
      const count = Number(countResult.value);

      // Sanity guard: an implausibly large count means the first byte is raw
      // codec data (e.g. an H.264 start-code 0x00 0x00 0x00 0x01 reads as
      // count=0 after masking).
      if (count === 0 || count > 64) {
        return {props, payloadOffset: 0};
      }

      for (let i = 0; i < count; i++) {
        const typeResult = this.readVi64At_(data, offset);
        offset += typeResult.bytesRead;
        const type = typeResult.value;

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

      return {props, payloadOffset: offset};
    } catch (e) {
      shaka.log.v2('LOCParser: failed to parse private properties prefix, ' +
          'using full buffer as payload', e);
      return {props, payloadOffset: 0};
    }
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
