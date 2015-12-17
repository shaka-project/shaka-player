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

goog.provide('shaka.media.PresentationTimeline');



/**
 * Creates a PresentationTimeline.
 *
 * @param {number} duration The presentation's duration in seconds.
 *     POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 * @param {?number} presentationStartTime The wall-clock time, in seconds,
 *   when the presentation started or will start. Only required for live.
 * @param {?number} segmentAvailabilityDuration
 *   The amount of time, in seconds, that the start of a segment remains
 *   available after the live-edge moves past the end of the segment.
 *   POSITIVE_INFINITY indicates that segments remain available indefinitely.
 *   For example, if your live presentation has a 5 minute DVR window and your
 *   segments are typically 10 seconds long then you should set this value to 4
 *   minutes and 50 seconds. Only required for live.
 *
 * @see {shakaExtern.Manifest}
 *
 * @constructor
 * @struct
 * @export
 */
shaka.media.PresentationTimeline = function(
    duration, presentationStartTime, segmentAvailabilityDuration) {
  shaka.asserts.assert(duration > 0, 'Timeline duration must be > 0');
  shaka.asserts.assert((presentationStartTime === null &&
                        segmentAvailabilityDuration === null) ||
                       (presentationStartTime >= 0 &&
                        segmentAvailabilityDuration > 0),
                       'Timeline start time and duration must be > 0 or null');

  /** @private {number} */
  this.duration_ = duration;

  /** @private {?number} */
  this.presentationStartTime_ = presentationStartTime;

  /** @private {?number} */
  this.segmentAvailabilityDuration_ = segmentAvailabilityDuration;
};


/**
 * Gets the presentation's current segment availability start time. Segments
 * ending at or before this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability start time, in seconds,
 *     relative to the start of the presentation.
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
 *     relative to the start of the presentation.
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityEnd =
    function() {
  if (this.presentationStartTime_ == null)
    return this.duration_;

  return Math.min(this.getLiveEdge_(), this.duration_);
};


/**
 * @return {boolean} true if the presentation has ended; otherwise, return
 *     false.
 */
shaka.media.PresentationTimeline.prototype.hasEnded = function() {
  if (this.presentationStartTime_ == null)
    return false;

  return this.getLiveEdge_() >= this.duration_;
};


/**
 * Sets the presentation's duration. The duration may be updated at any time.
 *
 * @param {number} duration The presentation's duration in seconds.
 *     POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 */
shaka.media.PresentationTimeline.prototype.setDuration = function(duration) {
  shaka.asserts.assert(duration > 0, 'Timeline duration must be > 0');
  this.duration_ = duration;
};


/**
 * @return {number} The current presentation time in seconds.
 * @private
 */
shaka.media.PresentationTimeline.prototype.getLiveEdge_ = function() {
  shaka.asserts.assert(this.presentationStartTime_ >= 0,
                       'Cannot compute timeline live edge without start time');
  return (Date.now() / 1000.0) - this.presentationStartTime_;
};

