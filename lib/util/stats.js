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

goog.provide('shaka.util.Stats');

goog.require('shaka.util.StateHistory');
goog.require('shaka.util.SwitchHistory');


/**
 * This class tracks all the various components (some optional) that are used to
 * populate |shaka.extern.Stats| which is passed to the app.
 *
 * @final
 */
shaka.util.Stats = class {
  constructor() {
    /** @private {number} */
    this.width_ = NaN;
    /** @private {number} */
    this.height_ = NaN;

    /** @private {number} */
    this.totalDroppedFrames_ = NaN;
    /** @private {number} */
    this.totalDecodedFrames_ = NaN;
    /** @private {number} */
    this.totalCorruptedFrames_ = NaN;

    /** @private {number} */
    this.loadLatencySeconds_ = NaN;

    /** @private {number} */
    this.licenseTimeSeconds_ = NaN;

    /** @private {number} */
    this.variantBandwidth_ = NaN;
    /** @private {number} */
    this.bandwidthEstimate_ = NaN;

    /** @private {!shaka.util.StateHistory} */
    this.stateHistory_ = new shaka.util.StateHistory();

    /** @private {!shaka.util.SwitchHistory} */
    this.switchHistory_ = new shaka.util.SwitchHistory();
  }

  /**
   * Update the ratio of dropped frames to total frames. This will replace the
   * previous values.
   *
   * @param {number} dropped
   * @param {number} decoded
   */
  setDroppedFrames(dropped, decoded) {
    this.totalDroppedFrames_ = dropped;
    this.totalDecodedFrames_ = decoded;
  }


  /**
   * Update corrupted frames. This will replace the previous values.
   *
   * @param {number} corrupted
   */
  setCorruptedFrames(corrupted) {
    this.totalCorruptedFrames_ = corrupted;
  }

  /**
   * Set the width and height of the video we are currently playing.
   *
   * @param {number} width
   * @param {number} height
   */
  setResolution(width, height) {
    this.width_ = width;
    this.height_ = height;
  }

  /**
   * Record the time it took between the user signalling "I want to play this"
   * to "I am now seeing this".
   *
   * @param {number} seconds
   */
  setLoadLatency(seconds) {
    this.loadLatencySeconds_ = seconds;
  }

  /**
   * Record the cumulative time spent on license requests during this session.
   *
   * @param {number} seconds
   */
  setLicenseTime(seconds) {
    this.licenseTimeSeconds_ = seconds;
  }

  /**
   * @param {number} bandwidth
   */
  setVariantBandwidth(bandwidth) {
    this.variantBandwidth_ = bandwidth;
  }

  /**
   * @param {number} bandwidth
   */
  setBandwidthEstimate(bandwidth) {
    this.bandwidthEstimate_ = bandwidth;
  }

  /**
   * @return {!shaka.util.StateHistory}
   */
  getStateHistory() {
    return this.stateHistory_;
  }

  /**
   * @return {!shaka.util.SwitchHistory}
   */
  getSwitchHistory() {
    return this.switchHistory_;
  }

  /**
   * Create a stats blob that we can pass up to the app. This blob will not
   * reference any internal data.
   *
   * @return {shaka.extern.Stats}
   */
  getBlob() {
    return {
      width: this.width_,
      height: this.height_,
      streamBandwidth: this.variantBandwidth_,
      decodedFrames: this.totalDecodedFrames_,
      droppedFrames: this.totalDroppedFrames_,
      corruptedFrames: this.totalCorruptedFrames_,
      estimatedBandwidth: this.bandwidthEstimate_,
      loadLatency: this.loadLatencySeconds_,
      playTime: this.stateHistory_.getTimeSpentIn('playing'),
      pauseTime: this.stateHistory_.getTimeSpentIn('paused'),
      bufferingTime: this.stateHistory_.getTimeSpentIn('buffering'),
      licenseTime: this.licenseTimeSeconds_,
      stateHistory: this.stateHistory_.getCopy(),
      switchHistory: this.switchHistory_.getCopy(),
    };
  }

  /**
   * Create an empty stats blob. This resembles the stats when we are not
   * playing any content.
   *
   * @return {shaka.extern.Stats}
   */
  static getEmptyBlob() {
    return {
      width: NaN,
      height: NaN,
      streamBandwidth: NaN,
      decodedFrames: NaN,
      droppedFrames: NaN,
      corruptedFrames: NaN,
      estimatedBandwidth: NaN,
      loadLatency: NaN,
      playTime: NaN,
      pauseTime: NaN,
      bufferingTime: NaN,
      licenseTime: NaN,
      switchHistory: [],
      stateHistory: [],
    };
  }
};
