/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.MetaSegmentIndex');
goog.provide('shaka.media.SegmentIndex');
goog.provide('shaka.media.SegmentIterator');

goog.require('goog.asserts');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * SegmentIndex.
 *
 * @implements {shaka.util.IReleasable}
 * @implements {Iterable.<!shaka.media.SegmentReference>}
 * @export
 */
shaka.media.SegmentIndex = class {
  /**
   * @param {!Array.<!shaka.media.SegmentReference>} references The list of
   *   SegmentReferences, which must be sorted first by their start times
   *   (ascending) and second by their end times (ascending).
   */
  constructor(references) {
    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(references);
    }

    /** @protected {!Array.<!shaka.media.SegmentReference>} */
    this.references = references;

    /** @private {shaka.util.Timer} */
    this.timer_ = null;

    /**
     * The number of references that have been removed from the front of the
     * array.  Used to create stable positions in the find/get APIs.
     *
     * @protected {number}
     */
    this.numEvicted = 0;

    /** @private {boolean} */
    this.immutable_ = false;
  }


  /**
   * @override
   * @export
   */
  release() {
    if (this.immutable_) {
      return;
    }

    this.references = [];

    if (this.timer_) {
      this.timer_.stop();
    }
    this.timer_ = null;
  }


  /**
   * Marks the index as immutable.  Segments cannot be added or removed after
   * this point.  This doesn't affect the references themselves.  This also
   * makes the destroy/release methods do nothing.
   *
   * This is mainly for testing.
   *
   * @export
   */
  markImmutable() {
    this.immutable_ = true;
  }


  /**
   * Iterates over all top-level segment references in this segment index.
   * @param {function(!shaka.media.SegmentReference)} fn
   */
  forEachTopLevelReference(fn) {
    for (const reference of this.references) {
      fn(reference);
    }
  }


  /**
   * Return the earliest reference, or null if empty.
   * @return {shaka.media.SegmentReference}
   */
  earliestReference() {
    return this.references[0] || null;
  }


  /**
   * Drop the first N references.
   * Used in early HLS synchronization, and does not count as eviction.
   * @param {number} n
   */
  dropFirstReferences(n) {
    this.references.splice(0, n);
  }


  /**
   * Finds the position of the segment for the given time, in seconds, relative
   * to the start of the presentation.  Returns the position of the segment
   * with the largest end time if more than one segment is known for the given
   * time.
   *
   * @param {number} time
   * @return {?number} The position of the segment, or null if the position of
   *   the segment could not be determined.
   * @export
   */
  find(time) {
    // For live streams, searching from the end is faster.  For VOD, it balances
    // out either way.  In both cases, references.length is small enough that
    // the difference isn't huge.
    const lastReferenceIndex = this.references.length - 1;
    for (let i = lastReferenceIndex; i >= 0; --i) {
      const r = this.references[i];
      const start = r.startTime;
      // A rounding error can cause /time/ to equal e.endTime or fall in between
      // the references by a fraction of a second. To account for this, we use
      // the start of the next segment as /end/, unless this is the last
      // reference, in which case we use its end time as /end/.
      const end = i < lastReferenceIndex ?
        this.references[i + 1].startTime : r.endTime;
      // Note that a segment ends immediately before the end time.
      if ((time >= start) && (time < end)) {
        return i + this.numEvicted;
      }
    }
    if (this.references.length && time < this.references[0].startTime) {
      return this.numEvicted;
    }

    return null;
  }


  /**
   * Gets the SegmentReference for the segment at the given position.
   *
   * @param {number} position The position of the segment as returned by find().
   * @return {shaka.media.SegmentReference} The SegmentReference, or null if
   *   no such SegmentReference exists.
   * @export
   */
  get(position) {
    if (this.references.length == 0) {
      return null;
    }

    const index = position - this.numEvicted;
    if (index < 0 || index >= this.references.length) {
      return null;
    }

    return this.references[index];
  }


  /**
   * Offset all segment references by a fixed amount.
   *
   * @param {number} offset The amount to add to each segment's start and end
   *   times.
   * @export
   */
  offset(offset) {
    if (!this.immutable_) {
      for (const ref of this.references) {
        ref.offset(offset);
      }
    }
  }


  /**
   * Merges the given SegmentReferences.  Supports extending the original
   * references only.  Will replace old references with equivalent new ones, and
   * keep any unique old ones.
   *
   * Used, for example, by the DASH and HLS parser, where manifests may not list
   * all available references, so we must keep available references in memory to
   * fill the availability window.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} references The list of
   *   SegmentReferences, which must be sorted first by their start times
   *   (ascending) and second by their end times (ascending).
   */
  merge(references) {
    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(references);
    }
    if (this.immutable_) {
      return;
    }

    if (!references.length) {
      return;
    }

    // Partial segments are used for live edge, and should be removed when they
    // get older. Remove the old SegmentReferences after the first new
    // reference's start time.
    // Use times rounded to the millisecond for filtering purposes, so that
    // tiny rounding errors will not result in duplicate segments in the index.
    const firstStartTime = Math.round(references[0].startTime * 1000) / 1000;
    this.references = this.references.filter((r) => {
      return (Math.round(r.startTime * 1000) / 1000) < firstStartTime;
    });

    this.references.push(...references);

    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(this.references);
    }
  }

  /**
   * Merges the given SegmentReferences and evicts the ones that end before the
   * given time.  Supports extending the original references only.
   * Will not replace old references or interleave new ones.
   * Used, for example, by the DASH and HLS parser, where manifests may not list
   * all available references, so we must keep available references in memory to
   * fill the availability window.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} references The list of
   *   SegmentReferences, which must be sorted first by their start times
   *   (ascending) and second by their end times (ascending).
   * @param {number} windowStart The start of the availability window to filter
   *   out the references that are no longer available.
   * @export
   */
  mergeAndEvict(references, windowStart) {
    // Filter out the references that are no longer available to avoid
    // repeatedly evicting them and messing up eviction count.
    references = references.filter((r) => {
      return r.endTime > windowStart &&
          (this.references.length == 0 ||
           r.endTime > this.references[0].startTime);
    });

    const oldFirstRef = this.references[0];
    this.merge(references);
    const newFirstRef = this.references[0];

    if (oldFirstRef) {
      // We don't compare the actual ref, since the object could legitimately be
      // replaced with an equivalent.  Even the URIs could change due to
      // load-balancing actions taken by the server.  However, if the time
      // changes, its not an equivalent reference.
      goog.asserts.assert(oldFirstRef.startTime == newFirstRef.startTime,
          'SegmentIndex.merge should not change the first reference time!');
    }

    this.evict(windowStart);
  }

  /**
   * Removes all SegmentReferences that end before the given time.
   *
   * @param {number} time The time in seconds.
   * @export
   */
  evict(time) {
    if (this.immutable_) {
      return;
    }

    const oldSize = this.references.length;

    this.references = this.references.filter((ref) => ref.endTime > time);

    const newSize = this.references.length;
    const diff = oldSize - newSize;
    // Tracking the number of evicted refs will keep their "positions" stable
    // for the caller.
    this.numEvicted += diff;
  }


  /**
   * Drops references that start after windowEnd, or end before windowStart,
   * and contracts the last reference so that it ends at windowEnd.
   *
   * Do not call on the last period of a live presentation (unknown duration).
   * It is okay to call on the other periods of a live presentation, where the
   * duration is known and another period has been added.
   *
   * @param {number} windowStart
   * @param {?number} windowEnd
   * @param {boolean=} isNew Whether this is a new SegmentIndex and we shouldn't
   *   update the number of evicted elements.
   * @export
   */
  fit(windowStart, windowEnd, isNew = false) {
    goog.asserts.assert(windowEnd != null,
        'Content duration must be known for static content!');
    goog.asserts.assert(windowEnd != Infinity,
        'Content duration must be finite for static content!');
    if (this.immutable_) {
      return;
    }

    // Trim out references we will never use.
    while (this.references.length) {
      const lastReference = this.references[this.references.length - 1];
      if (lastReference.startTime >= windowEnd) {
        this.references.pop();
      } else {
        break;
      }
    }

    while (this.references.length) {
      const firstReference = this.references[0];
      if (firstReference.endTime <= windowStart) {
        this.references.shift();
        if (!isNew) {
          this.numEvicted++;
        }
      } else {
        break;
      }
    }

    if (this.references.length == 0) {
      return;
    }

    // Adjust the last SegmentReference.
    const lastReference = this.references[this.references.length - 1];
    this.references[this.references.length - 1] =
        new shaka.media.SegmentReference(
            lastReference.startTime,
            /* endTime= */ windowEnd,
            lastReference.getUrisInner,
            lastReference.startByte,
            lastReference.endByte,
            lastReference.initSegmentReference,
            lastReference.timestampOffset,
            lastReference.appendWindowStart,
            lastReference.appendWindowEnd,
            lastReference.partialReferences,
            lastReference.tilesLayout,
            lastReference.tileDuration,
            lastReference.syncTime,
            lastReference.status,
            lastReference.hlsAes128Key,
        );
    this.references[this.references.length - 1].discontinuitySequence =
        lastReference.discontinuitySequence;
  }


  /**
   * Updates the references every so often.  Stops when the references list
   * returned by the callback is null.
   *
   * @param {number} interval The interval in seconds.
   * @param {function():Array.<shaka.media.SegmentReference>} updateCallback
   * @export
   */
  updateEvery(interval, updateCallback) {
    goog.asserts.assert(!this.timer_, 'SegmentIndex timer already started!');
    if (this.immutable_) {
      return;
    }
    if (this.timer_) {
      this.timer_.stop();
    }

    this.timer_ = new shaka.util.Timer(() => {
      const references = updateCallback();
      if (references) {
        this.references.push(...references);
      } else {
        this.timer_.stop();
        this.timer_ = null;
      }
    });
    this.timer_.tickEvery(interval);
  }


  /** @return {!shaka.media.SegmentIterator} */
  [Symbol.iterator]() {
    const iter = this.getIteratorForTime(0);
    goog.asserts.assert(iter != null, 'Iterator for 0 should never be null!');
    return iter;
  }

  /**
   * Returns a new iterator that initially points to the segment that contains
   * the given time.  Like the normal iterator, next() must be called first to
   * get to the first element. Returns null if we do not find a segment at the
   * requested time.
   *
   * @param {number} time
   * @return {?shaka.media.SegmentIterator}
   * @export
   */
  getIteratorForTime(time) {
    let index = this.find(time);
    if (index == null) {
      return null;
    } else {
      index--;
    }
    // +1 so we can get the element we'll eventually point to so we can see if
    // we need to use a partial segment index.
    const ref = this.get(index + 1);

    let partialSegmentIndex = -1;
    if (ref && ref.hasPartialSegments()) {
      // Look for a partial SegmentReference.
      for (let i = ref.partialReferences.length - 1; i >= 0; --i) {
        const r = ref.partialReferences[i];
        // Note that a segment ends immediately before the end time.
        if ((time >= r.startTime) && (time < r.endTime)) {
          // Call to next() should move the partial segment, not the full
          // segment.
          index++;
          partialSegmentIndex = i - 1;
          break;
        }
      }
    }
    return new shaka.media.SegmentIterator(this, index, partialSegmentIndex);
  }

  /**
   * @return {boolean}
   */
  isEmpty() {
    return this.references.length == 0;
  }

  /**
   * Create a SegmentIndex for a single segment of the given start time and
   * duration at the given URIs.
   *
   * @param {number} startTime
   * @param {number} duration
   * @param {!Array.<string>} uris
   * @return {!shaka.media.SegmentIndex}
   * @export
   */
  static forSingleSegment(startTime, duration, uris) {
    const reference = new shaka.media.SegmentReference(
        /* startTime= */ startTime,
        /* endTime= */ startTime + duration,
        /* getUris= */ () => uris,
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* presentationTimeOffset= */ startTime,
        /* appendWindowStart= */ startTime,
        /* appendWindowEnd= */ startTime + duration);
    return new shaka.media.SegmentIndex([reference]);
  }
};


if (goog.DEBUG) {
  /**
   * Asserts that the given SegmentReferences are sorted.
   *
   * @param {!Array.<shaka.media.SegmentReference>} references
   * @private
   */
  shaka.media.SegmentIndex.assertCorrectReferences_ = (references) => {
    goog.asserts.assert(references.every((r2, i) => {
      if (i == 0) {
        return true;
      }
      const r1 = references[i - 1];
      if (r1.startTime < r2.startTime) {
        return true;
      } else if (r1.startTime > r2.startTime) {
        return false;
      } else {
        if (r1.endTime <= r2.endTime) {
          return true;
        } else {
          return false;
        }
      }
    }), 'SegmentReferences are incorrect');
  };
}


/**
 * An iterator over a SegmentIndex's references.
 *
 * @implements {Iterator.<shaka.media.SegmentReference>}
 * @export
 */
shaka.media.SegmentIterator = class {
  /**
   * @param {shaka.media.SegmentIndex} segmentIndex
   * @param {number} index
   * @param {number} partialSegmentIndex
   */
  constructor(segmentIndex, index, partialSegmentIndex) {
    /** @private {shaka.media.SegmentIndex} */
    this.segmentIndex_ = segmentIndex;

    /** @private {number} */
    this.currentPosition_ = index;

    /** @private {number} */
    this.currentPartialPosition_ = partialSegmentIndex;
  }

  /**
   * @return {number}
   * @export
   */
  currentPosition() {
    return this.currentPosition_;
  }

  /**
   * @return {shaka.media.SegmentReference}
   * @export
   */
  current() {
    let ref = this.segmentIndex_.get(this.currentPosition_);

    // When we advance past the end of partial references in next(), then add
    // new references in merge(), the pointers may not make sense any more.
    // This adjusts the invalid pointer values to point to the next newly added
    // segment or partial segment.
    if (ref && ref.hasPartialSegments() && ref.getUris().length &&
        this.currentPartialPosition_ >= ref.partialReferences.length) {
      this.currentPosition_++;
      this.currentPartialPosition_ = 0;
      ref = this.segmentIndex_.get(this.currentPosition_);
    }

    // If the regular segment contains partial segments, get the current
    // partial SegmentReference.
    if (ref && ref.hasPartialSegments()) {
      const partial = ref.partialReferences[this.currentPartialPosition_];
      return partial;
    }
    return ref;
  }

  /**
   * @override
   * @export
   */
  next() {
    const ref = this.segmentIndex_.get(this.currentPosition_);

    if (ref && ref.hasPartialSegments()) {
      // If the regular segment contains partial segments, move to the next
      // partial SegmentReference.
      this.currentPartialPosition_++;
      // If the current regular segment has been published completely (has a
      // valid Uri), and we've reached the end of its partial segments list,
      // move to the next regular segment.
      // If the Partial Segments list is still on the fly, do not move to
      // the next regular segment.
      if (ref.getUris().length &&
          this.currentPartialPosition_ == ref.partialReferences.length) {
        this.currentPosition_++;
        this.currentPartialPosition_ = 0;
      }
    } else {
      // If the regular segment doesn't contain partial segments, move to the
      // next regular segment.
      this.currentPosition_++;
      this.currentPartialPosition_ = 0;
    }

    const res = this.current();

    return {
      'value': res,
      'done': !res,
    };
  }
};


/**
 * A meta-SegmentIndex composed of multiple other SegmentIndexes.
 * Used in constructing multi-Period Streams for DASH.
 *
 * @extends shaka.media.SegmentIndex
 * @implements {shaka.util.IReleasable}
 * @implements {Iterable.<!shaka.media.SegmentReference>}
 * @export
 */
shaka.media.MetaSegmentIndex = class extends shaka.media.SegmentIndex {
  /** */
  constructor() {
    super([]);

    /** @private {!Array.<!shaka.media.SegmentIndex>} */
    this.indexes_ = [];
  }

  /**
   * Append a SegmentIndex to this MetaSegmentIndex.  This effectively stitches
   * the underlying Stream onto the end of the multi-Period Stream represented
   * by this MetaSegmentIndex.
   *
   * @param {!shaka.media.SegmentIndex} segmentIndex
   */
  appendSegmentIndex(segmentIndex) {
    goog.asserts.assert(
        this.indexes_.length == 0 || segmentIndex.numEvicted == 0,
        'Should not append a new segment index with already-evicted segments');
    this.indexes_.push(segmentIndex);
  }

  /**
   * Create a clone of this MetaSegmentIndex containing all the same indexes.
   *
   * @return {!shaka.media.MetaSegmentIndex}
   */
  clone() {
    const clone = new shaka.media.MetaSegmentIndex();
    // Be careful to clone the Array.  We don't want to share the reference with
    // our clone and affect each other accidentally.
    clone.indexes_ = this.indexes_.slice();
    return clone;
  }

  /**
   * @override
   * @export
   */
  release() {
    for (const index of this.indexes_) {
      index.release();
    }

    this.indexes_ = [];
  }

  /**
   * @override
   * @export
   */
  find(time) {
    let numPassedInEarlierIndexes = 0;

    for (const index of this.indexes_) {
      const position = index.find(time);

      if (position != null) {
        return position + numPassedInEarlierIndexes;
      }

      numPassedInEarlierIndexes += index.numEvicted + index.references.length;
    }

    return null;
  }

  /**
   * @override
   * @export
   */
  get(position) {
    let numPassedInEarlierIndexes = 0;
    let sawSegments = false;

    for (const index of this.indexes_) {
      goog.asserts.assert(
          !sawSegments || index.numEvicted == 0,
          'Should not see evicted segments after available segments');
      const reference = index.get(position - numPassedInEarlierIndexes);

      if (reference) {
        return reference;
      }

      numPassedInEarlierIndexes += index.numEvicted + index.references.length;
      sawSegments = sawSegments || index.references.length != 0;
    }

    return null;
  }

  /**
   * @override
   * @export
   */
  offset(offset) {
    // offset() is only used by HLS, and MetaSegmentIndex is only used for DASH.
    goog.asserts.assert(
        false, 'offset() should not be used in MetaSegmentIndex!');
  }

  /**
   * @override
   * @export
   */
  merge(references) {
    // merge() is only used internally by the DASH and HLS parser on
    // SegmentIndexes, but never on MetaSegmentIndex.
    goog.asserts.assert(
        false, 'merge() should not be used in MetaSegmentIndex!');
  }

  /**
   * @override
   * @export
   */
  evict(time) {
    // evict() is only used internally by the DASH and HLS parser on
    // SegmentIndexes, but never on MetaSegmentIndex.
    goog.asserts.assert(
        false, 'evict() should not be used in MetaSegmentIndex!');
  }

  /**
   * @override
   * @export
   */
  mergeAndEvict(references, windowStart) {
    // mergeAndEvict() is only used internally by the DASH and HLS parser on
    // SegmentIndexes, but never on MetaSegmentIndex.
    goog.asserts.assert(
        false, 'mergeAndEvict() should not be used in MetaSegmentIndex!');
  }

  /**
   * @override
   * @export
   */
  fit(windowStart, windowEnd) {
    // fit() is only used internally by manifest parsers on SegmentIndexes, but
    // never on MetaSegmentIndex.
    goog.asserts.assert(false, 'fit() should not be used in MetaSegmentIndex!');
  }

  /**
   * @override
   * @export
   */
  updateEvery(interval, updateCallback) {
    // updateEvery() is only used internally by the DASH parser on
    // SegmentIndexes, but never on MetaSegmentIndex.
    goog.asserts.assert(
        false, 'updateEvery() should not be used in MetaSegmentIndex!');
  }
};
