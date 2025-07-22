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
 *   loadTimes: !Array<number>,
 *   averageLoadTime: number,
 *   started: number,
 *   overlayAds: number,
 *   playedCompletely: number,
 *   skipped: number,
 *   errors: number
 * }}
 *
 * @description
 * Contains statistics and information about the current state of the player.
 *
 * @property {number} loadTimes
 *   The set of amounts of time it took to get the final manifest.
 * @property {number} averageLoadTime
 *   The average time it took to get the final manifest.
 * @property {number} started
 *   The number of ads started (linear and overlays ads).
 * @property {number} overlayAds
 *   The number of overlay ads started.
 * @property {number} playedCompletely
 *   The number of ads played completely.
 * @property {number} skipped
 *   The number of ads skipped.
 * @property {number} errors
 *   The number of ads with errors.
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
 * @typedef {{
 *   id: ?string,
 *   groupId: ?string,
 *   startTime: number,
 *   endTime: ?number,
 *   uri: string,
 *   mimeType: ?string,
 *   isSkippable: boolean,
 *   skipOffset: ?number,
 *   skipFor: ?number,
 *   canJump: boolean,
 *   resumeOffset: ?number,
 *   playoutLimit: ?number,
 *   once: boolean,
 *   pre: boolean,
 *   post: boolean,
 *   timelineRange: boolean,
 *   loop: boolean,
 *   overlay: ?shaka.extern.AdPositionInfo,
 *   displayOnBackground: boolean,
 *   currentVideo: ?shaka.extern.AdPositionInfo,
 *   background: ?string,
 *   clickThroughUrl: ?string,
 * }}
 *
 * @description
 * Contains the ad interstitial info.
 *
 * @property {?string} id
 *   The id of the interstitial.
 * @property {?string} groupId
 *   The group id of the interstitial.
 * @property {number} startTime
 *   The start time of the interstitial.
 * @property {?number} endTime
 *   The end time of the interstitial.
 * @property {string} uri
 *   The uri of the interstitial, can be any type that
 *   ShakaPlayer supports (either in MSE or src=)
 * @property {?string} mimeType
 *   The mimeType of the interstitial if known.
 * @property {boolean} isSkippable
 *   Indicate if the interstitial is skippable.
 * @property {?number} skipOffset
 *   Time value that identifies when skip controls are made available to the
 *   end user.
 * @property {?number} skipFor
 *   The amount of time in seconds a skip button should be displayed for.
 *   Note that this value should be >= 0.
 * @property {boolean} canJump
 *   Indicate if the interstitial is jumpable.
 * @property {?number} resumeOffset
 *   Indicates where the primary playback will resume after the interstitial
 *   plays. It is expressed as a time lag from when interstitial playback was
 *   scheduled on the primary player's timeline. For live ad replacement it
 *   must be null.
 * @property {?number} playoutLimit
 *   Indicate a limit for the playout time of the entire interstitial.
 * @property {boolean} once
 *   Indicates that the interstitial should only be played once.
 * @property {boolean} pre
 *   Indicates that an action is to be triggered before playback of the
 *   primary asset begins, regardless of where playback begins in the primary
 *   asset.
 * @property {boolean} post
 *   Indicates that an action is to be triggered after the primary asset has
 *   been played to its end without error.
 * @property {boolean} timelineRange
 *   Indicates whether the  interstitial should be presented in a timeline UI
 *   as a single point or as a range.
 * @property {boolean} loop
 *   Indicates that the interstitials should play in loop.
 *   Only applies if the interstitials is an overlay.
 *   Only supported when using multiple video elements for interstitials.
 * @property {?shaka.extern.AdPositionInfo} overlay
 *   Indicates the characteristics of the overlay
 *   Only supported when using multiple video elements for interstitials.
 * @property {boolean} displayOnBackground
 *   Indicates if we should display on background, shrinking the current video.
 * @property {?shaka.extern.AdPositionInfo} currentVideo
 *   Indicates the characteristics of the current video.
 *   Only set if any feature changes.
 * @property {?string} background
 *   Specifies the background, the value can be any value of the CSS background
 *   property.
 * @property {?string} clickThroughUrl
 *   Indicate the URL when the ad is clicked.
 * @exportDoc
 */
shaka.extern.AdInterstitial;


/**
 * @typedef {{
 *   viewport: {x: number, y: number},
 *   topLeft: {x: number, y: number},
 *   size: {x: number, y: number}
 * }}
 *
 * @description
 * Contains the coordinates of a position info
 *
 * @property {{x: number, y: number}} viewport
 *   The viewport in pixels.
 * @property {{x: number, y: number}} topLeft
 *   The topLeft in pixels.
 * @property {{x: number, y: number}} size
 *   The size in pixels.
 * @exportDoc
 */
shaka.extern.AdPositionInfo;


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
   * @param {?HTMLElement} adContainer
   * @param {!shaka.Player} basePlayer
   * @param {!HTMLMediaElement} baseVideo
   */
  initInterstitial(adContainer, basePlayer, baseVideo) {}

  /**
   * @param {!HTMLElement} adContainer
   * @param {!HTMLMediaElement} video
   * @param {?google.ima.AdsRenderingSettings} adsRenderingSettings
   */
  initClientSide(adContainer, video, adsRenderingSettings) {}

  /**
   * @param {!google.ima.AdsRequest} imaRequest
   */
  requestClientSideAds(imaRequest) {}

  /**
   * @param {!google.ima.AdsRenderingSettings} adsRenderingSettings
   */
  updateClientSideAdsRenderingSettings(adsRenderingSettings) {}

  /**
   * @param {!HTMLElement} adContainer
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {!HTMLMediaElement} video
   */
  initMediaTailor(adContainer, networkingEngine, video) {}

  /**
   * @param {string} url
   * @param {Object} adsParams
   * @param {string=} backupUrl
   * @return {!Promise<string>}
   */
  requestMediaTailorStream(url, adsParams, backupUrl) {}

  /**
   * @param {string} url
   */
  addMediaTailorTrackingUrl(url) {}

  /**
   * @param {!HTMLElement} adContainer
   * @param {!HTMLMediaElement} video
   */
  initServerSide(adContainer, video) {}

  /**
   * @param {!google.ima.dai.api.StreamRequest} imaRequest
   * @param {string=} backupUrl
   * @return {!Promise<string>}
   */
  requestServerSideStream(imaRequest, backupUrl) {}

  /**
   * @param {Object} adTagParameters
   */
  replaceServerSideAdTagParameters(adTagParameters) {}

  /**
   * @return {!Array<!shaka.extern.AdCuePoint>}
   */
  getServerSideCuePoints() {}

  /**
   * @return {!Array<!shaka.extern.AdCuePoint>}
   */
  getCuePoints() {}

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
   * Fired when the manifest is updated.
   *
   * @param {boolean} isLive
   */
  onManifestUpdated(isLive) {}

  /**
   * @param {shaka.extern.ID3Metadata} metadata
   * @param {number} timestampOffset
   */
  onHlsTimedMetadata(metadata, timestampOffset) {}

  /**
   * @param {shaka.extern.MetadataFrame} value
   */
  onCueMetadataChange(value) {}

  /**
   * @param {!shaka.Player} basePlayer
   * @param {!HTMLMediaElement} baseVideo
   * @param {shaka.extern.HLSInterstitial} interstitial
   */
  onHLSInterstitialMetadata(basePlayer, baseVideo, interstitial) {}

  /**
   * @param {!shaka.Player} basePlayer
   * @param {!HTMLMediaElement} baseVideo
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  onDASHInterstitialMetadata(basePlayer, baseVideo, region) {}

  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   */
  addCustomInterstitial(interstitial) {}

  /**
   * @param {string} url
   * @return {!Promise}
   */
  addAdUrlInterstitial(url) {}

  /**
   * @return {shaka.Player}
   */
  getInterstitialPlayer() {}
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
   * @return {boolean}
   */
  needsSkipUI() {}

  /**
   * @return {boolean}
   */
  isClientRendering() {}

  /**
   * @return {boolean}
   */
  hasCustomClick() {}

  /**
   * @return {boolean}
   */
  isUsingAnotherMediaElement() {}

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
  getVastAdId() {}

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

  /**
   * @return {number}
   */
  getPodIndex() {}
};
