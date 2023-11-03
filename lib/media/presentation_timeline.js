/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.PresentationTimeline');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');


/**
 * PresentationTimeline.
 * @export
 */
shaka.media.PresentationTimeline = class {
  /**
   * @param {?number} presentationStartTime The wall-clock time, in seconds,
   *   when the presentation started or will start. Only required for live.
   * @param {number} presentationDelay The delay to give the presentation, in
   *   seconds.  Only required for live.
   * @param {boolean=} autoCorrectDrift Whether to account for drift when
   *   determining the availability window.
   *
   * @see {shaka.extern.Manifest}
   * @see {@tutorial architecture}
   */
  constructor(presentationStartTime, presentationDelay,
      autoCorrectDrift = true) {
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
     * The maximum segment end time (in seconds, in the presentation timeline)
     * for segments we explicitly know about.
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

    /**
     * For low latency Dash, availabilityTimeOffset indicates a segment is
     * available for download earlier than its availability start time.
     * This field is the minimum availabilityTimeOffset value among the
     * segments. We reduce the distance from live edge by this value.
     *
     * @private {number}
     */
    this.availabilityTimeOffset_ = 0;

    /** @private {boolean} */
    this.startTimeLocked_ = false;
  }


  /**
   * @return {number} The presentation's duration in seconds.
   *   Infinity indicates that the presentation continues indefinitely.
   * @export
   */
  getDuration() {
    return this.duration_;
  }


  /**
   * @return {number} The presentation's max segment duration in seconds.
   * @export
   */
  getMaxSegmentDuration() {
    return this.maxSegmentDuration_;
  }


  /**
   * Sets the presentation's start time.
   *
   * @param {number} presentationStartTime The wall-clock time, in seconds,
   *   when the presentation started or will start. Only required for live.
   * @export
   */
  setPresentationStartTime(presentationStartTime) {
    goog.asserts.assert(presentationStartTime >= 0,
        'presentationStartTime must be >= 0');
    this.presentationStartTime_ = presentationStartTime;
  }


  /**
   * Sets the presentation's duration.
   *
   * @param {number} duration The presentation's duration in seconds.
   *   Infinity indicates that the presentation continues indefinitely.
   * @export
   */
  setDuration(duration) {
    goog.asserts.assert(duration > 0, 'duration must be > 0');
    this.duration_ = duration;
  }


  /**
   * @return {?number} The presentation's start time in seconds.
   * @export
   */
  getPresentationStartTime() {
    return this.presentationStartTime_;
  }


  /**
   * Sets the clock offset, which is the difference between the client's clock
   * and the server's clock, in milliseconds (i.e., serverTime = Date.now() +
   * clockOffset).
   *
   * @param {number} offset The clock offset, in ms.
   * @export
   */
  setClockOffset(offset) {
    this.clockOffset_ = offset;
  }


  /**
   * Sets the presentation's static flag.
   *
   * @param {boolean} isStatic If true, the presentation is static, meaning all
   *   segments are available at once.
   * @export
   */
  setStatic(isStatic) {
    // NOTE: the argument name is not "static" because that's a keyword in ES6
    this.static_ = isStatic;
  }


  /**
   * Sets the presentation's segment availability duration. The segment
   * availability duration should only be set for live.
   *
   * @param {number} segmentAvailabilityDuration The presentation's new segment
   *   availability duration in seconds.
   * @export
   */
  setSegmentAvailabilityDuration(segmentAvailabilityDuration) {
    goog.asserts.assert(segmentAvailabilityDuration >= 0,
        'segmentAvailabilityDuration must be >= 0');
    this.segmentAvailabilityDuration_ = segmentAvailabilityDuration;
  }


  /**
   * Sets the presentation delay in seconds.
   *
   * @param {number} delay
   * @export
   */
  setDelay(delay) {
    // NOTE: This is no longer used internally, but is exported.
    // So we cannot remove it without deprecating it and waiting one release
    // cycle, or else we risk breaking custom manifest parsers.
    goog.asserts.assert(delay >= 0, 'delay must be >= 0');
    this.presentationDelay_ = delay;
  }


  /**
   * Gets the presentation delay in seconds.
   * @return {number}
   * @export
   */
  getDelay() {
    return this.presentationDelay_;
  }

  /**
   * Gives PresentationTimeline a Stream's timeline so it can size and position
   * the segment availability window, and account for missing segment
   * information.
   *
   * @param {!Array.<shaka.media.PresentationTimeline.TimeRange>} timeline
   * @param {number} startOffset
   * @export
   */
  notifyTimeRange(timeline, startOffset) {
    if (timeline.length == 0) {
      return;
    }

    const firstStartTime = timeline[0].start + startOffset;
    const lastEndTime = timeline[timeline.length - 1].end + startOffset;

    this.notifyMinSegmentStartTime(firstStartTime);

    this.maxSegmentDuration_ = timeline.reduce(
        (max, r) => { return Math.max(max, r.end - r.start); },
        this.maxSegmentDuration_);

    this.maxSegmentEndTime_ =
          Math.max(this.maxSegmentEndTime_, lastEndTime);

    if (this.presentationStartTime_ != null && this.autoCorrectDrift_ &&
            !this.startTimeLocked_) {
      // Since we have explicit segment end times, calculate a presentation
      // start based on them.  This start time accounts for drift.
      // Date.now() is in milliseconds, from which we compute "now" in seconds.
      const now = (Date.now() + this.clockOffset_) / 1000.0;
      this.presentationStartTime_ =
            now - this.maxSegmentEndTime_ - this.maxSegmentDuration_;
    }

    shaka.log.v1('notifySegments:',
        'maxSegmentDuration=' + this.maxSegmentDuration_);
  }


  /**
   * Gives PresentationTimeline an array of segments so it can size and position
   * the segment availability window, and account for missing segment
   * information.  These segments do not necessarily need to all be from the
   * same stream.
   *
   * @param {!Array.<!shaka.media.SegmentReference>} references
   * @export
   */
  notifySegments(references) {
    if (references.length == 0) {
      return;
    }

    let firstReferenceStartTime = references[0].startTime;
    let lastReferenceEndTime = references[0].endTime;

    // Date.now() is in milliseconds, from which we compute "now" in seconds.
    const now = (Date.now() + this.clockOffset_) / 1000.0;

    for (const reference of references) {
      // Exclude segments that are in the "future".
      if (now < reference.startTime) {
        continue;
      }

      firstReferenceStartTime = Math.min(
          firstReferenceStartTime, reference.startTime);
      lastReferenceEndTime = Math.max(lastReferenceEndTime, reference.endTime);
      this.maxSegmentDuration_ = Math.max(
          this.maxSegmentDuration_, reference.endTime - reference.startTime);
    }
    this.notifyMinSegmentStartTime(firstReferenceStartTime);
    this.maxSegmentEndTime_ =
        Math.max(this.maxSegmentEndTime_, lastReferenceEndTime);

    if (this.presentationStartTime_ != null && this.autoCorrectDrift_ &&
        !this.startTimeLocked_) {
      // Since we have explicit segment end times, calculate a presentation
      // start based on them.  This start time accounts for drift.
      this.presentationStartTime_ =
          now - this.maxSegmentEndTime_ - this.maxSegmentDuration_;
    }

    shaka.log.v1('notifySegments:',
        'maxSegmentDuration=' + this.maxSegmentDuration_);
  }


  /**
   * Lock the presentation timeline's start time.  After this is called, no
   * further adjustments to presentationStartTime_ will be permitted.
   *
   * This should be called after all Periods have been parsed, and all calls to
   * notifySegments() from the initial manifest parse have been made.
   *
   * Without this, we can get assertion failures in SegmentIndex for certain
   * DAI content.  If DAI adds ad segments to the manifest faster than
   * real-time, adjustments to presentationStartTime_ can cause availability
   * windows to jump around on updates.
   *
   * @export
   */
  lockStartTime() {
    this.startTimeLocked_ = true;
  }


  /**
   * Gives PresentationTimeline a Stream's minimum segment start time.
   *
   * @param {number} startTime
   * @export
   */
  notifyMinSegmentStartTime(startTime) {
    if (this.minSegmentStartTime_ == null) {
      // No data yet, and Math.min(null, startTime) is always 0.  So just store
      // startTime.
      this.minSegmentStartTime_ = startTime;
    } else {
      this.minSegmentStartTime_ =
          Math.min(this.minSegmentStartTime_, startTime);
    }
  }


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
  notifyMaxSegmentDuration(maxSegmentDuration) {
    this.maxSegmentDuration_ = Math.max(
        this.maxSegmentDuration_, maxSegmentDuration);

    shaka.log.v1('notifyNewSegmentDuration:',
        'maxSegmentDuration=' + this.maxSegmentDuration_);
  }


  /**
   * Offsets the segment times by the given amount.
   *
   * @param {number} offset The number of seconds to offset by.  A positive
   *   number adjusts the segment times forward.
   * @export
   */
  offset(offset) {
    if (this.minSegmentStartTime_ != null) {
      this.minSegmentStartTime_ += offset;
    }
    if (this.maxSegmentEndTime_ != null) {
      this.maxSegmentEndTime_ += offset;
    }
  }


  /**
   * @return {boolean} True if the presentation is live; otherwise, return
   *   false.
   * @export
   */
  isLive() {
    return this.duration_ == Infinity &&
           !this.static_;
  }


  /**
   * @return {boolean} True if the presentation is in progress (meaning not
   *   live, but also not completely available); otherwise, return false.
   * @export
   */
  isInProgress() {
    return this.duration_ != Infinity &&
           !this.static_;
  }


  /**
   * Gets the presentation's current segment availability start time.  Segments
   * ending at or before this time should be assumed to be unavailable.
   *
   * @return {number} The current segment availability start time, in seconds,
   *   relative to the start of the presentation.
   * @export
   */
  getSegmentAvailabilityStart() {
    goog.asserts.assert(this.segmentAvailabilityDuration_ >= 0,
        'The availability duration should be positive');

    const end = this.getSegmentAvailabilityEnd();
    const start = end - this.segmentAvailabilityDuration_;
    return Math.max(this.userSeekStart_, start);
  }


  /**
   * Sets the start time of the user-defined seek range.  This is only used for
   * VOD content.
   *
   * @param {number} time
   * @export
   */
  setUserSeekStart(time) {
    this.userSeekStart_ = time;
  }


  /**
   * Gets the presentation's current segment availability end time.  Segments
   * starting after this time should be assumed to be unavailable.
   *
   * @return {number} The current segment availability end time, in seconds,
   *   relative to the start of the presentation.  For VOD, the availability
   *   end time is the content's duration.  If the Player's playRangeEnd
   *   configuration is used, this can override the duration.
   * @export
   */
  getSegmentAvailabilityEnd() {
    if (!this.isLive() && !this.isInProgress()) {
      // It's a static manifest (can also be a dynamic->static conversion)
      if (this.maxSegmentEndTime_) {
        // If we know segment times, use the min of that and duration.
        // Note that the playRangeEnd configuration changes this.duration_.
        // See https://github.com/shaka-project/shaka-player/issues/4026
        return Math.min(this.maxSegmentEndTime_, this.duration_);
      } else {
        // If we don't have segment times, use duration.
        return this.duration_;
      }
    }
    // Can be either live or "in-progress recording" (live with known duration)
    return Math.min(this.getLiveEdge_() + this.availabilityTimeOffset_,
        this.duration_);
  }


  /**
   * Gets the seek range start time, offset by the given amount.  This is used
   * to ensure that we don't "fall" back out of the seek window while we are
   * buffering.
   *
   * @param {number} offset The offset to add to the start time for live
   *   streams.
   * @return {number} The current seek start time, in seconds, relative to the
   *   start of the presentation.
   * @export
   */
  getSafeSeekRangeStart(offset) {
    // The earliest known segment time, ignoring segment availability duration.
    const earliestSegmentTime =
        Math.max(this.minSegmentStartTime_, this.userSeekStart_);

    // For VOD, the offset and end time are ignored, and we just return the
    // earliest segment time.  All segments are "safe" in VOD.  However, we
    // should round up to the nearest millisecond to avoid issues like
    // https://github.com/shaka-project/shaka-player/issues/2831, in which we
    // tried to seek repeatedly to catch up to the seek range, and never
    // actually "arrived" within it.  The video's currentTime is not as
    // accurate as the JS number representing the earliest segment time for
    // some content.
    if (this.segmentAvailabilityDuration_ == Infinity) {
      return Math.ceil(earliestSegmentTime * 1e3) / 1e3;
    }

    // AKA the live edge for live streams.
    const availabilityEnd = this.getSegmentAvailabilityEnd();

    // The ideal availability start, not considering known segments.
    const availabilityStart =
        availabilityEnd - this.segmentAvailabilityDuration_;

    // Add the offset to the availability start to ensure that we don't fall
    // outside the availability window while we buffer; we don't need to add the
    // offset to earliestSegmentTime since that won't change over time.
    // Also see: https://github.com/shaka-project/shaka-player/issues/692
    const desiredStart =
        Math.min(availabilityStart + offset, this.getSeekRangeEnd());
    return Math.max(earliestSegmentTime, desiredStart);
  }


  /**
   * Gets the seek range start time.
   *
   * @return {number}
   * @export
   */
  getSeekRangeStart() {
    return this.getSafeSeekRangeStart(/* offset= */ 0);
  }


  /**
   * Gets the seek range end.
   *
   * @return {number}
   * @export
   */
  getSeekRangeEnd() {
    const useDelay = this.isLive() || this.isInProgress();
    const delay = useDelay ? this.presentationDelay_ : 0;
    return Math.max(0, this.getSegmentAvailabilityEnd() - delay);
  }


  /**
   * True if the presentation start time is being used to calculate the live
   * edge.
   * Using the presentation start time means that the stream may be subject to
   * encoder drift.  At runtime, we will avoid using the presentation start time
   * whenever possible.
   *
   * @return {boolean}
   * @export
   */
  usingPresentationStartTime() {
    // If it's VOD, IPR, or an HLS "event", we are not using the presentation
    // start time.
    if (this.presentationStartTime_ == null) {
      return false;
    }

    // If we have explicit segment times, we're not using the presentation
    // start time.
    if (this.maxSegmentEndTime_ != null && this.autoCorrectDrift_) {
      return false;
    }

    return true;
  }


  /**
   * @return {number} The current presentation time in seconds.
   * @private
   */
  getLiveEdge_() {
    goog.asserts.assert(this.presentationStartTime_ != null,
        'Cannot compute timeline live edge without start time');
    // Date.now() is in milliseconds, from which we compute "now" in seconds.
    const now = (Date.now() + this.clockOffset_) / 1000.0;
    return Math.max(
        0, now - this.maxSegmentDuration_ - this.presentationStartTime_);
  }

  /**
   * Sets the presentation's segment availability time offset. This should be
   * only set for Low Latency Dash.
   * The segments are available earlier for download than the availability start
   * time, so we can move closer to the live edge.
   *
   * @param {number} offset
   * @export
   */
  setAvailabilityTimeOffset(offset) {
    this.availabilityTimeOffset_ = offset;
  }

  /**
   * Debug only: assert that the timeline parameters make sense for the type
   * of presentation (VOD, IPR, live).
   */
  assertIsValid() {
    if (goog.DEBUG) {
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
    }
  }
};


/**
 * @typedef {{
 *   start: number,
 *   unscaledStart: number,
 *   end: number,
 *   partialSegments: number
 * }}
 *
 * @description
 * Defines a time range of a media segment.  Times are in seconds.
 *
 * @property {number} start
 *   The start time of the range.
 * @property {number} unscaledStart
 *   The start time of the range in representation timescale units.
 * @property {number} end
 *   The end time (exclusive) of the range.
 * @property {number} partialSegments
 *   The number of partial segments
 *
 * @export
 */
shaka.media.PresentationTimeline.TimeRange;
