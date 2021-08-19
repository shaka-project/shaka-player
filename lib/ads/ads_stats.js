/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ads.AdsStats');


/**
 * This class tracks all the various components (some optional) that are used to
 * populate |shaka.extern.AdsStats| which is passed to the app.
 *
 * @final
 */
shaka.ads.AdsStats = class {
  /** */
  constructor() {
    /** @private {!Array.<number>} */
    this.loadTimes_ = [];
    /** @private {number} */
    this.started_ = 0;
    /** @private {number} */
    this.playedCompletely_ = 0;
    /** @private {number} */
    this.skipped_ = 0;
  }

  /**
   * Record the time it took to get the final manifest.
   *
   * @param {number} seconds
   */
  addLoadTime(seconds) {
    this.loadTimes_.push(seconds);
  }

  /**
   * Increase the number of ads started by one.
   */
  incrementStarted() {
    this.started_++;
  }

  /**
   * Increase the number of ads played completely by one.
   */
  incrementPlayedCompletely() {
    this.playedCompletely_++;
  }

  /**
   * Increase the number of ads skipped by one.
   */
  incrementSkipped() {
    this.skipped_++;
  }

  /**
   * Create a stats blob that we can pass up to the app. This blob will not
   * reference any internal data.
   *
   * @return {shaka.extern.AdsStats}
   */
  getBlob() {
    return {
      loadTimes: this.loadTimes_,
      started: this.started_,
      playedCompletely: this.playedCompletely_,
      skipped: this.skipped_,
    };
  }
};
