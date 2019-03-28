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

    /** @private {!Map.<shaka.media.BufferingObserver.State, number>} */
    this.thresholds_ = new Map()
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

    const oldState = this.previousState_;
    const newState = (bufferedToEnd || bufferLead >= threshold) ?
                     (State.SATISFIED) :
                     (State.STARVING);

    // Save the new state now so that calls to |getState| from any callbacks
    // will be accurate.
    this.previousState_ = newState;

    // Return |true| only when the state has changed.
    return oldState != newState;
  }

  /**
   * Set which state that the observer should think playback was in.
   *
   * @param {shaka.media.BufferingObserver.State} state
   */
  setState(state) {
    this.previousState_ = state;
  }

  /**
   * Get the state that the observer last thought playback was in.
   *
   * @return {shaka.media.BufferingObserver.State}
   */
  getState() {
    return this.previousState_;
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
