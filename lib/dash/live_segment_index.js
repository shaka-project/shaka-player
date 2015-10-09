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

goog.provide('shaka.dash.LiveSegmentIndex');

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Clock');



/**
 * Creates a SegmentIndex that supports live DASH content.
 *
 * A LiveSegmentIndex automatically evicts SegmentReferences that are no longer
 * available. However, it does not generate any new SegmentReferences.
 * Additional SegmentReferences can be added to the SegmentIndex by integrating
 * another SegmentIndex into it.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references The set of
 *     SegmentReferences. The live-edge is the start time of the last
 *     SegmentReference.
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @constructor
 * @struct
 * @extends {shaka.media.SegmentIndex}
 */
shaka.dash.LiveSegmentIndex = function(
    references, mpd, period, manifestCreationTime) {
  shaka.asserts.assert(mpd.availabilityStartTime != null);
  shaka.asserts.assert(period.start != null);

  shaka.media.SegmentIndex.call(this, references);

  /** @protected {!shaka.dash.mpd.Mpd} */
  this.mpd = mpd;

  /** @protected {!shaka.dash.mpd.Period} */
  this.period = period;

  /** @protected {number} */
  this.manifestCreationTime = manifestCreationTime;

  /** @protected {?number} */
  this.duration = this.mpd.mediaPresentationDuration ||
      this.mpd.periods.reduce(function(all, part) {
        if (part.duration == null) {
          return NaN;
        } else {
          return all + part.duration;
        }
      }, 0) || 0;

  /**
   * Either the current presentation time when the manifest was created, in
   * seconds, or null if this SegmentIndex has never contained any
   * SegmentReferences.
   *
   * @private {?number}
   */
  this.originalPresentationTime_ = null;

  /**
   * Either the time of the live-edge when the manifest was created, in
   * seconds, or null if this SegmentIndex has never contained any
   * SegmentReferences.
   *
   * The original live-edge is the same as the original latest available
   * segment start time. The live-edge is not taken to be the end time of the
   * last SegmentReference (i.e., the latest available segment end time), as if
   * it were, there wouldn't be any content in front of the playhead during
   * stream startup.
   *
   * @private {?number}
   */
  this.originalLiveEdge_ = null;

  /**
   * Either the seek start time, in seconds, or null if this SegmentIndex has
   * never contained any SegmentReferences.
   *
   * The seek start time moves "continuously" from the start of the earliest
   * available segment to the end of the earliest available segment. It is not
   * taken as the earliest available segment start time directly because if it
   * were, it would end up moving stepwise, which is undesirable.
   *
   * @private {?number}
   */
  this.seekStartTime_ = null;

  this.initializeSeekWindow();
};
goog.inherits(shaka.dash.LiveSegmentIndex, shaka.media.SegmentIndex);


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.LiveSegmentIndex.prototype.destroy = function() {
  this.mpd = null;
  this.period = null;
  shaka.media.SegmentIndex.prototype.destroy.call(this);
};


/** @override */
shaka.dash.LiveSegmentIndex.prototype.find = function(time) {
  return this.findInternal(time, shaka.util.Clock.now() / 1000.0);
};


/**
 * Finds a SegmentReference for the specified time.
 *
 * @param {number} targetTime The time in seconds.
 * @param {number} wallTime The current wall-clock time in seconds.
 * @return {shaka.media.SegmentReference}
 * @protected
 */
shaka.dash.LiveSegmentIndex.prototype.findInternal = function(
    targetTime, wallTime) {
  this.evict_(wallTime);
  return shaka.media.SegmentIndex.prototype.find.call(this, targetTime);
};


/** @override */
shaka.dash.LiveSegmentIndex.prototype.integrate = function(segmentIndex) {
  if (!(segmentIndex instanceof shaka.dash.LiveSegmentIndex)) {
    shaka.log.warning('Cannot integrate SegmentIndex:',
                      'Only a LiveSegmentIndex can be integrated into',
                      'another LiveSegmentIndex.',
                      this);
    return false;
  }
  var temp = /** @type {shaka.dash.LiveSegmentIndex} */ (segmentIndex);

  this.merge(segmentIndex);
  this.duration = Math.max(this.duration, temp.duration);

  if (this.originalPresentationTime_ == null) {
    this.manifestCreationTime = temp.manifestCreationTime;
    this.initializeSeekWindow();
  } else {
    this.evictEnd_();
  }
  return true;
};


/**
 * Initializes the seek window, if possible, during construction or after
 * integrating a SegmentIndex.
 *
 * @protected
 */
shaka.dash.LiveSegmentIndex.prototype.initializeSeekWindow = function() {
  shaka.asserts.assert(this.originalPresentationTime_ == null);
  shaka.asserts.assert(this.originalLiveEdge_ == null);
  shaka.asserts.assert(this.seekStartTime_ == null);

  this.evictEnd_();
  if (this.length() == 0) {
    return;
  }

  this.setOriginalPresentationTime_();
  this.originalLiveEdge_ = this.last().startTime;
  this.seekStartTime_ = this.first().startTime;

  shaka.log.v1('originalPresentationTime_', this.originalPresentationTime_);
  shaka.log.v1('originalLiveEdge_', this.originalLiveEdge_);
  shaka.log.v1('seekStartTime_', this.seekStartTime_);

  if (!COMPILED) {
    var delta = (shaka.util.Clock.now() / 1000.0) - this.manifestCreationTime;
    var currentPresentationTime = this.originalPresentationTime_ + delta;
    if (this.originalLiveEdge_ > currentPresentationTime) {
      shaka.log.error(
          'The live-edge (' + this.originalLiveEdge_ + ')',
          'should not be greater than',
          'the current presentation time (' + currentPresentationTime + ')');
    }
  }
};


/**
 * Sets the original presentation time.
 *
 * @private
 */
shaka.dash.LiveSegmentIndex.prototype.setOriginalPresentationTime_ =
    function() {
  shaka.asserts.assert(this.length() > 0);

  var fallback = this.last().endTime != null ?
                 this.last().endTime :
                 this.last().startTime;

  if (this.mpd.availabilityStartTime > this.manifestCreationTime) {
    shaka.log.warning('The stream might not be available yet!', this.period);
    this.originalPresentationTime_ = fallback;
    return;
  }

  var currentPresentationTime =
      this.manifestCreationTime -
      (this.mpd.availabilityStartTime + this.period.start);
  if (currentPresentationTime < 0) {
    shaka.log.warning('The Period might not be available yet!', this.period);
    this.originalPresentationTime_ = fallback;
    return;
  }

  if (currentPresentationTime <
      Math.max(this.last().startTime, this.last().endTime || 0)) {
    // Some SegmentReferences shouldn't be available yet, yet they were
    // included in the MPD; assume that @availabilityStartTime is inaccurate.
    shaka.log.warning(
        '@availabilityStartTime seems to be inaccurate;',
        'some segments may not be available yet:',
        'currentPresentationTime', currentPresentationTime,
        'latestAvailableSegmentEndTime', this.last().endTime);
    this.originalPresentationTime_ = fallback;
    return;
  }

  this.originalPresentationTime_ = currentPresentationTime;
};


/** @override */
shaka.dash.LiveSegmentIndex.prototype.correct = function(timestampCorrection) {
  var delta = shaka.media.SegmentIndex.prototype.correct.call(
      this, timestampCorrection);

  var max = Math.min.apply(null,
      this.references
        .filter(function(a) { return a.endTime != null; })
        .map(function(a) { return a.endTime - a.startTime; }));
  if (Math.abs(delta) > max) {
    // A timestamp correction should be less than the duration of any one
    // segment in the stream.
    shaka.log.warning(
        'Timestamp correction (' + timestampCorrection + ')',
        'is unreasonably large for live content.',
        'The content may have errors in it.');
  }

  if (this.originalPresentationTime_ != null) {
    shaka.asserts.assert(this.originalLiveEdge_ != null);
    shaka.asserts.assert(this.seekStartTime_ != null);

    this.originalLiveEdge_ += delta;
    this.seekStartTime_ += delta;
    this.originalPresentationTime_ += delta;

    shaka.asserts.assert(this.originalLiveEdge_ <=
                         this.originalPresentationTime_);
  }

  return delta;
};


/** @override */
shaka.dash.LiveSegmentIndex.prototype.getSeekRange = function() {
  return this.getSeekRangeInternal(shaka.util.Clock.now() / 1000.0);
};


/**
 * @param {number} wallTime The wall-clock time in seconds.
 * @return {{start: number, end: ?number}}
 * @protected
 */
shaka.dash.LiveSegmentIndex.prototype.getSeekRangeInternal = function(
    wallTime) {
  this.evict_(wallTime);

  if (this.originalPresentationTime_ == null ||
      this.originalLiveEdge_ == null ||
      this.seekStartTime_ == null) {
    return { start: 0, end: 0 };
  }

  var streamEnd = Number.POSITIVE_INFINITY;
  if (this.duration) {
    streamEnd = this.duration;
  }

  var manifestAge = wallTime - this.manifestCreationTime;
  var currentPresentationTime = this.originalPresentationTime_ + manifestAge;

  // Update the seek start time.
  if (this.mpd.timeShiftBufferDepth != null) {
    var seekWindow = currentPresentationTime - this.seekStartTime_;
    shaka.asserts.assert(seekWindow >= 0);
    var seekWindowSurplus = seekWindow - this.mpd.timeShiftBufferDepth;

    // Don't move the seek start time if it results in a seek window less than
    // @timeShiftBufferDepth.
    if (seekWindowSurplus > 0) {
      this.seekStartTime_ += seekWindowSurplus;
    }
  }
  this.seekStartTime_ = Math.min(this.seekStartTime_, streamEnd);

  if (!COMPILED) {
    if (this.length() > 0) {
      shaka.asserts.assert(
          this.seekStartTime_ >= this.first().startTime,
          'The seek start time (' + this.seekStartTime_ + ')' +
          'should not be less than' +
          'the first segment\'s start time (' + this.first().startTime + ')');
    }
  }


  var currentLiveEdge = this.originalLiveEdge_ + manifestAge;
  if (currentLiveEdge < this.seekStartTime_) {
    // The seek window has moved past the last segment; the stream may have
    // stopped broadcasting or the manifest may be malformed (e.g.
    // @availabilityStartTime may be large compared to the segment start/end).
    return { start: this.seekStartTime_, end: this.seekStartTime_ };
  }

  // Compute the seek end time. Allow the seek end time to move into the last
  // segment (in the usual case), so we can play-out the last segment.
  var targetSeekEndTime;
  if (this.length() > 0) {
    targetSeekEndTime =
        this.last().endTime != null ?
        Math.min(currentLiveEdge, this.last().endTime) :
        currentLiveEdge;
  } else {
    targetSeekEndTime = this.seekStartTime_;
  }

  // If we are not receiving any new SegmentReferences then the seek start time
  // may surpass the end time of the last SegmentReference (although, it will
  // never surpass the live-edge). This last SegmentReference may not have been
  // evicted because the seek window is smaller (by two segments) than the
  // available segment range.
  if (!COMPILED) {
    if (this.seekStartTime_ > targetSeekEndTime) {
      shaka.log.debug(
          'The seek start time (' + this.seekStartTime_ + ')',
          'has surpassed the target seek end time (' + targetSeekEndTime + ')');
    }
  }
  var seekEndTime = Math.max(targetSeekEndTime, this.seekStartTime_);
  seekEndTime = Math.min(seekEndTime, streamEnd);

  return { start: this.seekStartTime_, end: seekEndTime };
};


/**
 * Removes all inaccessible SegmentReferences.
 *
 * @param {number} wallTime The current wall-clock time in seconds.
 * @private
 */
shaka.dash.LiveSegmentIndex.prototype.evict_ = function(wallTime) {
  // Always evict segments at the end.
  this.evictEnd_();

  if (this.mpd.timeShiftBufferDepth == null) {
    return;
  }

  if (this.originalPresentationTime_ == null) {
    shaka.asserts.assert(this.length() == 0);
    return;
  }

  var manifestAge = wallTime - this.manifestCreationTime;
  var currentPresentationTime = this.originalPresentationTime_ + manifestAge;

  // The MPD spec. indicates that
  //
  // SegmentAvailabilityEndTime =
  //   MpdAvailabilityStartTime + PeriodStart +
  //   SegmentStart + 2*SegmentDuration + TimeShiftBufferDepth
  //
  // Thus, a segment is still available if the end time of the segment
  // following it plus @timeShiftBufferDepth is greater than or equal to the
  // current presentation time.
  var remove = 0;

  for (var i = 0; i < this.references.length; ++i) {
    /** @type {?number} */
    var nextEndTime = null;

    if (i < this.references.length - 1) {
      nextEndTime = this.references[i + 1].endTime;
    } else {
      // We don't have enough segments to compute an accurate
      // SegmentAvailabilityEndTime, so just assume that the next segment has
      // the same duration as the last one we have.
      var r = this.references[i];
      nextEndTime =
          r.endTime != null ? r.endTime + (r.endTime - r.startTime) : null;
    }

    if ((nextEndTime != null) &&
        (nextEndTime <
         currentPresentationTime - this.mpd.timeShiftBufferDepth)) {
      ++remove;
    } else {
      break;
    }
  }

  if (remove > 0) {
    this.references.splice(0, remove);
    shaka.log.debug(
        'Evicted', remove, 'SegmentReference(s),',
        this.references.length, 'SegmentReference(s) remain.');
  }
};


/**
 * Evicts segments that are past the end of the stream.
 *
 * @private
 */
shaka.dash.LiveSegmentIndex.prototype.evictEnd_ = function() {
  if (!this.duration) {
    return;
  }

  // Check to remove references past |duration|.
  var end = 0;
  for (var i = this.references.length - 1; i >= 0; --i) {
    var startTime = this.references[i].startTime;
    if (startTime > this.duration) {
      ++end;
    } else {
      break;
    }
  }

  if (end > 0) {
    this.references.splice(-end);
    shaka.log.warning(
        'Segments found after stream end, evicted', end,
        'SegmentReference(s),', this.references.length,
        'SegmentReference(s) remain.');
  }
};

