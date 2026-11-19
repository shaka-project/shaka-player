/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SegmentByteTracker');

goog.requireType('shaka.media.SegmentReference');
goog.requireType('shaka.util.ManifestParserUtils');


/** Tracks appended media bytes against the ranges still buffered. */
shaka.media.SegmentByteTracker = class {
  /**
   * @param {function(shaka.util.ManifestParserUtils.ContentType):
   *     !Array<shaka.extern.BufferedRange>} getBufferedRanges
   */
  constructor(getBufferedRanges) {
    /** @private */
    this.getBufferedRanges_ = getBufferedRanges;

    /**
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType,
     *     !Array<shaka.media.SegmentByteTracker.AppendedSegment_>>}
     */
    this.appendedSegments_ = new Map();
  }

  /** Forgets all segments when the SourceBuffers are replaced or destroyed. */
  clear() {
    this.appendedSegments_.clear();
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {!shaka.media.SegmentReference} reference
   * @param {number} bytes
   * @param {boolean} isChunkedData
   */
  recordAppend(contentType, reference, bytes, isChunkedData) {
    const start = reference.startTime;
    const end = reference.endTime;
    if (!(bytes > 0) || !(end > start)) {
      return;
    }
    const oldSegments = this.appendedSegments_.get(contentType) || [];
    const last = oldSegments[oldSegments.length - 1];
    if (isChunkedData && last && last.reference == reference) {
      last.bytes += bytes;
      return;
    }

    const ranges = this.getBufferedRanges_(contentType);
    const segments = [];
    for (const segment of oldSegments) {
      // Keep only the parts not overwritten by the new segment.
      const parts = [
        [segment.start, Math.min(segment.end, start)],
        [Math.max(segment.start, end), segment.end],
      ];
      for (const [partStart, partEnd] of parts) {
        // Drop evicted segments so the list does not grow forever.
        if (partEnd <= partStart || !ranges.some(
            (range) => range.start < partEnd && range.end > partStart)) {
          continue;
        }
        segments.push({
          start: partStart,
          end: partEnd,
          bytes: segment.bytes * (partEnd - partStart) /
              (segment.end - segment.start),
          reference: segment.reference,
        });
      }
    }
    segments.push({start, end, bytes, reference});
    this.appendedSegments_.set(contentType, segments);
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} startTime
   * @param {number} endTime
   * @return {number} Estimated appended bytes still buffered in this interval.
   */
  bufferedBytes(contentType, startTime, endTime) {
    const segments = this.appendedSegments_.get(contentType);
    if (!segments || !segments.length) {
      return 0;
    }
    // Read the ranges now since the browser can evict data between appends.
    const ranges = this.getBufferedRanges_(contentType);
    let bytes = 0;
    for (const segment of segments) {
      let buffered = 0;
      for (const range of ranges) {
        const start = Math.max(segment.start, range.start, startTime);
        const end = Math.min(segment.end, range.end, endTime);
        buffered += Math.max(0, end - start);
      }
      const duration = segment.end - segment.start;
      bytes += segment.bytes * Math.min(1, buffered / duration);
    }
    return bytes;
  }
};


/**
 * @typedef {{
 *   start: number,
 *   end: number,
 *   bytes: number,
 *   reference: shaka.media.SegmentReference,
 * }}
 * @private
 */
shaka.media.SegmentByteTracker.AppendedSegment_;
