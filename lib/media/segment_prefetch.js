/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.SegmentIterator');
goog.provide('shaka.media.SegmentPrefetch');
goog.require('shaka.log');

/**
 * @summary
 * This class manages segment prefetch operations.
 * Called by StreamingEngine to prefetch next N segments
 * ahead of playhead, to reduce the chances of rebuffering.
 */
shaka.media.SegmentPrefetch = class {
  /**
   * @param {number} prefetchLimit
   * @param {shaka.extern.Stream} stream
   * @param {function(
   *  !(shaka.media.InitSegmentReference|shaka.media.SegmentReference),
   *  shaka.extern.Stream
   * ):!shaka.net.NetworkingEngine.PendingRequest} fetchDispatcher
   */
  constructor(prefetchLimit, stream, fetchDispatcher) {
    /**
     * @private {number}
     */
    this.prefetchLimit_ = prefetchLimit;

    /** @private {shaka.extern.Stream} */
    this.stream_ = stream;

    /** @private {number} */
    this.prefetchPosTime_ = 0;

    /** @private {function(
     * !(shaka.media.InitSegmentReference|shaka.media.SegmentReference),
     * shaka.extern.Stream
     * ):!shaka.net.NetworkingEngine.PendingRequest} */
    this.fetchDispatcher_ = fetchDispatcher;

    /**
     * @private {!Map.<shaka.media.SegmentReference,
                 !shaka.net.NetworkingEngine.PendingRequest>}
     */
    this.segmentPrefetchMap_ = new Map();
  }

  /**
   * Fetch next segments ahead of current segment.
   *
   * @param {!shaka.media.SegmentIterator} segmentIterator
   * @param {(!shaka.media.SegmentReference)} startReference
   * @public
   */
  prefetchSegments(segmentIterator, startReference) {
    if (!(this.prefetchLimit_ > 0)) {
      return;
    }
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(
        this.stream_,
    );
    const currTime = segmentIterator.current().startTime;
    const maxTime = Math.max(currTime, this.prefetchPosTime_);
    const it = this.stream_.segmentIndex.getIteratorForTime(maxTime);
    let reference = startReference;
    while (this.segmentPrefetchMap_.size < this.prefetchLimit_ &&
            reference != null) {
      if (!this.segmentPrefetchMap_.has(reference)) {
        const op = this.fetchDispatcher_(reference, this.stream_);
        shaka.log.info(
            logPrefix,
            'fetching segment for time:', reference.startTime,
            'mapSize', this.segmentPrefetchMap_.size,
        );
        this.segmentPrefetchMap_.set(reference, op);
      }
      this.prefetchPosTime_ = reference.startTime;
      reference =it.next().value;
    }
  }

  /**
   * Get the result of prefetched segment if already exists.
   * @param {(
   *  !shaka.media.InitSegmentReference|!shaka.media.SegmentReference
   * )} reference
   * @return {?shaka.net.NetworkingEngine.PendingRequest} op
   * @public
   */
  getPrefetchedSegment(reference) {
    let op = null;
    if (
      !(reference instanceof shaka.media.SegmentReference) ||
      !(this.prefetchLimit_ > 0)
    ) {
      return null;
    }

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(
        this.stream_,
    );

    if (this.segmentPrefetchMap_.has(reference)) {
      op = this.segmentPrefetchMap_.get(reference);
      this.segmentPrefetchMap_.delete(reference);
      shaka.log.info(
          logPrefix,
          'reuse prefetched segment at time:', reference.startTime,
          'mapSize', this.segmentPrefetchMap_.size);
    } else {
      shaka.log.info(
          logPrefix,
          'missed segment at time:', reference.startTime,
          'mapSize', this.segmentPrefetchMap_.size);
    }
    return op;
  }

  /**
   * Clear prefetched segment data within given time range.
   * @param {number} startTime
   * @param {number} duration
   * @public
   */
  clearWithinRange(startTime, duration) {
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(
        this.stream_,
    );
    const endTime = startTime + duration;
    for (const reference of this.segmentPrefetchMap_.keys()) {
      if (
        duration === 0 ||
        (reference.startTime >= startTime && reference.endTime <= endTime)
      ) {
        shaka.log.info(
            logPrefix, 'clear segment at time:', reference.startTime);
        const operation = this.segmentPrefetchMap_.get(reference);
        this.segmentPrefetchMap_.delete(reference);
        operation.abort();
      }
    }
  }

  /**
   * Clear all segment data.
   * @public
   */
  clearAll() {
    this.clearWithinRange(0, 0);
  }

  /**
   * Reset the prefetchLimit and clear all internal states.
   * Called by StreamingEngine when configure() was called.
   * @param {number} prefetchLimit.
   * @public
   */
  reset(prefetchLimit) {
    if (prefetchLimit !== this.prefetchLimit_) {
      this.clearAll();
      this.prefetchLimit_ = prefetchLimit;
      this.prefetchPosTime_ = 0;
    }
  }

  /** @private */
  static logPrefix_(stream) {
    return 'SegmentPrefetch(' + stream.type + ':' + stream.id + ')';
  }
};
