/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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

    /** @private {string} */
    this.currentCodecs_ = '';

    /** @private {number} */
    this.totalDroppedFrames_ = NaN;
    /** @private {number} */
    this.totalDecodedFrames_ = NaN;
    /** @private {number} */
    this.totalCorruptedFrames_ = NaN;

    /** @private {number} */
    this.totalStallsDetected_ = NaN;
    /** @private {number} */
    this.totalGapsJumped_ = NaN;

    /** @private {number} */
    this.completionPercent_ = NaN;

    /** @private {number} */
    this.loadLatencySeconds_ = NaN;

    /** @private {number} */
    this.manifestTimeSeconds_ = NaN;

    /** @private {number} */
    this.drmTimeSeconds_ = NaN;

    /** @private {number} */
    this.licenseTimeSeconds_ = NaN;

    /** @private {number} */
    this.liveLatencySeconds_ = NaN;

    /** @private {number} */
    this.maxSegmentDurationSeconds_ = NaN;

    /** @private {number} */
    this.currentStreamBandwidth_ = NaN;
    /** @private {number} */
    this.bandwidthEstimate_ = NaN;

    /** @private {number} */
    this.manifestSizeBytes_ = NaN;
    /** @private {number} */
    this.bytesDownloaded_ = NaN;

    /** @private {number} */
    this.nonFatalErrorCount_ = 0;
    /** @private {number} */
    this.manifestPeriodCount_ = NaN;
    /** @private {number} */
    this.manifestGapCount_ = NaN;

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
   * Update number of stalls detected. This will replace the previous value.
   *
   * @param {number} stallsDetected
   */
  setStallsDetected(stallsDetected) {
    this.totalStallsDetected_ = stallsDetected;
  }

  /**
   * Update number of playback gaps jumped over. This will replace the previous
   * value.
   *
   * @param {number} gapsJumped
   */
  setGapsJumped(gapsJumped) {
    this.totalGapsJumped_ = gapsJumped;
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
   * Set the codecs that we are currently playing.
   *
   * @param {string} codecs
   */
  setCodecs(codecs) {
    this.currentCodecs_ = codecs;
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
   * Record the time it took to download and parse the manifest.
   *
   * @param {number} seconds
   */
  setManifestTime(seconds) {
    this.manifestTimeSeconds_ = seconds;
  }

  /**
   * Record the current completion percent. This is the "high water mark", so it
   * will store the highest provided completion percent.
   *
   * @param {number} percent
   */
  setCompletionPercent(percent) {
    if (isNaN(this.completionPercent_)) {
      this.completionPercent_ = percent;
    } else {
      this.completionPercent_ = Math.max(this.completionPercent_, percent);
    }
  }

  /**
   * Record the time it took to download the first drm key.
   *
   * @param {number} seconds
   */
  setDrmTime(seconds) {
    this.drmTimeSeconds_ = seconds;
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
   * Record the latency in live streams.
   *
   * @param {number} seconds
   */
  setLiveLatency(seconds) {
    this.liveLatencySeconds_ = seconds;
  }

  /**
   * Record the presentation's max segment duration.
   *
   * @param {number} seconds
   */
  setMaxSegmentDuration(seconds) {
    this.maxSegmentDurationSeconds_ = seconds;
  }

  /**
   * @param {number} bandwidth
   */
  setCurrentStreamBandwidth(bandwidth) {
    this.currentStreamBandwidth_ = bandwidth;
  }

  /**
   * @param {number} bandwidth
   */
  setBandwidthEstimate(bandwidth) {
    this.bandwidthEstimate_ = bandwidth;
  }

  /**
   * @param {number} size
   */
  setManifestSize(size) {
    this.manifestSizeBytes_ = size;
  }

  /**
   * @param {number} bytesDownloaded
   */
  addBytesDownloaded(bytesDownloaded) {
    if (isNaN(this.bytesDownloaded_)) {
      this.bytesDownloaded_ = bytesDownloaded;
    } else {
      this.bytesDownloaded_ += bytesDownloaded;
    }
  }

  /** */
  addNonFatalError() {
    this.nonFatalErrorCount_++;
  }

  /**
   * @param {number} count
   */
  setManifestPeriodCount(count) {
    this.manifestPeriodCount_ = count;
  }

  /**
   * @param {number} count
   */
  setManifestGapCount(count) {
    this.manifestGapCount_ = count;
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
      currentCodecs: this.currentCodecs_,
      streamBandwidth: this.currentStreamBandwidth_,
      decodedFrames: this.totalDecodedFrames_,
      droppedFrames: this.totalDroppedFrames_,
      corruptedFrames: this.totalCorruptedFrames_,
      stallsDetected: this.totalStallsDetected_,
      gapsJumped: this.totalGapsJumped_,
      estimatedBandwidth: this.bandwidthEstimate_,
      completionPercent: this.completionPercent_,
      loadLatency: this.loadLatencySeconds_,
      manifestTimeSeconds: this.manifestTimeSeconds_,
      drmTimeSeconds: this.drmTimeSeconds_,
      playTime: this.stateHistory_.getTimeSpentIn('playing'),
      pauseTime: this.stateHistory_.getTimeSpentIn('paused'),
      bufferingTime: this.stateHistory_.getTimeSpentIn('buffering'),
      licenseTime: this.licenseTimeSeconds_,
      liveLatency: this.liveLatencySeconds_,
      maxSegmentDuration: this.maxSegmentDurationSeconds_,
      manifestSizeBytes: this.manifestSizeBytes_,
      bytesDownloaded: this.bytesDownloaded_,
      nonFatalErrorCount: this.nonFatalErrorCount_,
      manifestPeriodCount: this.manifestPeriodCount_,
      manifestGapCount: this.manifestGapCount_,
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
      currentCodecs: '',
      streamBandwidth: NaN,
      decodedFrames: NaN,
      droppedFrames: NaN,
      corruptedFrames: NaN,
      stallsDetected: NaN,
      gapsJumped: NaN,
      estimatedBandwidth: NaN,
      completionPercent: NaN,
      loadLatency: NaN,
      manifestTimeSeconds: NaN,
      drmTimeSeconds: NaN,
      playTime: NaN,
      pauseTime: NaN,
      bufferingTime: NaN,
      licenseTime: NaN,
      liveLatency: NaN,
      maxSegmentDuration: NaN,
      manifestSizeBytes: NaN,
      bytesDownloaded: NaN,
      nonFatalErrorCount: NaN,
      manifestPeriodCount: NaN,
      manifestGapCount: NaN,
      switchHistory: [],
      stateHistory: [],
    };
  }
};
