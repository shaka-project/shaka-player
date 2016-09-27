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
   * Half of the estimate is based on the last 2 seconds of sample history.
   * @private {!shaka.abr.Ewma}
   */
  this.fast_ = new shaka.abr.Ewma(2);

  /**
   * A slow-moving average.
   * Half of the estimate is based on the last 5 seconds of sample history.
   * @private {!shaka.abr.Ewma}
   */
  this.slow_ = new shaka.abr.Ewma(5);

  /**
   * Number of bytes sampled.
   * @private {number}
   */
  this.bytesSampled_ = 0;

  /**
   * Initial estimate used when there is not enough data.
   * @see shaka.abr.EwmaBandwidthEstimator.DEFAULT_ESTIMATE
   * @private {number}
   */
  this.defaultEstimate_ = shaka.abr.EwmaBandwidthEstimator.DEFAULT_ESTIMATE;

  /**
   * Minimum number of bytes sampled before we trust the estimate.  If we have
   * not sampled much data, our estimate may not be accurate enough to trust.
   * If bytesSampled_ is less than minTotalBytes_, we use defaultEstimate_.
   * This specific value is based on experimentation.
   *
   * @private {number}
   * @const
   */
  this.minTotalBytes_ = 128e3;  // 128kB

  /**
   * Minimum number of bytes, under which samples are discarded.  Our models do
   * not include latency information, so connection startup time (time to first
   * byte) is considered part of the download time.  Because of this, we should
   * ignore very small downloads which would cause our estimate to be too low.
   * This specific value is based on experimentation.
   *
   * @private {number}
   * @const
   */
  this.minBytes_ = 16e3;  // 16kB
};


/**
 * Contains the default estimate to use when there is not enough data.
 * This is a relatively safe default, since 3G cell connections are faster than
 * this.  For slower connections, such as 2G, the default estimate may be too
 * high.  This default can be changed at runtime using
 * {@link shaka.Player#configure} and {@link shakaExtern.AbrConfiguration}.
 * @const {number}
 */
shaka.abr.EwmaBandwidthEstimator.DEFAULT_ESTIMATE = 500e3;  // 500kbps


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

  var bandwidth = 8000 * numBytes / durationMs;
  var weight = durationMs / 1000;

  this.bytesSampled_ += numBytes;
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
  if (this.bytesSampled_ < this.minTotalBytes_) {
    return this.defaultEstimate_;
  }

  // Take the minimum of these two estimates.  This should have the effect of
  // adapting down quickly, but up more slowly.
  return Math.min(this.fast_.getEstimate(), this.slow_.getEstimate());
};


/**
 * @return {boolean} True if there is enough data to produce a meaningful
 *   estimate.
 */
shaka.abr.EwmaBandwidthEstimator.prototype.hasGoodEstimate = function() {
  return this.bytesSampled_ >= this.minTotalBytes_;
};
