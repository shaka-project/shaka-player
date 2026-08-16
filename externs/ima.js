/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for IMA SDK.
 * @externs
 */


/** @const */
var google = {};

/** @const */
google.ima = {};

/** @type {!google.ima.ImaSdkSettings} */
google.ima.settings;


/**
 * @implements {EventTarget}
 */
google.ima.AdsLoader = class {
  /** @param {!google.ima.AdDisplayContainer} container */
  constructor(container) {}

  contentComplete() {}

  /** @param {google.ima.AdsRequest} request */
  requestAds(request) {}

  /** @return {google.ima.ImaSdkSettings} */
  getSettings() {}

  /** @override */
  addEventListener() {}

  /** @override */
  removeEventListener() {}

  /** @override */
  dispatchEvent() {}

  destroy() {}
};


/**
 * @implements {EventTarget}
 */
google.ima.AdsManager = class {
  start() {}

  /**
   * @param {number} width
   * @param {number} height
   */
  init(width, height) {}

  /**
   * @return {number}
   */
  getRemainingTime() {}

  pause() {}

  resume() {}

  getVolume() {}

  /**
   * @return {boolean}
   */
  getAdSkippableState() {}

  skip() {}

  stop() {}

  destroy() {}

  /**
   * @param {number} volume
   */
  setVolume(volume) {}

  /**
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {}

  /**
   * @return {!Array<number>}
   */
  getCuePoints() {}

  /** @override */
  addEventListener() {}

  /** @override */
  removeEventListener() {}

  /** @override */
  dispatchEvent() {}

  /**
   * @param {!google.ima.AdsRenderingSettings} adsRenderingSettings
   */
  updateAdsRenderingSettings(adsRenderingSettings) {}
};


/** @const */
google.ima.AdsManagerLoadedEvent = class extends Event {
  /**
   * @param {!(HTMLElement|{currentTime: number})} video
   * @param {!google.ima.AdsRenderingSettings=} adsRenderingSettings
   * @return {!google.ima.AdsManager}
   */
  getAdsManager(video, adsRenderingSettings) {}
};


/**
 * @typedef {{
 *   autoAlign: (boolean),
 *   bitrate: (number),
 *   enablePreloading: (boolean),
 *   loadVideoTimeout: (number),
 *   mimeTypes: (?Array<string>),
 *   playAdsAfterTime: (number),
 *   restoreCustomPlaybackStateOnAdBreakComplete: (boolean),
 *   uiElements: (?Array<string>),
 *   useStyledLinearAds: (boolean),
 *   useStyledNonLinearAds: (boolean),
 * }}
 *
 * @description Defines parameters that control the rendering of ads.
 * @property {boolean} autoAlign
 *   Set to false if you wish to have fine grained control over
 *   the positioning of all non-linear ads.
 *   If this value is true, the ad is positioned in the bottom center.
 *   If this value is false, the ad is positioned in the top left corner.
 *   The default value is true.
 * @property {number} bitrate
 *   Maximum recommended bitrate. The value is in kbit/s.
 *   The SDK will pick media with bitrate below the specified max,
 *   or the closest bitrate if there is no media with lower bitrate found.
 *   Default value, -1, means the SDK selects the maximum bitrate.
 * @property {boolean} enablePreloading
 *   Enables preloading of video assets.
 *   For more info see [our guide to preloading media]{@link https://developers.google.com/interactive-media-ads/docs/sdks/html5/preload}.
 * @property {number} loadVideoTimeout
 *   Timeout (in milliseconds) when loading a video ad media file.
 *   If loading takes longer than this timeout, the ad playback is canceled
 *   and the next ad in the pod plays, if available.
 *   Use -1 for the default of 8 seconds.
 * @property {?Array<string>} mimeTypes
 *   Only supported for linear video mime types.
 *   If specified, the SDK will include media that matches
 *   the MIME type(s) specified in the list and exclude media.
 *   that does not match the specified MIME type(s).
 *   The format is a list of strings,
 *   for example, [ 'video/mp4', 'video/webm', ... ] If not specified,
 *   the SDK will pick the media based on player capabilities.
 * @property {number} playAdsAfterTime
 *   For VMAP and ad rules playlists, only play ad breaks scheduled
 *   after this time (in seconds).
 *   This setting is strictly after - for example,
 *   setting playAdsAfterTime to 15 will cause IMA to ignore
 *   an ad break scheduled to play at 15s.
 * @property {boolean} restoreCustomPlaybackStateOnAdBreakComplete
 *   Specifies whether or not the SDK should restore the custom playback
 *   state after an ad break completes. This is setting is used primarily
 *   when the publisher passes in its content player to use for
 *   custom ad playback.
 * @property {?Array<string>} uiElements
 *   Specifies whether the UI elements that should be displayed.
 *   The elements in this array are ignored for AdSense/AdX ads.
 * @property {boolean} useStyledLinearAds
 *   Render linear ads with full UI styling.
 *   This setting does not apply to AdSense/AdX ads
 *   or ads played in a mobile context that already
 *   use full UI styling by default.
 * @property {boolean} useStyledNonLinearAds
 *   Render non-linear ads with a close and recall button.
 * @exportDoc
 */
google.ima.AdsRenderingSettings;


/** @const */
google.ima.AdDisplayContainer = class {
  /**
   * @param {HTMLElement} adContainer
   * @param {HTMLMediaElement} video
   */
  constructor(adContainer, video) {}

  initialize() {}

  destroy() {}
};


/**
 * @enum {string}
 */
google.ima.AdsManagerLoadedEvent.Type = {
  ADS_MANAGER_LOADED: 'ADS_MANAGER_LOADED',
};


/** @const */
google.ima.AdEvent = class extends Event {
  /** @return {?google.ima.Ad} */
  getAd() {}
};


/** @const */
google.ima.Ad = class {
  /** @return {number} */
  getDuration() {}

  /** @return {number} */
  getMinSuggestedDuration() {}

  /** @return {number} */
  getSkipTimeOffset() {}

  /** @return {google.ima.AdPodInfo} */
  getAdPodInfo() {}

  /** @return {string} */
  getAdvertiserName() {}

  /** @return {boolean} */
  isLinear() {}

  /** @return {string} */
  getTitle() {}

  /** @return {string} */
  getDescription() {}

  /** @return {number} */
  getVastMediaBitrate() {}

  /** @return {number} */
  getVastMediaHeight() {}

  /** @return {number} */
  getVastMediaWidth() {}

  /** @return {string} */
  getAdId() {}

  /** @return {string} */
  getCreativeAdId() {}

  /** @return {?string} */
  getMediaUrl() {}
};

/** @const */
google.ima.AdPodInfo = class {
  /** @return {number} */
  getAdPosition() {}

  /** @return {number} */
  getTotalAds() {}

  /** @return {number} */
  getTimeOffset() {}

  /** @return {number} */
  getPodIndex() {}
};

/** @const */
google.ima.ImaSdkSettings = class {
  /**
   * @param {string} locale
   */
  setLocale(locale) {}

  /**
   * @param {string} player
   */
  setPlayerType(player) {}

  /**
   * @param {string} version
   */
  setPlayerVersion(version) {}

  /**
   * @param {google.ima.ImaSdkSettings.VpaidMode} vpaidMode
   */
  setVpaidMode(vpaidMode) {}

  /**
   * @param {boolean} disable
   */
  setDisableCustomPlaybackForIOS10Plus(disable) {}
};

/**
 * @enum {number}
 */
google.ima.ImaSdkSettings.VpaidMode = {
  DISABLED: 0,
  ENABLED: 1,
  INSECURE: 2,
};


/**
 * @enum {string}
 */
google.ima.AdEvent.Type = {
  CONTENT_PAUSE_REQUESTED: 'CONTENT_PAUSE_REQUESTED',
  CONTENT_RESUME_REQUESTED: 'CONTENT_RESUME_REQUESTED',
  AD_ERROR: 'AD_ERROR',
  PAUSED: 'PAUSED',
  RESUMED: 'RESUMED',
  VOLUME_CHANGED: 'VOLUME_CHANGED',
  VOLUME_MUTED: 'VOLUME_MUTED',
  SKIPPABLE_STATE_CHANGED: 'SKIPPABLE_STATE_CHANGED',
  STARTED: 'STARTED',
  FIRST_QUARTILE: 'FIRST_QUARTILE',
  MIDPOINT: 'MIDPOINT',
  THIRD_QUARTILE: 'THIRD_QUARTILE',
  COMPLETE: 'COMPLETE',
  ALL_ADS_COMPLETED: 'ALL_ADS_COMPLETED',
  SKIPPED: 'SKIPPED',
  INTERACTION: 'INTERACTION',
  LOG: 'LOG',
  AD_BREAK_READY: 'AD_BREAK_READY',
  AD_METADATA: 'AD_METADATA',
  LINEAR_CHANGED: 'LINEAR_CHANGED',
  LOADED: 'LOADED',
  USER_CLOSE: 'USER_CLOSE',
  DURATION_CHANGE: 'DURATION_CHANGE',
  IMPRESSION: 'IMPRESSION',
  AD_BUFFERING: 'AD_BUFFERING',
  AD_PROGRESS: 'AD_PROGRESS',
  CLICK: 'CLICK',
};


/**
 * @typedef {{
 *   adsResponse: (string|undefined),
 *   adTagUrl: (string|undefined),
 * }}
 *
 * @description Request for the ad server
 * @property {string|undefined} adTagUrl
 *   Specifies the ad tag url that is requested from the ad server.
 *   This parameter is optional if adsResponse is given.
 * @property {string|undefined} adsResponse
 *   Specifies a VAST 2.0 document to be used as the ads response instead of
 *   making a request via an ad tag url. This can be useful for debugging
 *   and other situations where a VAST response is already available.
 *   This parameter is optional if adTagUrl is given.
 * @exportDoc
 */
google.ima.AdsRequest;


/** @const */
google.ima.AdError = class {};


/** @const */
google.ima.AdErrorEvent = class extends Event {
  /** @return {google.ima.AdError} */
  getError() {}
};


/**
 * @enum {string}
 */
google.ima.AdErrorEvent.Type = {
  AD_ERROR: 'AD_ERROR',
};


/** @const */
google.ima.dai = {};


/** @const */
google.ima.dai.api = {};


/**
 * @implements {EventTarget}
 */
google.ima.dai.api.StreamManager = class {
  /**
   * @param {HTMLMediaElement} videoElement
   * @param {HTMLElement=} adUiElement
   * @param {google.ima.dai.api.UiSettings=} uiSettings
   */
  constructor(videoElement, adUiElement = undefined, uiSettings = undefined) {}

  /** @param {number} streamTime */
  contentTimeForStreamTime(streamTime) {}

  /** @param {Object} metadata */
  onTimedMetadata(metadata) {}

  /**
   * @param {?Element} clickElement the element used as the ad click through.
   */
  setClickElement(clickElement) {}


  /** @param {number} streamTime */
  previousCuePointForStreamTime(streamTime) {}

  /**
   * @param {string} type
   * @param {Uint8Array|string} data
   * @param {number} timestamp
   */
  processMetadata(type, data, timestamp) {}

  /** @param {Object} adTagParameters */
  replaceAdTagParameters(adTagParameters) {}

  /** @param {google.ima.dai.api.StreamRequest} streamRequest */
  requestStream(streamRequest) {}

  reset() {}

  /** @param {number} contentTime */
  streamTimeForContentTime(contentTime) {}

  /**
   * @param {string|Array} type
   * @param {Function|Object} handler
   * @param {boolean|!AddEventListenerOptions=} capture
   * @param {Object=} handlerScope
   * @override
   */
  addEventListener(type, handler, capture, handlerScope) {}

  /** @override */
  removeEventListener() {}

  /** @override */
  dispatchEvent() {}
};


/** @const */
google.ima.dai.api.UiSettings = class {
  /** @return {number} */
  getLocale() {}

  /** @param {string} locale */
  setLocale(locale) {}
};


/** @const */
google.ima.dai.api.Ad = class {
  /** @return {number} */
  getDuration() {}

  /** @return {number} */
  getSkipTimeOffset() {}

  /** @return {google.ima.AdPodInfo} */
  getAdPodInfo() {}

  /** @return {string} */
  getAdvertiserName() {}

  /** @return {boolean} */
  isSkippable() {}

  /** @return {string} */
  getTitle() {}

  /** @return {string} */
  getDescription() {}

  /** @return {number} */
  getVastMediaHeight() {}

  /** @return {number} */
  getVastMediaWidth() {}

  /** @return {string} */
  getAdId() {}

  /** @return {string} */
  getCreativeAdId() {}

  /** @return {!Array<!google.ima.dai.api.CompanionAd>} */
  getCompanionAds() {}
};


/** @const */
google.ima.dai.api.AdPodInfo = class {
  /** @return {number} */
  getAdPosition() {}

  /** @return {number} */
  getTotalAds() {}

  /** @return {number} */
  getTimeOffset() {}

  /** @return {number} */
  getPodIndex() {}
};

/** @const */
google.ima.dai.api.CompanionAd = class {
  /** @return {?string} */
  getAdSlotId() {}

  /** @return {string} */
  getContent() {}

  /** @return {?string} */
  getContentType() {}

  /** @return {number} */
  getHeight() {}

  /** @return {?number} */
  getWidth() {}
};


/** @const */
google.ima.dai.api.CuePoint = class {};

/** @type {number} */
google.ima.dai.api.CuePoint.prototype.start;

/** @type {number} */
google.ima.dai.api.CuePoint.prototype.end;

/** @type {boolean} */
google.ima.dai.api.CuePoint.prototype.played;


/** @const */
google.ima.dai.api.AdProgressData = class {};


/** @type {number} */
google.ima.dai.api.AdProgressData.prototype.currentTime;


/** @type {number} */
google.ima.dai.api.AdProgressData.prototype.duration;


/** @type {number} */
google.ima.dai.api.AdProgressData.prototype.url;


/** @type {number} */
google.ima.dai.api.AdProgressData.prototype.totalAds;


/** @type {number} */
google.ima.dai.api.AdProgressData.prototype.adPosition;


/** @const */
google.ima.dai.api.StreamData = class {};


/** @type {google.ima.dai.api.AdProgressData} */
google.ima.dai.api.StreamData.prototype.adProgressData;


/** @type {string} */
google.ima.dai.api.StreamData.prototype.url;


/** @type {!Array<!google.ima.dai.api.CuePoint>} */
google.ima.dai.api.StreamData.prototype.cuepoints;


/** @type {string} */
google.ima.dai.api.StreamData.prototype.errorMessage;


/** @type {string} */
google.ima.dai.api.StreamData.prototype.streamId;


/** @type {?Array<{url: string, language: string, language_name: string}>} */
google.ima.dai.api.StreamData.prototype.subtitles;


/** @const */
google.ima.dai.api.StreamEvent = class extends Event {
  /** @return {!google.ima.dai.api.Ad} */
  getAd() {}

  /** @return {!google.ima.dai.api.StreamData} */
  getStreamData() {}
};


/** @const */
google.ima.dai.api.StreamRequest = class {};


/** @type {Object} */
google.ima.dai.api.StreamRequest.prototype.adTagParameters;


/** @type {string} */
google.ima.dai.api.StreamRequest.prototype.apiKey;


/** @type {string} */
google.ima.dai.api.StreamRequest.prototype.authToken;


/** @type {string} */
google.ima.dai.api.StreamRequest.prototype.streamActivityMonitorId;


/** @type {?string} */
google.ima.dai.api.StreamRequest.prototype.format;


/**
 * @type {Object<
 *   google.ima.dai.api.OmidVerificationVendor,
 *   (google.ima.dai.api.OmidAccessMode | undefined)>}
 */
google.ima.dai.api.StreamRequest.prototype.omidAccessModeRules;


/**
 * @enum {string}
 */
google.ima.dai.api.StreamRequest.StreamFormat = {
  DASH: 'dash',
  HLS: 'hls',
};


/** @const */
google.ima.dai.api.VODStreamRequest =
    class extends google.ima.dai.api.StreamRequest {};


/** @type {Object} */
google.ima.dai.api.VODStreamRequest.prototype.adTagParameters;


/** @type {string} */
google.ima.dai.api.VODStreamRequest.prototype.apiKey;


/** @type {string} */
google.ima.dai.api.VODStreamRequest.prototype.authToken;


/** @type {string} */
google.ima.dai.api.VODStreamRequest.prototype.contentSourceId;


/** @type {string} */
google.ima.dai.api.VODStreamRequest.prototype.streamActivityMonitorId;


/** @type {string} */
google.ima.dai.api.VODStreamRequest.prototype.videoId;


/** @const */
google.ima.dai.api.LiveStreamRequest =
    class extends google.ima.dai.api.StreamRequest {};


/** @type {Object} */
google.ima.dai.api.LiveStreamRequest.prototype.adTagParameters;


/** @type {string} */
google.ima.dai.api.LiveStreamRequest.prototype.apiKey;


/** @type {string} */
google.ima.dai.api.LiveStreamRequest.prototype.assetKey;


/** @type {string} */
google.ima.dai.api.LiveStreamRequest.prototype.authToken;


/** @type {string} */
google.ima.dai.api.LiveStreamRequest.prototype.streamActivityMonitorId;


/**
 * @enum {string}
 */
google.ima.dai.api.StreamEvent.Type = {
  LOADED: 'loaded',
  AD_BREAK_STARTED: 'adBreakStarted',
  AD_BREAK_ENDED: 'adBreakEnded',
  AD_PERIOD_STARTED: 'adPeriodStarted',
  AD_PERIOD_ENDED: 'adPeriodEnded',
  AD_PROGRESS: 'adProgress',
  CUEPOINTS_CHANGED: 'cuepointsChanged',
  CLICK: 'click',
  ERROR: 'error',
  STARTED: 'started',
  FIRST_QUARTILE: 'firstquartile',
  MIDPOINT: 'midpoint',
  STREAM_INITIALIZED: 'streamInitialized',
  THIRD_QUARTILE: 'thirdquartile',
  COMPLETE: 'complete',
  SKIPPABLE_STATE_CHANGED: 'skippableStateChanged',
  SKIPPED: 'skip',
  VIDEO_CLICKED: 'videoClicked',
};


/**
 * @enum {number}
 */
google.ima.dai.api.OmidVerificationVendor = {
  OTHER: 1,
  MOAT: 2,
  DOUBLEVERIFY: 3,
  INTEGRAL_AD_SCIENCE: 4,
  PIXELATE: 5,
  NIELSEN: 6,
  COMSCORE: 7,
  MEETRICS: 8,
  GOOGLE: 9,
};


/**
 * @enum {string}
 */
google.ima.dai.api.OmidAccessMode = {
  FULL: 'full',
  DOMAIN: 'domain',
  LIMITED: 'limited',
};
