/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @summary
 * Defines an interface to generate streams.
 *
 * @interface
 */
shaka.test.IStreamGenerator = class {
  /**
   * Initializes the IStreamGenerator.
   *
   * @return {!Promise} A Promise that resolves after the IStreamGenerator has
   *   initialized itself.
   */
  init() {}

  /**
   * Gets the stream's initialization segment.
   * The IStreamGenerator must be initialized.
   *
   * @param {number} wallClockTime The wall-clock time in seconds.
   *
   * @return {ArrayBuffer} The initialization segment if the stream has started;
   *   otherwise, return null.
   */
  getInitSegment(wallClockTime) {}

  /**
   * Gets one of the stream's segments.
   * The IStreamGenerator must be initialized.
   *
   * @param {number} position The segment's position.
   * @param {number} wallClockTime The wall-clock time in seconds.
   *
   * @return {ArrayBuffer} The segment if the stream has started, and the
   *   segment exists and is available; otherwise, return null.
   */
  getSegment(position, wallClockTime) {}
};

/**
 * @summary
 * Simulates an HLS, video-on-demand, ts stream.  The StreamGenerator assumes
 * the stream contains a single segment.
 *
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.TSVodStreamGenerator = class {
  /**
   * @param {string} segmentUri The URI of the segment.
   * @param {number} segmentDuration The duration of a single segment, in
   *   seconds.
   */
  constructor(segmentUri, segmentDuration) {
    /** @private {string} */
    this.segmentUri_ = segmentUri;

    /**
     * Internally, everything is in timescale units.
     * @private {number}
     */
    this.segmentDuration_ = segmentDuration * 90000;

    /** @private {!Array.<{offset: number, dts: ?number, pts: ?number}>} */
    this.timestamps_ = [];

    /** @private {number} */
    this.timestampOffset_ = Infinity;

    /** @private {ArrayBuffer} */
    this.segmentTemplate_ = null;
  }

  /** @override */
  async init() {
    const segment = await shaka.test.Util.fetch(this.segmentUri_);
    this.segmentTemplate_ = segment;
    this.parseSegment_();
  }

  /** @override */
  getInitSegment(time) {
    goog.asserts.assert(false, 'getInitSegment not implemented for HLS VOD.');
    return new ArrayBuffer(0);
  }

  /** @override */
  getSegment(position, wallClockTime) {
    goog.asserts.assert(
        this.segmentTemplate_,
        'init() must be called before getSegment().');

    // This will create a copy of the given buffer.
    const buffer = shaka.util.Uint8ArrayUtils.concat(this.segmentTemplate_);

    for (const timestampMetadata of this.timestamps_) {
      this.setTimestamp_(buffer, timestampMetadata, position);
    }

    return shaka.util.BufferUtils.toArrayBuffer(buffer);
  }

  /** @private */
  parseSegment_() {
    goog.asserts.assert(
        this.segmentTemplate_,
        'init() must be called before parseSegment_().');

    // A TS segment can contain a timestamp in each 188-byte PES packet.
    // Find all the timestamps and their offsets, and cache them.
    const dataView = shaka.util.BufferUtils.toDataView(this.segmentTemplate_);
    const reader = new shaka.util.DataViewReader(
        dataView, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    // Read each TS packet (188 bytes).
    for (let i = 0; i < reader.getLength(); i += 188) {
      reader.seek(i);
      const syncByte = reader.readUint8();
      goog.asserts.assert(syncByte == 0x47, 'Sync byte not found!');

      const flagsAndPacketId = reader.readUint16();
      const packetId = flagsAndPacketId & 0x1fff;
      if (packetId == 0x1fff) {
        // A "null" TS packet.  Skip it.
        continue;
      }

      const hasPesPacket = flagsAndPacketId & 0x4000;
      if (!hasPesPacket) {
        // Not a PES packet.  Skip it.
        continue;
      }

      const flags = reader.readUint8();
      const adaptationFieldControl = (flags & 0x30) >> 4;
      if (adaptationFieldControl == 0 /* reserved */ ||
          adaptationFieldControl == 2 /* adaptation field, no payload */) {
        throw new Error(
            `Unexpected adaptation field control: ${adaptationFieldControl}`);
      }

      if (adaptationFieldControl == 3) {
        // Skip over adaptation field.
        const length = reader.readUint8();
        reader.skip(length);
      }

      // Now we come to the PES header (hopefully).
      // Format reference: https://bit.ly/TsPES
      const startCode = reader.readUint32();
      const startCodePrefix = startCode >> 8;
      if (startCodePrefix != 1) {
        // Not a PES packet.  Skip it.
        continue;
      }

      // Skip the 16-bit PES length and the first 8 bits of the optional header.
      reader.skip(3);
      // The next 8 bits contain flags about DTS & PTS.
      const ptsDtsIndicator = reader.readUint8() >> 6;
      if (ptsDtsIndicator == 0 /* no timestamp */ ||
          ptsDtsIndicator == 1 /* forbidden */) {
        throw new Error(`Unexpected PTS/DTS flag: ${ptsDtsIndicator}`);
      }

      const pesHeaderLengthRemaining = reader.readUint8();
      if (pesHeaderLengthRemaining == 0) {
        throw new Error(`Malformed TS, no room for PTS/DTS!`);
      }

      const offset = reader.getPosition();
      let pts = null;
      let dts = null;

      // Parse timestamps and keep track of the minimum timestamp seen, to use
      // as a timestamp offset when we calculate new timestamps for a segment.
      if (ptsDtsIndicator == 2 /* PTS only */) {
        goog.asserts.assert(pesHeaderLengthRemaining == 5, 'Bad PES header?');
        pts = this.parseTimestamp_(reader);
        this.timestampOffset_ = Math.min(this.timestampOffset_, pts);
      } else if (ptsDtsIndicator == 3 /* PTS and DTS */) {
        goog.asserts.assert(pesHeaderLengthRemaining == 10, 'Bad PES header?');
        pts = this.parseTimestamp_(reader);
        dts = this.parseTimestamp_(reader);
        this.timestampOffset_ = Math.min(this.timestampOffset_, pts, dts);
      }

      this.timestamps_.push({
        offset,
        pts,
        dts,
      });
    }
  }

  /**
   * @param {!shaka.util.DataViewReader} reader
   * @return {number}
   * @private
   */
  parseTimestamp_(reader) {
    const pts0 = reader.readUint8();
    const pts1 = reader.readUint16();
    const pts2 = reader.readUint16();
    // Reconstruct 33-bit PTS from the 5-byte, padded structure.
    const ptsHigh3 = (pts0 & 0x0e) >> 1;
    const ptsLow30 = ((pts1 & 0xfffe) << 14) | ((pts2 & 0xfffe) >> 1);
    // Reconstruct the PTS as a float.  Avoid bitwise operations to combine
    // because bitwise ops treat the values as 32-bit ints.
    return ptsHigh3 * (1 << 30) + ptsLow30;
  }

  /**
   * @param {!Uint8Array} buffer
   * @param {{offset: number, pts: ?number, dts: ?number}} timestampMetadata
   * @param {number} position
   * @private
   */
  setTimestamp_(buffer, timestampMetadata, position) {
    // Wikipedia: "If only PTS is present, this is done by catenating 0010 ...
    // If both PTS and DTS are present, first 4 bits are 0011 and first 4 bits
    // for DTS are 0001."
    const ptsHeader = timestampMetadata.dts == null ? 0b0010 : 0b0011;
    const dtsHeader = 0b0001;

    const segmentTime = this.segmentDuration_ * position;

    if (timestampMetadata.pts != null) {
      const pts = timestampMetadata.pts - this.timestampOffset_ + segmentTime;
      this.writeTimestamp_(
          buffer, timestampMetadata.offset, ptsHeader, this.overflow_(pts));
    }
    if (timestampMetadata.dts != null) {
      const dts = timestampMetadata.dts - this.timestampOffset_ + segmentTime;
      this.writeTimestamp_(
          buffer, timestampMetadata.offset + 5, dtsHeader, this.overflow_(dts));
    }
  }

  /**
   * Write a timestamp (PTS or DTS) to a specific place in the buffer, with a
   * specific header, in the PES timestamp layout.
   *
   * @param {!Uint8Array} buffer
   * @param {number} offset Where to begin writing
   * @param {number} header 4-bit header for the timestamp
   * @param {number} timestamp the actual timestamp
   * @private
   */
  writeTimestamp_(buffer, offset, header, timestamp) {
    // The 33 bit timestamp is split into parts, then packed into 40 bits
    // (5 bytes).  Wikipedia phrases the layout as: "0010b, most significant 3
    // bits from PTS, 1, following next 15 bits, 1, rest 15 bits and 1."
    // https://en.wikipedia.org/wiki/Packetized_elementary_stream
    const top3Bits = timestamp >> 30;
    const next15Bits = (timestamp >> 15) & 0x7fff;
    const last15Bits = timestamp & 0x7fff;

    buffer[offset + 0] = (header << 4) | (top3Bits << 1) | 1;
    buffer[offset + 1] = next15Bits >> 7;
    buffer[offset + 2] = ((next15Bits & 0x7f) << 1) | 1;
    buffer[offset + 3] = last15Bits >> 7;
    buffer[offset + 4] = ((last15Bits & 0x7f) << 1) | 1;
  }

  /**
   * Handle PES timestamp overflow (33 bits).
   *
   * @param {number} timestamp
   * @return {number}  The same timestamp, with TS overflow applied.
   * @private
   */
  overflow_(timestamp) {
    // NOTE: You can't get 2^33 with a bit-shift, because JavaScript will treat
    // the number as a 32-bit int.  Use Math.pow() instead.  The result is
    // still accurate as an integer.
    const limit = Math.pow(2, 33);
    while (timestamp >= limit) {
      timestamp -= limit;
    }
    return timestamp;
  }
};

/**
 * @summary
 * Simulates an HLS, video-on-demand, aac stream.  The StreamGenerator assumes
 * the stream contains a single segment.
 *
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.AACVodStreamGenerator = class {
  /** @param {string} segmentUri The URI of the segment. */
  constructor(segmentUri) {
    /** @private {string} */
    this.segmentUri_ = segmentUri;

    /** @private {ArrayBuffer} */
    this.segment_ = null;
  }

  /** @override */
  async init() {
    const segment = await shaka.test.Util.fetch(this.segmentUri_);
    this.segment_ = segment;
  }

  /** @override */
  getInitSegment(time) {
    goog.asserts.assert(false, 'getInitSegment not implemented for HLS VOD.');
    return new ArrayBuffer(0);
  }

  /** @override */
  getSegment(position, wallClockTime) {
    goog.asserts.assert(
        this.segment_,
        'init() must be called before getSegment().');
    return this.segment_;
  }
};

/**
 * @summary
 * Simulates a DASH, video-on-demand, MP4 stream.  The StreamGenerator loops a
 * single segment.
 *
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.Mp4VodStreamGenerator = class {
  /**
   * @param {string} initSegmentUri The URI of the initialization segment.
   * @param {number} mdhdOffset The offset of the initialization segment's
   *   mdhd box.
   * @param {string} segmentTemplateUri The URI of the segment to loop.
   * @param {number} tfdtOffset The offset of the segment's tfdt box.
   * @param {number} segmentDuration The duration of a single segment in
   *   seconds.
   */
  constructor(
      initSegmentUri, mdhdOffset, segmentTemplateUri, tfdtOffset,
      segmentDuration) {
    goog.asserts.assert(mdhdOffset >= 0, 'mdhd offset invalid');
    goog.asserts.assert(tfdtOffset >= 0, 'tfdt offset invalid');
    goog.asserts.assert(segmentDuration > 0, 'segment duration invalid');

    /** @private {string} */
    this.initSegmentUri_ = initSegmentUri;

    /** @private {number} */
    this.mdhdOffset_ = mdhdOffset;

    /** @private {string} */
    this.segmentTemplateUri_ = segmentTemplateUri;

    /** @private {number} */
    this.tfdtOffset_ = tfdtOffset;

    /** @private {number} */
    this.segmentDuration_ = segmentDuration;

    /** @private {ArrayBuffer} */
    this.initSegment_ = null;

    /** @private {ArrayBuffer} */
    this.segmentTemplate_ = null;

    /** @private {number} */
    this.timescale_ = 1;
  }

  /** @override */
  async init() {
    const fetch = [
      shaka.test.Util.fetch(this.initSegmentUri_),
      shaka.test.Util.fetch(this.segmentTemplateUri_),
    ];

    const results = await Promise.all(fetch);
    goog.asserts.assert(results.length == 2,
        'did not load both segments');
    this.initSegment_ = results[0];
    this.segmentTemplate_ = results[1];
    this.timescale_ = shaka.test.StreamGenerator.getTimescale_(
        /** @type {!ArrayBuffer} */ (this.initSegment_), this.mdhdOffset_);
  }

  /** @override */
  getInitSegment(time) {
    goog.asserts.assert(
        this.initSegment_,
        'init() must be called before getInitSegment().');
    return this.initSegment_;
  }

  /** @override */
  getSegment(position, wallClockTime) {
    goog.asserts.assert(
        this.segmentTemplate_,
        'init() must be called before getSegment().');
    if (!this.segmentTemplate_) {
      return null;
    }

    // |position| must be an integer and >= 0.
    goog.asserts.assert((position % 1 === 0) && (position >= 0),
        'segment number must be an integer >= 0');

    const segmentStartTime = position * this.segmentDuration_;

    return shaka.test.StreamGenerator.setBaseMediaDecodeTime_(
        this.segmentTemplate_, this.tfdtOffset_, segmentStartTime,
        this.timescale_);
  }
};

/**
 * @summary
 * Simulates a DASH, live, MP4 stream.
 *
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.Mp4LiveStreamGenerator = class {
  /**
   * @param {string} initSegmentUri The URI of the initialization segment.
   * @param {number} mdhdOffset The offset of the initialization segment's
   *   mdhd box.
   * @param {string} segmentTemplateUri The URI of the segment to loop.
   * @param {number} tfdtOffset The offset of the segment's TFDT box.
   * @param {number} segmentDuration The duration of a single segment in
   *   seconds.
   * @param {number} broadcastStartTime The wall-clock time in seconds when the
   *   stream began or will begin to broadcast.
   * @param {number} availabilityStartTime The wall-clock time in seconds when
   *   the stream began or will begin to be available. |broadcastStartTime| and
   *   |availabilityStartTime| should typically be equal; however,
   *   |availabilityStartTime| may be less than |broadcastStartTime| to
   *   align the stream if the Period's first segment's first timestamp does not
   *   equal 0.
   * @param {number} timeShiftBufferDepth The duration of the stream's
   *   time-shift buffer in seconds.
   */
  constructor(
      initSegmentUri, mdhdOffset, segmentTemplateUri, tfdtOffset,
      segmentDuration, broadcastStartTime, availabilityStartTime,
      timeShiftBufferDepth) {
    goog.asserts.assert(mdhdOffset >= 0, 'mdhd offset invalid');
    goog.asserts.assert(tfdtOffset >= 0, 'tfdt offset invalid');
    goog.asserts.assert(segmentDuration > 0, 'segment duration invalid');
    goog.asserts.assert(
        broadcastStartTime >= 0, 'broadcast start time invalid');
    goog.asserts.assert(
        availabilityStartTime >= 0, 'availability start time invalid');
    goog.asserts.assert(
        timeShiftBufferDepth >= 0, 'time shift buffer depth invalid');
    goog.asserts.assert(
        broadcastStartTime >= availabilityStartTime,
        'broadcast start time before availability start time');

    /** @private {string} */
    this.initSegmentUri_ = initSegmentUri;

    /** @private {number} */
    this.mdhdOffset_ = mdhdOffset;

    /** @private {string} */
    this.segmentTemplateUri_ = segmentTemplateUri;

    /** @private {number} */
    this.tfdtOffset_ = tfdtOffset;

    /** @private {number} */
    this.segmentDuration_ = segmentDuration;

    /** @private {number} */
    this.broadcastStartTime_ = broadcastStartTime;

    /** @private {number} */
    this.availabilityStartTime_ = availabilityStartTime;

    /** @private {number} */
    this.timeShiftBufferDepth_ = timeShiftBufferDepth;

    /** @private {number} */
    this.timescale_ = 1;

    /** @private {ArrayBuffer} */
    this.initSegment_ = null;

    /** @private {ArrayBuffer} */
    this.segmentTemplate_ = null;
  }

  /** @override */
  async init() {
    const fetch = [
      shaka.test.Util.fetch(this.initSegmentUri_),
      shaka.test.Util.fetch(this.segmentTemplateUri_),
    ];

    const results = await Promise.all(fetch);
    goog.asserts.assert(results.length == 2,
        'did not load both segments');
    this.initSegment_ = results[0];
    this.segmentTemplate_ = results[1];
    this.timescale_ = shaka.test.StreamGenerator.getTimescale_(
        /** @type {!ArrayBuffer} */ (this.initSegment_), this.mdhdOffset_);
  }

  /** @override */
  getInitSegment(wallClockTime) {
    goog.asserts.assert(
        this.initSegment_,
        'init() must be called before getInitSegment().');
    return this.initSegment_;
  }

  /** @override */
  getSegment(position, wallClockTime) {
    goog.asserts.assert(
        this.initSegment_,
        'init() must be called before getSegment().');
    if (!this.initSegment_) {
      return null;
    }

    // |position| must be an integer and >= 0.
    goog.asserts.assert((position % 1 === 0) && (position >= 0),
        'segment number must be an integer >= 0');

    const segmentStartTime = position * this.segmentDuration_;

    // Compute the segment's availability start time and end time.
    // (See section 5.3.9.5.3 of the DASH spec.)
    const segmentAvailabilityStartTime = this.availabilityStartTime_ +
                                       segmentStartTime +
                                       this.segmentDuration_;
    const segmentAvailabiltyEndTime = segmentAvailabilityStartTime +
                                    this.segmentDuration_ +
                                    this.timeShiftBufferDepth_;

    // Note it is possible for this to be called slightly before it becomes
    // available due to rounding errors with PresentationTimeline.
    if (wallClockTime + 1 < segmentAvailabilityStartTime) {
      shaka.log.debug(
          'wallClockTime < segmentAvailabilityStartTime:',
          'wallClockTime=' + wallClockTime,
          'segmentAvailabilityStartTime=', segmentAvailabilityStartTime);
      return null;
    } else if (wallClockTime > segmentAvailabiltyEndTime) {
      shaka.log.debug(
          'wallClockTime > segmentAvailabiltyEndTime',
          'wallClockTime=' + wallClockTime,
          'segmentAvailabiltyEndTime=' + segmentAvailabiltyEndTime);
      return null;
    }

    // |availabilityStartTime| may be less than |broadcastStartTime| to align
    // the stream if the Period's first segment's first timestamp does not equal
    // 0.
    const artificialPresentationTimeOffset =
        this.broadcastStartTime_ - this.availabilityStartTime_;
    const mediaTimestamp = segmentStartTime + artificialPresentationTimeOffset;

    return shaka.test.StreamGenerator.setBaseMediaDecodeTime_(
        /** @type {!ArrayBuffer} */ (this.segmentTemplate_), this.tfdtOffset_,
        mediaTimestamp, this.timescale_);
  }
};

shaka.test.StreamGenerator = class {
  /**
   * Gets the given initialization segment's movie header box's (mdhd box)
   * timescale parameter.
   *
   * @param {!ArrayBuffer} initSegment
   * @param {number} mdhdOffset The byte offset of the initialization segment's
   *   mdhd box.
   * @return {number} The timescale parameter.
   * @private
   */
  static getTimescale_(initSegment, mdhdOffset) {
    const dataView = new DataView(initSegment);
    const reader = new shaka.util.DataViewReader(
        dataView, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    reader.skip(mdhdOffset);

    const size = reader.readUint32();
    const type = reader.readUint32();
    goog.asserts.assert(
        type == 0x6d646864,  // mdhd
        'initSegment does not contain an mdhd box at the specified offset.');

    const largesizePresent = size == 1;
    if (largesizePresent) {
      shaka.log.v2('\'largesize\' field is present.');
      reader.skip(8);  // Skip 'largesize' field.
    }

    const version = reader.readUint8();
    reader.skip(3);  // Skip 'flags' field.

    // Skip 'creation_time' and 'modification_time' fields.
    if (version == 0) {
      shaka.log.v2('mdhd box is version 0.');
      reader.skip(8);
    } else {
      shaka.log.v2('mdhd box is version 1.');
      reader.skip(16);
    }

    const timescale = reader.readUint32();
    return timescale;
  }

  /**
   * Sets the given segment's track fragment media decode time box's (tfdt box)
   * baseMediaDecodeTime parameter.
   *
   * @param {!ArrayBuffer} segment
   * @param {number} tfdtOffset The byte offset of the segment's tfdt box.
   * @param {number} baseMediaDecodeTime The baseMediaDecodeTime in seconds,
   *   this value is the first presentation timestamp of the first frame/sample
   *   in the segment.
   * @param {number} timescale
   * @return {!ArrayBuffer} The modified segment.
   * @private
   */
  static setBaseMediaDecodeTime_(
      segment, tfdtOffset, baseMediaDecodeTime, timescale) {
    goog.asserts.assert(baseMediaDecodeTime * timescale < Math.pow(2, 32),
        'Specied baseMediaDecodeTime is too big.');

    // This will create a copy of the given buffer.
    const buffer = shaka.util.Uint8ArrayUtils.concat(segment);

    const dataView = shaka.util.BufferUtils.toDataView(buffer);
    const reader = new shaka.util.DataViewReader(
        dataView, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    reader.skip(tfdtOffset);

    const size = reader.readUint32();
    const type = reader.readUint32();
    goog.asserts.assert(
        type == 0x74666474,  // tfdt
        'segment does not contain a tfdt box at the specified offset.');

    const largesizePresent = size == 1;
    if (largesizePresent) {
      shaka.log.v2('\'largesize\' field is present.');
      reader.skip(8);  // Skip 'largesize' field.
    }

    const version = reader.readUint8();
    reader.skip(3);  // Skip 'flags' field.

    const pos = reader.getPosition();
    if (version == 0) {
      shaka.log.v2('tfdt box is version 0.');
      dataView.setUint32(pos, baseMediaDecodeTime * timescale);
    } else {
      shaka.log.v2('tfdt box is version 1.');
      // tfdt box version 1 supports 64-bit 'baseMediaDecodeTime' fields;
      // however, we restrict the intput to 32 bits above.
      dataView.setUint32(pos, 0);
      dataView.setUint32(pos + 4, baseMediaDecodeTime * timescale);
    }

    return shaka.util.BufferUtils.toArrayBuffer(buffer);
  }
};
