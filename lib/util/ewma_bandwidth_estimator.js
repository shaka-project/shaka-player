/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Tracks bandwidth samples and estimates available bandwidth.
 * Based on the minimum of two exponentially-weighted moving averages with
 * different half-lives.
 */

goog.provide('shaka.util.EWMABandwidthEstimator');

goog.require('shaka.util.EWMA');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');



/**
 * Tracks bandwidth samples and estimates available bandwidth.
 *
 * @struct
 * @constructor
 * @extends {shaka.util.FakeEventTarget}
 * @implements {shaka.util.IBandwidthEstimator}
 * @export
 */
shaka.util.EWMABandwidthEstimator = function() {
  shaka.util.FakeEventTarget.call(this, null);

  /**
   * A fast-moving average.
   * Half of the estimate is based on the last 3 seconds of sample history.
   * @private {!shaka.util.EWMA}
   */
  this.fast_ = new shaka.util.EWMA(3);

  /**
   * A slow-moving average.
   * Half of the estimate is based on the last 10 seconds of sample history.
   * @private {!shaka.util.EWMA}
   */
  this.slow_ = new shaka.util.EWMA(10);

  /**
   * Prevents ultra-fast internal connections from causing crazy results.
   * @private {number}
   * @const
   */
  this.minDelayMs_ = 50;

  /**
   * Initial estimate used when there is not enough data.
   * @private {number}
   * @const
   */
  this.defaultEstimate_ = 5e5;  // 500kbps

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

  /**
   * The last time a sample was recorded, in milliseconds.
   * @private {number}
   */
  this.lastSampleTime_ = 0;
};
goog.inherits(shaka.util.EWMABandwidthEstimator, shaka.util.FakeEventTarget);


/** @override */
shaka.util.EWMABandwidthEstimator.prototype.sample = function(delayMs, bytes) {
  if (bytes < this.minBytes_) {
    return;
  }

  delayMs = Math.max(delayMs, this.minDelayMs_);

  var bandwidth = 8000 * bytes / delayMs;
  var weight = delayMs / 1000;

  this.fast_.sample(weight, bandwidth);
  this.slow_.sample(weight, bandwidth);

  this.dispatchEvent(shaka.util.FakeEvent.create({
    'type': 'bandwidth'
  }));

  this.lastSampleTime_ = Date.now();
};


/** @override */
shaka.util.EWMABandwidthEstimator.prototype.getBandwidth = function() {
  if (this.fast_.getTotalWeight() < this.minWeight_) {
    return this.defaultEstimate_;
  }

  // Take the minimum of these two estimates.  This should have the effect of
  // adapting down quickly, but up more slowly.
  return Math.min(this.fast_.getEstimate(), this.slow_.getEstimate());
};


/** @override */
shaka.util.EWMABandwidthEstimator.prototype.getDataAge = function() {
  return (Date.now() - this.lastSampleTime_) / 1000;
};

