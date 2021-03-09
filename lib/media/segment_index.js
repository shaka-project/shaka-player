/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.media.SegmentIndex');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.IDestroyable');


/**
 * Creates a SegmentIndex.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references The list of
 *   SegmentReferences, which must be sorted first by their start times
 *   (ascending) and second by their end times (ascending).  They must have
 *   continuous, increasing positions.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.media.SegmentIndex = function(references) {
  if (goog.DEBUG) {
    shaka.media.SegmentIndex.assertCorrectReferences_(references);
  }

  /** @private {Array.<!shaka.media.SegmentReference>} */
  this.references_ = references;
};


/**
 * @override
 * @export
 */
shaka.media.SegmentIndex.prototype.destroy = function() {
  this.references_ = null;
  return Promise.resolve();
};


/**
 * Finds the position of the segment for the given time, in seconds, relative
 * to the start of a particular Period.  Returns the position of the segment
 * with the largest end time if more than one segment is known for the given
 * time.
 *
 * @param {number} time
 * @return {?number} The position of the segment, or null
 *   if the position of the segment could not be determined.
 * @export
 */
shaka.media.SegmentIndex.prototype.find = function(time) {
  // For live streams, searching from the end is faster.  For VOD, it balances
  // out either way.  In both cases, references_.length is small enough that the
  // difference isn't huge.
  const lastReferenceIndex = this.references_.length - 1;
  for (let i = lastReferenceIndex; i >= 0; --i) {
    const r = this.references_[i];
    const start = r.startTime;
    // A rounding error can cause /time/ to equal e.endTime or fall in between
    // the references by a fraction of a second. To account for this, we use the
    // start of the next segment as /end/, unless this is the last reference, in
    // which case we use its end time as /end/.
    const end = i < lastReferenceIndex ?
        this.references_[i + 1].startTime : r.endTime;
    // Note that a segment ends immediately before the end time.
    if ((time >= start) && (time < end)) {
      return r.position;
    }
  }
  if (this.references_.length && time < this.references_[0].startTime) {
    return this.references_[0].position;
  }

  return null;
};


/**
 * Gets the SegmentReference for the segment at the given position.
 *
 * @param {number} position The position of the segment.
 * @return {shaka.media.SegmentReference} The SegmentReference, or null if
 *   no such SegmentReference exists.
 * @export
 */
shaka.media.SegmentIndex.prototype.get = function(position) {
  if (this.references_.length == 0) {
    return null;
  }

  let index = position - this.references_[0].position;
  if (index < 0 || index >= this.references_.length) {
    return null;
  }

  return this.references_[index];
};


/**
 * Offset all segment references by a fixed amount.
 *
 * @param {number} offset The amount to add to each segment's start and end
 *   times.
 * @export
 */
shaka.media.SegmentIndex.prototype.offset = function(offset) {
  for (let i = 0; i < this.references_.length; ++i) {
    this.references_[i].startTime += offset;
    this.references_[i].endTime += offset;
  }
};


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
shaka.media.SegmentIndex.prototype.merge = function(references) {
  if (goog.DEBUG) {
    shaka.media.SegmentIndex.assertCorrectReferences_(references);
  }

  let newReferences = [];
  let i = 0;
  let j = 0;

  while ((i < this.references_.length) && (j < references.length)) {
    let r1 = this.references_[i];
    let r2 = references[j];

    if (r1.startTime < r2.startTime) {
      newReferences.push(r1);
      i++;
    } else if (r1.startTime > r2.startTime) {
      if (i == 0) {
        // If the reference appears before any existing reference, it may have
        // been evicted before; in this case, simply add it back and it will be
        // evicted again later.
        newReferences.push(r2);
      } else {
        // Drop the new reference if it would have to be interleaved with the
        // old one.  Issue a warning, since this is not a supported update.
        shaka.log.warning('Refusing to rewrite original references on update!');
      }
      j++;
    } else {
      // When period is changed, fit() will expand the last segment to the start
      // of the next period.  So, it is valid to have end time updated to the
      // last segment reference in a period.
      if (Math.abs(r1.endTime - r2.endTime) > 0.1) {
        goog.asserts.assert(r2.endTime > r1.endTime &&
            i == this.references_.length - 1 &&
            j == references.length - 1,
            'This should be an update of the last segment in a period');
        let r = new shaka.media.SegmentReference(r1.position,
            r2.startTime, r2.endTime, r2.getUris, r2.startByte, r2.endByte);
        newReferences.push(r);
      } else {
        // Drop the new reference if there's an old reference with the
        // same time.
        newReferences.push(r1);
      }
      i++;
      j++;
    }
  }

  while (i < this.references_.length) {
    newReferences.push(this.references_[i++]);
  }

  if (newReferences.length) {
    // The rest of these references may need to be renumbered.
    let nextPosition = newReferences[newReferences.length - 1].position + 1;
    while (j < references.length) {
      let r = references[j++];
      let r2 = new shaka.media.SegmentReference(nextPosition++,
          r.startTime, r.endTime, r.getUris, r.startByte, r.endByte);
      newReferences.push(r2);
    }
  } else {
    newReferences = references;
  }

  if (goog.DEBUG) {
    shaka.media.SegmentIndex.assertCorrectReferences_(newReferences);
  }

  this.references_ = newReferences;
};


/**
 * Replace existing references with new ones, without merging.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} newReferences
 */
shaka.media.SegmentIndex.prototype.replace = function(newReferences) {
  if (goog.DEBUG) {
    shaka.media.SegmentIndex.assertCorrectReferences_(newReferences);
  }
  this.references_ = newReferences;
};


/**
 * Removes all SegmentReferences that end before the given time.
 *
 * @param {number} time The time in seconds.
 * @export
 */
shaka.media.SegmentIndex.prototype.evict = function(time) {
  for (let i = 0; i < this.references_.length; ++i) {
    if (this.references_[i].endTime > time) {
      this.references_.splice(0, i);
      return;
    }
  }
  this.references_ = [];
};


/**
 * Expands the first SegmentReference so it begins at the start of its Period
 * if it already begins close to the start of its Period.
 *
 * Also expands or contracts the last SegmentReference so it ends at the end of
 * its Period.
 *
 * Do not call on the last period of a live presentation (unknown duration).
 * It is okay to call on the other periods of a live presentation, where the
 * duration is known and another period has been added.
 *
 * @param {?number} periodDuration
 */
shaka.media.SegmentIndex.prototype.fit = function(periodDuration) {
  goog.asserts.assert(periodDuration != null,
                      'Period duration must be known for static content!');
  goog.asserts.assert(periodDuration != Infinity,
                      'Period duration must be finite for static content!');

  // Trim out references we will never use.
  while (this.references_.length) {
    let lastReference = this.references_[this.references_.length - 1];
    if (lastReference.startTime >= periodDuration) {
      this.references_.pop();
    } else {
      break;
    }
  }
  while (this.references_.length) {
    let firstReference = this.references_[0];
    if (firstReference.endTime <= 0) {
      this.references_.shift();
    } else {
      break;
    }
  }

  if (this.references_.length == 0) {
    return;
  }

  // Adjust the last SegmentReference.
  let lastReference = this.references_[this.references_.length - 1];
  this.references_[this.references_.length - 1] =
      new shaka.media.SegmentReference(
          lastReference.position,
          lastReference.startTime,
          /* endTime */ periodDuration,
          lastReference.getUris,
          lastReference.startByte,
          lastReference.endByte);
};


if (goog.DEBUG) {
  /**
   * Asserts that the given SegmentReferences are sorted and have continuous,
   * increasing positions.
   *
   * @param {!Array.<shaka.media.SegmentReference>} references
   * @private
   */
  shaka.media.SegmentIndex.assertCorrectReferences_ = function(references) {
    goog.asserts.assert(references.every(function(r2, i) {
      if (i == 0) return true;
      let r1 = references[i - 1];
      if (r2.position != r1.position + 1) return false;
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

