/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.test.IStreamGenerator');
goog.provide('shaka.test.Mp4LiveStreamGenerator');
goog.provide('shaka.test.Mp4VodStreamGenerator');
goog.provide('shaka.test.StreamGenerator');
goog.provide('shaka.test.TSVodStreamGenerator');


/**
 * Defines an interface to generate streams.
 *
 * @interface
 */
shaka.test.IStreamGenerator = function() {};


/**
 * Initializes the IStreamGenerator.
 *
 * @return {!Promise} A Promise that resolves after the IStreamGenerator has
 *   initialized itself.
 */
shaka.test.IStreamGenerator.prototype.init = function() {};


/**
 * Gets the stream's initialization segment.
 * The IStreamGenerator must be initialized.
 *
 * @param {number} wallClockTime The wall-clock time in seconds.
 *
 * @return {ArrayBuffer} The initialization segment if the stream has started;
 *   otherwise, return null.
 */
shaka.test.IStreamGenerator.prototype.getInitSegment = function(
    wallClockTime) {};


/**
 * Gets one of the stream's segments.
 * The IStreamGenerator must be initialized.
 *
 * @param {number} position The segment's position within a particular Period p.
 * @param {number} segmentOffset The number of segments in all Periods that
 *   came before Period p.
 * @param {number} wallClockTime The wall-clock time in seconds.
 * @example getSegment(1, 0) gets the 1st segment in the stream,
 *   and getSegment(2, 5) gets the 2nd segment in a Period that starts
 *   at the 6th segment (relative to the very start of the stream).
 *
 * @return {ArrayBuffer} The segment if the stream has started, and the segment
 *   exists and is available; otherwise, return null.
 */
shaka.test.IStreamGenerator.prototype.getSegment = function(
    position, segmentOffset, wallClockTime) {};


/**
 * Creates an TSVodStreamGenerator, which simulates an HLS, video-on-demand,
 * ts stream.
 *
 * The StreamGenerator assumes the stream contains a single segment.
 *
 * @param {string} segmentUri The URI of the segment.
 *
 * @constructor
 * @struct
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.TSVodStreamGenerator = function(segmentUri) {
  /** @private {string} */
  this.segmentUri_ = segmentUri;

  /** @private {ArrayBuffer} */
  this.segment_ = null;
};


/** @override */
shaka.test.TSVodStreamGenerator.prototype.init = function() {
  return shaka.test.Util.fetch(this.segmentUri_).then((segment) => {
    this.segment_ = segment;
  });
};

/** @override */
shaka.test.TSVodStreamGenerator.prototype.getInitSegment = function(time) {
  goog.asserts.assert(false, 'getInitSegment not implemented for HLS VOD.');
  return new ArrayBuffer(0);
};

/** @override */
shaka.test.TSVodStreamGenerator.prototype.getSegment = function(
    position, segmentOffset, wallClockTime) {
  goog.asserts.assert(
      this.segment_,
      'init() must be called before getSegment().');
  // TODO: complete implementation; this should change the timestamps based on
  // the given segmentOffset and wallClockTime, so as to simulate a long stream.
  return this.segment_;
};


/**
 * Creates a Mp4VodStreamGenerator, which simulates a DASH, video-on-demand,
 * MP4 stream.
 *
 * The StreamGenerator loops a single segment.
 *
 * @param {string} initSegmentUri The URI of the initialization segment.
 * @param {number} mdhdOffset The offset of the initialization segment's
 *   mdhd box.
 * @param {string} segmentTemplateUri The URI of the segment to loop.
 * @param {number} tfdtOffset The offset of the segment's tfdt box.
 * @param {number} segmentDuration The duration of a single segment in seconds.
 * @param {number} presentationTimeOffset The presentation time offset
 *   in seconds.
 *
 * @constructor
 * @struct
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.Mp4VodStreamGenerator = function(
    initSegmentUri,
    mdhdOffset,
    segmentTemplateUri,
    tfdtOffset,
    segmentDuration,
    presentationTimeOffset) {
  goog.asserts.assert(mdhdOffset >= 0, 'mdhd offset invalid');
  goog.asserts.assert(tfdtOffset >= 0, 'tfdt offset invalid');
  goog.asserts.assert(segmentDuration > 0, 'segment duration invalid');
  goog.asserts.assert(presentationTimeOffset >= 0,
      'presentation time offset invalid');

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
  this.presentationTimeOffset_ = presentationTimeOffset;

  /** @private {ArrayBuffer} */
  this.initSegment_ = null;

  /** @private {ArrayBuffer} */
  this.segmentTemplate_ = null;

  /** @private {number} */
  this.timescale_ = 1;
};


/** @override */
shaka.test.Mp4VodStreamGenerator.prototype.init = function() {
  let async = [
    shaka.test.Util.fetch(this.initSegmentUri_),
    shaka.test.Util.fetch(this.segmentTemplateUri_),
  ];

  return Promise.all(async).then(
      function(results) {
        goog.asserts.assert(results.length == 2,
                            'did not load both segments');
        this.initSegment_ = results[0];
        this.segmentTemplate_ = results[1];
        this.timescale_ = shaka.test.StreamGenerator.getTimescale_(
            /** @type {!ArrayBuffer} */ (this.initSegment_), this.mdhdOffset_);
      }.bind(this));
};


/** @override */
shaka.test.Mp4VodStreamGenerator.prototype.getInitSegment = function(time) {
  goog.asserts.assert(
      this.initSegment_,
      'init() must be called before getInitSegment().');
  return this.initSegment_;
};


/** @override */
shaka.test.Mp4VodStreamGenerator.prototype.getSegment = function(
    position, segmentOffset, wallClockTime) {
  goog.asserts.assert(
      this.segmentTemplate_,
      'init() must be called before getSegment().');
  if (!this.segmentTemplate_) return null;

  // |position| must be an integer and >= 1.
  goog.asserts.assert((position % 1 === 0) && (position >= 1),
                      'segment number must be an integer >= 1');

  let segmentStartTime = (position - 1) * this.segmentDuration_;

  let mediaTimestamp = segmentStartTime + this.presentationTimeOffset_;

  return shaka.test.StreamGenerator.setBaseMediaDecodeTime_(
      this.segmentTemplate_, this.tfdtOffset_, mediaTimestamp, this.timescale_);
};


/**
 * Creates a Mp4LiveStreamGenerator, which simulates a DASH, live, MP4 stream.
 *
 * @param {string} initSegmentUri The URI of the initialization segment.
 * @param {number} mdhdOffset The offset of the initialization segment's
 *   mdhd box.
 * @param {string} segmentTemplateUri The URI of the segment to loop.
 * @param {number} tfdtOffset The offset of the segment's TFDT box.
 * @param {number} segmentDuration The duration of a single segment in seconds.
 * @param {number} presentationTimeOffset The presentation time offset
 *   in seconds.
 * @param {number} broadcastStartTime The wall-clock time in seconds when the
 *   stream began or will begin to broadcast.
 * @param {number} availabilityStartTime The wall-clock time in seconds when
 *   the stream began or will begin to be available. |broadcastStartTime| and
 *   |availabilityStartTime| should typically be equal; however,
 *   |availabilityStartTime| may be less than |broadcastStartTime| to
 *   align the stream if the Period's first segment's first timestamp does not
 *   equal 0.
 * @param {number} timeShiftBufferDepth The duration of the stream's time-shift
 *   buffer in seconds.
 *
 * @constructor
 * @struct
 * @implements {shaka.test.IStreamGenerator}
 */
shaka.test.Mp4LiveStreamGenerator = function(
    initSegmentUri,
    mdhdOffset,
    segmentTemplateUri,
    tfdtOffset,
    segmentDuration,
    presentationTimeOffset,
    broadcastStartTime,
    availabilityStartTime,
    timeShiftBufferDepth) {
  goog.asserts.assert(mdhdOffset >= 0, 'mdhd offset invalid');
  goog.asserts.assert(tfdtOffset >= 0, 'tfdt offset invalid');
  goog.asserts.assert(segmentDuration > 0, 'segment duration invalid');
  goog.asserts.assert(presentationTimeOffset >= 0,
      'presentation time offset invalid');
  goog.asserts.assert(broadcastStartTime >= 0,
      'broadcast start time invalid');
  goog.asserts.assert(availabilityStartTime >= 0,
      'availability start time invalid');
  goog.asserts.assert(timeShiftBufferDepth >= 0,
      'time shift buffer depth invalid');
  goog.asserts.assert(broadcastStartTime >= availabilityStartTime,
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
  this.presentationTimeOffset_ = presentationTimeOffset;

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
};


/** @override */
shaka.test.Mp4LiveStreamGenerator.prototype.init = function() {
  let async = [
    shaka.test.Util.fetch(this.initSegmentUri_),
    shaka.test.Util.fetch(this.segmentTemplateUri_),
  ];

  return Promise.all(async).then(
      function(results) {
        goog.asserts.assert(results.length == 2,
                            'did not load both segments');
        this.initSegment_ = results[0];
        this.segmentTemplate_ = results[1];
        this.timescale_ = shaka.test.StreamGenerator.getTimescale_(
            /** @type {!ArrayBuffer} */ (this.initSegment_), this.mdhdOffset_);
      }.bind(this));
};


/** @override */
shaka.test.Mp4LiveStreamGenerator.prototype.getInitSegment = function(
    wallClockTime) {
  goog.asserts.assert(
      this.initSegment_,
      'init() must be called before getInitSegment().');
  return this.initSegment_;
};


/** @override */
shaka.test.Mp4LiveStreamGenerator.prototype.getSegment = function(
    position, segmentOffset, wallClockTime) {
  goog.asserts.assert(
      this.initSegment_,
      'init() must be called before getSegment().');
  if (!this.initSegment_) return null;

  // |position| must be an integer and >= 1.
  goog.asserts.assert((position % 1 === 0) && (position >= 1),
                      'segment number must be an integer >= 1');

  let segmentStartTime = (position - 1) * this.segmentDuration_;

  // Compute the segment's availability start time and end time.
  // (See section 5.3.9.5.3 of the DASH spec.)
  let segmentAvailabilityStartTime = this.availabilityStartTime_ +
                                     segmentStartTime +
                                     (segmentOffset * this.segmentDuration_) +
                                     this.segmentDuration_;
  let segmentAvailabiltyEndTime = segmentAvailabilityStartTime +
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

  // |availabilityStartTime| may be less than |broadcastStartTime| to align the
  // stream if the Period's first segment's first timestamp does not equal 0.
  let artificialPresentationTimeOffset =
      this.broadcastStartTime_ - this.availabilityStartTime_;
  let mediaTimestamp = segmentStartTime +
                       this.presentationTimeOffset_ +
                       artificialPresentationTimeOffset;

  return shaka.test.StreamGenerator.setBaseMediaDecodeTime_(
      /** @type {!ArrayBuffer} */ (this.segmentTemplate_), this.tfdtOffset_,
      mediaTimestamp, this.timescale_);
};


/**
 * Gets the given initialization segment's movie header box's (mdhd box)
 * timescale parameter.
 *
 * @param {!ArrayBuffer} initSegment
 * @param {number} mdhdOffset The byte offset of the initialization segment's
 *   mdhd box.
 * @return {number} The timescale parameter.
 * @throws RangeError
 * @private
 */
shaka.test.StreamGenerator.getTimescale_ = function(
    initSegment, mdhdOffset) {
  let dataView = new DataView(initSegment);
  let reader = new shaka.util.DataViewReader(
      dataView, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
  reader.skip(mdhdOffset);

  let size = reader.readUint32();
  let type = reader.readUint32();
  goog.asserts.assert(
      type == 0x6d646864 /* mdhd */,
      'initSegment does not contain an mdhd box at the specified offset.');

  let largesizePresent = size == 1;
  if (largesizePresent) {
    shaka.log.v2('\'largesize\' field is present.');
    reader.skip(8);  // Skip 'largesize' field.
  }

  let version = reader.readUint8();
  reader.skip(3);  // Skip 'flags' field.

  // Skip 'creation_time' and 'modification_time' fields.
  if (version == 0) {
    shaka.log.v2('mdhd box is version 0.');
    reader.skip(8);
  } else {
    shaka.log.v2('mdhd box is version 1.');
    reader.skip(16);
  }

  let timescale = reader.readUint32();
  return timescale;
};


/**
 * Sets the given segment's track fragment media decode time box's (tfdt box)
 * baseMediaDecodeTime parameter.
 *
 * @param {!ArrayBuffer} segment
 * @param {number} tfdtOffset The byte offset of the segment's tfdt box.
 * @param {number} baseMediaDecodeTime The baseMediaDecodeTime in seconds, this
 *   value is the first presentation timestamp of the first frame/sample in
 *   the segment.
 * @param {number} timescale
 * @return {!ArrayBuffer} The modified segment.
 * @throws RangeError
 * @private
 */
shaka.test.StreamGenerator.setBaseMediaDecodeTime_ = function(
    segment, tfdtOffset, baseMediaDecodeTime, timescale) {
  goog.asserts.assert(baseMediaDecodeTime * timescale < Math.pow(2, 32),
                      'Specied baseMediaDecodeTime is too big.');

  // NOTE from Microsoft on the lack of ArrayBuffer.prototype.slice in IE11:
  // "At this time we do not plan to fix this issue." ~ https://bit.ly/2ywEkpQ
  // This is the best replacement for segment.slice(0) I could come up with:
  let buffer = new ArrayBuffer(segment.byteLength);
  (new Uint8Array(buffer)).set(new Uint8Array(segment));

  let dataView = new DataView(buffer);
  let reader = new shaka.util.DataViewReader(
      dataView, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
  reader.skip(tfdtOffset);

  let size = reader.readUint32();
  let type = reader.readUint32();
  goog.asserts.assert(
      type == 0x74666474 /* tfdt */,
      'segment does not contain a tfdt box at the specified offset.');

  let largesizePresent = size == 1;
  if (largesizePresent) {
    shaka.log.v2('\'largesize\' field is present.');
    reader.skip(8);  // Skip 'largesize' field.
  }

  let version = reader.readUint8();
  reader.skip(3);  // Skip 'flags' field.

  let pos = reader.getPosition();
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

  return buffer;
};

