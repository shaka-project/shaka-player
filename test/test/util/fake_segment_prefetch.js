/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A fake SegmentPrefetch class that is used for testing
 * segment prefetching functionality.
 *
 * @final
 * @struct
 * @extends {shaka.media.SegmentPrefetch}
 */
shaka.test.FakeSegmentPrefetch = class {
  /**
   * Suppress the JSC_PRIVATE_OVERRIDE error for overriding prefetchPosTime_
   * @suppress {visibility}
   */
  constructor(prefetchLimit, stream, segmentData) {
    /** @private {number} */
    this.prefetchLimit_ = prefetchLimit;

    /** @private {(Set.<!shaka.media.SegmentReference|
     *      !shaka.media.InitSegmentReference>)} */
    this.requestedReferences_ = new Set();

    /** @private {shaka.extern.Stream} */
    this.streamObj_ = stream;

    /**
     * @private {!Object.<string, shaka.test.FakeMediaSourceEngine.SegmentData>}
     */
    this.segmentData_ = segmentData;

    /** @private {Array<number>} */
    this.evictions_ = [];

    /** @private {number} */
    this.prefetchPosTime_ = 0;

    /** @private {number} */
    this.segmentNum_ = 0;
  }

  /** @override */
  replaceFetchDispatcher(fetchDispatcher) {
    // empty fake for now
  }

  /** @override */
  prefetchSegmentsByTime(currTime) {
    const maxTime = Math.max(currTime, this.prefetchPosTime_);
    const iterator = this.streamObj_.segmentIndex.getIteratorForTime(maxTime);
    let reference = iterator.next().value;
    while (this.segmentNum_ < this.prefetchLimit_ && reference != null) {
      if (!this.requestedReferences_.has(reference)) {
        if (reference instanceof shaka.media.SegmentReference) {
          this.segmentNum_++;
        }
        this.requestedReferences_.add(reference);
      }
      this.prefetchPosTime_ = reference.startTime;
      reference = iterator.next().value;
    }
  }

  /** @override */
  switchStream(stream) {
    if (stream !== this.streamObj_) {
      this.requestedReferences_.clear();
    }
  }

  /** @override */
  resetLimit(limit) {
    this.clearAll();
  }

  /** @override */
  clearAll() {
    this.requestedReferences_.clear();
    this.segmentNum_ = 0;
    this.prefetchPosTime_ = 0;
  }

  /** @override */
  evict(time) {
    this.evictions_.push(time);
  }

  /**
   * @override
   * @param {shaka.media.InitSegmentReference|
   *     shaka.media.SegmentReference} reference
   */
  getPrefetchedSegment(reference) {
    if (!(reference instanceof shaka.media.SegmentReference)) {
      return null;
    }
    /**
     * The unit tests assume a segment is already prefetched
     * if it was ever passed to prefetchSegmentsByTime() as param.
     * Otherwise return null so the streaming engine being tested
     * will do actual fetch.
     */
    if (this.requestedReferences_.has(reference)) {
      const segmentData = this.segmentData_[this.streamObj_.type];
      return new shaka.net.NetworkingEngine.PendingRequest(
          Promise.resolve({
            uri: reference.getUris()[0],
            data: segmentData.segments[
                segmentData.segmentStartTimes.indexOf(reference.startTime)
            ],
            headers: {},
          }),
          () => Promise.resolve(null),
          new shaka.net.NetworkingEngine.NumBytesRemainingClass(),
      );
    }
    return null;
  }
};
