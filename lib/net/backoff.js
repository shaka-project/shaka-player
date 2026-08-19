/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.Backoff');

goog.require('goog.asserts');
goog.require('shaka.util.Error');
goog.require('shaka.util.Timer');


/**
 * Backoff represents delay and backoff state.  This is used by NetworkingEngine
 * for individual requests and by StreamingEngine to retry streaming failures.
 *
 * @final
 */
shaka.net.Backoff = class {
  /**
   * @param {shaka.extern.RetryParameters} parameters
   * @param {boolean=} autoReset  If true, start at a "first retry" state and
   *   and auto-reset that state when we reach maxAttempts.
   *   Default set to false.
   */
  constructor(parameters, autoReset = false) {
    // Set defaults as we unpack these, so that individual app-level requests in
    // NetworkingEngine can be missing parameters.

    const defaults = shaka.net.Backoff.defaultRetryParameters();

    /**
     * @const
     * @private {number}
     */
    this.maxAttempts_ = (parameters.maxAttempts == null) ?
        defaults.maxAttempts : parameters.maxAttempts;

    goog.asserts.assert(this.maxAttempts_ >= 1, 'maxAttempts should be >= 1');

    /**
     * @const
     * @private {number}
     */
    this.baseDelay_ = (parameters.baseDelay == null) ?
        defaults.baseDelay : parameters.baseDelay;

    goog.asserts.assert(this.baseDelay_ >= 0, 'baseDelay should be >= 0');

    /**
     * @const
     * @private {number}
     */
    this.fuzzFactor_ = (parameters.fuzzFactor == null) ?
        defaults.fuzzFactor : parameters.fuzzFactor;

    goog.asserts.assert(this.fuzzFactor_ >= 0, 'fuzzFactor should be >= 0');

    /**
     * @const
     * @private {number}
     */
    this.backoffFactor_ = (parameters.backoffFactor == null) ?
        defaults.backoffFactor : parameters.backoffFactor;

    goog.asserts.assert(
        this.backoffFactor_ >= 0, 'backoffFactor should be >= 0');

    /** @private {number} */
    this.numAttempts_ = 0;

    /** @private {number} */
    this.nextUnfuzzedDelay_ = this.baseDelay_;

    /** @private {boolean} */
    this.autoReset_ = autoReset;

    /**
     * The resolvers of the delay currently being awaited by attempt(), if any.
     * @private {?Promise.PromiseWithResolvers}
     */
    this.pendingDelay_ = null;

    /**
     * The timer backing the delay currently being awaited by attempt(), if any.
     * @private {shaka.util.Timer}
     */
    this.pendingTimer_ = null;

    if (this.autoReset_) {
      // There is no delay before the first attempt.  In StreamingEngine (the
      // intended user of auto-reset mode), the first attempt was implied, so we
      // reset numAttempts to 1.  Therefore maxAttempts (which includes the
      // first attempt) must be at least 2 for us to see a delay.
      goog.asserts.assert(this.maxAttempts_ >= 2,
          'maxAttempts must be >= 2 for autoReset == true');
      this.numAttempts_ = 1;
    }
  }

  /**
   * @return {!Promise} Resolves when the caller may make an attempt, possibly
   *   after a delay.  Rejects if no more attempts are allowed, or if stop() is
   *   called while we are waiting out a delay.
   */
  async attempt() {
    if (this.numAttempts_ >= this.maxAttempts_) {
      if (this.autoReset_) {
        this.reset_();
      } else {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.PLAYER,
            shaka.util.Error.Code.ATTEMPTS_EXHAUSTED);
      }
    }

    const currentAttempt = this.numAttempts_;
    this.numAttempts_++;

    if (currentAttempt == 0) {
      goog.asserts.assert(!this.autoReset_, 'Failed to delay with auto-reset!');
      return;
    }

    // We've already tried before, so delay the Promise.

    // Fuzz the delay to avoid tons of clients hitting the server at once
    // after it recovers from whatever is causing it to fail.
    const fuzzedDelayMs = shaka.net.Backoff.fuzz_(
        this.nextUnfuzzedDelay_, this.fuzzFactor_);

    // Keep track of the delay so that stop() can interrupt it.  Otherwise,
    // shutting down while we wait out a long retry delay would be blocked until
    // the delay expired.
    // See https://github.com/shaka-project/shaka-player/issues/10413
    const delay = Promise.withResolvers();
    this.pendingDelay_ = delay;
    this.pendingTimer_ = shaka.net.Backoff.defer(fuzzedDelayMs, () => {
      this.pendingDelay_ = null;
      this.pendingTimer_ = null;
      delay.resolve();
    });

    await delay.promise;

    // Update delay_ for next time.
    this.nextUnfuzzedDelay_ *= this.backoffFactor_;
  }

  /**
   * Interrupts the delay of an in-progress attempt(), if any, making its
   * Promise reject with OPERATION_ABORTED right away.  Attempts made after this
   * are unaffected.
   */
  stop() {
    if (this.pendingTimer_) {
      this.pendingTimer_.stop();
      this.pendingTimer_ = null;
    }

    if (this.pendingDelay_) {
      const delay = this.pendingDelay_;
      this.pendingDelay_ = null;
      delay.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED));
    }
  }

  /**
   * Gets a copy of the default retry parameters.
   *
   * @return {shaka.extern.RetryParameters}
   */
  static defaultRetryParameters() {
    // Use a function rather than a constant member so the calling code can
    // modify the values without affecting other call results.
    return {
      maxAttempts: 2,
      baseDelay: 1000,
      backoffFactor: 2,
      fuzzFactor: 0.5,
      timeout: 30000,
      stallTimeout: 5000,
      connectionTimeout: 10000,
    };
  }

  /**
   * Fuzz the input value by +/- fuzzFactor.  For example, a fuzzFactor of 0.5
   * will create a random value that is between 50% and 150% of the input value.
   *
   * @param {number} value
   * @param {number} fuzzFactor
   * @return {number} The fuzzed value
   * @private
   */
  static fuzz_(value, fuzzFactor) {
    // A random number between -1 and +1.
    const negToPosOne = (Math.random() * 2.0) - 1.0;

    // A random number between -fuzzFactor and +fuzzFactor.
    const negToPosFuzzFactor = negToPosOne * fuzzFactor;

    // The original value, fuzzed by +/- fuzzFactor.
    return value * (1.0 + negToPosFuzzFactor);
  }

  /**
   * Reset state in autoReset mode.
   * @private
   */
  reset_() {
    goog.asserts.assert(this.autoReset_, 'Should only be used for auto-reset!');
    this.numAttempts_ = 1;
    this.nextUnfuzzedDelay_ = this.baseDelay_;
  }

  /**
   * This method is only public for testing. It allows us to intercept the
   * time-delay call.
   *
   * @param {number} delayInMs
   * @param {function()} callback
   * @return {shaka.util.Timer}
   */
  static defer(delayInMs, callback) {
    const timer = new shaka.util.Timer(callback);
    timer.tickAfter(delayInMs / 1000);
    return timer;
  }
};
