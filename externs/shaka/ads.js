/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * @typedef {{
 *   started: number,
 *   playedCompletely: number,
 *   skipped: number
 * }}
 *
 * @description
 * Contains statistics and information about the current state of the player.
 *
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
   * @param {!shaka.Player} player
   */
  initServerSide(adContainer, video, player) {}

  /**
   * @param {Object} adTagParameters
   * @param {string} apiKey
   * @param {string} authToken
   * @param {string} contentSourceId
   * @param {string} streamActivityMonitorId
   * @param {string} videoId
   * @param {string} backupUrl
   * @param {number} startTime
   */
  loadServerSideVodStream(
      adTagParameters, apiKey, authToken, contentSourceId,
      streamActivityMonitorId, videoId, backupUrl, startTime) {}

  /**
   * @param {Object} adTagParameters
   * @param {string} apiKey
   * @param {string} assetKey
   * @param {string} authToken
   * @param {string} streamActivityMonitorId
   * @param {string} backupUrl
   * @param {number} startTime
   */
  loadServerSideLiveStream(
      adTagParameters, apiKey, assetKey, authToken, streamActivityMonitorId,
      backupUrl, startTime) {}

  /**
   * @param {Object} adTagParameters
   */
  replaceServerSideAdTagParameters(adTagParameters) {}

  /**
   * Get statistics for the current playback session. If the player is not
   * playing content, this will return an empty stats object.
   */
  getStats() {}
};


/**
 * A factory for creating the ad manager.  This will be called with 'new'.
 *
 * @typedef {function(new:shaka.extern.IAdManager)}
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
   */
  getDuration() {}

  /**
   * @return {number}
   */
  getRemainingTime() {}

  /**
   * @return {number}
   */
  getTimeUntilSkippable() {}

  /**
   * @return {boolean}
   */
  isPaused() {}

  /**
   * @return {boolean}
   */
  isSkippable() {}

  /**
   * @return {boolean}
   */
  canSkipNow() {}

  skip() {}

  play() {}

  pause() {}

  /**
   * @return {number}
   */
  getVolume() {}

  /**
   * @param {number} volume
   */
  setVolume(volume) {}

  /**
   * @return {boolean}
   */
  isMuted() {}

  /**
   * @param {boolean} muted
   */
  setMuted(muted) {}

  /**
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {}

  /**
   * @return {number}
   */
  getSequenceLength() {}

  /**
   * @return {number}
   */
  getPositionInSequence() {}
};
