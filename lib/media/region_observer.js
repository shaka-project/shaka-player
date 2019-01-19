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

goog.provide('shaka.media.RegionObserver');

goog.require('shaka.media.RegionTimeline');


/**
 * The region observer watches a region timeline and playhead, and fires events
 * (onEnter, onExit, and onSkip) as the playhead moves.
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @final
 */
shaka.media.RegionObserver = class {
  /**
   * Create a region observer for the given timeline. The observer does not
   * own the timeline, only uses it. This means that the observer should NOT
   * destroy the timeline.
   *
   * @param {!shaka.media.RegionTimeline} timeline
   */
  constructor(timeline) {
    /** @private {shaka.media.RegionTimeline} */
    this.timeline_ = timeline;

    /**
     * A mapping between a region and where we previously were relative to it.
     * When the value here differs from what we calculate, it means we moved and
     * should fire an event.
     *
     * @private {!Map.<shaka.extern.TimelineRegionInfo,
     *                 shaka.media.RegionObserver.RelativePosition_>}
     */
    this.oldPosition_ = new Map();

    /** @private {shaka.media.RegionObserver.EventListener} */
    this.onEnter_ = (region, seeking) => {};
    /** @private {shaka.media.RegionObserver.EventListener} */
    this.onExit_ = (region, seeking) => {};
    /** @private {shaka.media.RegionObserver.EventListener} */
    this.onSkip_ = (region, seeking) => {};

    // To make the rules easier to read, alias all the relative positions.
    const RelativePosition = shaka.media.RegionObserver.RelativePosition_;
    const BEFORE_THE_REGION = RelativePosition.BEFORE_THE_REGION;
    const IN_THE_REGION = RelativePosition.IN_THE_REGION;
    const AFTER_THE_REGION = RelativePosition.AFTER_THE_REGION;

    /**
     * A read-only collection of rules for what to do when we change position
     * relative to a region.
     *
     * @private {!Iterable.<shaka.media.RegionObserver.Rule_>}
     */
    this.rules_ = [
      {
        weWere: null,
        weAre: IN_THE_REGION,
        invoke: (region, seeking) => this.onEnter_(region, seeking),
      },
      {
        weWere: BEFORE_THE_REGION,
        weAre: IN_THE_REGION,
        invoke: (region, seeking) => this.onEnter_(region, seeking),
      },
      {
        weWere: AFTER_THE_REGION,
        weAre: IN_THE_REGION,
        invoke: (region, seeking) => this.onEnter_(region, seeking),
      },
      {
        weWere: IN_THE_REGION,
        weAre: BEFORE_THE_REGION,
        invoke: (region, seeking) => this.onExit_(region, seeking),
      },
      {
        weWere: IN_THE_REGION,
        weAre: AFTER_THE_REGION,
        invoke: (region, seeking) => this.onExit_(region, seeking),
      },
      {
        weWere: BEFORE_THE_REGION,
        weAre: AFTER_THE_REGION,
        invoke: (region, seeking) => this.onSkip_(region, seeking),
      },
      {
        weWere: AFTER_THE_REGION,
        weAre: BEFORE_THE_REGION,
        invoke: (region, seeking) => this.onSkip_(region, seeking),
      },
    ];
  }

  /** @override */
  release() {
    this.timeline_ = null;

    // Clear our maps so that we are not holding onto any more information than
    // needed.
    this.oldPosition_.clear();

    // Clear the callbacks so that we don't hold onto any references external
    // to this class.
    this.onEnter_ = (region, seeking) => {};
    this.onExit_ = (region, seeking) => {};
    this.onSkip_ = (region, seeking) => {};
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    const RegionObserver = shaka.media.RegionObserver;

    for (const region of this.timeline_.regions()) {
      const previousPosition = this.oldPosition_.get(region);
      const currentPosition = RegionObserver.determinePositionRelativeTo_(
          region, positionInSeconds);

      // We will only use |previousPosition| and |currentPosition|, so we can
      // update our state now.
      this.oldPosition_.set(region, currentPosition);

      for (const rule of this.rules_) {
        if (rule.weWere == previousPosition && rule.weAre == currentPosition) {
          rule.invoke(region, wasSeeking);
        }
      }
    }
  }

  /**
   * Set all the listeners. This overrides any previous calls to |setListeners|.
   *
   * @param {shaka.media.RegionObserver.EventListener} onEnter
   *    The callback for when we move from outside a region to inside a region.
   * @param {shaka.media.RegionObserver.EventListener} onExit
   *    The callback for when we move from inside a region to outside a region.
   * @param {shaka.media.RegionObserver.EventListener} onSkip
   *    The callback for when we move from before to after a region or from
   *    after to before a region.
   */
  setListeners(onEnter, onExit, onSkip) {
    this.onEnter_ = onEnter;
    this.onExit_ = onExit;
    this.onSkip_ = onSkip;
  }

  /**
   * Get the relative position of the playhead to |region| when the playhead is
   * at |seconds|. We treat the region's start and end times as inclusive
   * bounds.
   *
   * @param {shaka.extern.TimelineRegionInfo} region
   * @param {number} seconds
   * @return {shaka.media.RegionObserver.RelativePosition_}
   * @private
   */
  static determinePositionRelativeTo_(region, seconds) {
    const RelativePosition = shaka.media.RegionObserver.RelativePosition_;

    if (seconds < region.startTime) {
      return RelativePosition.BEFORE_THE_REGION;
    }

    if (seconds > region.endTime) {
      return RelativePosition.AFTER_THE_REGION;
    }

    return RelativePosition.IN_THE_REGION;
  }
};

/**
 * An enum of relative positions between the playhead and a region. Each is
 * phrased so that it works in "The playhead is X" where "X" is any value in
 * the enum.
 *
 * @enum {number}
 * @private
 */
shaka.media.RegionObserver.RelativePosition_ = {
  BEFORE_THE_REGION: 1,
  IN_THE_REGION: 2,
  AFTER_THE_REGION: 3,
};

/**
 * All region observer events (onEnter, onExit, and onSkip) will be passed the
 * region that the playhead is interacting with and whether or not the playhead
 * moving is part of a seek event.
 *
 * @typedef {function(shaka.extern.TimelineRegionInfo, boolean)}
 */
shaka.media.RegionObserver.EventListener;

/**
 * @typedef {{
 *    weWere: ?shaka.media.RegionObserver.RelativePosition_,
 *    weAre: ?shaka.media.RegionObserver.RelativePosition_,
 *    invoke: shaka.media.RegionObserver.EventListener
 * }}
 *
 * @private
 */
shaka.media.RegionObserver.Rule_;
