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


/**
 * The region timeline is a set of unique timeline region info entries. When
 * a new entry is added, the |onAddRegion| callback will be called.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.media.RegionTimeline = class {
  constructor() {
    /** @private {function(shaka.extern.TimelineRegionInfo)} */
    this.onAddRegion_ = (region) => {};
    /** @private {!Set.<shaka.extern.TimelineRegionInfo>} */
    this.regions_ = new Set();
  }

  /** @override */
  release() {
    // Prevent us from holding onto any external references via the callback.
    this.onAddRegion_ = (region) => {};
    this.regions_.clear();
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
   * Find a region in the timeline that has the same scheme id uri, start time,
   * and end time. If these three parameters match, we assume it to be the same
   * region. If no similar region can be found, |null| will be returned.
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
