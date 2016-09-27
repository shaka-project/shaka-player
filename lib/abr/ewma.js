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

goog.provide('shaka.abr.Ewma');

goog.require('goog.asserts');



/**
 * Computes an exponentionally-weighted moving average.
 *
 * @param {number} halfLife About half of the estimated value will be from the
 *   last |halfLife| samples by weight.
 * @struct
 * @constructor
 */
shaka.abr.Ewma = function(halfLife) {
  goog.asserts.assert(halfLife > 0, 'expected halfLife to be positive');

  /**
   * Larger values of alpha expire historical data more slowly.
   * @private {number}
   */
  this.alpha_ = Math.exp(Math.log(0.5) / halfLife);

  /** @private {number} */
  this.estimate_ = 0;

  /** @private {number} */
  this.totalWeight_ = 0;
};


/**
 * Takes a sample.
 *
 * @param {number} weight
 * @param {number} value
 */
shaka.abr.Ewma.prototype.sample = function(weight, value) {
  var adjAlpha = Math.pow(this.alpha_, weight);
  this.estimate_ = value * (1 - adjAlpha) + adjAlpha * this.estimate_;
  this.totalWeight_ += weight;
};


/**
 * @return {number}
 */
shaka.abr.Ewma.prototype.getEstimate = function() {
  var zeroFactor = 1 - Math.pow(this.alpha_, this.totalWeight_);
  return this.estimate_ / zeroFactor;
};
