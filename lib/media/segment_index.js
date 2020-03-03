/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SegmentIndex');

goog.require('goog.asserts');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Timer');


/**
 * SegmentIndex.
 *
 * @implements {shaka.util.IDestroyable}
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

    /** @private {!Array.<!shaka.media.SegmentReference>} */
    this.references_ = references;

    /** @private {shaka.util.Timer} */
    this.timer_ = null;

    /** @protected {number} */
    this.currentIndex_ = 0;
  }


  /**
   * @override
   * @export
   */
  destroy() {
    this.references_ = [];

    if (this.timer_) {
      this.timer_.stop();
    }
    this.timer_ = null;

    return Promise.resolve();
  }


  /**
   * Moves the internal pointer to the current reference so that it points to
   * the segment reference for the given time, in seconds, relative to the start
   * of the presentation.
   *
   * See also current() and next(), which can be used to iterate sequentially
   * through the references after a seek().
   *
   * This should only be used by StreamingEngine.
   *
   * @param {number} time
   * @return {shaka.media.SegmentReference} The SegmentReference, or null if
   *   no such SegmentReference exists.
   * @export
   */
  seek(time) {
    // For live streams, searching from the end is typically faster.  For VOD,
    // it balances out either way on average.  In both cases, references_.length
    // is small enough that the difference isn't huge.
    for (let i = this.references_.length - 1; i >= 0; --i) {
      const r = this.references_[i];
      // Note that a segment ends immediately before the end time.
      if ((time >= r.startTime) && (time < r.endTime)) {
        this.currentIndex_ = i;
        return r;
      }
    }
    if (this.references_.length && time < this.references_[0].startTime) {
      this.currentIndex_ = 0;
      return this.references_[0];
    }

    this.currentIndex_ = this.references_.length;
    return null;
  }


  /**
   * Return the current SegmentReference according to the internal pointer
   * maintained by seek() and next().
   *
   * This should only be used by StreamingEngine.
   *
   * @return {shaka.media.SegmentReference} The current SegmentReference, or
   *   null if no such SegmentReference exists.
   * @export
   */
  current() {
    return this.references_[this.currentIndex_] || null;
  }


  /**
   * Advances the internal pointer to the next segment.
   *
   * This should only be used by StreamingEngine.
   *
   * @return {shaka.media.SegmentReference} The next SegmentReference, or
   *   null if no such SegmentReference exists.
   * @export
   */
  next() {
    this.currentIndex_++;
    return this.current();
  }


  /**
   * Offset all segment references by a fixed amount.
   *
   * @param {number} offset The amount to add to each segment's start and end
   *   times.
   * @export
   */
  offset(offset) {
    for (const ref of this.references_) {
      ref.startTime += offset;
      ref.endTime += offset;
      ref.timestampOffset += offset;
    }
  }


  /**
   * Merges the given SegmentReferences.  Supports extending the original
   * references only.  Will not replace old references or interleave new ones.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} references The list of
   *   SegmentReferences, which must be sorted first by their start times
   *   (ascending) and second by their end times (ascending).  They must have
   *   continuous, increasing positions.
   * @export
   */
  merge(references) {
    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(references);
    }

    const lastOldReference = this.references_[this.references_.length - 1];

    let newReferences = [];
    if (!this.references_.length) {
      // There are no old references, so we take all of the new ones.
      newReferences = references;
    } else {
      // There are some old ones, so we only take the new ones that overlap with
      // the last old one or come after the last old one.
      newReferences = references.filter((r) => {
        return r.startTime >= lastOldReference.startTime;
      });
    }

    // It's valid to update the last reference in the old set.  If the first new
    // ref is a match for the last old one, we'll replace the old one.
    if (lastOldReference && newReferences.length &&
        newReferences[0].startTime == lastOldReference.startTime) {
      // Remove the last entry from the old set, and the first entry from the
      // new set will replace it in push(...) below.
      this.references_.pop();
    }

    this.references_.push(...newReferences);

    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(this.references_);
    }
  }


  /**
   * Replace existing references with new ones, without merging.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} newReferences
   * @export
   */
  replace(newReferences) {
    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(newReferences);
    }
    this.references_ = newReferences;
  }


  /**
   * Removes all SegmentReferences that end before the given time.
   *
   * @param {number} time The time in seconds.
   * @export
   */
  evict(time) {
    const oldSize = this.references_.length;
    let oldCurrent;
    if (goog.DEBUG) {
      oldCurrent = this.references_[this.currentIndex_];
    }

    this.references_ = this.references_.filter((ref) => ref.endTime > time);

    // Maintain the current index.
    const newSize = this.references_.length;
    const diff = oldSize - newSize;
    this.currentIndex_ = this.currentIndex_ - diff;

    // So long as the current reference wasn't evicted, this should hold.
    if (goog.DEBUG && this.currentIndex_ >= 0) {
      const newCurrent = this.references_[this.currentIndex_];
      goog.asserts.assert(oldCurrent == newCurrent,
          'Current segment reference changed on evict!');
    }

    // If the current reference was evicted, point to a valid reference.
    if (this.currentIndex_ < 0) {
      this.currentIndex_ = 0;
    }
  }


  /**
   * Also expands or contracts the last SegmentReference so it ends at the end
   * of its Period.
   *
   * Do not call on the last period of a live presentation (unknown duration).
   * It is okay to call on the other periods of a live presentation, where the
   * duration is known and another period has been added.
   *
   * @param {number} periodStart
   * @param {?number} periodEnd
   * @export
   */
  fit(periodStart, periodEnd) {
    goog.asserts.assert(periodEnd != null,
        'Period duration must be known for static content!');
    goog.asserts.assert(periodEnd != Infinity,
        'Period duration must be finite for static content!');

    let oldCurrent;
    if (goog.DEBUG) {
      oldCurrent = this.references_[this.currentIndex_];
    }

    // Trim out references we will never use.
    while (this.references_.length) {
      const lastReference = this.references_[this.references_.length - 1];
      if (lastReference.startTime >= periodEnd) {
        this.references_.pop();
      } else {
        break;
      }
    }

    while (this.references_.length) {
      const firstReference = this.references_[0];
      if (firstReference.endTime <= periodStart) {
        this.references_.shift();
        this.currentIndex_--;
      } else {
        break;
      }
    }

    // So long as the current reference wasn't evicted, this should hold.
    if (goog.DEBUG && this.currentIndex_ >= 0) {
      const newCurrent = this.references_[this.currentIndex_];
      goog.asserts.assert(oldCurrent == newCurrent,
          'Current segment reference changed on evict!');
    }

    // If the current reference was evicted, point to a valid reference.
    if (this.currentIndex_ < 0) {
      this.currentIndex_ = 0;
    }

    if (this.references_.length == 0) {
      return;
    }

    // Adjust the last SegmentReference.
    const lastReference = this.references_[this.references_.length - 1];
    this.references_[this.references_.length - 1] =
        new shaka.media.SegmentReference(
            lastReference.position,
            lastReference.startTime,
            /* endTime= */ periodEnd,
            lastReference.getUris,
            lastReference.startByte,
            lastReference.endByte,
            lastReference.initSegmentReference,
            lastReference.timestampOffset,
            lastReference.appendWindowStart,
            lastReference.appendWindowEnd);

    if (goog.DEBUG) {
      shaka.media.SegmentIndex.assertCorrectReferences_(this.references_);
    }
  }


  /**
   * Updates the references every so often.  Stops when the references list
   * becomes empty.
   *
   * @param {number} interval The interval in seconds.
   * @param {function():!Array.<shaka.media.SegmentReference>} updateCallback
   * @export
   */
  updateEvery(interval, updateCallback) {
    goog.asserts.assert(!this.timer_, 'SegmentIndex timer already started!');
    this.timer_ = new shaka.util.Timer(() => {
      const references = updateCallback();
      this.references_.push(...references);
      if (this.references_.length == 0) {
        this.timer_.stop();
        this.timer_ = null;
      }
      if (goog.DEBUG) {
        shaka.media.SegmentIndex.assertCorrectReferences_(this.references_);
      }
    });
    this.timer_.tickEvery(interval);
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
        /* position= */ 1,
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
   * Asserts that the given SegmentReferences are sorted and have continuous,
   * increasing positions.
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
      if (r2.position != r1.position + 1) {
        return false;
      }
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

