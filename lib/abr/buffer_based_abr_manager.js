/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.abr.BufferBasedAbrManager');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * @summary
 * A buffer-based ABR manager for low-latency live streams (MoQ/MSF).
 *
 * Unlike the default bandwidth-based SimpleAbrManager, this manager makes
 * quality decisions based on buffer health relative to the stream's target
 * latency. This is better suited for low-latency live streams where
 * bandwidth estimation is unreliable due to small segment sizes and
 * push-based delivery (WebTransport/MoQ).
 *
 * Down-switch: immediate when buffer drops below 30% of target latency,
 * or when excessive video frames are dropped.
 * Up-switch: requires 5 seconds of sustained buffer above 150% of target
 * latency.
 *
 * @implements {shaka.extern.AbrManager}
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.abr.BufferBasedAbrManager = class {
  constructor() {
    /** @private {?shaka.extern.AbrManager.SwitchCallback} */
    this.switch_ = null;

    /** @private {HTMLMediaElement} */
    this.mediaElement_ = null;

    /** @private {!Array<!shaka.extern.Variant>} */
    this.variants_ = [];

    /** @private {boolean} */
    this.isLowLatency_ = false;

    /** @private {boolean} */
    this.enabled_ = false;

    /**
     * Target latency in milliseconds. Used to compute buffer thresholds.
     * Updated via configure() or from the manifest's serviceDescription.
     * @private {number}
     */
    this.targetLatencyMs_ = 2000;

    /**
     * ABR ladder sorted by pixel count (ascending). Each entry contains
     * the variant and its resolution metadata.
     * @private {!Array<{variant: shaka.extern.Variant, pixels: number,
     *     width: number, height: number, bandwidth: number}>}
     */
    this.ladder_ = [];

    /** @private {number} */
    this.currentIndex_ = -1;

    /** @private {string} */
    this.state_ = 'stable';

    /** @private {number} */
    this.stableStart_ = 0;

    /** @private {number} */
    this.lastDroppedFrames_ = 0;

    /** @private {number} */
    this.playbackStartTime_ = 0;

    /** @private {shaka.util.Timer} */
    this.timer_ = null;
  }

  /**
   * @override
   * @export
   */
  init(switchCallback) {
    this.switch_ = switchCallback;
  }

  /**
   * @override
   * @export
   */
  stop() {
    this.switch_ = null;
    this.variants_ = [];
    this.enabled_ = false;
    if (this.timer_) {
      this.timer_.stop();
      this.timer_ = null;
    }
  }

  /**
   * @override
   * @export
   */
  release() {
    this.stop();
    this.mediaElement_ = null;
    this.ladder_ = [];
  }

  /**
   * Returns the highest-quality variant for initial playback.
   * Mid-stream switching is handled by evaluate_() calling switch_().
   *
   * @param {boolean=} preferFastSwitching
   * @return {shaka.extern.Variant}
   * @override
   * @export
   */
  chooseVariant(preferFastSwitching = false) {
    if (this.ladder_.length > 0) {
      if (this.currentIndex_ < 0) {
        this.currentIndex_ = this.ladder_.length - 1;
        shaka.log.info('[BufferABR] Ladder:',
            this.ladder_.map((l) => l.height + 'p').join(' < '),
            'initial:', this.ladder_[this.currentIndex_].height + 'p');
      }
      return this.ladder_[this.currentIndex_].variant;
    }
    if (this.variants_.length > 0) {
      return this.variants_[this.variants_.length - 1];
    }
    // Should not happen — Shaka always calls setVariants before chooseVariant.
    goog.asserts.assert(false, 'No variants available');
    return this.variants_[0];
  }

  /**
   * @override
   * @export
   */
  enable() {
    if (this.enabled_) {
      return;
    }
    this.enabled_ = true;
    this.playbackStartTime_ = Date.now();
    this.state_ = 'stable';
    this.stableStart_ = Date.now();
    this.lastDroppedFrames_ = 0;

    if (this.ladder_.length > 1) {
      this.timer_ = new shaka.util.Timer(() => this.evaluate_());
      this.timer_.tickEvery(
          shaka.abr.BufferBasedAbrManager.EVALUATE_INTERVAL_S_);
    }
  }

  /**
   * @override
   * @export
   */
  disable() {
    this.enabled_ = false;
    if (this.timer_) {
      this.timer_.stop();
    }
  }

  /**
   * @override
   * @export
   */
  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request, context) {
    // Not used — buffer-based ABR doesn't rely on bandwidth estimation.
  }

  /**
   * @override
   * @export
   */
  trySuggestStreams() {}

  /**
   * @override
   * @export
   */
  getBandwidthEstimate() {
    return 0;
  }

  /**
   * @param {!Array<!shaka.extern.Variant>} variants
   * @param {boolean} isLowLatency
   * @return {boolean}
   * @override
   * @export
   */
  setVariants(variants, isLowLatency) {
    this.variants_ = variants;
    this.isLowLatency_ = isLowLatency;
    this.buildLadder_();
    return true;
  }

  /**
   * @override
   * @export
   */
  playbackRateChanged(rate) {}

  /**
   * @override
   * @export
   */
  setMediaElement(mediaElement) {
    this.mediaElement_ = mediaElement;
  }

  /**
   * @override
   * @export
   */
  setCmsdManager(cmsdManager) {}

  /**
   * @override
   * @export
   */
  configure(config) {}

  // --- Private methods ---

  /**
   * Build the ABR quality ladder from the current variants, sorted by
   * resolution (pixel count ascending). Deduplicates by resolution,
   * keeping the highest bandwidth variant for each.
   * @private
   */
  buildLadder_() {
    const seen = new Map();
    for (const v of this.variants_) {
      if (!v.video) {
        continue;
      }
      const w = v.video.width || 0;
      const h = v.video.height || 0;
      const pixels = w * h;
      if (pixels === 0) {
        continue;
      }
      const key = w + 'x' + h;
      if (!seen.has(key) || v.bandwidth > (seen.get(key).bandwidth || 0)) {
        seen.set(key, {
          variant: v,
          pixels: pixels,
          width: w,
          height: h,
          bandwidth: v.bandwidth || 0,
        });
      }
    }
    this.ladder_ =
        Array.from(seen.values()).sort((a, b) => a.pixels - b.pixels);
  }

  /**
   * Evaluate buffer health and switch quality if needed.
   * Called every EVALUATE_INTERVAL_S_ seconds when enabled.
   * @private
   */
  evaluate_() {
    if (!this.enabled_ || !this.mediaElement_ || this.ladder_.length <= 1) {
      return;
    }

    // Grace period: skip evaluation for the first 5s after enable
    // to let the buffer stabilize after initial playback.
    if (Date.now() - this.playbackStartTime_ <
        shaka.abr.BufferBasedAbrManager.GRACE_PERIOD_MS_) {
      return;
    }

    const video = this.mediaElement_;
    const buffered = video.buffered;
    if (buffered.length === 0) {
      return;
    }

    const bufferHealth = buffered.end(buffered.length - 1) - video.currentTime;
    if (bufferHealth <= 0) {
      return;
    }

    const htmlVideo = /** @type {HTMLVideoElement} */ (video);
    const dropped = htmlVideo.getVideoPlaybackQuality ?
        htmlVideo.getVideoPlaybackQuality().droppedVideoFrames : 0;
    const droppedDelta = dropped - this.lastDroppedFrames_;
    this.lastDroppedFrames_ = dropped;

    const targetSec = this.targetLatencyMs_ / 1000;
    const downThreshold =
        targetSec * shaka.abr.BufferBasedAbrManager.DOWN_THRESHOLD_FACTOR_;
    const upThreshold =
        targetSec * shaka.abr.BufferBasedAbrManager.UP_THRESHOLD_FACTOR_;

    // DOWN: buffer critically low or excessive dropped frames
    if ((bufferHealth < downThreshold ||
        droppedDelta > shaka.abr.BufferBasedAbrManager.MAX_DROPPED_FRAMES_) &&
        this.currentIndex_ > 0) {
      const newIndex = this.currentIndex_ - 1;
      shaka.log.info('[BufferABR] DOWN: buffer=' +
          bufferHealth.toFixed(2) + 's drops=' + droppedDelta +
          ' -> ' + this.ladder_[newIndex].height + 'p');
      this.switchTo_(newIndex);
      return;
    }

    // UP: sustained healthy buffer for STABLE_DURATION_MS_
    if (bufferHealth > upThreshold &&
        this.currentIndex_ < this.ladder_.length - 1) {
      if (this.state_ !== 'stable') {
        this.state_ = 'stable';
        this.stableStart_ = Date.now();
      } else if (Date.now() - this.stableStart_ >
          shaka.abr.BufferBasedAbrManager.STABLE_DURATION_MS_) {
        const newIndex = this.currentIndex_ + 1;
        shaka.log.info('[BufferABR] UP: buffer=' +
            bufferHealth.toFixed(2) + 's stable=' +
            ((Date.now() - this.stableStart_) / 1000).toFixed(0) +
            's -> ' + this.ladder_[newIndex].height + 'p');
        this.switchTo_(newIndex);
        return;
      }
    } else {
      if (this.state_ === 'stable' && bufferHealth <= upThreshold) {
        this.stableStart_ = Date.now();
      }
    }
  }

  /**
   * Switch to a new quality level in the ladder.
   * @param {number} newIndex
   * @private
   */
  switchTo_(newIndex) {
    if (newIndex < 0 || newIndex >= this.ladder_.length) {
      return;
    }
    this.currentIndex_ = newIndex;
    this.state_ = 'recovering';
    this.stableStart_ = Date.now();

    const variant = this.ladder_[newIndex].variant;
    if (this.switch_) {
      this.switch_(variant);
    }
  }
};


/**
 * Evaluate buffer health every 1 second.
 * @const {number}
 * @private
 */
shaka.abr.BufferBasedAbrManager.EVALUATE_INTERVAL_S_ = 1;

/**
 * Grace period after enable before evaluating (ms).
 * @const {number}
 * @private
 */
shaka.abr.BufferBasedAbrManager.GRACE_PERIOD_MS_ = 5000;

/**
 * Down-switch when buffer < targetLatency * this factor.
 * @const {number}
 * @private
 */
shaka.abr.BufferBasedAbrManager.DOWN_THRESHOLD_FACTOR_ = 0.3;

/**
 * Up-switch when buffer > targetLatency * this factor.
 * @const {number}
 * @private
 */
shaka.abr.BufferBasedAbrManager.UP_THRESHOLD_FACTOR_ = 1.5;

/**
 * Required sustained buffer duration before up-switching (ms).
 * @const {number}
 * @private
 */
shaka.abr.BufferBasedAbrManager.STABLE_DURATION_MS_ = 5000;

/**
 * Down-switch if more than this many frames dropped in one interval.
 * @const {number}
 * @private
 */
shaka.abr.BufferBasedAbrManager.MAX_DROPPED_FRAMES_ = 5;
