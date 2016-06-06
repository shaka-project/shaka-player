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

goog.provide('shaka.util.CancelableChain');

goog.require('goog.asserts');
goog.require('shaka.util.Error');



/**
 * A Promise-based abstraction that creates cancelable Promise chains.
 * When canceled, subsequent stages of the internal Promise chain will stop.
 * A canceled chain is rejected with a user-specified value.
 *
 * A CancelableChain only supports linear Promise chains.  Chains which branch
 * (more than one then() handler chained to a particular stage) are not
 * supported.  You will not be prevented from treating this as if branching
 * were supported, but everything will be serialized into a linear chain.
 * Be careful!
 *
 * @constructor
 * @struct
 */
shaka.util.CancelableChain = function() {
  /** @private {!Promise} */
  this.promise_ = Promise.resolve();

  /** @private {boolean} */
  this.final_ = false;

  /** @private {boolean} */
  this.complete_ = false;

  /** @private {boolean} */
  this.canceled_ = false;

  /** @private {shaka.util.Error} */
  this.rejectionValue_;

  /** @private {function()} */
  this.onCancelComplete_;

  /** @private {!Promise} */
  this.cancelPromise_ = new Promise(function(resolve) {
    this.onCancelComplete_ = resolve;
  }.bind(this));
};


/**
 * @param {function(*)} callback
 * @return {!shaka.util.CancelableChain} the chain itself.
 */
shaka.util.CancelableChain.prototype.then = function(callback) {
  goog.asserts.assert(!this.final_, 'Chain should not be final!');

  this.promise_ = this.promise_.then(callback).then(function(data) {
    if (this.canceled_) {
      this.onCancelComplete_();
      return Promise.reject(this.rejectionValue_);
    }
    return Promise.resolve(data);
  }.bind(this));
  return this;
};


/**
 * Finalize the chain.
 * Converts the chain into a simple Promise and stops accepting new stages.
 *
 * @return {!Promise}
 */
shaka.util.CancelableChain.prototype.finalize = function() {
  if (!this.final_) {
    this.promise_ = this.promise_.then(function(data) {
      this.complete_ = true;
      return Promise.resolve(data);
    }.bind(this), function(error) {
      this.complete_ = true;
      return Promise.reject(error);
    }.bind(this));
  }
  this.final_ = true;
  return this.promise_;
};


/**
 * Cancel the Promise chain and reject with the given value.
 *
 * @param {!shaka.util.Error} reason
 * @return {!Promise} resolved when the cancelation has been processed by the
 *   the chain and no more stages will execute.  Note that this may be before
 *   the owner of the finalized chain has seen the rejection.
 */
shaka.util.CancelableChain.prototype.cancel = function(reason) {
  if (this.complete_) return Promise.resolve();

  this.canceled_ = true;
  this.rejectionValue_ = reason;
  return this.cancelPromise_;
};
