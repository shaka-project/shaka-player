/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * @typedef {{
 *   loadTimes: !Array.<number>,
 *   started: number,
 *   playedCompletely: number,
 *   skipped: number
 * }}
 *
 * @description
 * Contains statistics and information about the current state of the player.
 *
 * @property {number} loadTimes
 *   The set of amounts of time it took to get the final manifest.
 * @property {number} started
 *   The number of ads started.
 * @property {number} playedCompletely
 *   The number of ads played completely.
 * @property {number} skipped
 *   The number of ads skipped.
 * @exportDoc
 */
shaka.extern.AdsStats;


/**
 * An object that's responsible for all the ad-related logic
 * in the player.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.IAdManager = class extends EventTarget {
  onAssetUnload() {}

  /**
   * @param {!HTMLElement} adContainer
   * @param {!HTMLMediaElement} video
   */
  initClientSide(adContainer, video) {}

  /**
   * @param {!google.ima.AdsRequest} imaRequest
   */
  requestClientSideAds(imaRequest) {}

  /**
   * @param {!HTMLElement} adContainer
   * @param {!HTMLMediaElement} video
   */
  initServerSide(adContainer, video) {}

  /**
   * @param {!google.ima.dai.api.StreamRequest} imaRequest
   * @param {string=} backupUrl
   * @return {!Promise.<!string>}
   */
  requestServerSideStream(imaRequest, backupUrl) {}

  /**
   * @param {Object} adTagParameters
   */
  replaceServerSideAdTagParameters(adTagParameters) {}

  /**
   * Get statistics for the current playback session. If the player is not
   * playing content, this will return an empty stats object.
   */
  getStats() {}

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  onTimedMetadata(region) {}
};


/**
 * A factory for creating the ad manager.
 *
 * @typedef {function():!shaka.extern.IAdManager}
 * @exportDoc
 */
shaka.extern.IAdManager.Factory;


/**
 * Interface for Ad objects.
 *
 * @extends {shaka.util.IReleasable}
 * @interface
 * @exportDoc
 */
shaka.extern.IAd = class {
  /**
   * @return {number}
   * @exportTypescript
   */
  getDuration() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getRemainingTime() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getTimeUntilSkippable() {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  isPaused() {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  isSkippable() {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  canSkipNow() {}

  /**
   * @exportTypescript
   */
  skip() {}

  /**
   * @exportTypescript
   */
  play() {}

  /**
   * @exportTypescript
   */
  pause() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getVolume() {}

  /**
   * @param {number} volume
   * @exportTypescript
   */
  setVolume(volume) {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  isMuted() {}

  /**
   * @param {boolean} muted
   * @exportTypescript
   */
  setMuted(muted) {}

  /**
   * @param {number} width
   * @param {number} height
   * @exportTypescript
   */
  resize(width, height) {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getSequenceLength() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getPositionInSequence() {}
};
