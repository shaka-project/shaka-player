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
 *
 * @extends {shaka.media.PresentationTimeline}
 * @export
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
   * @export
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
   * @export
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
};
