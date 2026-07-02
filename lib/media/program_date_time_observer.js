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
 * playhead crosses into a different region.  This happens at a discontinuity
 * that introduces a new PROGRAM-DATE-TIME base (e.g. server-side ad insertion
 * or a live restart).
 *
 * The region the playhead starts in does not fire an event; only crossings do.
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
     * The start of the region the playhead was last seen in, or null if we have
     * not established a baseline yet.
     *
     * @private {?number}
     */
    this.previousRegionStart_ = null;
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

    if (this.previousRegionStart_ == null) {
      // Establish a baseline without firing for the region we start in.
      this.previousRegionStart_ = region.start;
      return;
    }

    if (region.start != this.previousRegionStart_) {
      this.previousRegionStart_ = region.start;
      this.dispatchEvent(new shaka.util.FakeEvent('change', new Map([
        ['programDateTime', new Date(region.pdt * 1000)],
        ['timestamp', region.start],
      ])));
    }
  }
};
