/*! @license
 * Shaka Player
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
 * @typedef {{
 *   start: number,
 *   end: ?number
 * }}
 *
 * @description
 * Contains the times of a range of an Ad.
 *
 * @property {number} start
 *   The start time of the range, in milliseconds.
 * @property {number} end
 *   The end time of the range, in milliseconds.
 * @exportDoc
 */
shaka.extern.AdCuePoint;


/**
 * An object that's responsible for all the ad-related logic
 * in the player.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.IAdManager = class extends EventTarget {
  /**
   * @param {string} locale
   */
  setLocale(locale) {}

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   * Must be called at least once before init*().
   *
   * @param {shaka.extern.AdsConfiguration} config
   */
  configure(config) {}

  release() {}

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
   * @return {!Promise.<string>}
   */
  requestServerSideStream(imaRequest, backupUrl) {}

  /**
   * @param {Object} adTagParameters
   */
  replaceServerSideAdTagParameters(adTagParameters) {}

  /**
   * @return {!Array.<!shaka.extern.AdCuePoint>}
   */
  getServerSideCuePoints() {}

  /**
   * Get statistics for the current playback session. If the player is not
   * playing content, this will return an empty stats object.
   */
  getStats() {}

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  onDashTimedMetadata(region) {}

  /**
   * @param {shaka.extern.ID3Metadata} metadata
   * @param {number} timestampOffset
   */
  onHlsTimedMetadata(metadata, timestampOffset) {}

  /**
   * @param {shaka.extern.MetadataFrame} value
   */
  onCueMetadataChange(value) {}
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
   */
  getDuration() {}

  /**
   * Gets the minimum suggested duration.  Defaults to being equivalent to
   * getDuration() for server-side ads.
   * @see http://bit.ly/3q3U6hI
   * @return {number}
   */
  getMinSuggestedDuration() {}

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
   * @return {boolean}
   */
  isLinear() {}

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

  /**
   * @return {string}
   */
  getTitle() {}

  /**
   * @return {string}
   */
  getDescription() {}

  /**
   * @return {number}
   */
  getVastMediaBitrate() {}

  /**
   * @return {number}
   */
  getVastMediaHeight() {}

  /**
   * @return {number}
   */
  getVastMediaWidth() {}

  /**
   * @return {string}
   */
  getAdId() {}

  /**
   * @return {string}
   */
  getCreativeAdId() {}

  /**
   * @return {string}
   */
  getAdvertiserName() {}

  /**
   * @return {?string}
   */
  getMediaUrl() {}

  /**
   * @return {number}
   */
  getTimeOffset() {}
};
