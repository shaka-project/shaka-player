/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.MSFPresentationTimeline');

goog.require('shaka.media.PresentationTimeline');


/**
 * A PresentationTimeline variant for MoQ/MSF live streams.
 *
 * Unlike the standard timeline, the live edge is derived directly from the
 * latest known segment end time rather than from wall-clock arithmetic.
 * This is correct for MoQ because:
 *   1. The server delivers from the live edge; segment timestamps ARE the
 *      truth.
 *   2. There is no encoder/clock drift to compensate for.
 *   3. We want a zero seek range (no DVR): availability window = one segment.
 *
 * @extends {shaka.media.PresentationTimeline}
 * @final
 */
// eslint-disable-next-line @stylistic/max-len
shaka.msf.MSFPresentationTimeline = class extends shaka.media.PresentationTimeline {
  constructor() {
    // presentationStartTime=null avoids wall-clock live edge in base class.
    // delay=0 because MoQ targets minimum latency.
    // maxSegmentDuration=0 because the segments can be very small.
    super(/* presentationStartTime= */ null, /* delay= */ 0,
        /* autoCorrectDrift= */ false, /* maxSegmentDuration= */ 0);
  }

  /**
   * For MoQ live: the availability end IS the latest segment end time.
   * No wall-clock arithmetic needed.
   * @override
   */
  getSegmentAvailabilityEnd() {
    if (!this.isDynamic()) {
      return super.getSegmentAvailabilityEnd();
    }
    const maxSegmentEndTime = this.getMaxSegmentEndTime();
    return maxSegmentEndTime != null ? maxSegmentEndTime : 0;
  }

  /**
   * Zero seek range: the availability window is exactly one segment wide.
   * Users cannot seek back on Live.
   * @override
   */
  getSegmentAvailabilityStart() {
    if (!this.isDynamic()) {
      return super.getSegmentAvailabilityStart();
    }
    // Keep one segment of headroom so the player never falls out of range
    // due to the 250ms onPollWindow_ tick.
    return Math.max(0,
        this.getSegmentAvailabilityEnd() - this.getMaxSegmentDuration());
  }

  /**
   * getSeekRangeEnd() calls getSegmentAvailabilityEnd() with a delay
   * subtraction.
   * presentationDelay_ is 0, so this is just maxSegmentEndTime_.
   * No override needed, but document it explicitly for clarity.
   *
   * getSafeSeekRangeStart() uses segmentAvailabilityDuration_ internally.
   * We must keep it in sync so the base class logic in getSafeSeekRangeStart()
   * produces the same result as our overridden getSegmentAvailabilityStart().
   * @override
   */
  notifySegments(references) {
    super.notifySegments(references);
    // Keep segmentAvailabilityDuration_ = one segment so that
    // getSafeSeekRangeStart() (used by onPollWindow_) stays consistent
    // with our overridden getSegmentAvailabilityStart().
    if (this.isDynamic()) {
      const maxSegmentDuration = this.getMaxSegmentDuration();
      if (maxSegmentDuration > 0) {
        this.setSegmentAvailabilityDuration(this.getMaxSegmentDuration());
      }
    }
  }
};
