/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.abr.Ewma');

goog.require('goog.asserts');


/**
 * @summary
 * This class computes an exponentially-weighted moving average.
 */
shaka.abr.Ewma = class {
  /**
   * @param {number} halfLife The quantity of prior samples (by weight) used
   *   when creating a new estimate.  Those prior samples make up half of the
   *   new estimate.
   */
  constructor(halfLife) {
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
  }


  /**
   * Update the alpha with a new halfLife value.
   *
   * @param {number} halfLife The quantity of prior samples (by weight) used
   *   when creating a new estimate.  Those prior samples make up half of the
   *   new estimate.
   */
  updateAlpha(halfLife) {
    goog.asserts.assert(halfLife > 0, 'expected halfLife to be positive');
    this.alpha_ = Math.exp(Math.log(0.5) / halfLife);
  }


  /**
   * Takes a sample.
   *
   * @param {number} weight
   * @param {number} value
   */
  sample(weight, value) {
    const adjAlpha = Math.pow(this.alpha_, weight);
    const newEstimate = value * (1 - adjAlpha) + adjAlpha * this.estimate_;

    if (!isNaN(newEstimate)) {
      this.estimate_ = newEstimate;
      this.totalWeight_ += weight;
    }
  }


  /**
   * @return {number}
   */
  getEstimate() {
    const zeroFactor = 1 - Math.pow(this.alpha_, this.totalWeight_);
    return this.estimate_ / zeroFactor;
  }
};
