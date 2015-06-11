/**
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
 *
 * @fileoverview Implements a SegmentIndex that supports live DASH content.
 */

goog.provide('shaka.dash.LiveSegmentIndex');

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Clock');



/**
 * Creates a LiveSegmentIndex.
 *
 * A LiveSegmentIndex automatically evicts SegmentReferences that are no longer
 * available. However, it does not generate new SegmentReferences, so new
 * SegmentReferences must be integrated into it.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references The set of
 *     SegmentReferences. The start time of the last SegmentReference
 *     indicates the live-edge.
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

  /** @private {number} */
  this.originalPresentationTime_ =
      manifestCreationTime - (mpd.availabilityStartTime + period.start);

  /** @private {number} */
  this.updateTimer_ = window.setInterval(this.onUpdate_.bind(this), 1000);

  // Immediately evict any inaccessible SegmentReferences.
  this.evict_(this.originalPresentationTime_);
};
goog.inherits(shaka.dash.LiveSegmentIndex, shaka.media.SegmentIndex);


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.LiveSegmentIndex.prototype.destroy = function() {
  this.mpd = null;
  this.period = null;
  window.clearInterval(this.updateTimer_);
  shaka.media.SegmentIndex.prototype.destroy.call(this);
};


/**
 * Update timer callback.
 *
 * @private
 */
shaka.dash.LiveSegmentIndex.prototype.onUpdate_ = function() {
  this.onUpdate(shaka.util.Clock.now() / 1000.0);
};


/**
 * Update hook.
 *
 * @param {number} wallTime The current wall-clock time, in seconds.
 * @protected
 */
shaka.dash.LiveSegmentIndex.prototype.onUpdate = function(wallTime) {
  this.evict_(wallTime);
};


/**
 * Removes all inaccessible SegmentReferences.
 *
 * @param {number} wallTime The current wall-clock time, in seconds.
 * @private
 */
shaka.dash.LiveSegmentIndex.prototype.evict_ = function(wallTime) {
  if (this.mpd.timeShiftBufferDepth == null) {
    return;
  }

  // Compute the current presentation time.
  var delta = wallTime - this.manifestCreationTime;
  var currentPresentationTime = this.originalPresentationTime_ + delta;

  // The MPD spec. indicates that
  //
  // SegmentAvailabilityEndTime =
  //   MpdAvailabilityStartTime + PeriodStart +
  //   SegmentStart + 2*SegmentDuration + TimeShiftBufferDepth
  //
  // Thus, a segment is still available if the end time of the segment
  // following it plus @timeShiftBufferDepth is greater than or equal to the
  // current presentation time.
  var firstIndex = 0;
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

    if ((nextEndTime == null) ||
        (nextEndTime + this.mpd.timeShiftBufferDepth >=
         currentPresentationTime)) {
      firstIndex = i;
      break;
    }
  }

  if (firstIndex != 0) {
    this.references.splice(0, firstIndex);
    shaka.log.debug('Evicted', firstIndex, 'SegmentReference(s).');
  }
};

