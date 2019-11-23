/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.abr.EwmaBandwidthEstimator');

goog.require('shaka.abr.Ewma');


/**
 * @summary
 * This class tracks bandwidth samples and estimates available bandwidth.
 * Based on the minimum of two exponentially-weighted moving averages with
 * different half-lives.
 *
 */
shaka.abr.EwmaBandwidthEstimator = class {
  constructor() {
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
     * Minimum number of bytes, under which samples are discarded.  Our models
     * do not include latency information, so connection startup time (time to
     * first byte) is considered part of the download time.  Because of this, we
     * should ignore very small downloads which would cause our estimate to be
     * too low.
     * This specific value is based on experimentation.
     *
     * @private {number}
     * @const
     */
    this.minBytes_ = 16e3;  // 16kB
  }

  /**
   * Takes a bandwidth sample.
   *
   * @param {number} durationMs The amount of time, in milliseconds, for a
   *   particular request.
   * @param {number} numBytes The total number of bytes transferred in that
   *   request.
   */
  sample(
      durationMs, numBytes) {
    if (numBytes < this.minBytes_) {
      return;
    }

    const bandwidth = 8000 * numBytes / durationMs;
    const weight = durationMs / 1000;

    this.bytesSampled_ += numBytes;
    this.fast_.sample(weight, bandwidth);
    this.slow_.sample(weight, bandwidth);
  }


  /**
   * Gets the current bandwidth estimate.
   *
   * @param {number} defaultEstimate
   * @return {number} The bandwidth estimate in bits per second.
   */
  getBandwidthEstimate(defaultEstimate) {
    if (this.bytesSampled_ < this.minTotalBytes_) {
      return defaultEstimate;
    }

    // Take the minimum of these two estimates.  This should have the effect
    // of adapting down quickly, but up more slowly.
    return Math.min(this.fast_.getEstimate(), this.slow_.getEstimate());
  }


  /**
   * @return {boolean} True if there is enough data to produce a meaningful
   *   estimate.
   */
  hasGoodEstimate() {
    return this.bytesSampled_ >= this.minTotalBytes_;
  }
};
