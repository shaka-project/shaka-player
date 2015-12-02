/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');



/**
 * Creates a SegmentIndex.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references The list of
 *     SegmentReferences, which must be sorted first by their start times
 *     (ascending) and second by their end times (ascending).
 *
 * @struct
 * @constructor
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


/** @override */
shaka.media.SegmentIndex.prototype.destroy = function() {
  this.references_ = null;
  return Promise.resolve();
};


/**
 * Gets the SegmentReference at the given index.
 *
 * @param {number} index
 * @return {!shaka.media.SegmentReference}
 * @throws {shaka.util.Error} when |index| is out of range.
 */
shaka.media.SegmentIndex.prototype.get = function(index) {
  if (index < 0 || index >= this.references_.length) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.SEGMENT_OUT_OF_RANGE);
  }
  return this.references_[index];
};


/**
 * Returns the SegmentReference for the specified time. If more than one
 * SegmentReference exists for the specified time then returns the one with the
 * largest index.
 *
 * @param {number} time The time in seconds.
 * @return {shaka.media.SegmentReference} The SegmentReference for the
 *     specified time, or null if no such SegmentReference exists.
 */
shaka.media.SegmentIndex.prototype.find = function(time) {
  var references =
      /** @type {!Array.<!shaka.media.SegmentReference>} */(this.references_);
  var i = shaka.media.SegmentReference.find(references, time);
  return i >= 0 ? this.references_[i] : null;
};


/**
 * Merges the given SegmentReferences.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references The list of
 *     SegmentReferences, which must be sorted first by their start times
 *     (ascending) and second by their end times (ascending).
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
      newReferences.push(r2);
      j++;
    } else {
      // Place references that end later closer to the end, and place newer
      // references after older references.
      if (r1.endTime < r2.endTime) {
        newReferences.push(r1);
        i++;
      } else {
        newReferences.push(r2);
        j++;
      }
    }
  }

  while (i < this.references_.length) {
    newReferences.push(this.references_[i++]);
  }

  while (j < references.length) {
    newReferences.push(references[j++]);
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
   * Asserts that the given SegmentReferences are correctly sorted.
   *
   * @param {!Array.<shaka.media.SegmentReference>} references
   * @private
   */
  shaka.media.SegmentIndex.assertCorrectReferences_ = function(references) {
    shaka.asserts.assert(references.every(function(r2, i) {
      if (i == 0) return true;
      var r1 = references[i - 1];
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
    }), 'SegmentReferences should be sorted.');
  };
}

