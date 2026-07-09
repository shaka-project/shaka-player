/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ProgramDateTimeObserver');

goog.require('shaka.media.IPlayheadObserver');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.requireType('shaka.media.PresentationTimeline');


/**
 * The program-date-time observer watches the playhead against the presentation
 * timeline's program-date-time regions, and fires a 'change' event whenever the
 * playhead moves into a region with a different PROGRAM-DATE-TIME base.  A new
 * base is introduced by a discontinuity whose PDT jumps relative to the media
 * timeline (e.g. server-side ad insertion or a live restart).
 *
 * A region's base is its offset between wall-clock and presentation time
 * (|pdt - start|), not its |start|: as a live window slides, a region is
 * re-anchored to a later reference, advancing its |start| and |pdt| together
 * while the base stays the same.  Comparing the base ignores that ordinary
 * re-anchoring and only reacts to genuine discontinuities.
 *
 * The region the playhead starts in does not fire an event; only changes do.
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @final
 */
shaka.media.ProgramDateTimeObserver = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!shaka.media.PresentationTimeline} timeline
   */
  constructor(timeline) {
    super();

    /** @private {?shaka.media.PresentationTimeline} */
    this.timeline_ = timeline;

    /**
     * The base (|pdt - start|) of the region the playhead was last seen in, or
     * null if we have not established a baseline yet.
     *
     * @private {?number}
     */
    this.previousBase_ = null;
  }

  /** @override */
  release() {
    this.timeline_ = null;
    super.release();
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    if (!this.timeline_) {
      return;
    }

    const region =
        this.timeline_.getProgramDateTimeRegionForTime(positionInSeconds);
    if (!region) {
      return;
    }

    const base = region.pdt - region.start;
    if (this.previousBase_ == null) {
      // Establish a baseline without firing for the region we start in.
      this.previousBase_ = base;
      return;
    }

    // A real PDT-base change is a discontinuity gap (> 1s); anything smaller is
    // sub-second sync jitter from a live window re-anchoring, which we ignore.
    if (Math.abs(base - this.previousBase_) > 0.5) {
      this.dispatchEvent(new shaka.util.FakeEvent('change', new Map([
        ['programDateTime', new Date(region.pdt * 1000)],
        ['timestamp', region.start],
      ])));
    }
    this.previousBase_ = base;
  }
};
