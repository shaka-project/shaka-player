/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SegmentPrefetch');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Uint8ArrayUtils');


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
     * @private {!Map.<
     *        !(shaka.media.SegmentReference|shaka.media.InitSegmentReference),
     *        !shaka.media.SegmentPrefetchOperation>}
     */
    this.segmentPrefetchMap_ = new Map();
  }

  /**
   * Fetch next segments ahead of current segment.
   *
   * @param {(!shaka.media.SegmentReference)} startReference
   * @param {boolean=} skipFirst
   * @public
   */
  prefetchSegments(startReference, skipFirst = false) {
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
    if (!iterator) {
      return;
    }
    let reference = startReference;
    if (skipFirst) {
      reference = iterator.next().value;
      if (reference &&
          reference.startTime == startReference.startTime &&
          reference.endTime == startReference.endTime) {
        reference = null;
      }
    }
    while (this.segmentPrefetchMap_.size < this.prefetchLimit_ &&
            reference != null) {
      // By default doesn't prefech preload partial segments when using
      // byterange
      let prefetchAllowed = true;
      if (reference.isPreload() && reference.endByte != null) {
        prefetchAllowed = false;
      }
      if (reference.getStatus() ==
          shaka.media.SegmentReference.Status.MISSING) {
        prefetchAllowed = false;
      }
      if (prefetchAllowed && !this.segmentPrefetchMap_.has(reference)) {
        const segmentPrefetchOperation =
          new shaka.media.SegmentPrefetchOperation(this.fetchDispatcher_);
        segmentPrefetchOperation.dispatchFetch(reference, this.stream_);
        this.segmentPrefetchMap_.set(reference, segmentPrefetchOperation);
      }
      this.prefetchPosTime_ = reference.startTime;
      reference = iterator.next().value;
    }
  }

  /**
   * Fetch init segment.
   *
   * @param {!shaka.media.InitSegmentReference} initSegmentReference
   * @public
   */
  prefetchInitSegment(initSegmentReference) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    if (!this.stream_.segmentIndex) {
      shaka.log.info(logPrefix, 'missing segmentIndex');
      return;
    }

    if (this.segmentPrefetchMap_.size < this.prefetchLimit_) {
      if (!this.segmentPrefetchMap_.has(initSegmentReference)) {
        const segmentPrefetchOperation =
          new shaka.media.SegmentPrefetchOperation(this.fetchDispatcher_);
        segmentPrefetchOperation.dispatchFetch(
            initSegmentReference, this.stream_);
        this.segmentPrefetchMap_.set(
            initSegmentReference, segmentPrefetchOperation);
      }
    }
  }

  /**
   * Get the result of prefetched segment if already exists.
   * @param {!(shaka.media.SegmentReference|shaka.media.InitSegmentReference)}
   *        reference
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   * @return {?shaka.net.NetworkingEngine.PendingRequest} op
   * @public
   */
  getPrefetchedSegment(reference, streamDataCallback) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);

    if (this.segmentPrefetchMap_.has(reference)) {
      const segmentPrefetchOperation = this.segmentPrefetchMap_.get(reference);
      if (streamDataCallback) {
        segmentPrefetchOperation.setStreamDataCallback(streamDataCallback);
      }
      this.segmentPrefetchMap_.delete(reference);
      if (reference instanceof shaka.media.SegmentReference) {
        shaka.log.debug(
            logPrefix,
            'reused prefetched segment at time:', reference.startTime,
            'mapSize', this.segmentPrefetchMap_.size);
      } else {
        shaka.log.debug(
            logPrefix,
            'reused prefetched init segment at time, mapSize',
            this.segmentPrefetchMap_.size);
      }
      return segmentPrefetchOperation.getOperation();
    } else {
      if (reference instanceof shaka.media.SegmentReference) {
        shaka.log.debug(
            logPrefix,
            'reused prefetched segment at time:', reference.startTime,
            'mapSize', this.segmentPrefetchMap_.size);
      } else {
        shaka.log.debug(
            logPrefix,
            'reused prefetched init segment at time, mapSize',
            this.segmentPrefetchMap_.size);
      }
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
   * @param {!(shaka.media.SegmentReference|shaka.media.InitSegmentReference)}
   *        reference
   * @private
   */
  abortPrefetchedSegment_(reference) {
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    const segmentPrefetchOperation = this.segmentPrefetchMap_.get(reference);
    this.segmentPrefetchMap_.delete(reference);
    if (segmentPrefetchOperation) {
      segmentPrefetchOperation.abort();
      if (reference instanceof shaka.media.SegmentReference) {
        shaka.log.info(
            logPrefix,
            'pop and abort prefetched segment at time:', reference.startTime);
      } else {
        shaka.log.info(logPrefix, 'pop and abort prefetched init segment');
      }
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
 * @summary
 * This class manages a segment prefetch operation.
 */
shaka.media.SegmentPrefetchOperation = class {
  /**
   * @param {shaka.media.SegmentPrefetch.FetchDispatcher} fetchDispatcher
   */
  constructor(fetchDispatcher) {
    /** @private {shaka.media.SegmentPrefetch.FetchDispatcher} */
    this.fetchDispatcher_ = fetchDispatcher;

    /** @private {?function(BufferSource):!Promise} */
    this.streamDataCallback_ = null;

    /** @private {?shaka.net.NetworkingEngine.PendingRequest} */
    this.operation_ = null;
  }

  /**
   * Fetch a segments
   *
   * @param {!(shaka.media.SegmentReference|shaka.media.InitSegmentReference)}
   *        reference
   * @param {!shaka.extern.Stream} stream
   * @public
   */
  dispatchFetch(reference, stream) {
    // We need to store the data, because streamDataCallback_ might not be
    // available when you start getting the first data.
    let buffered = new Uint8Array(0);
    this.operation_ = this.fetchDispatcher_(
        reference, stream, async (data) => {
          if (buffered.byteLength > 0) {
            buffered = shaka.util.Uint8ArrayUtils.concat(buffered, data);
          } else {
            buffered = data;
          }
          if (this.streamDataCallback_) {
            await this.streamDataCallback_(buffered);
            buffered = new Uint8Array(0);
          }
        });
  }

  /**
   * Get the operation of prefetched segment if already exists.
   *
   * @return {?shaka.net.NetworkingEngine.PendingRequest} op
   * @public
   */
  getOperation() {
    return this.operation_;
  }

  /**
   * @param {?function(BufferSource):!Promise} streamDataCallback
   * @public
   */
  setStreamDataCallback(streamDataCallback) {
    this.streamDataCallback_ = streamDataCallback;
  }

  /**
   * Abort the current operation if exists.
   */
  abort() {
    if (this.operation_) {
      this.operation_.abort();
    }
  }
};

/**
 * @typedef {function(
 *  !(shaka.media.InitSegmentReference|shaka.media.SegmentReference),
 *  shaka.extern.Stream,
 *  ?function(BufferSource):!Promise=
 * ):!shaka.net.NetworkingEngine.PendingRequest}
 *
 * @description
 * A callback function that fetches a segment.
 * @export
 */
shaka.media.SegmentPrefetch.FetchDispatcher;
