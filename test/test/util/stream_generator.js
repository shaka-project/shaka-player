/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.IStreamGenerator');
goog.provide('shaka.test.Mp4LiveStreamGenerator');
goog.provide('shaka.test.Mp4VodStreamGenerator');
goog.provide('shaka.test.StreamGenerator');
goog.provide('shaka.test.TSVodStreamGenerator');


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
   * @param {number} position The segment's position within a particular Period
   *   p.
   * @param {number} segmentOffset The number of segments in all Periods that
   *   came before Period p.
   * @param {number} wallClockTime The wall-clock time in seconds.
   * @example getSegment(1, 0) gets the 1st segment in the stream,
   *   and getSegment(2, 5) gets the 2nd segment in a Period that starts
   *   at the 6th segment (relative to the very start of the stream).
   *
   * @return {ArrayBuffer} The segment if the stream has started, and the
   *   segment exists and is available; otherwise, return null.
   */
  getSegment(position, segmentOffset, wallClockTime) {}
};

/**
 * @summary
 * Simulates an HLS, video-on-demand, ts stream.  The StreamGenerator assumes
 * the stream contains a single segment.
 *
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.TSVodStreamGenerator = class {
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
  getSegment(position, segmentOffset, wallClockTime) {
    goog.asserts.assert(
        this.segment_,
        'init() must be called before getSegment().');
    // TODO: complete implementation; this should change the timestamps based on
    // the given segmentOffset and wallClockTime, so as to simulate a long
    // stream.
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
  getSegment(position, segmentOffset, wallClockTime) {
    goog.asserts.assert(
        this.segmentTemplate_,
        'init() must be called before getSegment().');
    if (!this.segmentTemplate_) {
      return null;
    }

    // |position| must be an integer and >= 1.
    goog.asserts.assert((position % 1 === 0) && (position >= 1),
        'segment number must be an integer >= 1');

    const segmentStartTime = (position - 1) * this.segmentDuration_;

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
  getSegment(position, segmentOffset, wallClockTime) {
    goog.asserts.assert(
        this.initSegment_,
        'init() must be called before getSegment().');
    if (!this.initSegment_) {
      return null;
    }

    // |position| must be an integer and >= 1.
    goog.asserts.assert((position % 1 === 0) && (position >= 1),
        'segment number must be an integer >= 1');

    const segmentStartTime = (position - 1) * this.segmentDuration_;

    // Compute the segment's availability start time and end time.
    // (See section 5.3.9.5.3 of the DASH spec.)
    const segmentAvailabilityStartTime = this.availabilityStartTime_ +
                                       segmentStartTime +
                                       (segmentOffset * this.segmentDuration_) +
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
    const mediaTimestamp = segmentStartTime +
                         artificialPresentationTimeOffset;

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
        type == 0x6d646864 /* mdhd */,
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
        type == 0x74666474 /* tfdt */,
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
