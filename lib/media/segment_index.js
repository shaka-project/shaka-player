/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements a segment index.
 */

goog.provide('shaka.media.SegmentIndex');

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentRange');
goog.require('shaka.media.SegmentReference');



/**
 * Creates a SegmentIndex.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references Sorted by time in
 *     ascending order with no gaps.
 * @constructor
 * @struct
 */
shaka.media.SegmentIndex = function(references) {
  shaka.asserts.assert(
      references.every(function(item, index) {
        if (index == 0) return true;
        var previousItem = references[index - 1];
        return (item.startTime >= previousItem.startTime) &&
               (item.startTime <= previousItem.endTime) &&
               ((item.endTime && item.endTime >= previousItem.endTime) ||
                (index == references.length - 1));
      }),
      'SegmentReferences should be sorted without gaps.');

  /** @private {!Array.<!shaka.media.SegmentReference>} */
  this.references_ = references;
};


/**
 * Gets the number of SegmentReferences.
 *
 * @return {number}
 */
shaka.media.SegmentIndex.prototype.length = function() {
  return this.references_.length;
};


/**
 * Gets the first SegmentReference.
 *
 * @return {!shaka.media.SegmentReference} The first SegmentReference.
 * @throws {RangeError} when there are no SegmentReferences.
 */
shaka.media.SegmentIndex.prototype.first = function() {
  if (this.references_.length == 0) {
    throw new RangeError('SegmentIndex: There is no first SegmentReference.');
  }
  return this.references_[0];
};


/**
 * Gets the last SegmentReference.
 *
 * @return {!shaka.media.SegmentReference} The last SegmentReference.
 * @throws {RangeError} when there are no SegmentReferences.
 */
shaka.media.SegmentIndex.prototype.last = function() {
  if (this.references_.length == 0) {
    throw new RangeError('SegmentIndex: There is no last SegmentReference.');
  }
  return this.references_[this.references_.length - 1];
};


/**
 * Gets the SegmentReference at the given index.
 *
 * @param {number} index
 * @return {!shaka.media.SegmentReference}
 * @throws {RangeError} when |index| is out of range.
 */
shaka.media.SegmentIndex.prototype.get = function(index) {
  if (index < 0 || index >= this.references_.length) {
    throw new RangeError('SegmentIndex: The specified index is out of range.');
  }

  return this.references_[index];
};


/**
 * Gets the SegmentRange that contains the timestamps |startTime| and
 * |startTime| + |duration|.
 *
 * @param {number} startTime The starting time in seconds.
 * @param {number} duration The interval's duration in seconds.
 * @return {shaka.media.SegmentRange} The SegmentRange or null if there are no
 *     segments.
 */
shaka.media.SegmentIndex.prototype.getRangeForInterval =
    function(startTime, duration) {
  var beginIndex = this.find(startTime);
  if (beginIndex < 0) {
    return null;
  }

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  for (var i = beginIndex; i < this.references_.length; i++) {
    references.push(this.references_[i]);
    var endTime = this.references_[i].endTime;
    // Note: the end time is exclusive!
    if (!endTime || (endTime > startTime + duration)) {
      break;
    }
  }

  return new shaka.media.SegmentRange(references);
};


/**
 * Gets the index of the SegmentReference for the specified time.
 *
 * @param {number} time The time in seconds.
 * @return {number} The index of the SegmentReference for the specified time.
 *     0 is returned if |time| is less than the first segment's start time. The
 *     index of the last SegmentReference is returned if |time| is greater than
 *     the last segment's start time. -1 is returned if there are no segments.
 */
shaka.media.SegmentIndex.prototype.find = function(time) {
  for (var i = 0; i < this.references_.length; i++) {
    if (this.references_[i].startTime > time) {
      return i ? i - 1 : 0;
    }
  }

  // |time| is greater than or equal to the last segment's start time or there
  // are no SegmentReferences.
  return this.references_.length - 1;
};


/**
 * Merges |segmentIndex| into this one. Only merges |segmentIndex| if it covers
 * times greater than or equal to times that this SegmentIndex covers.
 *
 * @param {!shaka.media.SegmentIndex} segmentIndex
 */
shaka.media.SegmentIndex.prototype.merge = function(segmentIndex) {
  if (this.length() == 0) {
    this.references_ = segmentIndex.references_.slice(0);
    return;
  }

  if (segmentIndex.length() == 0) {
    shaka.log.debug('Nothing to merge: new SegmentIndex is empty.');
    return;
  }

  if (this.last().endTime == null) {
    shaka.log.debug(
        'Nothing to merge:',
        'existing SegmentIndex ends at the end of the stream.');
    return;
  }

  if ((segmentIndex.last().endTime != null) &&
      (segmentIndex.last().endTime < this.last().endTime)) {
    shaka.log.debug(
        'Nothing to merge:',
        'new SegmentIndex ends before the existing one ends.');
    return;
  }

  // The new SegmentIndex starts after the existing SegmentIndex.
  if (this.last().endTime <= segmentIndex.first().startTime) {
    // Adjust the last existing segment so that it starts at the the start of
    // the first new segment.
    var adjustedReference = this.last().adjust(
        this.last().startTime, segmentIndex.first().startTime);
    var head = this.references_.slice(0, -1).concat([adjustedReference]);
    this.references_ = head.concat(segmentIndex.references_);
    return;
  }

  // The new SegmentIndex starts before or in the middle of the existing
  // SegmentIndex.
  var i;
  for (i = 0; i < this.references_.length; ++i) {
    if (this.references_[i].endTime >= segmentIndex.first().startTime) {
      break;
    }
  }
  shaka.asserts.assert(i < this.references_.length);

  var head;
  if (this.references_[i].startTime < segmentIndex.first().startTime) {
    // The first new segment starts in the middle of an existing segment, so
    // compress the existing segment such that it ends at the start of the
    // first new segment.
    var adjustedReference = this.references_[i].adjust(
        this.references_[i].startTime, segmentIndex.first().startTime);
    head = this.references_.slice(0, i).concat([adjustedReference]);
  } else {
    // The first new segment either starts before all existing segments or at
    // the start of an existing segment.
    shaka.asserts.assert(
        (this.first().startTime > segmentIndex.first().startTime) ||
        (this.references_[i].startTime == segmentIndex.first().startTime));
    head = this.references_.slice(0, i);
  }
  this.references_ = head.concat(segmentIndex.references_);
};


/**
 * Removes the SegmentReferences that end at or before the given time.
 * @param {number} minEndTime
 */
shaka.media.SegmentIndex.prototype.evict = function(minEndTime) {
  if (this.references_.length == 0) {
    return;
  }

  if (this.last().endTime <= minEndTime) {
    this.references_ = [];
    return;
  }

  var i = this.find(minEndTime);
  shaka.asserts.assert(i >= 0);
  this.references_ = this.references_.slice(i);
};

