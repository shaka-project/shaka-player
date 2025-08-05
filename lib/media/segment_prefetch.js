/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SegmentPrefetch');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentIterator');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
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
   * @param {boolean} reverse
   * @param {?function(!shaka.media.SegmentReference,
   *         !shaka.extern.Stream):boolean=} shouldPrefetchNextSegment
   */
  constructor(prefetchLimit, stream, fetchDispatcher, reverse,
      shouldPrefetchNextSegment) {
    /** @private {number} */
    this.prefetchLimit_ = prefetchLimit;

    /** @private {shaka.extern.Stream} */
    this.stream_ = stream;

    /** @private {shaka.media.SegmentPrefetch.FetchDispatcher} */
    this.fetchDispatcher_ = fetchDispatcher;

    /**
     * @private {!Map<
     *        !shaka.media.SegmentReference,
     *        !shaka.media.SegmentPrefetchOperation>}
     */
    this.segmentPrefetchMap_ = new Map();

    /**
     * @private {!Map<
     *        !shaka.media.InitSegmentReference,
     *        !shaka.media.SegmentPrefetchOperation>}
     */
    this.initSegmentPrefetchMap_ = new Map();

    /** @private {?shaka.media.SegmentIterator} */
    this.iterator_ = null;

    /** @private {boolean} */
    this.reverse_ = reverse;

    const defaultShouldPrefetchNextSegment = (reference, stream) => {
      if (!stream.fastSwitching ||
          !reference.isPartial() || !reference.isLastPartial()) {
        return true;
      }
      return false;
    };

    /**
     * @private {function(!shaka.media.SegmentReference,
     *           !shaka.extern.Stream):boolean}
     */
    this.shouldPrefetchNextSegment_ =
        shouldPrefetchNextSegment || defaultShouldPrefetchNextSegment;
  }

  /**
   * @param {shaka.media.SegmentPrefetch.FetchDispatcher} fetchDispatcher
   */
  replaceFetchDispatcher(fetchDispatcher) {
    this.fetchDispatcher_ = fetchDispatcher;
    for (const operation of this.segmentPrefetchMap_.values()) {
      operation.replaceFetchDispatcher(fetchDispatcher);
    }
  }

  /**
   * Fetch next segments ahead of current time.
   *
   * @param {number} currTime
   * @param {boolean=} skipFirst
   * @return {!Promise}
   * @public
   */
  prefetchSegmentsByTime(currTime, skipFirst = false) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    if (!this.stream_.segmentIndex) {
      shaka.log.debug(logPrefix, 'missing segmentIndex');
      return Promise.resolve();
    }
    if (!this.iterator_) {
      this.iterator_ = this.stream_.segmentIndex.getIteratorForTime(
          currTime, /* allowNonIndependent= */ true, this.reverse_);
    }
    if (!this.iterator_) {
      shaka.log.debug(logPrefix, 'missing iterator');
      return Promise.resolve();
    }
    if (skipFirst) {
      this.iterator_.next();
    }
    const promises = [];
    while (this.segmentPrefetchMap_.size < this.prefetchLimit_) {
      const reference = this.iterator_.next().value;
      if (!reference) {
        break;
      }
      // By default doesn't prefetch preload partial segments when using
      // byterange
      let prefetchAllowed = true;
      if (reference.isPreload() && reference.endByte != null) {
        prefetchAllowed = false;
      }
      if (reference.getStatus() ==
          shaka.media.SegmentReference.Status.MISSING) {
        prefetchAllowed = false;
      }
      if (reference.getSegmentData(/* allowDeleteOnSingleUse= */ false)) {
        prefetchAllowed = false;
      }
      if (prefetchAllowed && reference.initSegmentReference) {
        promises.push(this.prefetchInitSegment(
            reference.initSegmentReference));
      }
      if (prefetchAllowed && !this.segmentPrefetchMap_.has(reference)) {
        const segmentPrefetchOperation =
          new shaka.media.SegmentPrefetchOperation(this.fetchDispatcher_);
        promises.push(segmentPrefetchOperation.dispatchFetch(
            reference, this.stream_));
        this.segmentPrefetchMap_.set(reference, segmentPrefetchOperation);
      }
      if (!this.shouldPrefetchNextSegment_(reference, this.stream_)) {
        break;
      }
    }
    this.clearInitSegments_();
    return Promise.all(promises);
  }

  /**
   * Fetch init segment.
   *
   * @param {!shaka.media.InitSegmentReference} initSegmentReference
   * @return {!Promise}
   */
  prefetchInitSegment(initSegmentReference) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    if (!this.stream_.segmentIndex) {
      shaka.log.debug(logPrefix, 'missing segmentIndex');
      return Promise.resolve();
    }

    if (initSegmentReference.getSegmentData()) {
      return Promise.resolve();
    }

    // init segments are ignored from the prefetch limit
    const initSegments = Array.from(this.initSegmentPrefetchMap_.keys());
    const someReference = initSegments.some((reference) => {
      return shaka.media.InitSegmentReference.equal(
          reference, initSegmentReference);
    });
    if (someReference) {
      return Promise.resolve();
    }
    const segmentPrefetchOperation = new shaka.media.SegmentPrefetchOperation(
        this.fetchDispatcher_);
    const promise = segmentPrefetchOperation.dispatchFetch(
        initSegmentReference, this.stream_);
    this.initSegmentPrefetchMap_.set(
        initSegmentReference, segmentPrefetchOperation);
    return promise;
  }

  /**
   * Get the result of prefetched segment if already exists.
   * @param {!(shaka.media.SegmentReference|
   *           shaka.media.InitSegmentReference)} reference
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   * @return {?shaka.net.NetworkingEngine.PendingRequest} op
   * @public
   */
  getPrefetchedSegment(reference, streamDataCallback) {
    goog.asserts.assert(this.prefetchLimit_ > 0,
        'SegmentPrefetch can not be used when prefetchLimit <= 0.');

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);

    let prefetchMap = this.segmentPrefetchMap_;
    if (reference instanceof shaka.media.InitSegmentReference) {
      prefetchMap = this.initSegmentPrefetchMap_;
    }

    if (prefetchMap.has(reference)) {
      const segmentPrefetchOperation = prefetchMap.get(reference);
      if (streamDataCallback) {
        segmentPrefetchOperation.setStreamDataCallback(streamDataCallback);
      }
      if (reference instanceof shaka.media.SegmentReference) {
        shaka.log.debug(
            logPrefix,
            'reused prefetched segment at time:', reference.startTime,
            'mapSize', prefetchMap.size);
      } else {
        shaka.log.debug(
            logPrefix,
            'reused prefetched init segment at time, mapSize',
            prefetchMap.size);
      }
      return segmentPrefetchOperation.getOperation();
    } else {
      if (reference instanceof shaka.media.SegmentReference) {
        shaka.log.debug(
            logPrefix,
            'missed segment at time:', reference.startTime,
            'mapSize', prefetchMap.size);
      } else {
        shaka.log.debug(
            logPrefix,
            'missed init segment at time, mapSize',
            prefetchMap.size);
      }
      return null;
    }
  }

  /**
   * Clear All Helper
   * @param {!Map<T,
   *        !shaka.media.SegmentPrefetchOperation>} map
   * @template T SegmentReference or InitSegmentReference
   * @private
   */
  clearMap_(map) {
    for (const reference of map.keys()) {
      if (reference) {
        this.abortPrefetchedSegment_(reference);
      }
    }
  }

  /** */
  resetPosition() {
    this.iterator_ = null;
  }

  /**
   * Clear all segment data.
   * @public
   */
  clearAll() {
    this.clearMap_(this.segmentPrefetchMap_);
    this.clearMap_(this.initSegmentPrefetchMap_);
    this.resetPosition();
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    shaka.log.debug(logPrefix, 'cleared all');
  }

  /**
   * Remove a reference of prefetched segment if already exists.
   * @param {!shaka.media.SegmentReference} reference
   * @public
   */
  removeReference(reference) {
    this.abortPrefetchedSegment_(reference);
  }

  /**
   * @param {number} time
   * @param {boolean=} clearInitSegments
   */
  evict(time, clearInitSegments = false) {
    for (const ref of this.segmentPrefetchMap_.keys()) {
      if (time > ref.endTime) {
        this.abortPrefetchedSegment_(ref);
      }
    }
    if (clearInitSegments) {
      this.clearInitSegments_();
    }
  }

  /**
   * @param {boolean} reverse
   */
  setReverse(reverse) {
    this.reverse_ = reverse;
    if (this.iterator_) {
      this.iterator_.setReverse(reverse);
    }
  }

  /**
   * Remove all init segments that don't have associated segments in
   * the segment prefetch map.
   * By default, with delete on get, the init segments should get removed as
   * they are used. With deleteOnGet set to false, we need to clear them
   * every so often once the segments that are associated with each init segment
   * is no longer prefetched.
   * @private
   */
  clearInitSegments_() {
    const segmentReferences = Array.from(this.segmentPrefetchMap_.keys());
    for (const initSegmentReference of this.initSegmentPrefetchMap_.keys()) {
      // if no segment references this init segment, we should remove it.
      const someReference = segmentReferences.some((segmentReference) => {
        return shaka.media.InitSegmentReference.equal(
            segmentReference.initSegmentReference, initSegmentReference);
      });
      if (!someReference) {
        this.abortPrefetchedSegment_(initSegmentReference);
      }
    }
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

    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);
    shaka.log.debug(logPrefix, 'resetting prefetch limit to', newPrefetchLimit);
    this.prefetchLimit_ = newPrefetchLimit;
    const keyArr = Array.from(this.segmentPrefetchMap_.keys());
    while (keyArr.length > newPrefetchLimit) {
      const reference = keyArr.pop();
      if (reference) {
        this.abortPrefetchedSegment_(reference);
      }
    }
    this.clearInitSegments_();
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
   * Get the current stream.
   * @public
   * @return {shaka.extern.Stream}
   */
  getStream() {
    return this.stream_;
  }

  /**
   * Remove a segment from prefetch map and abort it.
   * @param {!(shaka.media.SegmentReference|
   *           shaka.media.InitSegmentReference)} reference
   * @private
   */
  abortPrefetchedSegment_(reference) {
    const logPrefix = shaka.media.SegmentPrefetch.logPrefix_(this.stream_);

    let prefetchMap = this.segmentPrefetchMap_;
    if (reference instanceof shaka.media.InitSegmentReference) {
      prefetchMap = this.initSegmentPrefetchMap_;
    }

    const segmentPrefetchOperation = prefetchMap.get(reference);
    prefetchMap.delete(reference);

    if (segmentPrefetchOperation) {
      segmentPrefetchOperation.abort();
      if (reference instanceof shaka.media.SegmentReference) {
        shaka.log.debug(
            logPrefix,
            'pop and abort prefetched segment at time:', reference.startTime);
      } else {
        shaka.log.debug(logPrefix, 'pop and abort prefetched init segment');
      }
    }
  }

  /**
   * The prefix of the logs that are created in this class.
   * @param {shaka.extern.Stream} stream
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
   * @param {shaka.media.SegmentPrefetch.FetchDispatcher} fetchDispatcher
   */
  replaceFetchDispatcher(fetchDispatcher) {
    this.fetchDispatcher_ = fetchDispatcher;
  }

  /**
   * Fetch segments
   *
   * @param {!(shaka.media.SegmentReference|
   *           shaka.media.InitSegmentReference)} reference
   * @param {!shaka.extern.Stream} stream
   * @return {!Promise}
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
    return this.operation_.promise.catch((e) => {
      // Ignore OPERATION_ABORTED errors.
      if (e instanceof shaka.util.Error &&
          e.code == shaka.util.Error.Code.OPERATION_ABORTED) {
        return Promise.resolve();
      }
      // Continue to surface other errors.
      return Promise.reject(e);
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
