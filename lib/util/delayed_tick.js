/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.DelayedTick');


/**
 * @summary
 * This class wraps a function so that we can defer executing the function by X
 * seconds.
 *
 * @final
 */
shaka.util.DelayedTick = class {
  /**
   * @param {function()} onTick
   */
  constructor(onTick) {
    /** @private {function()} */
    this.onTick_ = onTick;

    /** @private {?function()} */
    this.cancelPending_ = null;
  }

  /**
   * Call |onTick| after |delayInSeconds| has elapsed. If there is already a
   * pending call to |onTick|, the pending call will be canceled.
   *
   * @param {number} delayInSeconds
   * @return {!shaka.util.DelayedTick}
   */
  tickAfter(delayInSeconds) {
    // We only want one timeout set at a time, so make sure no other timeouts
    // are running.
    this.stop();

    // We will wrap these values in a function to allow us to cancel the timeout
    // we are about to create.
    let alive = true;
    let timeoutId = null;

    this.cancelPending_ = () => {
      window.clearTimeout(timeoutId);
      alive = false;
    };

    // For some reason, a timeout may still execute after we have cleared it in
    // our tests. We will wrap the callback so that we can double-check our
    // |alive| flag.
    const onTick = () => {
      if (alive) {
        this.onTick_();
      }
    };

    timeoutId = window.setTimeout(onTick, delayInSeconds * 1000);

    return this;
  }

  /**
   * Cancel any pending calls to |onTick|. If there are no pending calls to
   * |onTick|, this will be a no-op.
   */
  stop() {
    if (this.cancelPending_) {
      this.cancelPending_();
      this.cancelPending_ = null;
    }
  }
};
