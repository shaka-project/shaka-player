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
   * @param {string=} normalizedCodec The track's codec as returned by
   *   shaka.util.MimeUtils.getNormalizedCodec, used to decode the Video
   *   Config property. Omit for tracks that cannot carry one.
   */
  constructor(frameDuration, normalizedCodec) {
    /** @private {number} */
    this.frameDuration_ = frameDuration;

    /** @private {?string} */
    this.normalizedCodec_ = normalizedCodec || null;

    /**
     * End time of the last reference this parser emitted, or null before the
     * first one. See snapStartTime_.
     * @private {?number}
     */
    this.lastEndTime_ = null;
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

    let payload = shaka.util.BufferUtils.toUint8(obj.data);

    // Public properties (MOQ Object Properties).
    // obj.extensions is a raw Uint8Array of length-bounded property bytes
    // (the total-length prefix was already consumed by the transport layer).
    // Parse it as a flat sequence of type+value pairs (no count prefix).
    if (obj.extensions && obj.extensions.byteLength > 0) {
      const pubProps = this.parseExtensions_(obj.extensions);

      // Restore the parameter sets of a publisher that ships them out of band.
      // LOC-04 §2.1.2 allows a track to strip parameter sets from the
      // bitstream and carry the codec's extradata in the Video Config
      // property instead, on every key frame. Without this the payload of an
      // AVC track contains only slice NALs, H264.parseInfo() never resolves a
      // config, and the video track stays silently empty forever.
      const videoConfig = pubProps.get(LOCParser.VIDEO_CONFIG_ID_);
      if (videoConfig && ArrayBuffer.isView(videoConfig)) {
        payload = this.prependParameterSets_(
            payload, /** @type {!Uint8Array} */ (videoConfig));
      }
      // draft-04 renumbered Timestamp from 0x06 to 0x10; accept both, current
      // ID first, because publishers of both vintages are deployed.
      let pubTs = pubProps.get(LOCParser.TIMESTAMP_ID_);
      if (typeof pubTs !== 'bigint') {
        pubTs = pubProps.get(LOCParser.TIMESTAMP_ID_LEGACY_);
      }
      if (typeof pubTs === 'bigint') {
        const pubScale = pubProps.get(LOCParser.TIMESCALE_ID_);
        const startTime = this.snapStartTime_(this.timestampToSeconds_(
            pubTs, typeof pubScale === 'bigint' ? pubScale : undefined));
        return {startTime, duration: this.frameDuration_, payload};
      }
    }

    // Fallback: GroupID × frameDuration
    return {
      startTime: this.snapStartTime_(
          Number(obj.location.group) * this.frameDuration_),
      duration: this.frameDuration_,
      payload,
    };
  }

  /**
   * Snaps `startTime` onto the previous reference's end time when it is close
   * enough to be publish-clock noise rather than a real discontinuity.
   *
   * A LOC reference is assembled from two different clocks: `startTime` comes
   * from the publisher's Timestamp, `duration` is a constant derived from the
   * catalog. The two cannot agree exactly, so consecutive references overlap
   * or leave a hole — even a publisher whose timestamps are exact leaves
   * sub-microsecond gaps, because a frame duration such as 1024/48000 s is
   * not representable in whole timestamp units.
   *
   * That is not cosmetic, and the size of the gap barely matters.
   * StreamingEngine asks for the segment covering the previous reference's
   * endTime; when that instant falls in a hole of ANY width,
   * SegmentIndex.find() returns null and update_ takes its "segment could not
   * be found ... just try again" path, backing off half a segment and
   * retrying instead of appending.
   *
   * Beyond the tolerance the publisher's clock stays authoritative, so a real
   * discontinuity still resyncs the timeline.
   *
   * The trade-off is explicit: within the tolerance a genuinely lost frame is
   * closed up rather than preserved as a gap, which advances this track
   * against the others by that frame's duration. For live playback that is
   * the right trade — a lost frame is inaudible or invisible, a hole stalls
   * outright, and the drift is bounded because any real discontinuity
   * re-anchors on the publisher's clock.
   *
   * @param {number} startTime
   * @return {number}
   * @private
   */
  snapStartTime_(startTime) {
    const LOCParser = shaka.msf.LOCParser;
    const last = this.lastEndTime_;
    // Publish-clock jitter is an absolute quantity — a publisher whose clock
    // wanders by tens of milliseconds does so whether the track is 60 fps
    // video or 48 kHz audio — so a purely frame-counted tolerance hands each
    // track a different allowance for the same physical jitter, and
    // under-serves whichever track has the shorter frames. Floor it in the
    // time domain, keeping the frame-based term for tracks whose frames are
    // longer than the floor.
    const tolerance = Math.max(
        this.frameDuration_ * LOCParser.SNAP_TOLERANCE_FRAMES_,
        LOCParser.SNAP_TOLERANCE_MIN_SEC_);
    if (last != null && Math.abs(startTime - last) < tolerance) {
      startTime = last;
    }
    this.lastEndTime_ = startTime + this.frameDuration_;
    return startTime;
  }

  /**
   * Prepends the parameter sets carried in the Video Config property to
   * `payload`, as 4-byte length-prefixed NAL units.
   *
   * LOC-04 §2.3.2.1 defines Video Config as "the extradata bytes defined by
   * the corresponding codec specification", so its layout depends on the
   * codec: an AVCDecoderConfigurationRecord for H.264 and an
   * HEVCDecoderConfigurationRecord for H.265. A publisher that uses it has
   * stripped the parameter sets from the bitstream (§2.1.2), so re-inlining
   * them here restores exactly what was removed, at the earliest point, and
   * every downstream consumer stays unchanged — in-band parameter sets ahead
   * of a key frame are what decoders expect anyway.
   *
   * The record's own `lengthSizeMinusOne` describes how the RECORD frames its
   * entries, not how the bitstream frames its NAL units, so the restored sets
   * are always emitted with the 4-byte prefix LOC-04 §2.1.3 specifies.
   *
   * Returns `payload` unchanged when the codec has no known record layout or
   * the record is malformed: a bad config must degrade to the previous
   * behaviour rather than corrupt the bitstream.
   *
   * @param {!Uint8Array} payload
   * @param {!Uint8Array} config  The Video Config property value.
   * @return {!Uint8Array}
   * @private
   */
  prependParameterSets_(payload, config) {
    const LOCParser = shaka.msf.LOCParser;

    /** @type {?Array<!Uint8Array>} */
    let paramSets = null;
    if (this.normalizedCodec_ === 'avc') {
      paramSets = LOCParser.avcParameterSets_(config);
    } else if (this.normalizedCodec_ === 'hevc') {
      paramSets = LOCParser.hevcParameterSets_(config);
    }

    if (!paramSets || !paramSets.length) {
      return payload;
    }

    let prefixSize = 0;
    for (const ps of paramSets) {
      prefixSize += 4 + ps.byteLength;
    }

    const out = new Uint8Array(prefixSize + payload.byteLength);
    let w = 0;
    for (const ps of paramSets) {
      const len = ps.byteLength;
      out[w++] = (len >>> 24) & 0xff;
      out[w++] = (len >>> 16) & 0xff;
      out[w++] = (len >>> 8) & 0xff;
      out[w++] = len & 0xff;
      out.set(ps, w);
      w += len;
    }
    out.set(payload, w);
    return out;
  }

  /**
   * Extracts the SPS and PPS NAL units from an AVCDecoderConfigurationRecord
   * (ISO/IEC 14496-15 §5.3.3.1), or null if the record is malformed.
   *
   * @param {!Uint8Array} config
   * @return {?Array<!Uint8Array>}
   * @private
   */
  static avcParameterSets_(config) {
    // configurationVersion(1) profile(1) compat(1) level(1)
    // lengthSizeMinusOne(1) numOfSPS(1) — 6 bytes before the first SPS.
    if (config.byteLength < 7 || config[0] !== 1) {
      return null;
    }

    /** @type {!Array<!Uint8Array>} */
    const paramSets = [];
    let offset = 5;

    // Two runs with identical structure: SPS (count in the low 5 bits) then
    // PPS (a full byte). Each entry is a 2-byte big-endian length + payload.
    for (const mask of [0x1f, 0xff]) {
      if (offset >= config.byteLength) {
        return null;
      }
      const count = config[offset++] & mask;
      for (let i = 0; i < count; i++) {
        const nalu = shaka.msf.LOCParser.readSizedNalu_(config, offset);
        if (!nalu) {
          return null;
        }
        paramSets.push(nalu.data);
        offset = nalu.offset;
      }
    }

    return paramSets;
  }

  /**
   * Extracts the VPS, SPS and PPS NAL units from an
   * HEVCDecoderConfigurationRecord (ISO/IEC 14496-15 §8.3.3.1), or null if
   * the record is malformed.
   *
   * The record groups NAL units into arrays keyed by type rather than listing
   * them in a fixed order, and H265.parseInfo() needs all three, so every
   * array is emitted in the order the record lists them.
   *
   * @param {!Uint8Array} config
   * @return {?Array<!Uint8Array>}
   * @private
   */
  static hevcParameterSets_(config) {
    // 22 bytes of fixed fields (profile/tier/level, chroma and bit depths,
    // frame rate, lengthSizeMinusOne) precede numOfArrays.
    const ARRAYS_OFFSET = 23;
    if (config.byteLength < ARRAYS_OFFSET || config[0] !== 1) {
      return null;
    }

    /** @type {!Array<!Uint8Array>} */
    const paramSets = [];
    const numOfArrays = config[22];
    let offset = ARRAYS_OFFSET;

    for (let i = 0; i < numOfArrays; i++) {
      // array_completeness(1) reserved(1) NAL_unit_type(6), then a 2-byte
      // count. The NAL type is already in the unit's own header, so it is
      // only read past here.
      if (offset + 3 > config.byteLength) {
        return null;
      }
      offset += 1;
      const numNalus = (config[offset] << 8) | config[offset + 1];
      offset += 2;
      for (let j = 0; j < numNalus; j++) {
        const nalu = shaka.msf.LOCParser.readSizedNalu_(config, offset);
        if (!nalu) {
          return null;
        }
        paramSets.push(nalu.data);
        offset = nalu.offset;
      }
    }

    return paramSets;
  }

  /**
   * Reads one 2-byte big-endian length-prefixed NAL unit from a decoder
   * configuration record, or null if it does not fit.
   *
   * @param {!Uint8Array} config
   * @param {number} offset
   * @return {?{data: !Uint8Array, offset: number}}
   * @private
   */
  static readSizedNalu_(config, offset) {
    if (offset + 2 > config.byteLength) {
      return null;
    }
    const len = (config[offset] << 8) | config[offset + 1];
    offset += 2;
    if (len === 0 || offset + len > config.byteLength) {
      return null;
    }
    return {data: config.subarray(offset, offset + len), offset: offset + len};
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


/**
 * ID of the LOC Video Config property (draft-ietf-moq-loc-04 §2.3.2.1).
 *
 * Odd, so the value is a length-prefixed byte string: the codec's extradata,
 * which is an AVCDecoderConfigurationRecord for H.264 and an
 * HEVCDecoderConfigurationRecord for H.265. Carried only on key frames, and
 * only by publishers that strip parameter sets from the bitstream.
 *
 * @private @const {bigint}
 */
shaka.msf.LOCParser.VIDEO_CONFIG_ID_ = BigInt(0x0d);


/**
 * How far, in frame durations, a LOC timestamp may sit from the previous
 * reference's end and still be treated as publish-clock noise rather than a
 * discontinuity.
 *
 * A real discontinuity is a track switch or a source change, which is orders
 * of magnitude larger than this.
 *
 * @private @const {number}
 */
shaka.msf.LOCParser.SNAP_TOLERANCE_FRAMES_ = 2;


/**
 * Minimum snap tolerance in seconds, regardless of frame duration.
 *
 * Jitter is absolute, not proportional to frame rate, so a frame-counted
 * tolerance under-serves short frames: two frames of 48 kHz AAC is 42.7 ms,
 * which is inside the range ordinary publish-clock wander reaches.
 *
 * @private @const {number}
 */
shaka.msf.LOCParser.SNAP_TOLERANCE_MIN_SEC_ = 0.06;
