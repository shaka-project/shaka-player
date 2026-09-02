/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
     * When we schedule a timeout, this callback cancels it.
     *
     * @private {?function()}
     */
    this.cancelPending_ = null;
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
    this.schedule_(() => {
      this.onTick_();
    }, seconds);

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

    if (goog.DEBUG) {
      // Capture the stack trace by making a fake error.
      const stackTrace = Error('Timer created').stack;
      shaka.util.Timer.activeTimers.set(this, stackTrace);
    }
    this.scheduleRepeating_(seconds);

    return this;
  }

  /**
   * Stop the timer and clear the previous behaviour. The timer is still usable
   * after calling |stop|.
   *
   * @export
   */
  stop() {
    this.cancelPending_?.();
    this.cancelPending_ = null;
    if (goog.DEBUG) {
      shaka.util.Timer.activeTimers.delete(this);
    }
  }

  /**
   * Schedule |callback| to be called after |delayInSeconds|. If there is
   * already a pending call, it will be canceled first.
   *
   * @param {function()} callback
   * @param {number} delayInSeconds
   * @private
   */
  schedule_(callback, delayInSeconds) {
    // We will wrap these values in a function to allow us to cancel the
    // timeout we are about to create.
    let alive = true;
    let timeoutId = null;

    this.cancelPending_ = () => {
      clearTimeout(timeoutId);
      alive = false;
    };

    // For some reason, a timeout may still execute after we have cleared it
    // in our tests. We will wrap the callback so that we can double-check our
    // |alive| flag.
    const wrappedCallback = () => {
      if (alive) {
        callback();
      }
    };

    timeoutId = setTimeout(wrappedCallback, delayInSeconds * 1000);
  }

  /**
   * Schedule |onTick_| to be called repeatedly every |seconds|.
   *
   * @param {number} seconds
   * @private
   */
  scheduleRepeating_(seconds) {
    this.schedule_(() => {
      // Schedule the timer again first. |onTick_| could cancel the timer and
      // rescheduling first simplifies the implementation.
      this.scheduleRepeating_(seconds);
      this.onTick_();
    }, seconds);
  }
};

if (goog.DEBUG) {
  /**
   * Tracks all active timer instances, along with the stack trace that created
   * that timer.
   * @type {!Map<!shaka.util.Timer, string>}
   */
  shaka.util.Timer.activeTimers = new Map();
}
