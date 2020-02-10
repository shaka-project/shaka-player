/** @license
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
  constructor() {
    /** @private {number} */
    this.started_ = NaN;
    /** @private {number} */
    this.playedCompletely_ = NaN;
  }

  /**
   * Increase the number of ads started by one.
   */
  incrementStarted() {
    if (isNaN(this.started_)) {
      this.started_ = 0;
    }
    this.started_++;
  }

  /**
   * Increase the number of ads played completely by one.
   */
  incrementPlayedCompletely() {
    if (isNaN(this.playedCompletely_)) {
      this.playedCompletely_ = 0;
    }
    this.playedCompletely_++;
  }

  /**
   * Create a stats blob that we can pass up to the app. This blob will not
   * reference any internal data.
   *
   * @return {shaka.extern.AdsStats}
   */
  getBlob() {
    return {
      started: this.started_,
      playedCompletely: this.playedCompletely_,
    };
  }
};
