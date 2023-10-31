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
  constructor(stream, segmentData) {
    /** @private {(Set.<!shaka.media.SegmentReference>)} */
    this.requestedReferences_ = new Set();

    /** @private {shaka.extern.Stream} */
    this.streamObj_ = stream;

    /**
     * @private {!Object.<string, shaka.test.FakeMediaSourceEngine.SegmentData>}
     */
    this.segmentData_ = segmentData;
  }

  /** @override */
  prefetchSegments(reference) {
    if (!(reference instanceof shaka.media.SegmentReference)) {
      return;
    }
    this.requestedReferences_.add(reference);
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
  }

  /** @override */
  getPrefetchedSegment(reference) {
    if (!(reference instanceof shaka.media.SegmentReference)) {
      return null;
    }
    /**
     * The unit tests assume a segment is already prefetched
     * if it was ever passed to prefetchSegments() as param.
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

  /** @override */
  prefetchInitSegment(reference) {}
};
