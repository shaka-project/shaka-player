/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.LOCMAFParser');

goog.require('shaka.log');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.util.Mp4Generator');


/**
 * Parser for LOCMAF media objects, which turns each one back into the CMAF
 * chunk it was made from.
 *
 * LOCMAF is CMAF with the `moof` taken apart. The sample data travels
 * untouched as the object's trailing bytes, and everything the `moof` said
 * about it -- sample sizes, durations, flags, composition offsets, the decode
 * time, and the CENC per-sample metadata -- travels ahead of it as a handful
 * of tagged fields. Consecutive chunks of a group carry only what changed,
 * so the steady-state object is a two-byte header plus one frame.
 *
 * ## What has to be remembered
 *
 * Unlike a CMAF chunk, a LOCMAF object is not self-describing. Three kinds of
 * state make it readable:
 *
 *   1. **The initialization segment.** The track's `trex` defaults, its
 *      `track_ID`, and, for protected tracks, its `tenc` defaults are what
 *      every omitted field falls back to. They are read once, from the same
 *      CMAF Header a plain `cmaf` track would carry, and handed in as
 *      constructor parameters.
 *
 *   2. **The previous chunk of the group.** A delta header is a set of
 *      differences against the chunk before it, so a chunk cannot be read in
 *      isolation. A full header re-anchors that state; so does a rawBoxes
 *      object, after which the next header must be a full one.
 *
 *   3. **The decode time.** `baseMediaDecodeTime` never travels in a delta
 *      header at all. It is derived as the previous chunk's decode time plus
 *      the sum of the previous chunk's effective sample durations, which
 *      makes the running state load-bearing for timing and not merely for
 *      compression.
 *
 * Because of (2) and (3), a lost object poisons every delta that follows it.
 * The spec requires the receiver to notice -- a gap in object IDs -- and stop
 * applying deltas until the next full header or the next group, which is what
 * `checkContinuity_` does.
 *
 * ## What comes out
 *
 * The reconstruction follows the canonical form of the spec's Section 15
 * rather than any convenient equivalent. Playback does not need canonical
 * bytes, but conformance vectors are expressed in them, so producing them is
 * what makes this parser testable against the reference implementation.
 *
 * Note that the canonical chunk is a function of the chunk's *effective*
 * values alone -- what each sample's duration, size, flags and offset work
 * out to -- and not of how those values happened to be split between
 * per-sample lists and `tfhd`/`trex` defaults on the wire. This parser
 * therefore expands every field to a per-sample array first and re-derives
 * the box layout from the arrays, which is both simpler than tracking wire
 * provenance and the only way two encoders' output can be compared.
 *
 * @see https://datatracker.ietf.org/doc/draft-einarsson-moq-locmaf/
 *
 * @final
 */
shaka.msf.LOCMAFParser = class {
  /**
   * @param {!shaka.extern.MsfCodec} codec The negotiated draft's primitive
   *   codec, used to read the variable-length integers the spec calls vi64.
   *   It defines them by reference to MOQT's own encoding, which changed in
   *   draft-17, so the same header bytes mean different numbers depending on
   *   which draft delivered them.
   * @param {!shaka.msf.LOCMAFParser.TrackParams} params Everything read out
   *   of the track's CMAF Header.
   */
  constructor(codec, params) {
    /** @private {!shaka.extern.MsfCodec} */
    this.codec_ = codec;

    /** @private {!shaka.msf.LOCMAFParser.TrackParams} */
    this.params_ = params;

    /**
     * The in-group reference state: the represented field values of the
     * previous chunk, keyed by LOCMAF field ID. Not the effective values --
     * a delta applies to what the previous chunk carried, so a field the
     * previous chunk left to a default has a previous value of zero.
     * @private {!Map<number, (number|!Array<number>|!Uint8Array)>}
     */
    this.fields_ = new Map();

    /**
     * True once a full header has established a reference the deltas in this
     * group can be applied to.
     * @private {boolean}
     */
    this.hasReference_ = false;

    /**
     * The sum of the previous chunk's effective sample durations, which is
     * the only thing a delta chunk's decode time can be derived from.
     * @private {number}
     */
    this.previousDurationSum_ = 0;

    /** @private {?bigint} */
    this.group_ = null;

    /** @private {?bigint} */
    this.previousObjectId_ = null;
  }

  /**
   * Reconstructs the CMAF chunk one LOCMAF object carries, or returns null
   * when the object carries no appendable media -- an object status, a
   * rawBoxes object holding initialization bytes -- or when it cannot be
   * read.
   *
   * @param {!shaka.extern.MsfObject} obj
   * @return {?shaka.msf.LOCMAFParser.Chunk}
   */
  parse(obj) {
    this.checkContinuity_(obj);

    if (!obj.data.byteLength) {
      return null;
    }

    try {
      return this.parseObject_(obj.data);
    } catch (error) {
      // A malformed object is not fatal, but it does break the chain: the
      // fields it would have contributed are unknown, so every delta that
      // follows would be applied to the wrong reference.
      shaka.log.warning('Discarding malformed LOCMAF object', error);
      this.reset_();
      return null;
    }
  }

  /**
   * Notices the two things that invalidate the delta chain: a new group, and
   * a hole in the object IDs of the current one.
   *
   * @param {!shaka.extern.MsfObject} obj
   * @private
   */
  checkContinuity_(obj) {
    const location = obj.location;
    if (this.group_ === null || location.group !== this.group_) {
      this.group_ = location.group;
      this.reset_();
    } else if (this.previousObjectId_ !== null &&
        location.object !== this.previousObjectId_ + BigInt(1)) {
      shaka.log.debug('Gap in LOCMAF object IDs; waiting for a full header',
          this.previousObjectId_, location.object);
      this.reset_();
    }
    this.previousObjectId_ = location.object;
  }

  /**
   * Drops the in-group reference, so that nothing is decoded until the next
   * full header or rawBoxes object.
   *
   * @private
   */
  reset_() {
    this.fields_.clear();
    this.hasReference_ = false;
    this.previousDurationSum_ = 0;
  }

  /**
   * @param {!Uint8Array} data
   * @return {?shaka.msf.LOCMAFParser.Chunk}
   * @private
   */
  parseObject_(data) {
    const ElementType = shaka.msf.LOCMAFParser.ElementType_;

    /** @type {!Array<!Uint8Array>} */
    const genBoxes = [];
    let offset = 0;

    while (true) {
      const element = this.readVarInt_(data, offset);
      offset += element.bytesRead;

      if (element.value === ElementType.RAW_BOXES) {
        if (genBoxes.length) {
          throw new Error('rawBoxes is not the first element');
        }
        return this.parseRawBoxes_(data.subarray(offset));
      }

      if (element.value === ElementType.GEN_BOX) {
        const genBox = this.readGenBox_(data, offset);
        genBoxes.push(genBox.box);
        offset = genBox.offset;
        continue;
      }

      const isDelta = element.value === ElementType.DELTA_HEADER;
      if (!isDelta && element.value !== ElementType.FULL_HEADER) {
        // Element types are not self-delimiting, so an unrecognized one
        // cannot be skipped past; the spec makes this a hard failure rather
        // than let two receivers reconstruct different chunks.
        throw new Error(`Unknown LOCMAF element type ${element.value}`);
      }

      const length = this.readVarInt_(data, offset);
      offset += length.bytesRead;
      if (offset + length.value > data.byteLength) {
        throw new Error('LOCMAF property block overruns the object');
      }
      const block = data.subarray(offset, offset + length.value);
      offset += length.value;

      const properties = this.decodeProperties_(block, isDelta);
      if (isDelta) {
        this.applyDelta_(properties);
      } else {
        this.applyFull_(properties);
      }

      return this.buildChunk_(genBoxes, data.subarray(offset));
    }
  }

  /**
   * A rawBoxes object is reconstructed verbatim, but it resets the delta
   * chain: deriving reference state from it would mean parsing a `moof` back
   * out of the bytes, which reconstruction never otherwise needs.
   *
   * @param {!Uint8Array} boxes
   * @return {?shaka.msf.LOCMAFParser.Chunk}
   * @private
   */
  parseRawBoxes_(boxes) {
    this.reset_();

    if (!boxes.byteLength) {
      throw new Error('Empty rawBoxes element');
    }

    // What the boxes are is not signaled: in-band initialization bytes
    // (`ftyp` + `moov`) and a verbatim chunk are both legal. Reading the
    // timing tells the two apart -- only a chunk has a `tfdt` and a `trun` --
    // and a caller with no timing has nothing to append.
    const info = shaka.media.SegmentUtils.getStartTimeAndDurationFromMp4(
        boxes, this.params_.timescale);
    if (!info.duration) {
      shaka.log.debug('Ignoring rawBoxes object with no media timing');
      return null;
    }

    return {
      startTime: info.startTime,
      duration: info.duration,
      data: boxes,
    };
  }

  /**
   * Reads one genBox element and rebuilds the ISO box it carries. The wire
   * form drops the 4-byte size, so `box_size` covers the FourCC and the
   * contents, and the reconstructed box is four bytes longer.
   *
   * @param {!Uint8Array} data
   * @param {number} offset
   * @return {!{box: !Uint8Array, offset: number}}
   * @private
   */
  readGenBox_(data, offset) {
    const size = this.readVarInt_(data, offset);
    offset += size.bytesRead;

    if (size.value < 4) {
      throw new Error(`genBox size ${size.value} is below the FourCC`);
    }
    if (size.value > 0xfffffffb) {
      throw new Error(`genBox size ${size.value} overflows a 32-bit box`);
    }
    if (offset + size.value > data.byteLength) {
      throw new Error('genBox overruns the object');
    }

    const box = new Uint8Array(4 + size.value);
    this.writeUint32_(box, 0, box.byteLength);
    box.set(data.subarray(offset, offset + size.value), 4);

    return {box, offset: offset + size.value};
  }

  /**
   * Decodes a property block into field values.
   *
   * The parity of a field ID decides how its value is framed -- an even ID is
   * one bare vi64, an odd ID is length-prefixed bytes -- which is what lets a
   * receiver step over a field it does not know. That framing rule is fixed;
   * how the value bytes are read is per-field, and three fields do not follow
   * the plain absolute-in-full, delta-in-delta pattern.
   *
   * @param {!Uint8Array} block
   * @param {boolean} isDelta
   * @return {!Map<number, (number|!Array<number>|!Uint8Array)>}
   * @private
   */
  decodeProperties_(block, isDelta) {
    const Field = shaka.msf.LOCMAFParser.Field;

    /** @type {!Map<number, (number|!Array<number>|!Uint8Array)>} */
    const properties = new Map();
    let offset = 0;

    while (offset < block.byteLength) {
      const id = this.readVarInt_(block, offset);
      offset += id.bytesRead;

      if (properties.has(id.value)) {
        throw new Error(`Repeated LOCMAF field ${id.value}`);
      }

      if (id.value % 2 === 0) {
        const value = this.readVarInt_(block, offset);
        offset += value.bytesRead;
        properties.set(id.value, isDelta ?
            shaka.msf.LOCMAFParser.zigzagToSigned_(value.raw) : value.value);
        continue;
      }

      const length = this.readVarInt_(block, offset);
      offset += length.bytesRead;
      if (offset + length.value > block.byteLength) {
        throw new Error(`LOCMAF field ${id.value} overruns the block`);
      }
      const bytes = block.subarray(offset, offset + length.value);
      offset += length.value;

      if (id.value === Field.SENC_INITIALIZATION_VECTOR) {
        // Opaque bytes, overwritten rather than differenced. Copied because
        // it outlives the object it came from as reference state.
        properties.set(id.value, bytes.slice());
      } else {
        // Composition-time offsets are signed in both contexts, because
        // B-frames make them negative; the deletion list is a control field
        // whose elements are plain field IDs.
        const signed = isDelta ?
            id.value !== Field.DELTA_DELETED_LOCMAF_IDS :
            id.value === Field.TRUN_SAMPLE_COMPOSITION_TIME_OFFSETS;
        properties.set(id.value, this.decodeList_(bytes, signed));
      }
    }

    return properties;
  }

  /**
   * Decodes a vi64 list. The element count is never needed: a list always
   * carries exactly as many values as the chunk's list has entries, so the
   * byte-length prefix delimits it on its own. That holds through length
   * changes too -- a list that grows carries absolute values for the new
   * tail, and one that shrinks simply emits fewer values.
   *
   * @param {!Uint8Array} bytes
   * @param {boolean} signed
   * @return {!Array<number>}
   * @private
   */
  decodeList_(bytes, signed) {
    /** @type {!Array<number>} */
    const values = [];
    let offset = 0;
    while (offset < bytes.byteLength) {
      const value = this.readVarInt_(bytes, offset);
      offset += value.bytesRead;
      values.push(signed ?
          shaka.msf.LOCMAFParser.zigzagToSigned_(value.raw) : value.value);
    }
    return values;
  }

  /**
   * Replaces the reference state with a full header's absolute values.
   *
   * @param {!Map<number, (number|!Array<number>|!Uint8Array)>} properties
   * @private
   */
  applyFull_(properties) {
    const Field = shaka.msf.LOCMAFParser.Field;

    if (properties.has(Field.DELTA_DELETED_LOCMAF_IDS)) {
      throw new Error('A full LOCMAF header carries a deletion list');
    }
    if (!properties.has(Field.TRUN_SAMPLE_COUNT)) {
      throw new Error('A full LOCMAF header carries no sample count');
    }
    if (!properties.has(Field.TFDT_BASE_MEDIA_DECODE_TIME)) {
      throw new Error('A full LOCMAF header carries no decode time');
    }

    this.fields_.clear();
    for (const id of properties.keys()) {
      if (shaka.msf.LOCMAFParser.KNOWN_FIELDS_.has(id)) {
        this.fields_.set(id, properties.get(id));
      }
    }
    this.hasReference_ = true;
  }

  /**
   * Folds a delta header into the reference state. Deletions are applied
   * first, so that a field the current chunk drops falls back to its default
   * instead of being differenced against a value that no longer applies.
   *
   * @param {!Map<number, (number|!Array<number>|!Uint8Array)>} properties
   * @private
   */
  applyDelta_(properties) {
    const Field = shaka.msf.LOCMAFParser.Field;

    if (!this.hasReference_) {
      throw new Error('A LOCMAF delta header has no reference to apply to');
    }
    if (properties.has(Field.TFDT_BASE_MEDIA_DECODE_TIME)) {
      throw new Error('A LOCMAF delta header carries a decode time');
    }

    const deleted = properties.get(Field.DELTA_DELETED_LOCMAF_IDS);
    if (deleted) {
      for (const id of /** @type {!Array<number>} */ (deleted)) {
        this.fields_.delete(id);
      }
    }

    for (const id of properties.keys()) {
      if (id === Field.DELTA_DELETED_LOCMAF_IDS ||
          !shaka.msf.LOCMAFParser.KNOWN_FIELDS_.has(id)) {
        continue;
      }

      const value = properties.get(id);
      if (id === Field.SENC_INITIALIZATION_VECTOR) {
        this.fields_.set(id, value);
      } else if (id % 2 === 0) {
        const previous =
        /** @type {number|undefined} */ (this.fields_.get(id)) || 0;
        this.fields_.set(id, previous + /** @type {number} */ (value));
      } else {
        const previous =
        /** @type {!Array<number>|undefined} */ (this.fields_.get(id)) ||
            [];
        // A list that grew carries the absolute value for each new entry,
        // which is the same arithmetic against a previous value of zero.
        this.fields_.set(id, /** @type {!Array<number>} */ (value).map(
            (delta, i) => (previous[i] || 0) + delta));
      }
    }

    // The decode time is the one field a delta chunk never carries. CMAF
    // requires a contiguous decode timeline, so it is exactly the previous
    // chunk's time plus the samples the previous chunk held; an encoder that
    // breaks the timeline has to emit a full header instead.
    this.fields_.set(Field.TFDT_BASE_MEDIA_DECODE_TIME,
        this.baseMediaDecodeTime_() + this.previousDurationSum_);
  }

  /**
   * @return {number}
   * @private
   */
  baseMediaDecodeTime_() {
    return /** @type {number} */ (
      this.fields_.get(shaka.msf.LOCMAFParser.Field
          .TFDT_BASE_MEDIA_DECODE_TIME));
  }

  /**
   * @param {!Array<!Uint8Array>} genBoxes
   * @param {!Uint8Array} payload
   * @return {!shaka.msf.LOCMAFParser.Chunk}
   * @private
   */
  buildChunk_(genBoxes, payload) {
    const effective = this.computeEffective_(payload.byteLength);

    let durationSum = 0;
    for (const duration of effective.durations) {
      durationSum += duration;
    }
    this.previousDurationSum_ = durationSum;

    // The mdat header is always the 8-byte form: the ISO 64-bit largesize
    // escape is not allowed, so a payload this large cannot be packaged at
    // all and would otherwise be written as a silently truncated size.
    if (payload.byteLength > 0xfffffff7) {
      throw new Error('LOCMAF payload overflows a 32-bit mdat');
    }

    const moof = this.buildMoof_(effective);

    let total = moof.byteLength + 8 + payload.byteLength;
    for (const genBox of genBoxes) {
      total += genBox.byteLength;
    }

    const data = new Uint8Array(total);
    let offset = 0;
    for (const genBox of genBoxes) {
      data.set(genBox, offset);
      offset += genBox.byteLength;
    }
    data.set(moof, offset);
    offset += moof.byteLength;
    this.writeUint32_(data, offset, 8 + payload.byteLength);
    data.set(shaka.msf.LOCMAFParser.MDAT_, offset + 4);
    data.set(payload, offset + 8);

    return {
      startTime: effective.baseMediaDecodeTime / this.params_.timescale,
      duration: durationSum / this.params_.timescale,
      data,
    };
  }

  /**
   * Expands the reference state into the chunk's effective values: what each
   * sample's duration, size, flags and composition offset actually are, once
   * the `tfhd` and `trex` defaults have been resolved. Everything downstream
   * reads these arrays and nothing reads the fields, which is what makes the
   * output independent of how the encoder chose to distribute the values.
   *
   * @param {number} payloadLength
   * @return {!shaka.msf.LOCMAFParser.Effective_}
   * @private
   */
  computeEffective_(payloadLength) {
    const Field = shaka.msf.LOCMAFParser.Field;
    const params = this.params_;
    const fields = this.fields_;

    const sampleCount =
    /** @type {number|undefined} */ (fields.get(Field.TRUN_SAMPLE_COUNT));
    if (sampleCount === undefined) {
      throw new Error('LOCMAF chunk has no sample count');
    }

    const listLength = (id) => {
      const list = /** @type {!Array<number>|undefined} */ (fields.get(id));
      return list ? list.length : -1;
    };
    for (const id of [Field.TRUN_SAMPLE_DURATIONS,
      Field.TRUN_SAMPLE_COMPOSITION_TIME_OFFSETS, Field.TRUN_SAMPLE_FLAGS,
      Field.SENC_SUBSAMPLE_COUNT]) {
      const length = listLength(id);
      if (length !== -1 && length !== sampleCount) {
        throw new Error(`LOCMAF field ${id} has ${length} of ${sampleCount}` +
            ' entries');
      }
    }

    const sizes = this.deriveSizes_(sampleCount, payloadLength);

    const durations = [];
    const flags = [];
    const compositionTimeOffsets = [];
    const perSampleDurations =
    /** @type {!Array<number>|undefined} */ (
        fields.get(Field.TRUN_SAMPLE_DURATIONS));
    const defaultDuration =
    /** @type {number|undefined} */ (
        fields.get(Field.TFHD_DEFAULT_SAMPLE_DURATION));
    const perSampleFlags =
    /** @type {!Array<number>|undefined} */ (
        fields.get(Field.TRUN_SAMPLE_FLAGS));
    const firstSampleFlags =
    /** @type {number|undefined} */ (
        fields.get(Field.TRUN_FIRST_SAMPLE_FLAGS));
    const defaultFlags =
    /** @type {number|undefined} */ (
        fields.get(Field.TFHD_DEFAULT_SAMPLE_FLAGS));
    const perSampleOffsets =
    /** @type {!Array<number>|undefined} */ (
        fields.get(Field.TRUN_SAMPLE_COMPOSITION_TIME_OFFSETS));

    for (let i = 0; i < sampleCount; i++) {
      durations.push(perSampleDurations ? perSampleDurations[i] :
          (defaultDuration !== undefined ? defaultDuration :
            params.trexSampleDuration));

      if (perSampleFlags) {
        flags.push(perSampleFlags[i]);
      } else if (i === 0 && firstSampleFlags !== undefined) {
        flags.push(firstSampleFlags);
      } else if (defaultFlags !== undefined) {
        flags.push(defaultFlags);
      } else {
        flags.push(params.trexSampleFlags);
      }

      compositionTimeOffsets.push(perSampleOffsets ? perSampleOffsets[i] : 0);
    }

    const sampleDescriptionIndex =
    /** @type {number|undefined} */ (
        fields.get(Field.TFHD_SAMPLE_DESCRIPTION_INDEX));

    return {
      sampleCount,
      baseMediaDecodeTime: this.baseMediaDecodeTime_(),
      sampleDescriptionIndex: sampleDescriptionIndex !== undefined ?
          sampleDescriptionIndex : params.trexSampleDescriptionIndex,
      durations,
      sizes,
      flags,
      compositionTimeOffsets,
      cenc: this.computeCenc_(sampleCount),
    };
  }

  /**
   * Derives every sample's size. The last one is never on the wire: it is
   * whatever is left of the payload, which saves a vi64 on every chunk and
   * makes the payload length authoritative.
   *
   * @param {number} sampleCount
   * @param {number} payloadLength
   * @return {!Array<number>}
   * @private
   */
  deriveSizes_(sampleCount, payloadLength) {
    const Field = shaka.msf.LOCMAFParser.Field;

    if (sampleCount === 0) {
      if (payloadLength) {
        throw new Error('LOCMAF chunk has no samples but a non-empty payload');
      }
      return [];
    }

    const listed = /** @type {!Array<number>|undefined} */ (
      this.fields_.get(Field.TRUN_SAMPLE_SIZES));
    if (listed) {
      if (listed.length !== sampleCount - 1) {
        throw new Error(`LOCMAF sample sizes hold ${listed.length} of ` +
            `${sampleCount - 1} entries`);
      }
      let sum = 0;
      for (const size of listed) {
        sum += size;
      }
      if (sum > payloadLength) {
        throw new Error('LOCMAF sample sizes exceed the payload');
      }
      return listed.concat([payloadLength - sum]);
    }

    const uniform = () => {
      const explicit = /** @type {number|undefined} */ (
        this.fields_.get(Field.TFHD_DEFAULT_SAMPLE_SIZE));
      if (explicit !== undefined) {
        return explicit;
      }
      if (sampleCount === 1) {
        return payloadLength;
      }
      if (this.params_.trexSampleSize) {
        return this.params_.trexSampleSize;
      }
      if (payloadLength === 0) {
        return 0;
      }
      throw new Error('LOCMAF chunk has no derivable sample sizes');
    };

    const size = uniform();
    if (sampleCount * size !== payloadLength) {
      throw new Error(`LOCMAF sample size ${size} does not fill the payload`);
    }
    return new Array(sampleCount).fill(size);
  }

  /**
   * Gathers the per-sample encryption metadata, or returns null when the
   * chunk carries none.
   *
   * @param {number} sampleCount
   * @return {?shaka.msf.LOCMAFParser.Cenc_}
   * @private
   */
  computeCenc_(sampleCount) {
    const Field = shaka.msf.LOCMAFParser.Field;
    const fields = this.fields_;

    const carriesCenc = shaka.msf.LOCMAFParser.CENC_FIELDS_.some(
        (id) => fields.has(id));
    if (!this.params_.isProtected) {
      if (carriesCenc) {
        // The reconstruction below is defined only for protected tracks, so
        // there is no agreed answer to what such a chunk expands to.
        throw new Error('LOCMAF chunk carries CENC fields on a clear track');
      }
      return null;
    }

    const explicitIvSize = /** @type {number|undefined} */ (
      fields.get(Field.SENC_PER_SAMPLE_IV_SIZE));
    const perSampleIvSize = explicitIvSize !== undefined ? explicitIvSize :
        this.params_.defaultPerSampleIvSize;
    const subsampleCounts = /** @type {!Array<number>|undefined} */ (
      fields.get(Field.SENC_SUBSAMPLE_COUNT)) || null;

    // Under cbcs full-sample encryption the IV is constant and lives in the
    // initialization segment, so a protected chunk can legitimately have no
    // per-sample auxiliary information at all -- and then none of the three
    // boxes is emitted.
    if (!sampleCount || (!perSampleIvSize && !subsampleCounts)) {
      return null;
    }

    const ivs = /** @type {!Uint8Array} */ (
      fields.get(Field.SENC_INITIALIZATION_VECTOR) ||
        new Uint8Array(0));
    if (ivs.byteLength !== sampleCount * perSampleIvSize) {
      throw new Error(`LOCMAF holds ${ivs.byteLength} IV bytes for ` +
          `${sampleCount} samples of ${perSampleIvSize}`);
    }

    let subsampleTotal = 0;
    for (const count of subsampleCounts || []) {
      subsampleTotal += count;
    }
    const clearBytes = /** @type {!Array<number>|undefined} */ (
      fields.get(Field.SENC_BYTES_OF_CLEAR_DATA)) || [];
    const protectedBytes = /** @type {!Array<number>|undefined} */ (
      fields.get(Field.SENC_BYTES_OF_PROTECTED_DATA)) || [];
    if (subsampleCounts && (clearBytes.length !== subsampleTotal ||
        protectedBytes.length !== subsampleTotal)) {
      throw new Error('LOCMAF subsample map does not match its counts');
    }

    return {perSampleIvSize, ivs, subsampleCounts, clearBytes, protectedBytes};
  }

  /**
   * Builds the `moof`. The two offsets it has to carry -- `trun.data_offset`
   * and `saio.offset` -- both depend on the finished size of the box that
   * holds them, so the boxes are built with the offsets left at zero and
   * patched once every size is known.
   *
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @return {!Uint8Array}
   * @private
   */
  buildMoof_(effective) {
    const Mp4Generator = shaka.util.Mp4Generator;
    const layout = shaka.msf.LOCMAFParser.chooseLayout_(
        effective, this.params_);

    const tfhd = this.buildTfhd_(layout);
    const tfdt = this.buildTfdt_(effective);
    const trun = this.buildTrun_(effective, layout);
    const cencBoxes = this.buildCencBoxes_(effective);
    const boxes = [tfhd, tfdt, trun].concat(cencBoxes);

    // The moof is its own header, the mfhd box, the traf header, and the
    // boxes above, so its size is known before anything is assembled.
    let moofSize = 8 + 16 + 8;
    for (const box of boxes) {
      moofSize += box.byteLength;
    }

    // With default-base-is-moof set, both of the offsets below are measured
    // from the first byte of the moof.
    this.writeUint32_(trun, 16, moofSize + 8);
    if (cencBoxes.length) {
      const saio = cencBoxes[1];
      const senc = cencBoxes[2];
      // senc is the last box of the traf, so it ends where the moof does.
      // Sixteen bytes past its start are its box header, its version and
      // flags, and its sample count, leaving the first sample's auxiliary
      // information.
      this.writeUint32_(saio, 16, moofSize - senc.byteLength + 16);
    }

    return Mp4Generator.box('moof',
        Mp4Generator.box('mfhd', new Uint8Array(8)),
        Mp4Generator.box('traf', ...boxes));
  }


  /**
   * Recomputes the three CENC boxes, in the order the canonical form fixes
   * them in, or returns nothing when the chunk carries no per-sample
   * encryption metadata. Only senc travels; saiz and saio follow from it.
   *
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @return {!Array<!Uint8Array>}
   * @private
   */
  buildCencBoxes_(effective) {
    if (!effective.cenc) {
      return [];
    }
    return [
      this.buildSaiz_(effective),
      this.buildSaio_(),
      this.buildSenc_(effective),
    ];
  }


  /**
   * @param {!shaka.msf.LOCMAFParser.Layout_} layout
   * @return {!Uint8Array}
   * @private
   */
  buildTfhd_(layout) {
    const Flags = shaka.msf.LOCMAFParser.TfhdFlags_;

    /** @type {!Array<number>} */
    const values = [];
    // Sample data offsets are relative to the moof, so no base data offset
    // is present.
    let flags = Flags.DEFAULT_BASE_IS_MOOF;
    if (layout.sampleDescriptionIndex !== null) {
      flags |= Flags.SAMPLE_DESCRIPTION_INDEX_PRESENT;
      values.push(layout.sampleDescriptionIndex);
    }
    if (layout.defaultSampleDuration !== null) {
      flags |= Flags.DEFAULT_SAMPLE_DURATION_PRESENT;
      values.push(layout.defaultSampleDuration);
    }
    if (layout.defaultSampleSize !== null) {
      flags |= Flags.DEFAULT_SAMPLE_SIZE_PRESENT;
      values.push(layout.defaultSampleSize);
    }
    if (layout.defaultSampleFlags !== null) {
      flags |= Flags.DEFAULT_SAMPLE_FLAGS_PRESENT;
      values.push(layout.defaultSampleFlags);
    }

    const payload = new Uint8Array(8 + 4 * values.length);
    this.writeUint32_(payload, 0, flags);
    this.writeUint32_(payload, 4, this.params_.trackId);
    for (let i = 0; i < values.length; i++) {
      this.writeUint32_(payload, 8 + 4 * i, values[i]);
    }
    return shaka.util.Mp4Generator.box('tfhd', payload);
  }

  /**
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @return {!Uint8Array}
   * @private
   */
  buildTfdt_(effective) {
    // Version 1 unconditionally: a live decode timeline passes 32 bits within
    // hours at a 90 kHz timescale, and the four extra bytes never travel.
    const payload = new Uint8Array(12);
    payload[0] = 1;
    this.writeUint64_(
        payload, 4, effective.baseMediaDecodeTime);
    return shaka.util.Mp4Generator.box('tfdt', payload);
  }

  /**
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @param {!shaka.msf.LOCMAFParser.Layout_} layout
   * @return {!Uint8Array}
   * @private
   */
  buildTrun_(effective, layout) {
    const Flags = shaka.msf.LOCMAFParser.TrunFlags_;
    const n = effective.sampleCount;

    let flags = Flags.DATA_OFFSET_PRESENT;
    if (layout.firstSampleFlags !== null) {
      flags |= Flags.FIRST_SAMPLE_FLAGS_PRESENT;
    }
    if (layout.perSampleDurations) {
      flags |= Flags.SAMPLE_DURATION_PRESENT;
    }
    if (layout.perSampleSizes) {
      flags |= Flags.SAMPLE_SIZE_PRESENT;
    }
    if (layout.perSampleFlags) {
      flags |= Flags.SAMPLE_FLAGS_PRESENT;
    }
    if (layout.perSampleOffsets) {
      flags |= Flags.SAMPLE_COMPOSITION_TIME_OFFSETS_PRESENT;
    }

    const perSample = (layout.perSampleDurations ? 1 : 0) +
        (layout.perSampleSizes ? 1 : 0) + (layout.perSampleFlags ? 1 : 0) +
        (layout.perSampleOffsets ? 1 : 0);
    const head = 12 + (layout.firstSampleFlags !== null ? 4 : 0);
    const payload = new Uint8Array(head + 4 * perSample * n);

    // Version 1 makes the composition offset signed, which is what B-frames
    // need; version 0 is reached only when no offset is negative.
    const version = layout.signedOffsets ? 1 : 0;
    this.writeUint32_(payload, 0, (version << 24) | flags);
    this.writeUint32_(payload, 4, n);
    // The data offset is patched in once the moof size is known.
    if (layout.firstSampleFlags !== null) {
      this.writeUint32_(payload, 12, layout.firstSampleFlags);
    }

    let offset = head;
    for (let i = 0; i < n; i++) {
      if (layout.perSampleDurations) {
        this.writeUint32_(payload, offset, effective.durations[i]);
        offset += 4;
      }
      if (layout.perSampleSizes) {
        this.writeUint32_(payload, offset, effective.sizes[i]);
        offset += 4;
      }
      if (layout.perSampleFlags) {
        this.writeUint32_(payload, offset, effective.flags[i]);
        offset += 4;
      }
      if (layout.perSampleOffsets) {
        this.writeUint32_(payload, offset, effective.compositionTimeOffsets[i]);
        offset += 4;
      }
    }

    return shaka.util.Mp4Generator.box('trun', payload);
  }

  /**
   * Recomputes `saiz`, which LOCMAF never carries: every sample's auxiliary
   * information size follows from the IV size and the subsample count.
   *
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @return {!Uint8Array}
   * @private
   */
  buildSaiz_(effective) {
    const cenc = /** @type {!shaka.msf.LOCMAFParser.Cenc_} */ (effective.cenc);
    const n = effective.sampleCount;
    const sizes = [];
    for (let i = 0; i < n; i++) {
      // When the subsample flag is set every sample carries its two-byte
      // count, even a sample that has no subsamples.
      const size = cenc.perSampleIvSize + (cenc.subsampleCounts ?
          2 + 6 * cenc.subsampleCounts[i] : 0);
      if (size > 0xff) {
        throw new Error(`LOCMAF auxiliary info size ${size} exceeds a byte`);
      }
      sizes.push(size);
    }

    const uniform = sizes.every((size) => size === sizes[0]);
    const payload = new Uint8Array(9 + (uniform ? 0 : n));
    payload[4] = uniform && n ? sizes[0] : 0;
    this.writeUint32_(payload, 5, n);
    if (!uniform) {
      payload.set(sizes, 9);
    }
    return shaka.util.Mp4Generator.box('saiz', payload);
  }

  /**
   * @return {!Uint8Array}
   * @private
   */
  buildSaio_() {
    const payload = new Uint8Array(12);
    this.writeUint32_(payload, 4, 1);
    // The offset is patched in once the size of everything before senc is
    // known.
    return shaka.util.Mp4Generator.box('saio', payload);
  }

  /**
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @return {!Uint8Array}
   * @private
   */
  buildSenc_(effective) {
    const cenc = /** @type {!shaka.msf.LOCMAFParser.Cenc_} */ (effective.cenc);
    const n = effective.sampleCount;
    const useSubsamples = !!cenc.subsampleCounts;
    let size = 8;
    for (let i = 0; i < n; i++) {
      size += cenc.perSampleIvSize +
          (useSubsamples ? 2 + 6 * cenc.subsampleCounts[i] : 0);
    }

    const payload = new Uint8Array(size);
    if (useSubsamples) {
      // senc_use_subsamples
      payload[3] = 0x02;
    }
    this.writeUint32_(payload, 4, n);

    let offset = 8;
    let subsample = 0;
    for (let i = 0; i < n; i++) {
      payload.set(
          cenc.ivs.subarray(i * cenc.perSampleIvSize,
              (i + 1) * cenc.perSampleIvSize),
          offset);
      offset += cenc.perSampleIvSize;
      if (!useSubsamples) {
        continue;
      }
      const count = cenc.subsampleCounts[i];
      this.writeUint16_(payload, offset, count);
      offset += 2;
      for (let j = 0; j < count; j++) {
        this.writeUint16_(
            payload, offset, cenc.clearBytes[subsample]);
        this.writeUint32_(
            payload, offset + 2, cenc.protectedBytes[subsample]);
        offset += 6;
        subsample++;
      }
    }

    return shaka.util.Mp4Generator.box('senc', payload);
  }

  /**
   * Decides which values become `tfhd` defaults and which become per-sample
   * `trun` entries. This is where the canonical form is pinned down: the
   * decision is made from the effective values alone, so a chunk that carried
   * redundant defaults on the wire reconstructs to the same bytes as its
   * minimal counterpart.
   *
   * @param {!shaka.msf.LOCMAFParser.Effective_} effective
   * @param {!shaka.msf.LOCMAFParser.TrackParams} params
   * @return {!shaka.msf.LOCMAFParser.Layout_}
   * @private
   */
  static chooseLayout_(effective, params) {
    const n = effective.sampleCount;
    const {durations, sizes, flags, compositionTimeOffsets} = effective;
    const allEqual = (values) => values.every((value) => value === values[0]);

    const uniformDurations = n > 0 && allEqual(durations);
    const uniformSizes = n > 0 && allEqual(sizes);
    const uniformFlags = n > 0 && allEqual(flags);
    // A random-access chunk flags its first sample as a sync sample and
    // leaves the rest alone, which is worth a dedicated field rather than a
    // per-sample table.
    const firstFlagsDiffer = n > 1 && !uniformFlags &&
        allEqual(flags.slice(1));

    let defaultFlags = null;
    if (uniformFlags) {
      defaultFlags = flags[0];
    } else if (firstFlagsDiffer) {
      defaultFlags = flags[1];
    }

    const sdi = effective.sampleDescriptionIndex;

    return {
      sampleDescriptionIndex:
          sdi !== params.trexSampleDescriptionIndex ? sdi : null,
      defaultSampleDuration:
          uniformDurations && durations[0] !== params.trexSampleDuration ?
          durations[0] : null,
      defaultSampleSize:
          uniformSizes && sizes[0] !== params.trexSampleSize ? sizes[0] : null,
      defaultSampleFlags:
          defaultFlags !== null && defaultFlags !== params.trexSampleFlags ?
          defaultFlags : null,
      firstSampleFlags: firstFlagsDiffer ? flags[0] : null,
      perSampleDurations: n > 0 && !uniformDurations,
      perSampleSizes: n > 0 && !uniformSizes,
      perSampleFlags: n > 0 && !uniformFlags && !firstFlagsDiffer,
      perSampleOffsets:
          compositionTimeOffsets.some((offset) => offset !== 0),
      signedOffsets: compositionTimeOffsets.some((offset) => offset < 0),
    };
  }

  /**
   * Reads one vi64, reporting both its value as a number and the raw unsigned
   * value the zigzag decoding needs.
   *
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @return {!{value: number, raw: bigint, bytesRead: number}}
   * @private
   */
  readVarInt_(bytes, offset) {
    if (offset >= bytes.byteLength) {
      throw new Error('LOCMAF object ended inside a variable-length integer');
    }
    const decoded = this.codec_.decodeVarIntAt(bytes, offset);
    return {
      value: Number(decoded.value),
      raw: decoded.value,
      bytesRead: decoded.bytesRead,
    };
  }

  /**
   * Undoes the zigzag mapping, which interleaves the signs so that a small
   * negative delta encodes as compactly as a small positive one.
   *
   * @param {bigint} value
   * @return {number}
   * @private
   */
  static zigzagToSigned_(value) {
    const one = BigInt(1);
    return Number((value >> one) ^ -(value & one));
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @param {number} value
   * @private
   */
  writeUint16_(bytes, offset, value) {
    bytes[offset] = (value >>> 8) & 0xff;
    bytes[offset + 1] = value & 0xff;
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @param {number} value
   * @private
   */
  writeUint32_(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @param {number} value
   * @private
   */
  writeUint64_(bytes, offset, value) {
    const high = Math.floor(value / 0x100000000);
    this.writeUint32_(bytes, offset, high);
    this.writeUint32_(bytes, offset + 4, value - high * 0x100000000);
  }
};


/**
 * Everything the track's CMAF Header contributes to reconstruction. The
 * `trex` defaults and the `tenc` per-sample IV size are what every omitted
 * field falls back to, so they are read once per track rather than per chunk.
 *
 * @typedef {{
 *   trackId: number,
 *   timescale: number,
 *   trexSampleDescriptionIndex: number,
 *   trexSampleDuration: number,
 *   trexSampleSize: number,
 *   trexSampleFlags: number,
 *   isProtected: boolean,
 *   defaultPerSampleIvSize: number,
 * }}
 */
shaka.msf.LOCMAFParser.TrackParams;


/**
 * One reconstructed CMAF chunk.
 *
 * @typedef {{
 *   startTime: number,
 *   duration: number,
 *   data: !Uint8Array,
 * }}
 */
shaka.msf.LOCMAFParser.Chunk;


/**
 * The per-sample encryption metadata of one chunk.
 *
 * @typedef {{
 *   perSampleIvSize: number,
 *   ivs: !Uint8Array,
 *   subsampleCounts: ?Array<number>,
 *   clearBytes: !Array<number>,
 *   protectedBytes: !Array<number>,
 * }}
 * @private
 */
shaka.msf.LOCMAFParser.Cenc_;


/**
 * What one chunk works out to, per sample, once every default is resolved.
 *
 * @typedef {{
 *   sampleCount: number,
 *   baseMediaDecodeTime: number,
 *   sampleDescriptionIndex: number,
 *   durations: !Array<number>,
 *   sizes: !Array<number>,
 *   flags: !Array<number>,
 *   compositionTimeOffsets: !Array<number>,
 *   cenc: ?shaka.msf.LOCMAFParser.Cenc_,
 * }}
 * @private
 */
shaka.msf.LOCMAFParser.Effective_;


/**
 * Which values go in the `tfhd` and which are written per sample.
 *
 * @typedef {{
 *   sampleDescriptionIndex: ?number,
 *   defaultSampleDuration: ?number,
 *   defaultSampleSize: ?number,
 *   defaultSampleFlags: ?number,
 *   firstSampleFlags: ?number,
 *   perSampleDurations: boolean,
 *   perSampleSizes: boolean,
 *   perSampleFlags: boolean,
 *   perSampleOffsets: boolean,
 *   signedOffsets: boolean,
 * }}
 * @private
 */
shaka.msf.LOCMAFParser.Layout_;


/**
 * The LOCMAF element types, which tag each element of an object payload.
 *
 * @enum {number}
 * @private
 */
shaka.msf.LOCMAFParser.ElementType_ = {
  GEN_BOX: 1,
  FULL_HEADER: 2,
  DELTA_HEADER: 3,
  RAW_BOXES: 4,
};


/**
 * The LOCMAF header field IDs. Every scalar has an even ID and every list or
 * byte field an odd one, which is what makes the parity rule a framing rule.
 *
 * @enum {number}
 */
shaka.msf.LOCMAFParser.Field = {
  TRUN_SAMPLE_SIZES: 1,
  TFHD_SAMPLE_DESCRIPTION_INDEX: 2,
  TRUN_SAMPLE_DURATIONS: 3,
  TFHD_DEFAULT_SAMPLE_DURATION: 4,
  TRUN_SAMPLE_COMPOSITION_TIME_OFFSETS: 5,
  TFHD_DEFAULT_SAMPLE_SIZE: 6,
  TRUN_SAMPLE_FLAGS: 7,
  TFHD_DEFAULT_SAMPLE_FLAGS: 8,
  SENC_INITIALIZATION_VECTOR: 9,
  TFDT_BASE_MEDIA_DECODE_TIME: 10,
  SENC_SUBSAMPLE_COUNT: 11,
  TRUN_FIRST_SAMPLE_FLAGS: 12,
  SENC_BYTES_OF_CLEAR_DATA: 13,
  TRUN_SAMPLE_COUNT: 14,
  SENC_BYTES_OF_PROTECTED_DATA: 15,
  SENC_PER_SAMPLE_IV_SIZE: 16,
  DELTA_DELETED_LOCMAF_IDS: 27,
};


/**
 * The fields this parser stores as reference state. An unknown field is
 * skipped by the parity rule and otherwise ignored, so that new ones can be
 * added without breaking older receivers.
 *
 * @const {!Set<number>}
 * @private
 */
shaka.msf.LOCMAFParser.KNOWN_FIELDS_ = new Set(
    /** @type {!Array<number>} */ (
      Object.values(shaka.msf.LOCMAFParser.Field)));


/**
 * The fields that only a protected track may carry.
 *
 * @const {!Array<number>}
 * @private
 */
shaka.msf.LOCMAFParser.CENC_FIELDS_ = [
  shaka.msf.LOCMAFParser.Field.SENC_INITIALIZATION_VECTOR,
  shaka.msf.LOCMAFParser.Field.SENC_SUBSAMPLE_COUNT,
  shaka.msf.LOCMAFParser.Field.SENC_BYTES_OF_CLEAR_DATA,
  shaka.msf.LOCMAFParser.Field.SENC_BYTES_OF_PROTECTED_DATA,
  shaka.msf.LOCMAFParser.Field.SENC_PER_SAMPLE_IV_SIZE,
];


/**
 * @const {!Uint8Array}
 * @private
 */
shaka.msf.LOCMAFParser.MDAT_ = new Uint8Array([0x6d, 0x64, 0x61, 0x74]);


/**
 * @enum {number}
 * @private
 */
shaka.msf.LOCMAFParser.TfhdFlags_ = {
  SAMPLE_DESCRIPTION_INDEX_PRESENT: 0x000002,
  DEFAULT_SAMPLE_DURATION_PRESENT: 0x000008,
  DEFAULT_SAMPLE_SIZE_PRESENT: 0x000010,
  DEFAULT_SAMPLE_FLAGS_PRESENT: 0x000020,
  DEFAULT_BASE_IS_MOOF: 0x020000,
};


/**
 * @enum {number}
 * @private
 */
shaka.msf.LOCMAFParser.TrunFlags_ = {
  DATA_OFFSET_PRESENT: 0x000001,
  FIRST_SAMPLE_FLAGS_PRESENT: 0x000004,
  SAMPLE_DURATION_PRESENT: 0x000100,
  SAMPLE_SIZE_PRESENT: 0x000200,
  SAMPLE_FLAGS_PRESENT: 0x000400,
  SAMPLE_COMPOSITION_TIME_OFFSETS_PRESENT: 0x000800,
};
