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
 *   (ascending) and second by their end times (ascending), and have
 *   continuous, increasing positions.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.media.SegmentIndex = function(references) {
  if (!COMPILED) {
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
 * to the start of a particular Period. Returns the position of the segment
 * with the largest end time if more than one segment is known for the given
 * time.
 *
 * @param {number} time
 * @return {?number} The position of the segment, or null
 *   if the position of the segment could not be determined.
 * @export
 */
shaka.media.SegmentIndex.prototype.find = function(time) {
  // For live streams, searching from the end is faster. For VOD, it balances
  // out either way. In both cases, references_.length is small enough that the
  // difference isn't huge.
  for (var i = this.references_.length - 1; i >= 0; --i) {
    var r = this.references_[i];
    // Note that a segment ends immediately before the end time.
    if ((time >= r.startTime) && (time < r.endTime)) {
      return r.position;
    }
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
  if (this.references_.length == 0)
    return null;

  var index = position - this.references_[0].position;
  if (index < 0 || index >= this.references_.length)
    return null;

  return this.references_[index];
};


/**
 * Merges the given SegmentReferences.  Supports extending the original
 * references only.  Will not replace old references or interleave new ones.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references The list of
 *   SegmentReferences, which must be sorted first by their start times
 *   (ascending) and second by their end times (ascending), and have
 *   continuous, increasing positions.
 * @export
 */
shaka.media.SegmentIndex.prototype.merge = function(references) {
  if (!COMPILED) {
    shaka.media.SegmentIndex.assertCorrectReferences_(references);
  }

  var newReferences = [];
  var i = 0;
  var j = 0;

  while ((i < this.references_.length) && (j < references.length)) {
    var r1 = this.references_[i];
    var r2 = references[j];

    if (r1.startTime < r2.startTime) {
      newReferences.push(r1);
      i++;
    } else if (r1.startTime > r2.startTime) {
      // Drop the new reference if it would have to be interleaved with the
      // old one.  Issue a warning, since this is not a supported update.
      shaka.log.warning('Refusing to rewrite original references on update!');
      j++;
    } else {
      // When period is changed, fitSegmentReference will expand the last
      // segment to the start of the next period.  So, it is valid to have end
      // time updated to the last segment reference in a period
      if (Math.abs(r1.endTime - r2.endTime) > 0.1) {
        goog.asserts.assert(r2.endTime > r1.endTime &&
            i == this.references_.length - 1 &&
            j == references.length - 1,
            'This should be an update of the last segment in a period');
        newReferences.push(r2);
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
    // The rest of these refs may need to be renumbered.
    var nextPosition = newReferences[newReferences.length - 1].position + 1;
    while (j < references.length) {
      var r = references[j++];
      var r2 = new shaka.media.SegmentReference(nextPosition++,
          r.startTime, r.endTime, r.getUris, r.startByte, r.endByte);
      newReferences.push(r2);
    }
  } else {
    newReferences = references;
  }

  if (!COMPILED) {
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
  for (var i = 0; i < this.references_.length; ++i) {
    if (this.references_[i].endTime > time)
      break;
  }
  this.references_.splice(0, i);
};


if (!COMPILED) {
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
      var r1 = references[i - 1];
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

