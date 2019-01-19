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

goog.provide('shaka.media.BufferingObserver');

goog.require('shaka.media.IPlayheadObserver');


/**
 * The buffering observer watches how much content the video element has
 * buffered and raises events when the state changes (enough => not enough or
 * vice versa).
 *
 * The one listening to the events should take action to avoid running out of
 * content.
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @final
 */
shaka.media.BufferingObserver = class {
  /**
   * @param {number} thresholdWhenStarving
   *    The threshold for how many seconds worth of content must be buffered
   *    ahead of the playhead position to leave a STARVING state.
   * @param {shaka.media.BufferingObserver.State} initialState
   *    The state that the observer starts in. We allow this so that it is
   *    easier to test, rather than having to "force" the observer into a
   *    particular state through simulation in the test.
   * @param {function(number):number} getSecondsBufferedAfter
   *    Get the number of seconds after the given time (in seconds) that have
   *    buffered.
   * @param {function():boolean} isBufferedToEnd
   *    When we call |poll|, we need to know if we are buffered to the end of
   *    the presentation. This method should return |true| when we have
   *    buffered to the end of the current presentation. In terms of live
   *    content, this will return |true| when we are buffered to the live edge.
   */
  constructor(thresholdWhenStarving,
              initialState,
              getSecondsBufferedAfter,
              isBufferedToEnd) {
    /**
     * The state (SATISFIED vs STARVING) at last check.  This value will always
     * be "old", and we will compare it to what we evaluate in the "present" to
     * see when the state has changed.
     *
     * @private {shaka.media.BufferingObserver.State}
     */
    this.previousState_ = initialState;

    /**
     * The minimum amount of content that must be buffered ahead of the playhead
     * to avoid a transition from SATISFIED to STARVING, i.e. to remain in
     * SATISFIED.  This will be used when we the previous state is SATISFIED.
     *
     * Combined with |thresholdWhenStarving_|, this adds hysteresis to the
     * state machine to avoid frequent switches around a single threshold.
     * https://bit.ly/2QLQNtG
     *
     * @private {number}
     */
    this.thresholdWhenSatisfied_ = 0.5;

    /**
     * The minimum amount of content that must be buffered ahead of the playhead
     * to transition from STARVING to SATISFIED.  This will be used when the
     * previous state is STARVING.
     *
     * Combined with |thresholdWhenSatisfied_|, this adds hysteresis to the
     * state machine to avoid frequent switches around a single threshold.
     * https://bit.ly/2QLQNtG
     *
     * @private {number}
     */
    this.thresholdWhenStarving_ = thresholdWhenStarving;

    /**
     * When we call |poll|, we need to know if we are buffered to the end of
     * the presentation. This method should return |true| when we have
     * buffered to the end of the current presentation. In terms of live
     * content, this will return |true| when we are buffered to the live edge.
     *
     * Checking if we are buffered to the end of the presentation relies on a
     * number of factors. Which factors can even depend on what it loaded. To
     * avoid having all those factors here, we use an external callback so that
     * this implementation can be move flexible and easier to test.
     *
     * @private {function():boolean}
     */
    this.isBufferedToEnd_ = isBufferedToEnd;

    /**
     * A callback to get the number of seconds of buffered content that comes
     * after the given presentation time (in seconds).
     *
     * @private {function(number):number}
     */
    this.getSecondsBufferedAfter_ = getSecondsBufferedAfter;

    /** @private {function()} */
    this.onStarving_ = () => {};

    /** @private {function()} */
    this.onSatisfied_ = () => {};

    /**
     * A series of rules that we will use to determine what callback to use
     * when the playhead moves.
     *
     * @private {!Array.<shaka.media.BufferingObserver.Rule_>}
     */
    this.rules_ = [
      {
        was: shaka.media.BufferingObserver.State.STARVING,
        is: shaka.media.BufferingObserver.State.SATISFIED,
        doThis: () => this.onSatisfied_(),
      },
      {
        was: shaka.media.BufferingObserver.State.SATISFIED,
        is: shaka.media.BufferingObserver.State.STARVING,
        doThis: () => this.onStarving_(),
      },
    ];

    // If the thresholds are inverted, it could be possible that we miss a
    // transition from SATISFIED to STARVING in some cases.  This could have
    // serious consequences for playback, preventing us from entering a
    // buffering state, and causing interruptions in playback with no cause
    // obvious to the user.
    if (this.thresholdWhenSatisfied_ >= this.thresholdWhenStarving_) {
      // If this happens, warn the user and reduce |thresholdWhenSatisfied_| to
      // restore the correct mathematical relationship between the two.  The
      // behavior may still be poor, since the difference between the two
      // thresholds will be small and the hysteresis will be less effective.
      shaka.log.alwaysWarn(
          'Rebuffering threshold is set too low!  This could cause poor ' +
          'buffering behavior during playback!');
      this.thresholdWhenSatisfied_ = this.thresholdWhenStarving_ / 2;
    }
  }

  /** @override */
  release() {
    // Clear the callbacks so that we don't hold references to parts of the
    // listeners.
    this.onStarving_ = () => {};
    this.onSatisfied_ = () => {};
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    const State = shaka.media.BufferingObserver.State;
    // Our threshold for how much we need before we declare ourselves as
    // starving is based on whether or not we were just starving. If we
    // were just starving, we are more likely to starve again, so we require
    // more content to be buffered than if we were not just starving.
    const threshold = this.previousState_ == State.SATISFIED ?
                      this.thresholdWhenSatisfied_ :
                      this.thresholdWhenStarving_;

    // Check how far ahead of |currentTime| we have buffered. The most we have,
    // the better off we are.
    const amountBuffered = this.getSecondsBufferedAfter_(positionInSeconds);

    /** @type {boolean} */
    const isBufferedToEnd = this.isBufferedToEnd_();

    const currentState = (isBufferedToEnd || amountBuffered >= threshold) ?
                         (State.SATISFIED) :
                         (State.STARVING);

    // Execute all the rules that apply to the current state.
    for (const rule of this.rules_) {
      if (this.previousState_ == rule.was && currentState == rule.is) {
        rule.doThis();
      }
    }

    // Store the current state so that we can detect a change in state next
    // time |applyNewPlayheadPosition| is called.
    this.previousState_ = currentState;
  }

  /**
   * Set the listeners. This will override any previous calls to |setListeners|.
   *
   * @param {function()} onStarving
   *    The callback for when we change from "satisfied" to "starving".
   * @param {function()} onSatisfied
   *    The callback for when we change from "starving" to "satisfied".
   */
  setListeners(onStarving, onSatisfied) {
    this.onStarving_ = onStarving;
    this.onSatisfied_ = onSatisfied;
  }
};

/**
 * Rather than using booleans to communicate what state we are in, we have this
 * enum.
 *
 * @enum {number}
 */
shaka.media.BufferingObserver.State = {
  STARVING: 0,
  SATISFIED: 1,
};

/**
 * @typedef {{
 *    was: shaka.media.BufferingObserver.State,
 *    is: shaka.media.BufferingObserver.State,
 *    doThis: function()
 * }}
 */
shaka.media.BufferingObserver.Rule_;
