/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentReference');
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
   * @param {shaka.media.SegmentPrefetch.FetchDispatcher} fetchDispatcher
   */
  constructor(prefetchLimit, stream, fetchDispatcher) {
    /** @private {number} */
    this.prefetchLimit_ = prefetchLimit;

    /** @private {shaka.extern.Stream} */
    this.stream_ = stream;

    /** @private {number} */
    this.prefetchPosTime_ = 0;

    /** @private {shaka.media.SegmentPrefetch.FetchDispatcher} */
    this.fetchDispatcher_ = fetchDispatcher;

    /**
     * @private {!Map.<shaka.media.SegmentReference,
     *           !shaka.net.NetworkingEngine.PendingRequest>}
     */
    this.segmentPrefetchMap_ = new Map();
  }

  /**
   * Fetch next segments ahead of current segment.
   *
   * @param {(!shaka.media.SegmentReference)} startReference
   * @public
   */
  prefetchSegments(startReference) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    if (!this.stream_.segmentIndex) {
      shaka.log.info(logPrefix, 'missing segmentIndex');
      return;
    }
    const currTime = startReference.startTime;
    const maxTime = Math.max(currTime, this.prefetchPosTime_);
    const iterator = this.stream_.segmentIndex.getIteratorForTime(maxTime);
    let reference = startReference;
    while (this.segmentPrefetchMap_.size < this.prefetchLimit_ &&
            reference != null) {
      if (!this.segmentPrefetchMap_.has(reference)) {
        const op = this.fetchDispatcher_(reference, this.stream_);
        this.segmentPrefetchMap_.set(reference, op);
      }
      this.prefetchPosTime_ = reference.startTime;
      reference = iterator.next().value;
    }
  }

  /**
   * Get the result of prefetched segment if already exists.
   * @param {(!shaka.media.SegmentReference)} reference
   * @return {?shaka.net.NetworkingEngine.PendingRequest} op
   * @public
   */
  getPrefetchedSegment(reference) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');
    goog.asserts.assert(reference instanceof shaka.media.SegmentReference,
        'getPrefetchedSegment is only used for shaka.media.SegmentReference.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);

    if (this.segmentPrefetchMap_.has(reference)) {
      const op = this.segmentPrefetchMap_.get(reference);
      this.segmentPrefetchMap_.delete(reference);
      shaka.log.info(
          logPrefix,
          'reused prefetched segment at time:', reference.startTime,
          'mapSize', this.segmentPrefetchMap_.size);
      return op;
    } else {
      shaka.log.info(
          logPrefix,
          'missed segment at time:', reference.startTime,
          'mapSize', this.segmentPrefetchMap_.size);
      return null;
    }
  }

  /**
   * Clear all segment data.
   * @public
   */
  clearAll() {
    if (this.segmentPrefetchMap_.size === 0) {
      return;
    }
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    for (const reference of this.segmentPrefetchMap_.keys()) {
      if (reference) {
        this.abortPrefetchedSegment_(reference);
      }
    }
    shaka.log.info(logPrefix, 'cleared all');
    this.prefetchPosTime_ = 0;
  }

  /**
   * Reset the prefetchLimit and clear all internal states.
   * Called by StreamingEngine when configure() was called.
   * @param {number} newPrefetchLimit
   * @public
   */
  resetLimit(newPrefetchLimit) {
    goog.asserts.assert(newPrefetchLimit >= 0,
        'The new prefetch limit must be >= 0.');
    this.prefetchLimit_ = newPrefetchLimit;
    const keyArr = Array.from(this.segmentPrefetchMap_.keys());
    while (keyArr.length > newPrefetchLimit) {
      const reference = keyArr.pop();
      if (reference) {
        this.abortPrefetchedSegment_(reference);
      }
    }
  }

  /**
   * Called by Streaming Engine when switching variant.
   * @param {shaka.extern.Stream} stream
   * @public
   */
  switchStream(stream) {
    if (stream && stream !== this.stream_) {
      this.clearAll();
      this.stream_ = stream;
    }
  }

  /**
   * Remove a segment from prefetch map and abort it.
   * @param {(!shaka.media.SegmentReference)} reference
   * @private
   */
  abortPrefetchedSegment_(reference) {
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    const operation = this.segmentPrefetchMap_.get(reference);
    this.segmentPrefetchMap_.delete(reference);
    if (operation) {
      operation.abort();
      shaka.log.info(
          logPrefix,
          'pop and abort prefetched segment at time:', reference.startTime);
    }
  }

  /**
   * The prefix of the logs that are created in this class.
   * @return {string}
   * @private
   */
  static logPrefix_(stream) {
    return 'SegmentPrefetch(' + stream.type + ':' + stream.id + ')';
  }
};

/**
 * @typedef {function(
 *  !(shaka.media.InitSegmentReference|shaka.media.SegmentReference),
 *  shaka.extern.Stream
 * ):!shaka.net.NetworkingEngine.PendingRequest}
 *
 * @description
 * A callback function that fetches a segment.
 * @export
 */
shaka.media.SegmentPrefetch.FetchDispatcher;
