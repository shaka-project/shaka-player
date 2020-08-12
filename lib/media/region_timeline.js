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

goog.provide('shaka.media.RegionTimeline');

goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * The region timeline is a set of unique timeline region info entries. When
 * a new entry is added, the |onAddRegion| callback will be called.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.media.RegionTimeline = class {
  /** Constructor */
  constructor(getSeekRange) {
    /** @private {function(shaka.extern.TimelineRegionInfo)} */
    this.onAddRegion_ = (region) => {};
    /** @private {!Set.<shaka.extern.TimelineRegionInfo>} */
    this.regions_ = new Set();
    /** @private {function():{start: number, end: number}} */
    this.getSeekRange_ = getSeekRange;

    /**
     * Make sure all of the regions we're tracking are within the
     * seek range or further in the future. We don't want to store
     * regions that fall before the start of the seek range.
     *
     * @private {shaka.util.Timer}
     */
    this.filterTimer_ = new shaka.util.Timer(() => {
      this.filterBySeekRange_();
    }).tickEvery(
        /* seconds= */ shaka.media.RegionTimeline.REGION_FILTER_INTERVAL);
  }

  /** @override */
  release() {
    // Prevent us from holding onto any external references via the callback.
    this.onAddRegion_ = (region) => {};
    this.regions_.clear();
    this.filterTimer_.stop();
  }

  /**
   * Set the callbacks for events. This will override any previous calls to
   * |setListeners|.
   *
   * @param {function(shaka.extern.TimelineRegionInfo)} onAddRegion
   *    Set the callback for when we add a new region. This callback will only
   *    be called when a region is unique (we reject duplicate regions).
   */
  setListeners(onAddRegion) {
    this.onAddRegion_ = onAddRegion;
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  addRegion(region) {
    const similarRegion = this.findSimilarRegion_(region);

    // Make sure we don't add duplicate regions. We keep track of this here
    // instead of making the parser track it.
    if (similarRegion == null) {
      this.regions_.add(region);
      this.onAddRegion_(region);
    }
  }

  /**
   * @private
   */
  filterBySeekRange_() {
    const seekRange = this.getSeekRange_();
    for (const region of this.regions_) {
      // Only consider the seek range start here.
      // Future regions might become relevant eventually,
      // but regions that are in the past and can't ever be
      // seeked to will never come up again, and there's no
      // reson to store or process them.
      if (region.endTime < seekRange.start) {
        this.regions_.delete(region);
      }
    }
  }

  /**
   * Find a region in the timeline that has the same scheme id uri, event id,
   * start time and end time. If these four parameters match, we assume it
   * to be the same region. If no similar region can be found, |null| will be
   * returned.
   *
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {?shaka.extern.TimelineRegionInfo}
   * @private
   */
  findSimilarRegion_(region) {
    for (const existing of this.regions_) {
      // The same scheme ID and time range means that it is similar-enough to
      // be the same region.
      const isSimilar = existing.schemeIdUri == region.schemeIdUri &&
                        existing.id == region.id &&
                        existing.startTime == region.startTime &&
                        existing.endTime == region.endTime;

      if (isSimilar) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Get an iterable for all the regions in the timeline. This will allow
   * others to see what regions are in the timeline while not being able to
   * change the collection.
   *
   * @return {!Iterable.<shaka.extern.TimelineRegionInfo>}
   */
  regions() {
    return this.regions_;
  }
};

/** @const {number} */
shaka.media.RegionTimeline.REGION_FILTER_INTERVAL = 2; // in seconds
