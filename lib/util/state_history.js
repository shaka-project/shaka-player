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

goog.provide('shaka.util.StateHistory');

goog.require('goog.asserts');


/**
 * This class is used to track the time spent in arbitrary states. When told of
 * a state, it will assume that state was active until a new state is provided.
 * When provided with identical states back-to-back, the existing entry will be
 * updated.
 *
 * @final
 */
shaka.util.StateHistory = class {
  constructor() {
    /**
     * The state that we think is still the current change. It is "open" for
     * updating.
     *
     * @private {?shaka.extern.StateChange}
     */
    this.open_ = null;

    /**
     * The stats that are "closed" for updating. The "open" state becomes closed
     * once we move to a new state.
     *
     * @private {!Array.<shaka.extern.StateChange>}
     */
    this.closed_ = [];
  }

  /**
   * @param {string} state
   */
  update(state) {
    // |open_| will only be |null| when we first call |update|.
    if (this.open_ == null) {
      this.start_(state);
    } else {
      this.update_(state);
    }
  }

  /**
   * Go through all entries in the history and count how much time was spend in
   * the given state.
   *
   * @param {string} state
   * @return {number}
   */
  getTimeSpentIn(state) {
    let sum = 0;

    if (this.open_ && this.open_.state == state) {
      sum += this.open_.duration;
    }

    for (const entry of this.closed_) {
      sum += entry.state == state ? entry.duration : 0;
    }

    return sum;
  }

  /**
   * Get a copy of each state change entry in the history. A copy of each entry
   * is created to break the reference to the internal data.
   *
   * @return {!Array.<shaka.extern.StateChange>}
   */
  getCopy() {
    const clone = (entry) => {
      return {
        timestamp: entry.timestamp,
        state: entry.state,
        duration: entry.duration,
      };
    };

    const copy = [];
    for (const entry of this.closed_) {
      copy.push(clone(entry));
    }
    if (this.open_) {
      copy.push(clone(this.open_));
    }

    return copy;
  }

  /**
   * @param {string} state
   * @private
   */
  start_(state) {
    goog.asserts.assert(
        this.open_ == null,
        'There must be no open entry in order when we start');

    this.open_ = {
      timestamp: this.getNowInSeconds_(),
      state: state,
      duration: 0,
    };
  }

  /**
   * @param {string} state
   * @private
   */
  update_(state) {
    goog.asserts.assert(
        this.open_,
        'There must be an open entry in order to update it');

    const currentTimeSeconds = this.getNowInSeconds_();

    // Always update the duration so that it can always be as accurate as
    // possible.
    this.open_.duration = currentTimeSeconds - this.open_.timestamp;

    // If the state has not changed, there is no need to add a new entry.
    if (this.open_.state == state) {
      return;
    }

    // We have changed states, so "close" the open state.
    this.closed_.push(this.open_);
    this.open_ = {
      timestamp: currentTimeSeconds,
      state: state,
      duration: 0,
    };
  }

  /**
   * Get the system time in seconds.
   *
   * @return {number}
   * @private
   */
  getNowInSeconds_() {
    return Date.now() / 1000;
  }
};
