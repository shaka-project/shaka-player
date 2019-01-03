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
 * This class is used to track the changes in video state (playing, paused,
 * buffering, and ended) while playing content.
 *
 * @final
 */
shaka.util.StateHistory = class {
  /**
   * @param {!HTMLMediaElement} element
   */
  constructor(element) {
    /** @private {!HTMLMediaElement} */
    this.element_ = element;

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
   * @param {boolean} isBuffering
   */
  update(isBuffering) {
    // |open_| will only be |null| when we first call |update|.
    if (this.open_ == null) {
      this.start_(isBuffering);
    } else {
      this.update_(isBuffering);
    }
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
   * @param {boolean} isBuffering
   * @private
   */
  start_(isBuffering) {
    goog.asserts.assert(
        this.open_ == null,
        'There must be no open entry in order when we start');

    this.open_ = {
      timestamp: this.getNowInSeconds_(),
      state: this.getCurrentState_(isBuffering),
      duration: 0,
    };
  }

  /**
   * @param {boolean} isBuffering
   * @private
   */
  update_(isBuffering) {
    goog.asserts.assert(
        this.open_,
        'There must be an open entry in order to update it');

    const currentTimeSeconds = this.getNowInSeconds_();
    const currentState = this.getCurrentState_(isBuffering);

    // Always update the duration so that it can always be as accurate as
    // possible.
    this.open_.duration = currentTimeSeconds - this.open_.timestamp;

    // If the state has not changed, there is no need to add a new entry.
    if (this.open_.state == currentState) {
      return;
    }

    // We have changed states, so "close" the open state.
    this.closed_.push(this.open_);
    this.open_ = {
      timestamp: currentTimeSeconds,
      state: currentState,
      duration: 0,
    };
  }

  /**
   * @param {boolean} isBuffering
   * @return {string}
   * @private
   */
  getCurrentState_(isBuffering) {
    if (isBuffering) { return 'buffering'; }
    if (this.element_.ended) { return 'ended'; }
    if (this.element_.paused) { return 'paused'; }
    return 'playing';
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
