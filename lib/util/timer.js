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

    /**
     * When we schedule a timeout, it will give us an id for it. We can use this
     * id to cancel it anytime before it executes.
     *
     * @private {?number}
     */
    this.pendingTickId_ = null;
  }

  /**
   * Force the timer to tick. The timer will tick synchronously. This will
   * cancel any pending ticks (overriding previous calls to |start|).
   *
   * @export
   */
  tick() {
    // Clear any pending callbacks, part of |tick| is that it is overriding the
    // deferred tick with this immediate tick.
    if (this.pendingTickId_ != null) {
      clearTimeout(this.pendingTickId_);
      this.pendingTickId_ = null;
    }

    this.onTick_();
  }

  /**
   * Start the timer. The timer will tick in |delayInSeconds|. If
   * |repeating| is |true|, the timer will keep ticking until |stop| is
   * called.
   *
   * Calling |start| on a running timer will override any previous calls to
   * |start|.
   *
   * @param {number} delayInSeconds
   * @param {boolean} repeating
   * @export
   */
  start(delayInSeconds, repeating) {
    /** @type {number} */
    const delayInMs = delayInSeconds * 1000;

    /**
     * Wrap our |onTick_| callback with a function that will handle rescheduling
     * the callback.
     *
     * @type {function()}
     */
    const tick = () => {
      this.onTick_();

      this.pendingTickId_ = repeating ?
                            setTimeout(tick, delayInMs) :
                            null;
    };

    // Later calls to |start| override earlier calls to |start|, so cancel any
    // pending ticks.
    if (this.pendingTickId_ != null) {
      clearTimeout(this.pendingTickId_);
    }

    this.pendingTickId_ = setTimeout(tick, delayInMs);
  }

  /**
   * Stop the timer and cancel any pending ticks. The timer is still usable
   * after calling |stop|.
   *
   * @export
   */
  stop() {
    if (this.pendingTickId_ != null) {
      clearTimeout(this.pendingTickId_);
    }

    this.pendingTickId_ = null;
  }
};
