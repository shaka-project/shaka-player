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

goog.provide('shaka.net.Backoff');

goog.require('goog.asserts');
goog.require('shaka.util.PublicPromise');



/**
 * Backoff represents delay and backoff state.  This is used by NetworkingEngine
 * for individual requests and by StreamingEngine to retry streaming failures.
 *
 * @param {shakaExtern.RetryParameters} parameters
 * @param {boolean=} opt_autoReset  If true, start at a "first retry" state and
 *   and auto-reset that state when we reach maxAttempts.
 * @param {?function()=} opt_isCanceled  If provided, the backoff will end the
 *   current attempt early when this callback returns true.
 *
 * @struct
 * @constructor
 */
shaka.net.Backoff = function(parameters, opt_autoReset, opt_isCanceled) {
  // Set defaults as we unpack these, so that individual app-level requests in
  // NetworkingEngine can be missing parameters.

  let defaults = shaka.net.Backoff.defaultRetryParameters();

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

  goog.asserts.assert(this.backoffFactor_ >= 0, 'backoffFactor should be >= 0');

  /** @private {number} */
  this.numAttempts_ = 0;

  /** @private {number} */
  this.nextUnfuzzedDelay_ = this.baseDelay_;

  /** @private {boolean} */
  this.autoReset_ = opt_autoReset || false;

  /** @private {?function()} */
  this.isCanceled_ = opt_isCanceled || null;

  if (this.autoReset_) {
    // There is no delay before the first attempt.  In StreamingEngine (the
    // intended user of auto-reset mode), the first attempt was implied, so we
    // reset numAttempts to 1.  Therefore maxAttempts (which includes the first
    // attempt) must be at least 2 for us to see a delay.
    goog.asserts.assert(this.maxAttempts_ >= 2,
        'maxAttempts must be >= 2 for autoReset == true');
    this.numAttempts_ = 1;
  }
};


/**
 * @return {!Promise} Resolves when the caller may make an attempt, possibly
 *   after a delay.  Rejects if no more attempts are allowed.
 */
shaka.net.Backoff.prototype.attempt = function() {
  if (this.numAttempts_ >= this.maxAttempts_) {
    if (this.autoReset_) {
      this.reset_();
    } else {
      return Promise.reject();
    }
  }

  let p = new shaka.util.PublicPromise();
  if (this.numAttempts_) {
    // We've already tried before, so delay the Promise.

    // Fuzz the delay to avoid tons of clients hitting the server at once
    // after it recovers from whatever is causing it to fail.
    let fuzzedDelay =
        shaka.net.Backoff.fuzz_(this.nextUnfuzzedDelay_, this.fuzzFactor_);
    this.cancelableTimeout_(p.resolve, fuzzedDelay);

    // Update delay_ for next time.
    this.nextUnfuzzedDelay_ *= this.backoffFactor_;
  } else {
    goog.asserts.assert(!this.autoReset_, 'Failed to delay with auto-reset!');
    p.resolve();
  }

  this.numAttempts_++;
  return p;
};


/**
 * Gets a copy of the default retry parameters.
 *
 * @return {shakaExtern.RetryParameters}
 */
shaka.net.Backoff.defaultRetryParameters = function() {
  // Use a function rather than a constant member so the calling code can
  // modify the values without affecting other call results.
  return {
    maxAttempts: 2,
    baseDelay: 1000,
    backoffFactor: 2,
    fuzzFactor: 0.5,
    timeout: 0
  };
};


/**
 * Fuzz the input value by +/- fuzzFactor.  For example, a fuzzFactor of 0.5
 * will create a random value that is between 50% and 150% of the input value.
 *
 * @param {number} value
 * @param {number} fuzzFactor
 * @return {number} The fuzzed value
 * @private
 */
shaka.net.Backoff.fuzz_ = function(value, fuzzFactor) {
  // A random number between -1 and +1.
  let negToPosOne = (Math.random() * 2.0) - 1.0;

  // A random number between -fuzzFactor and +fuzzFactor.
  let negToPosFuzzFactor = negToPosOne * fuzzFactor;

  // The original value, fuzzed by +/- fuzzFactor.
  return value * (1.0 + negToPosFuzzFactor);
};


/**
 * Reset state in autoReset mode.
 * @private
 */
shaka.net.Backoff.prototype.reset_ = function() {
  goog.asserts.assert(this.autoReset_, 'Should only be used for auto-reset!');
  this.numAttempts_ = 1;
  this.nextUnfuzzedDelay_ = this.baseDelay_;
};


/**
 * Makes a timeout that cancels with isCanceled_ if this has an isCanceled_.
 *
 * @param {Function} fn The callback to invoke when the timeout expires.
 * @param {number} timeoutMs The timeout in milliseconds.
 * @private
 */
shaka.net.Backoff.prototype.cancelableTimeout_ = function(fn, timeoutMs) {
  if (this.isCanceled_) {
    if (this.isCanceled_() || timeoutMs == 0) {
      fn();
    } else {
      // This will break the timeout into 200 ms intervals, so that isCanceled_
      // will be checked periodically.
      let timeToUse = Math.min(200, timeoutMs);
      shaka.net.Backoff.setTimeout_(function() {
        this.cancelableTimeout_(fn, timeoutMs - timeToUse);
      }.bind(this), timeToUse);
    }
  } else {
    shaka.net.Backoff.setTimeout_(fn, timeoutMs);
  }
};


/**
 * This is here only for testability.  Mocking global setTimeout can lead to
 * unintended interactions with other tests.  So instead, we mock this.
 *
 * @param {Function} fn The callback to invoke when the timeout expires.
 * @param {number} timeoutMs The timeout in milliseconds.
 * @return {number} The timeout ID.
 * @private
 */
shaka.net.Backoff.setTimeout_ = function(fn, timeoutMs) {
  return window.setTimeout(fn, timeoutMs);
};
