/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.RegionObserver');

goog.require('shaka.media.IPlayheadObserver');
goog.require('shaka.media.RegionTimeline');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');


/**
 * The region observer watches a region timeline and playhead, and fires events
 * ('enter', 'exit', 'skip') as the playhead moves.
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @template T
 * @final
 */
shaka.media.RegionObserver = class extends shaka.util.FakeEventTarget {
  /**
   * Create a region observer for the given timeline. The observer does not
   * own the timeline, only uses it. This means that the observer should NOT
   * destroy the timeline.
   *
   * @param {!shaka.media.RegionTimeline<T>} timeline
   * @param {boolean} startsPastZero
   */
  constructor(timeline, startsPastZero) {
    super();

    /** @private {shaka.media.RegionTimeline<T>} */
    this.timeline_ = timeline;

    /**
     * Whether the asset is expected to start at a time beyond 0 seconds.
     * For example, if the asset is a live stream.
     * If true, we will not start polling for regions until the playhead has
     * moved past 0 seconds, to avoid bad behaviors where the current time is
     * briefly 0 before we have enough data to play.
     * @private {boolean}
     */
    this.startsPastZero_ = startsPastZero;

    /**
     * A mapping between a region and where we previously were relative to it.
     * When the value here differs from what we calculate, it means we moved and
     * should fire an event.
     *
     * @private {!Map<T, shaka.media.RegionObserver.RelativePosition_>}
     */
    this.oldPosition_ = new Map();

    // To make the rules easier to read, alias all the relative positions.
    const RelativePosition = shaka.media.RegionObserver.RelativePosition_;
    const BEFORE_THE_REGION = RelativePosition.BEFORE_THE_REGION;
    const IN_THE_REGION = RelativePosition.IN_THE_REGION;
    const AFTER_THE_REGION = RelativePosition.AFTER_THE_REGION;

    /**
     * A read-only collection of rules for what to do when we change position
     * relative to a region.
     *
     * @private {!Iterable<shaka.media.RegionObserver.Rule_>}
     */
    this.rules_ = [
      {
        weWere: null,
        weAre: IN_THE_REGION,
        invoke: (region, seeking) => this.onEvent_('enter', region, seeking),
      },
      {
        weWere: BEFORE_THE_REGION,
        weAre: IN_THE_REGION,
        invoke: (region, seeking) => this.onEvent_('enter', region, seeking),
      },
      {
        weWere: AFTER_THE_REGION,
        weAre: IN_THE_REGION,
        invoke: (region, seeking) => this.onEvent_('enter', region, seeking),
      },
      {
        weWere: IN_THE_REGION,
        weAre: BEFORE_THE_REGION,
        invoke: (region, seeking) => this.onEvent_('exit', region, seeking),
      },
      {
        weWere: IN_THE_REGION,
        weAre: AFTER_THE_REGION,
        invoke: (region, seeking) => this.onEvent_('exit', region, seeking),
      },
      {
        weWere: BEFORE_THE_REGION,
        weAre: AFTER_THE_REGION,
        invoke: (region, seeking) => {
          if (seeking) {
            this.onEvent_('skip', region, seeking);
          } else {
            // This is the case of regions whose duration is smaller than the
            // resolution of our polling.
            this.onEvent_('enter', region, seeking);
            this.onEvent_('exit', region, seeking);
          }
        },
      },
      {
        weWere: AFTER_THE_REGION,
        weAre: BEFORE_THE_REGION,
        invoke: (region, seeking) => this.onEvent_('skip', region, seeking),
      },
    ];

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(this.timeline_, 'regionremove', (event) => {
      /** @type {T} */
      const region = event['region'];
      this.oldPosition_.delete(region);
    });
  }

  /** @override */
  release() {
    this.timeline_ = null;

    // Clear our maps so that we are not holding onto any more information than
    // needed.
    this.oldPosition_.clear();

    this.eventManager_.release();
    this.eventManager_ = null;

    super.release();
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    const RegionObserver = shaka.media.RegionObserver;
    if (this.startsPastZero_ && positionInSeconds == 0) {
      // Don't start checking regions until the timeline has begun moving.
      return;
    }
    // Now that we have seen the playhead go past 0, it's okay if it goes
    // back there (e.g. seeking back to the start).
    this.startsPastZero_ = false;

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
   * Dispatch events of the given type.  All event types in this class have the
   * same parameters: region and seeking.
   *
   * @param {string} eventType
   * @param {T} region
   * @param {boolean} seeking
   * @private
   */
  onEvent_(eventType, region, seeking) {
    const event = new shaka.util.FakeEvent(eventType, new Map([
      ['region', region],
      ['seeking', seeking],
    ]));
    this.dispatchEvent(event);
  }

  /**
   * Get the relative position of the playhead to |region| when the playhead is
   * at |seconds|. We treat the region's start and end times as inclusive
   * bounds.
   *
   * @template T
   * @param {T} region
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
 * @typedef {function(?, boolean)}
 */
shaka.media.RegionObserver.EventListener;

/**
 * @typedef {{
 *    weWere: ?shaka.media.RegionObserver.RelativePosition_,
 *    weAre: ?shaka.media.RegionObserver.RelativePosition_,
 *    invoke: shaka.media.RegionObserver.EventListener,
 * }}
 *
 * @private
 */
shaka.media.RegionObserver.Rule_;
