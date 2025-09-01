/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @summary
 * This simulates multiple SourceBuffers. However, it only
 * allows segments to be appended if they are aligned (i.e., it goes not permit
 * gaps or overlaps are within the buffers).
 *
 * @extends {shaka.media.MediaSourceEngine}
 */
shaka.test.FakeMediaSourceEngine = class {
  /**
   * @param {!Object<string,
   *                  shaka.test.FakeMediaSourceEngine.SegmentData>} segmentData
   * @param {number=} drift Optional drift. Defaults to 0.
   */
  constructor(segmentData, drift) {
    /**
     * @type {!Object<string, shaka.test.FakeMediaSourceEngine.SegmentData>}
     */
    this.segmentData = segmentData;

    /** @type {!Object<string, !Array<boolean>>} */
    this.initSegments = {};

    /** @type {!Object<string, !Array<boolean>>} */
    this.segments = {};

    /** @private {number} */
    this.drift_ = drift || 0;

    /** @private {!Object<string, number>} */
    this.timestampOffsets_ = {};

    /** @private {number} */
    this.duration_ = Infinity;

    for (const type in segmentData) {
      const data = segmentData[type];

      this.initSegments[type] = data.initSegments.map(() => false);
      this.segments[type] = data.segments.map(() => false);

      this.timestampOffsets_[type] = data.timestampOffset || 0;
    }

    /** @type {!jasmine.Spy} */
    this.init = jasmine.createSpy('init').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.open = jasmine.createSpy('open').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure').and.stub();

    /** @type {!jasmine.Spy} */
    this.reinitText = jasmine.createSpy('reinitText').and.stub();

    /** @type {!jasmine.Spy} */
    this.ended = jasmine.createSpy('ended').and.returnValue(false);

    /** @type {!jasmine.Spy} */
    this.closed = jasmine.createSpy('closed').and.returnValue(false);

    /** @type {!jasmine.Spy} */
    this.endOfStream =
        jasmine.createSpy('endOfStream').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.getBufferedInfo =
        jasmine.createSpy('getBufferedInfo').and.returnValue({});

    /** @type {!jasmine.Spy} */
    this.setDuration = jasmine.createSpy('setDuration')
        .and.callFake((dur) => this.setDurationImpl_(dur));

    /** @type {!jasmine.Spy} */
    this.getDuration = jasmine.createSpy('getDuration')
        .and.callFake(() => this.getDurationImpl_());

    /** @type {!jasmine.Spy} */
    this.appendBuffer = jasmine.createSpy('appendBuffer')
        .and.callFake((type, data, reference) =>
          this.appendBufferImpl(type, data, reference));

    /** @type {!jasmine.Spy} */
    this.clear = jasmine.createSpy('clear')
        .and.callFake((type) => this.clearImpl_(type));

    /** @type {!jasmine.Spy} */
    this.resetCaptionParser = jasmine.createSpy('resetCaptionParser')
        .and.stub();

    /** @type {!jasmine.Spy} */
    this.bufferStart = jasmine.createSpy('bufferStart')
        .and.callFake((type) => this.bufferStartImpl_(type));

    /** @type {!jasmine.Spy} */
    this.bufferEnd = jasmine.createSpy('bufferEnd')
        .and.callFake((type) => this.bufferEndImpl_(type));

    /** @type {!jasmine.Spy} */
    this.isBuffered = jasmine.createSpy('isBuffered')
        .and.callFake((type, time) => this.isBufferedImpl_(type, time));

    /** @type {!jasmine.Spy} */
    this.bufferedAheadOf = jasmine.createSpy('bufferedAheadOf')
        .and.callFake((type, time) => this.bufferedAheadOfImpl(type, time));

    /** @type {!jasmine.Spy} */
    this.setStreamProperties = jasmine.createSpy('setStreamProperties')
        .and.callFake((type, offset, end, sequenceMode) =>
          this.setStreamPropertiesImpl_(type, offset, end, sequenceMode));

    /** @type {!jasmine.Spy} */
    this.remove = jasmine.createSpy('remove')
        .and.callFake((type, start, end) => this.removeImpl(type, start, end));

    /** @type {!jasmine.Spy} */
    this.flush = jasmine.createSpy('flush').and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.clearSelectedClosedCaptionId =
        jasmine.createSpy('clearSelectedClosedCaptionId');

    /** @type {!jasmine.Spy} */
    this.getTextDisplayer =
        jasmine.createSpy('getTextDisplayer')
            .and.returnValue(new shaka.test.FakeTextDisplayer());

    /** @type {!jasmine.Spy} */
    this.setSegmentRelativeVttTiming =
        jasmine.createSpy('setSegmentRelativeVttTiming').and.stub();

    /** @type {!jasmine.Spy} */
    this.updateLcevcDec =
        jasmine.createSpy('updateLcevcDec').and.stub();

    /** @type {!jasmine.Spy} */
    this.resync =
        jasmine.createSpy('resync').and.stub();

    /** @type {!jasmine.Spy} */
    this.setLiveSeekableRange =
        jasmine.createSpy('setLiveSeekableRange').and.stub();

    /** @type {!jasmine.Spy} */
    this.clearLiveSeekableRange =
        jasmine.createSpy('clearLiveSeekableRange').and.stub();
  }

  /** @override */
  destroy() {
    return Promise.resolve();
  }

  /** @override */
  isStreamingAllowed() {
    return true;
  }

  /**
   * @param {string} type
   * @return {?number}
   * @private
   */
  bufferStartImpl_(type) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    const first = this.segments[type].indexOf(true);
    if (first < 0) {
      return null;
    }

    return this.toTime_(type, first);
  }

  /**
   * @param {string} type
   * @return {?number}
   * @private
   */
  bufferEndImpl_(type) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    const last = this.segments[type].lastIndexOf(true);
    if (last < 0) {
      return null;
    }

    return this.toTime_(type, last + 1);
  }

  /**
   * @param {string} type
   * @param {number} time
   * @return {boolean}
   * @private
   */
  isBufferedImpl_(type, time) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    const first = this.segments[type].indexOf(true);
    const last = this.segments[type].lastIndexOf(true);
    if (first < 0 || last < 0) {
      return false;
    }

    return time >= this.toTime_(type, first) &&
        time < this.toTime_(type, last);
  }

  /**
   * @param {string} type
   * @param {number} start
   * @return {number}
   */
  bufferedAheadOfImpl(type, start) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const hasSegment = (i) => {
      return this.segments[type][i] ||
          (type == ContentType.VIDEO && this.segments['trickvideo'] &&
           this.segments['trickvideo'][i]);
    };

    // Note: |start| may equal the end of the last segment, so |first|
    // may equal segments[type].length
    const first = this.toIndex_(type, start);
    if (!hasSegment(first)) {
      return 0;
    }  // Unbuffered.

    // Find the first gap.
    let last = first;
    while (last < this.segments[type].length && hasSegment(last)) {
      last++;
    }

    return this.toTime_(type, last) - start;
  }

  /**
   * @param {string} type
   * @param {!ArrayBuffer} data
   * @param {?shaka.media.SegmentReference} reference
   * @return {!Promise}
   */
  appendBufferImpl(type, data, reference) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    // Remains 'video' even when we detect a 'trickvideo' segment.
    const originalType = type;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Set init segment.
    let i = this.segmentData[type].initSegments.indexOf(data);
    if (i < 0 && type == ContentType.VIDEO &&
        this.segmentData['trickvideo']) {
      // appendBuffer('video', ...) might be for 'trickvideo' data.
      i = this.segmentData['trickvideo'].initSegments.indexOf(data);
      if (i >= 0) {
        // 'trickvideo' value is only used for testing.
        // Cast to the ContentType enum for compatibility.
        type = /** @type {shaka.util.ManifestParserUtils.ContentType} */(
          'trickvideo');
      }
    }
    if (i >= 0) {
      // Update the list of which init segment was appended last.
      expect(reference).toBe(null);
      this.initSegments[type] =
          this.segmentData[type].initSegments.map((c) => false);
      this.initSegments[type][i] = true;
      return Promise.resolve();
    }

    // Set media segment.
    i = this.segmentData[type].segments.indexOf(data);
    if (i < 0 && type == ContentType.VIDEO &&
        this.segmentData['trickvideo']) {
      // appendBuffer('video', ...) might be for 'trickvideo' data.
      i = this.segmentData['trickvideo'].segments.indexOf(data);
      if (i >= 0) {
        // 'trickvideo' value is only used for testing.
        // Cast to the ContentType enum for compatibility.
        type = /** @type {shaka.util.ManifestParserUtils.ContentType} */(
          'trickvideo');
      }
    }
    if (i < 0) {
      throw new Error('unexpected data');
    }

    // Verify that the segment is aligned.
    const segmentData = this.segmentData[type];
    const appendedTime = segmentData.segmentStartTimes[i] +
                         this.timestampOffsets_[originalType];
    const expectedStartTime = i * segmentData.segmentDuration;
    const expectedEndTime = expectedStartTime + segmentData.segmentDuration;
    expect(appendedTime).toBe(expectedStartTime);
    expect(reference).not.toBe(null);
    if (reference) {
      expect(reference.startTime).toBe(expectedStartTime);
      expect(reference.endTime).toBe(expectedEndTime);
    }

    this.segments[type][i] = true;
    return Promise.resolve();
  }

  /**
   * @param {string} type
   * @param {number} start
   * @param {number} end
   * @param {Array<number>=} continuityTimelines
   * @return {!Promise}
   */
  removeImpl(type, start, end, continuityTimelines) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    const first = this.toIndex_(type, start);
    if (first < 0 || first >= this.segments[type].length) {
      throw new Error('unexpected start');
    }

    // Note: |end| is exclusive.
    const last = this.toIndex_(type, end - 0.000001);
    if (last < 0) {
      throw new Error('unexpected end');
    }

    if (first > last) {
      throw new Error('unexpected start and end');
    }

    for (let i = first; i <= last; ++i) {
      this.segments[type][i] = false;
    }

    return Promise.resolve();
  }


  /** @override */
  isResetMediaSourceNecessary() {
    return false;
  }

  /**
   * @param {string} type
   * @return {!Promise}
   * @private
   */
  clearImpl_(type) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }

    this.segments[type] = this.segments[type].map((c) => false);

    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // If we're clearing video, clear the segment list for 'trickvideo', too.
    if (type == ContentType.VIDEO && this.segments['trickvideo']) {
      // 'trickvideo' value is only used for testing.
      // Cast to the ContentType enum for compatibility.
      this.clearImpl_(
          /** @type {shaka.util.ManifestParserUtils.ContentType} */(
            'trickvideo'));
    }

    return Promise.resolve();
  }

  /**
   * @param {string} type
   * @param {number} offset
   * @param {number} appendWindowEnd
   * @param {boolean} sequenceMode
   * @return {!Promise}
   * @private
   */
  setStreamPropertiesImpl_(type, offset, appendWindowEnd, sequenceMode) {
    if (!this.segments[type]) {
      throw new Error('unexpected type');
    }
    if (!sequenceMode) {
      this.timestampOffsets_[type] = offset;
    }
    // Don't use |appendWindowEnd|.
    return Promise.resolve();
  }

  /**
   * @param {number} duration
   * @return {!Promise}
   * @private
   */
  setDurationImpl_(duration) {
    this.duration_ = duration;
    return Promise.resolve();
  }

  /**
   * @return {number}
   * @private
   */
  getDurationImpl_() {
    return this.duration_;
  }

  /**
   * @param {string} type
   * @param {number} ts
   * @return {number} The index of the segment which contains the given
   *     timestamp.
   * @private
   */
  toIndex_(type, ts) {
    return Math.floor((ts - this.drift_) /
                      this.segmentData[type].segmentDuration);
  }

  /**
   * @param {string} type
   * @param {number} i
   * @return {number} The start time of the i'th segment.
   * @private
   */
  toTime_(type, i) {
    return this.drift_ + (i * this.segmentData[type].segmentDuration);
  }
};

/**
 * @typedef {{
 *   initSegments: !Array<!BufferSource>,
 *   segments: !Array<!BufferSource>,
 *   segmentStartTimes: !Array<number>,
 *   segmentDuration: number,
 *   timestampOffset: number,
 * }}
 *
 * @property {!Array<!BufferSource>} initSegments
 *   The stream's initialization segments (for all periods).
 * @property {!Array<!BufferSource>} segments
 *   The stream's media segments (for all periods).
 * @property {!Array<number>} segmentStartTimes
 *   The start time of each media segment as they would appear within a
 *   segment index. These values plus drift simulate the segments'
 *   baseMediaDecodeTime (or equivalent) values.
 * @property {number} segmentDuration
 *   The duration of each media segment.
 * @property {number=} timestampOffset
 *   The offset to the segment start times that is added to create
 *   the media timeline.
 */
shaka.test.FakeMediaSourceEngine.SegmentData;
