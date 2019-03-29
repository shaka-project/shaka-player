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
  /**
   * @param {number} startOfLoadSeconds
   */
  constructor(startOfLoadSeconds) {
    /** @private {number} */
    this.width_ = NaN;
    /** @private {number} */
    this.height_ = NaN;

    /** @private {number} */
    this.totalDroppedFrames_ = NaN;
    /** @private {number} */
    this.totalDecodedFrames_ = NaN;

    // We want to track how much time elapses between when the player says it
    // starts loading content and when it says its done. The meaning of "start"
    // and "finish" is defined within the scope of the player, not here.
    /** @private {number} */
    this.loadStartedSeconds_ = startOfLoadSeconds;
    /** @private {number} */
    this.loadFinishedSeconds_ = NaN;

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
   * Mark the end of the load process. This should only be called after calling
   * |markStartOfLoad|.
   */
  markEndOfLoad() {
    this.loadFinishedSeconds_ = Date.now() / 1000;
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
    // Make sure that the start and end times make sense. If not, use NaN.
    const loadLatency = (this.loadFinishedSeconds_ > this.loadStartedSeconds_) ?
                        (this.loadFinishedSeconds_ - this.loadStartedSeconds_) :
                        (NaN);

    return {
      width: this.width_,
      height: this.height_,
      streamBandwidth: this.variantBandwidth_,
      decodedFrames: this.totalDecodedFrames_,
      droppedFrames: this.totalDroppedFrames_,
      estimatedBandwidth: this.bandwidthEstimate_,
      loadLatency: loadLatency,
      playTime: this.stateHistory_.getTimeSpentIn('playing'),
      pauseTime: this.stateHistory_.getTimeSpentIn('paused'),
      bufferingTime: this.stateHistory_.getTimeSpentIn('buffering'),
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
      estimatedBandwidth: NaN,
      loadLatency: NaN,
      playTime: NaN,
      pauseTime: NaN,
      bufferingTime: NaN,
      switchHistory: [],
      stateHistory: [],
    };
  }
};
