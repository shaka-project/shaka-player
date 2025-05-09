/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.RegionTimeline');

goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * The region timeline is a set of unique timeline region info entries. When
 * a new entry is added, the 'regionadd' event will be fired.  When an entry is
 * deleted, the 'regionremove' event will be fired.
 *
 * @implements {shaka.util.IReleasable}
 * @template T
 * @final
 */
shaka.media.RegionTimeline = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!function():{start: number, end: number}} getFilterRange
   */
  constructor(getFilterRange) {
    super();

    /** @private {!Map<string, T>} */
    this.regions_ = new Map();

    /** @private {!function():{start: number, end: number}} */
    this.getFilterRange_ = getFilterRange;

    /**
     * Make sure all of the regions we're tracking are within the
     * seek range or further in the future. We don't want to store
     * regions that fall before the start of the seek range.
     *
     * @private {shaka.util.Timer}
     */
    this.filterTimer_ = null;
  }

  /** @override */
  release() {
    this.regions_.clear();
    this.releaseTimer_();
    super.release();
  }

  /**
   * @param {T} region
   */
  addRegion(region) {
    const key = this.generateKey_(region);

    // Make sure we don't add duplicate regions. We keep track of this here
    // instead of making the parser track it.
    if (!this.regions_.has(key)) {
      this.regions_.set(key, region);
      const event = new shaka.util.FakeEvent('regionadd', new Map([
        ['region', region],
      ]));
      this.dispatchEvent(event);
      this.setupTimer_();
    }
  }

  /**
   * @private
   */
  filterByRange_() {
    const filterRange = this.getFilterRange_();
    for (const [key, region] of this.regions_) {
      // Only consider the seek range start here.
      // Future regions might become relevant eventually,
      // but regions that are in the past and can't ever be
      // seeked to will never come up again, and there's no
      // reason to store or process them.
      if (region.endTime < filterRange.start) {
        this.regions_.delete(key);
        const event = new shaka.util.FakeEvent('regionremove', new Map([
          ['region', region],
        ]));
        this.dispatchEvent(event);
      }
    }
    if (!this.regions_.size) {
      this.releaseTimer_();
    }
  }

  /** @private */
  setupTimer_() {
    if (this.filterTimer_) {
      return;
    }
    this.filterTimer_ = new shaka.util.Timer(() => {
      this.filterByRange_();
    }).tickEvery(
        /* seconds= */ shaka.media.RegionTimeline.REGION_FILTER_INTERVAL);
  }

  /** @private */
  releaseTimer_() {
    if (this.filterTimer_) {
      this.filterTimer_.stop();
      this.filterTimer_ = null;
    }
  }

  /**
   * Get an iterable for all the regions in the timeline. This will allow
   * others to see what regions are in the timeline while not being able to
   * change the collection.
   *
   * @return {!Iterable<T>}
   */
  regions() {
    return this.regions_.values();
  }

  /**
   * @param {T} region
   * @return {string}
   * @private
   */
  generateKey_(region) {
    return `${region.schemeIdUri}_${region.id}_` +
      `${region.startTime.toFixed(1)}_${region.endTime.toFixed(1)}`;
  }
};

/** @const {number} */
shaka.media.RegionTimeline.REGION_FILTER_INTERVAL = 2; // in seconds
