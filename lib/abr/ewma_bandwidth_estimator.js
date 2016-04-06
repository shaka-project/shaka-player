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

goog.provide('shaka.abr.EwmaBandwidthEstimator');

goog.require('shaka.abr.Ewma');



/**
 * Tracks bandwidth samples and estimates available bandwidth.
 * Based on the minimum of two exponentially-weighted moving averages with
 * different half-lives.
 *
 * @constructor
 * @struct
 */
shaka.abr.EwmaBandwidthEstimator = function() {
  /**
   * A fast-moving average.
   * Half of the estimate is based on the last 3 seconds of sample history.
   * @private {!shaka.abr.Ewma}
   */
  this.fast_ = new shaka.abr.Ewma(3);

  /**
   * A slow-moving average.
   * Half of the estimate is based on the last 10 seconds of sample history.
   * @private {!shaka.abr.Ewma}
   */
  this.slow_ = new shaka.abr.Ewma(10);

  /**
   * Prevents ultra-fast internal connections from causing crazy results.
   * @private {number}
   * @const
   */
  this.minDelayMs_ = 50;

  /**
   * Initial estimate used when there is not enough data.
   * @private {number}
   */
  this.defaultEstimate_ = shaka.abr.EwmaBandwidthEstimator.DEFAULT_ESTIMATE;

  /**
   * Minimum weight required to trust the estimate.
   * @private {number}
   * @const
   */
  this.minWeight_ = 0.5;

  /**
   * Minimum number of bytes, under which samples are discarded.
   * @private {number}
   * @const
   */
  this.minBytes_ = 65536;
};


/**
 * Contains the default estimate to use when there is not enough data.
 * @const {number}
 */
shaka.abr.EwmaBandwidthEstimator.DEFAULT_ESTIMATE = 5e5;  // 500kbps


/**
 * Takes a bandwidth sample.
 *
 * @param {number} durationMs The amount of time, in milliseconds, for a
 *   particular request.
 * @param {number} numBytes The total number of bytes transferred in that
 *   request.
 */
shaka.abr.EwmaBandwidthEstimator.prototype.sample = function(
    durationMs, numBytes) {
  if (numBytes < this.minBytes_) {
    return;
  }

  durationMs = Math.max(durationMs, this.minDelayMs_);

  var bandwidth = 8000 * numBytes / durationMs;
  var weight = durationMs / 1000;

  this.fast_.sample(weight, bandwidth);
  this.slow_.sample(weight, bandwidth);
};


/**
 * Sets the default bandwidth estimate to use if there is not enough data.
 *
 * @param {number} estimate The default bandwidth estimate, in bit/sec.
 */
shaka.abr.EwmaBandwidthEstimator.prototype.setDefaultEstimate = function(
    estimate) {
  this.defaultEstimate_ = estimate;
};


/**
 * Gets the current bandwidth estimate.
 *
 * @return {number} The bandwidth estimate in bits per second.
 */
shaka.abr.EwmaBandwidthEstimator.prototype.getBandwidthEstimate = function() {
  if (this.fast_.getTotalWeight() < this.minWeight_) {
    return this.defaultEstimate_;
  }

  // Take the minimum of these two estimates.  This should have the effect of
  // adapting down quickly, but up more slowly.
  return Math.min(this.fast_.getEstimate(), this.slow_.getEstimate());
};

