/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.BufferingObserver');

goog.require('shaka.util.MediaElementEvent');


/**
 * The buffering observer watches how much content has been buffered and raises
 * events when the state changes (enough => not enough or vice versa).
 *
 * @final
 */
shaka.media.BufferingObserver = class {
  /**
   * @param {number} thresholdWhenStarving
   * @param {number} thresholdWhenSatisfied
   */
  constructor(thresholdWhenStarving, thresholdWhenSatisfied) {
    const State = shaka.media.BufferingObserver.State;

    /** @private {shaka.media.BufferingObserver.State} */
    this.previousState_ = State.SATISFIED;

    /** @private {!Map<shaka.media.BufferingObserver.State, number>} */
    this.thresholds_ = new Map()
        .set(State.SATISFIED, thresholdWhenSatisfied)
        .set(State.STARVING, thresholdWhenStarving);

    /** @private {number} */
    this.lastRebufferTime_ = 0;
  }

  /**
   * @param {number} thresholdWhenStarving
   * @param {number} thresholdWhenSatisfied
   */
  setThresholds(thresholdWhenStarving, thresholdWhenSatisfied) {
    const State = shaka.media.BufferingObserver.State;
    this.thresholds_
        .set(State.SATISFIED, thresholdWhenSatisfied)
        .set(State.STARVING, thresholdWhenStarving);
  }

  /**
   * Update the observer by telling it how much content has been buffered (in
   * seconds) and if we are buffered to the end of the presentation. If the
   * controller believes the state has changed, it will return |true|.
   *
   * @param {number} bufferLead
   * @param {boolean} bufferedToEnd
   * @return {boolean}
   */
  update(bufferLead, bufferedToEnd) {
    const State = shaka.media.BufferingObserver.State;

    /**
     * Our threshold for how much we need before we declare ourselves as
     * starving is based on whether or not we were just starving. If we
     * were just starving, we are more likely to starve again, so we require
     * more content to be buffered than if we were not just starving.
     *
     * @type {number}
     */
    const threshold = this.thresholds_.get(this.previousState_);

    const newState =
        (bufferedToEnd || (bufferLead >= threshold && bufferLead > 0)) ?
        (State.SATISFIED) :
        (State.STARVING);

    return this.setState(newState);
  }

  /**
   * Set which state that the observer should think playback was in.
   *
   * @param {shaka.media.BufferingObserver.State} state
   * @return {boolean}
   */
  setState(state) {
    const State = shaka.media.BufferingObserver.State;

    // Return |true| only when the state has changed.
    const stateChanged = this.previousState_ !== state;
    this.previousState_ = state;
    if (stateChanged && state === State.SATISFIED) {
      this.lastRebufferTime_ = Date.now();
    }
    return stateChanged;
  }

  /**
   * Get the state that the observer last thought playback was in.
   *
   * @return {shaka.media.BufferingObserver.State}
   */
  getState() {
    return this.previousState_;
  }

  /**
   * Return the last time that the state went from |STARVING| to |SATISFIED|.
   * @return {number}
   */
  getLastRebufferTime() {
    return this.lastRebufferTime_;
  }

  /**
   * Reset the last rebuffer time to zero.
   */
  resetLastRebufferTime() {
    this.lastRebufferTime_ = 0;
  }

  /**
   * @param {!shaka.util.MediaElementEvent} event
   * @return {boolean}
   */
  reportEvent(event) {
    let state = undefined;
    switch (event) {
      case shaka.util.MediaElementEvent.SEEKING:
      case shaka.util.MediaElementEvent.WAITING:
        state = shaka.media.BufferingObserver.State.STARVING;
        break;
      case shaka.util.MediaElementEvent.CAN_PLAY_THROUGH:
      case shaka.util.MediaElementEvent.PLAYING:
      case shaka.util.MediaElementEvent.SEEKED:
        state = shaka.media.BufferingObserver.State.SATISFIED;
        break;
    }
    return state !== undefined ? this.setState(state) : false;
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
