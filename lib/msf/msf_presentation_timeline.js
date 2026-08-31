/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
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
    if (maxSegmentEndTime == null) {
      return 0;
    }
    // getMaxSegmentEndTime() is the maximum across EVERY stream, so it tracks
    // whichever track runs furthest ahead. Tracks are not published in
    // lockstep — a few hundred milliseconds of skew between audio and video
    // is normal — so pinning the live edge to that maximum puts the trailing
    // track permanently outside the availability window. StreamingEngine then
    // reports "cannot find segment" for it forever and it never buffers,
    // while the leading track plays fine.
    //
    // Hold the edge back far enough that every track has landed.
    return Math.max(0, maxSegmentEndTime -
        shaka.msf.MSFPresentationTimeline.TRACK_SKEW_MARGIN_);
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
    // Keep enough headroom that the player never falls out of range due to
    // the 250ms onPollWindow_ tick, and that a track arriving slightly late
    // still has somewhere to be fetched from. One segment is far too tight
    // for that when a segment is a single frame.
    return Math.max(0, this.getSegmentAvailabilityEnd() -
        Math.max(this.getMaxSegmentDuration(),
            shaka.msf.MSFPresentationTimeline.TRACK_SKEW_MARGIN_));
  }
};


/**
 * How far behind the furthest-ahead stream the live edge is held, in seconds.
 *
 * Must exceed the inter-track publication skew, or the trailing track can
 * never be fetched. Kept well under the segment-reference retention in
 * shaka.msf.MSFParser so references still exist when they are requested.
 *
 * @private @const {number}
 */
shaka.msf.MSFPresentationTimeline.TRACK_SKEW_MARGIN_ = 0.5;
