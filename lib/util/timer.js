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

goog.provide('shaka.util.Timer');

goog.require('shaka.util.DelayedTick');


/**
 * A timer allows a single function to be executed at a later time or at
 * regular intervals.
 *
 * @final
 * @export
 */
shaka.util.Timer = class {
  /**
   * Create a new timer. A timer is committed to a single callback function.
   * While there is no technical reason to do this, it is far easier to
   * understand and use timers when they are connected to one functional idea.
   *
   * @param {function()} onTick
   */
  constructor(onTick) {
    /**
     * Each time our timer "does work", we call that a "tick". The name comes
     * from old analog clocks.
     *
     * @private {function()}
     */
    this.onTick_ = onTick;

    /** @private {shaka.util.DelayedTick} */
    this.ticker_ = null;
  }

  /**
   * Have the timer call |onTick| now.
   *
   * @return {!shaka.util.Timer}
   * @export
   */
  tickNow() {
    this.stop();
    this.onTick_();

    return this;
  }

  /**
   * Have the timer call |onTick| after |seconds| has elapsed unless |stop| is
   * called first.
   *
   * @param {number} seconds
   * @return {!shaka.util.Timer}
   * @export
   */
  tickAfter(seconds) {
    this.stop();

    this.ticker_ = new shaka.util.DelayedTick(() => {
      this.onTick_();
    }).tickAfter(seconds);

    return this;
  }

  /**
   * Have the timer call |onTick| every |seconds| until |stop| is called.
   *
   * @param {number} seconds
   * @return {!shaka.util.Timer}
   * @export
   */
  tickEvery(seconds) {
    this.stop();

    this.ticker_ = new shaka.util.DelayedTick(() => {
      // Schedule the timer again first. |onTick_| could cancel the timer and
      // rescheduling first simplifies the implementation.
      this.ticker_.tickAfter(seconds);
      this.onTick_();
    }).tickAfter(seconds);

    return this;
  }

  /**
   * Stop the timer and clear the previous behaviour. The timer is still usable
   * after calling |stop|.
   *
   * @export
   */
  stop() {
    if (this.ticker_) {
      this.ticker_.stop();
      this.ticker_ = null;
    }
  }
};
