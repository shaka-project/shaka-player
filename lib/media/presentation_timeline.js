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

goog.provide('shaka.media.PresentationTimeline');



/**
 * Creates a PresentationTimeline.
 *
 * @param {number} duration The presentation's duration in seconds.
 *   POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 * @param {?number} presentationStartTime The wall-clock time, in seconds,
 *   when the presentation started or will start. Only required for live.
 * @param {?number} segmentAvailabilityDuration
 *   The amount of time, in seconds, that the start of a segment remains
 *   available after the live-edge moves past the end of the segment.
 *   POSITIVE_INFINITY indicates that segments remain available indefinitely.
 *   For example, if your live presentation has a 5 minute DVR window and your
 *   segments are typically 10 seconds long then you should set this value to 4
 *   minutes and 50 seconds. Only required for live.
 * @param {number} maxSegmentDuration The maximum duration, in seconds, of any
 *   one segment in the presentation.
 * @param {number} clockOffset
 *   The difference between the client clock and the media server time, in
 *   milliseconds (i.e. ServerTime = Date.now() + clockOffset).
 *
 * @see {shakaExtern.Manifest}
 *
 * @constructor
 * @struct
 * @export
 */
shaka.media.PresentationTimeline = function(
    duration,
    presentationStartTime,
    segmentAvailabilityDuration,
    maxSegmentDuration,
    clockOffset) {
  goog.asserts.assert(duration > 0, 'Timeline duration must be > 0');
  goog.asserts.assert(
      (presentationStartTime === null &&
       segmentAvailabilityDuration === null) ||
          (presentationStartTime >= 0 && segmentAvailabilityDuration > 0),
      'Timeline start time and duration must be > 0 or null');

  /** @private {number} */
  this.duration_ = duration;

  /** @private {?number} */
  this.presentationStartTime_ = presentationStartTime;

  /** @private {?number} */
  this.segmentAvailabilityDuration_ = segmentAvailabilityDuration;

  /** @private {number} */
  this.maxSegmentDuration_ = maxSegmentDuration;

  /** @private {number} */
  this.clockOffset_ = clockOffset;
};


/**
 * @return {number} The presentation's duration in seconds.
 *   POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 */
shaka.media.PresentationTimeline.prototype.getDuration = function() {
  return this.duration_;
};


/**
 * Sets the presentation's duration. The duration may be updated at any time.
 *
 * @param {number} duration The presentation's duration in seconds.
 *   POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 */
shaka.media.PresentationTimeline.prototype.setDuration = function(duration) {
  goog.asserts.assert(duration > 0, 'Timeline duration must be > 0');
  this.duration_ = duration;
};


/**
 * @return {?number} The presentation's segment availability duration.
 *   Always returns null for video-on-demand, and never returns null for live.
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityDuration =
    function() {
  return this.segmentAvailabilityDuration_;
};


/**
 * Updates the presentation's segment availability duration. The segment
 * availability duration can only be updated for live.
 *
 * @param {?number} segmentAvailabilityDuration The presentation's new segment
 *     availability duration in seconds.
 */
shaka.media.PresentationTimeline.prototype.setSegmentAvailabiliyDuration =
    function(segmentAvailabilityDuration) {
  goog.asserts.assert(
      (this.segmentAvailabilityDuration_ == null &&
       segmentAvailabilityDuration == null) ||
      (this.segmentAvailabilityDuration_ != null &&
       segmentAvailabilityDuration != null),
      'Segment availability duration can only be updated for live');
  this.segmentAvailabilityDuration_ = segmentAvailabilityDuration;
};


/**
 * Gets the presentation's current segment availability start time. Segments
 * ending at or before this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability start time, in seconds,
 *   relative to the start of the presentation. Always returns 0 for
 *   video-on-demand.
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityStart =
    function() {
  if (this.presentationStartTime_ == null ||
      this.segmentAvailabilityDuration_ == Number.POSITIVE_INFINITY) {
    return 0;
  }

  return Math.max(
      0, this.getSegmentAvailabilityEnd() - this.segmentAvailabilityDuration_);
};


/**
 * Gets the presentation's current segment availability end time. Segments
 * starting after this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability end time, in seconds,
 *   relative to the start of the presentation. Always returns the
 *   presentation's duration for video-on-demand.
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityEnd =
    function() {
  if (this.presentationStartTime_ == null)
    return this.duration_;

  return Math.min(this.getLiveEdge_(), this.duration_);
};


/**
 * @return {number} The current presentation time in seconds.
 * @private
 */
shaka.media.PresentationTimeline.prototype.getLiveEdge_ = function() {
  goog.asserts.assert(this.presentationStartTime_ != null,
                      'Cannot compute timeline live edge without start time');
  var now = (Date.now() + this.clockOffset_) / 1000.0;
  return Math.max(
      0, now - this.maxSegmentDuration_ - this.presentationStartTime_);
};

