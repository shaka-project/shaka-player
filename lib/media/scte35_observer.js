/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.Scte35Observer');

goog.require('shaka.media.IPlayheadObserver');
goog.require('shaka.media.Scte35Timeline');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');

/**
 * Observes message times rather than treating each message as an ad interval.
 * @implements {shaka.media.IPlayheadObserver}
 */
shaka.media.Scte35Observer = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!shaka.media.Scte35Timeline} timeline
   * @param {boolean} startsPastZero
   */
  constructor(timeline, startsPastZero) {
    super();
    /** @private {?shaka.media.Scte35Timeline} */
    this.timeline_ = timeline;
    /** @private {boolean} */
    this.startsPastZero_ = startsPastZero;
    /** @private {?number} */
    this.previous_ = null;
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    if (this.startsPastZero_ && positionInSeconds == 0) {
      return;
    }
    this.startsPastZero_ = false;
    const previous = this.previous_;
    this.previous_ = positionInSeconds;
    if (wasSeeking) {
      return;
    }
    const events = Array.from(this.timeline_.events()).sort(
        (a, b) => a.startTime - b.startTime);
    for (const event of events) {
      if ((previous == null && event.startTime == positionInSeconds) ||
          (previous != null && previous < event.startTime &&
           event.startTime <= positionInSeconds)) {
        this.dispatchEvent(new shaka.util.FakeEvent('scte35', new Map().set(
            'detail', shaka.media.Scte35Timeline.clone(event))));
      }
    }
  }

  /** @override */
  release() {
    this.timeline_ = null;
    this.previous_ = null;
    super.release();
  }
};
