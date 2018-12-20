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

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');


/**
 * Creates a PresentationTimeline.
 *
 * @param {?number} presentationStartTime The wall-clock time, in seconds,
 *   when the presentation started or will start. Only required for live.
 * @param {number} presentationDelay The delay to give the presentation, in
 *   seconds.  Only required for live.
 * @param {boolean=} autoCorrectDrift Whether to account for drift when
 *   determining the availability window.
 *
 * @see {shaka.extern.Manifest}
 * @see {@tutorial architecture}
 *
 * @constructor
 * @struct
 * @export
 */
shaka.media.PresentationTimeline = function(
    presentationStartTime, presentationDelay, autoCorrectDrift = true) {
  /** @private {?number} */
  this.presentationStartTime_ = presentationStartTime;

  /** @private {number} */
  this.presentationDelay_ = presentationDelay;

  /** @private {number} */
  this.duration_ = Infinity;

  /** @private {number} */
  this.segmentAvailabilityDuration_ = Infinity;

  /**
   * The maximum segment duration (in seconds).  Can be based on explicitly-
   * known segments or on signalling in the manifest.
   *
   * @private {number}
   */
  this.maxSegmentDuration_ = 1;

  /**
   * The minimum segment start time (in seconds, in the presentation timeline)
   * for segments we explicitly know about.
   *
   * This is null if we have no explicit descriptions of segments, such as in
   * DASH when using SegmentTemplate w/ duration.
   *
   * @private {?number}
   */
  this.minSegmentStartTime_ = null;

  /**
   * The maximum segment end time (in seconds, in the presentation timeline) for
   * segments we explicitly know about.
   *
   * This is null if we have no explicit descriptions of segments, such as in
   * DASH when using SegmentTemplate w/ duration.  When this is non-null, the
   * presentation start time is calculated from the segment end times.
   *
   * @private {?number}
   */
  this.maxSegmentEndTime_ = null;

  /** @private {number} */
  this.clockOffset_ = 0;

  /** @private {boolean} */
  this.static_ = true;

  /** @private {number} */
  this.userSeekStart_ = 0;

  /** @private {boolean} */
  this.autoCorrectDrift_ = autoCorrectDrift;
};


/**
 * @return {number} The presentation's duration in seconds.
 *   Infinity indicates that the presentation continues indefinitely.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getDuration = function() {
  return this.duration_;
};


/**
 * @return {number} The presentation's max segment duration in seconds.
 */
shaka.media.PresentationTimeline.prototype.getMaxSegmentDuration = function() {
  return this.maxSegmentDuration_;
};


/**
 * Sets the presentation's duration.
 *
 * @param {number} duration The presentation's duration in seconds.
 *   Infinity indicates that the presentation continues indefinitely.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setDuration = function(duration) {
  goog.asserts.assert(duration > 0, 'duration must be > 0');
  this.duration_ = duration;
};


/**
 * @return {?number} The presentation's start time in seconds.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getPresentationStartTime =
    function() {
  return this.presentationStartTime_;
};


/**
 * Sets the clock offset, which is the difference between the client's clock
 * and the server's clock, in milliseconds (i.e., serverTime = Date.now() +
 * clockOffset).
 *
 * @param {number} offset The clock offset, in ms.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setClockOffset = function(offset) {
  this.clockOffset_ = offset;
};


/**
 * Sets the presentation's static flag.
 *
 * @param {boolean} isStatic If true, the presentation is static, meaning all
 *   segments are available at once.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setStatic = function(isStatic) {
  // NOTE: the argument name is not "static" because that's a keyword in ES6
  this.static_ = isStatic;
};


/**
 * Sets the presentation's segment availability duration. The segment
 * availability duration should only be set for live.
 *
 * @param {number} segmentAvailabilityDuration The presentation's new segment
 *   availability duration in seconds.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setSegmentAvailabilityDuration =
    function(segmentAvailabilityDuration) {
  goog.asserts.assert(segmentAvailabilityDuration >= 0,
                      'segmentAvailabilityDuration must be >= 0');
  this.segmentAvailabilityDuration_ = segmentAvailabilityDuration;
};


/**
 * Sets the presentation delay in seconds.
 *
 * @param {number} delay
 * @export
 */
shaka.media.PresentationTimeline.prototype.setDelay = function(delay) {
  // NOTE: This is no longer used internally, but is exported.
  // So we cannot remove it without deprecating it and waiting one release
  // cycle, or else we risk breaking custom manifest parsers.
  goog.asserts.assert(delay >= 0, 'delay must be >= 0');
  this.presentationDelay_ = delay;
};


/**
 * Gets the presentation delay in seconds.
 * @return {number}
 * @export
 */
shaka.media.PresentationTimeline.prototype.getDelay = function() {
  return this.presentationDelay_;
};


/**
 * Gives PresentationTimeline a Stream's segments so it can size and position
 * the segment availability window, and account for missing segment
 * information.  This function should be called once for each Stream (no more,
 * no less).
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @param {number} periodStart
 * @export
 */
shaka.media.PresentationTimeline.prototype.notifySegments = function(
    references, periodStart) {
  if (references.length == 0) {
    return;
  }

  // TODO: Make SegmentReferences use timestamps in the presentation timeline,
  // not the period timeline.
  const firstReferenceStartTime = references[0].startTime + periodStart;
  const lastReferenceEndTime =
      references[references.length - 1].endTime + periodStart;

  this.notifyMinSegmentStartTime(firstReferenceStartTime);

  this.maxSegmentDuration_ = references.reduce(
      function(max, r) { return Math.max(max, r.endTime - r.startTime); },
      this.maxSegmentDuration_);

  this.maxSegmentEndTime_ =
      Math.max(this.maxSegmentEndTime_, lastReferenceEndTime);

  if (this.presentationStartTime_ != null && this.autoCorrectDrift_) {
    // Since we have explicit segment end times, calculate a presentation start
    // based on them.  This start time accounts for drift.
    // Date.now() is in milliseconds, from which we compute "now" in seconds.
    let now = (Date.now() + this.clockOffset_) / 1000.0;
    this.presentationStartTime_ =
        now - this.maxSegmentEndTime_ - this.maxSegmentDuration_;
  }

  shaka.log.v1('notifySegments:',
               'maxSegmentDuration=' + this.maxSegmentDuration_);
};


/**
 * Gives PresentationTimeline a Stream's minimum segment start time.
 *
 * @param {number} startTime
 * @export
 */
shaka.media.PresentationTimeline.prototype.notifyMinSegmentStartTime = function(
    startTime) {
  if (this.minSegmentStartTime_ == null) {
    // No data yet, and Math.min(null, startTime) is always 0.  So just store
    // startTime.
    this.minSegmentStartTime_ = startTime;
  } else {
    this.minSegmentStartTime_ =
        Math.min(this.minSegmentStartTime_, startTime);
  }
};


/**
 * Gives PresentationTimeline a Stream's maximum segment duration so it can
 * size and position the segment availability window.  This function should be
 * called once for each Stream (no more, no less), but does not have to be
 * called if notifySegments() is called instead for a particular stream.
 *
 * @param {number} maxSegmentDuration The maximum segment duration for a
 *   particular stream.
 * @export
 */
shaka.media.PresentationTimeline.prototype.notifyMaxSegmentDuration = function(
    maxSegmentDuration) {
  this.maxSegmentDuration_ = Math.max(
      this.maxSegmentDuration_, maxSegmentDuration);

  shaka.log.v1('notifyNewSegmentDuration:',
               'maxSegmentDuration=' + this.maxSegmentDuration_);
};


/**
 * Offsets the segment times by the given amount.
 *
 * @param {number} offset The number of seconds to offset by.  A positive number
 *   adjusts the segment times forward.
 * @export
 */
shaka.media.PresentationTimeline.prototype.offset = function(offset) {
  if (this.minSegmentStartTime_ != null) {
    this.minSegmentStartTime_ += offset;
  }
  if (this.maxSegmentEndTime_ != null) {
    this.maxSegmentEndTime_ += offset;
  }
};


/**
 * @return {boolean} True if the presentation is live; otherwise, return
 *   false.
 * @export
 */
shaka.media.PresentationTimeline.prototype.isLive = function() {
  return this.duration_ == Infinity &&
         !this.static_;
};


/**
 * @return {boolean} True if the presentation is in progress (meaning not live,
 *   but also not completely available); otherwise, return false.
 * @export
 */
shaka.media.PresentationTimeline.prototype.isInProgress = function() {
  return this.duration_ != Infinity &&
         !this.static_;
};


/**
 * Gets the presentation's current segment availability start time.  Segments
 * ending at or before this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability start time, in seconds,
 *   relative to the start of the presentation.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityStart =
    function() {
  goog.asserts.assert(this.segmentAvailabilityDuration_ >= 0,
                      'The availability duration should be positive');

  if (this.segmentAvailabilityDuration_ == Infinity) {
    return this.userSeekStart_;
  }

  let end = this.getSegmentAvailabilityEnd();
  let start = end - this.segmentAvailabilityDuration_;
  return Math.max(this.userSeekStart_, start);
};


/**
 * Sets the start time of the user-defined seek range.  This is only used for
 * VOD content.
 *
 * @param {number} time
 * @export
 */
shaka.media.PresentationTimeline.prototype.setUserSeekStart =
    function(time) {
  this.userSeekStart_ = time;
};


/**
 * Gets the presentation's current segment availability end time.  Segments
 * starting after this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability end time, in seconds,
 *   relative to the start of the presentation.  Always returns the
 *   presentation's duration for video-on-demand.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityEnd =
    function() {
  if (!this.isLive() && !this.isInProgress()) {
    return this.duration_;
  }

  return Math.min(this.getLiveEdge_(), this.duration_);
};


/**
 * Gets the seek range start time, offset by the given amount.  This is used to
 * ensure that we don't "fall" back out of the seek window while we are
 * buffering.
 *
 * @param {number} offset The offset to add to the start time.
 * @return {number} The current seek start time, in seconds, relative to the
 *   start of the presentation.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSafeSeekRangeStart = function(
    offset) {
  // The earliest known segment time, ignoring segment availability duration.
  const earliestSegmentTime =
      Math.max(this.minSegmentStartTime_, this.userSeekStart_);
  if (this.segmentAvailabilityDuration_ == Infinity) {
    return earliestSegmentTime;
  }

  // AKA the live edge for live streams.
  const availabilityEnd = this.getSegmentAvailabilityEnd();

  // The ideal availability start, not considering known segments.
  const availabilityStart = availabilityEnd - this.segmentAvailabilityDuration_;

  // Add the offset to the availability start to ensure that we don't fall
  // outside the availability window while we buffer; we don't need to add the
  // offset to earliestSegmentTime since that won't change over time.
  // Also see: https://github.com/google/shaka-player/issues/692
  const desiredStart =
      Math.min(availabilityStart + offset, this.getSeekRangeEnd());
  return Math.max(earliestSegmentTime, desiredStart);
};


/**
 * Gets the seek range start time.
 *
 * @return {number}
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSeekRangeStart = function() {
  return this.getSafeSeekRangeStart(/* offset */ 0);
};


/**
 * Gets the seek range end.
 *
 * @return {number}
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSeekRangeEnd = function() {
  let useDelay = this.isLive() || this.isInProgress();
  let delay = useDelay ? this.presentationDelay_ : 0;
  return Math.max(0, this.getSegmentAvailabilityEnd() - delay);
};


/**
 * True if the presentation start time is being used to calculate the live edge.
 * Using the presentation start time means that the stream may be subject to
 * encoder drift.  At runtime, we will avoid using the presentation start time
 * whenever possible.
 *
 * @return {boolean}
 * @export
 */
shaka.media.PresentationTimeline.prototype.usingPresentationStartTime =
    function() {
  // If it's VOD, IPR, or an HLS "event", we are not using the presentation
  // start time.
  if (this.presentationStartTime_ == null) {
    return false;
  }

  // If we have explicit segment times, we're not using the presentation
  // start time.
  if (this.maxSegmentEndTime_ != null) {
    return false;
  }

  return true;
};


/**
 * @return {number} The current presentation time in seconds.
 * @private
 */
shaka.media.PresentationTimeline.prototype.getLiveEdge_ = function() {
  goog.asserts.assert(this.presentationStartTime_ != null,
                      'Cannot compute timeline live edge without start time');
  // Date.now() is in milliseconds, from which we compute "now" in seconds.
  let now = (Date.now() + this.clockOffset_) / 1000.0;
  return Math.max(
      0, now - this.maxSegmentDuration_ - this.presentationStartTime_);
};


if (goog.DEBUG) {
  /**
   * Debug only: assert that the timeline parameters make sense for the type of
   *   presentation (VOD, IPR, live).
   */
  shaka.media.PresentationTimeline.prototype.assertIsValid = function() {
    if (this.isLive()) {
      // Implied by isLive(): infinite and dynamic.
      // Live streams should have a start time.
      goog.asserts.assert(this.presentationStartTime_ != null,
          'Detected as live stream, but does not match our model of live!');
    } else if (this.isInProgress()) {
      // Implied by isInProgress(): finite and dynamic.
      // IPR streams should have a start time, and segments should not expire.
      goog.asserts.assert(this.presentationStartTime_ != null &&
                          this.segmentAvailabilityDuration_ == Infinity,
          'Detected as IPR stream, but does not match our model of IPR!');
    } else {  // VOD
      // VOD segments should not expire and the presentation should be finite
      // and static.
      goog.asserts.assert(this.segmentAvailabilityDuration_ == Infinity &&
                          this.duration_ != Infinity &&
                          this.static_,
          'Detected as VOD stream, but does not match our model of VOD!');
    }
  };
}
