/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.CmcdManager');

goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.EventManager');

goog.requireType('shaka.media.SegmentReference');

/**
 * @summary
 * A CmcdManager maintains CMCD state as well as a collection of utility
 * functions.
 */
shaka.util.CmcdManager = class {
  /**
   * @param {shaka.util.CmcdManager.PlayerInterface} playerInterface
   * @param {shaka.extern.CmcdConfiguration} config
   */
  constructor(playerInterface, config) {
    /** @private {shaka.util.CmcdManager.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.CmcdConfiguration} */
    this.config_ = config;

    /**
     * Streaming format
     *
     * @private {(shaka.util.CmcdManager.StreamingFormat|undefined)}
     */
    this.sf_ = undefined;

    /**
     * @private {boolean}
     */
    this.playbackStarted_ = false;

    /**
     * @private {boolean}
     */
    this.buffering_ = true;

    /**
     * @private {boolean}
     */
    this.starved_ = false;

    /**
     * @private {boolean}
     */
    this.lowLatency_ = false;

    /**
     * @private {number|undefined}
     */
    this.playbackPlayTime_ = undefined;

    /**
     * @private {number|undefined}
     */
    this.playbackPlayingTime_ = undefined;

    /**
     * @private {number}
     */
    this.startTimeOfLoad_ = 0;

    /**
     * @private {{request: boolean, response: boolean}}
     */
    this.msdSent_ = {
      request: false,
      response: false,
    };

    /**
     * @private {shaka.util.EventManager}
     */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {HTMLMediaElement} */
    this.video_ = null;
  }


  /**
   * Set media element and setup event listeners
   * @param {HTMLMediaElement} mediaElement The video element
   */
  setMediaElement(mediaElement) {
    this.video_ = mediaElement;
    this.setupEventListeners_();
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.CmcdConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }


  /**
   * Resets the CmcdManager.
   */
  reset() {
    this.playbackStarted_ = false;
    this.buffering_ = true;
    this.starved_ = false;
    this.lowLatency_ = false;
    this.playbackPlayTime_ = 0;
    this.playbackPlayingTime_ = 0;
    this.startTimeOfLoad_ = 0;
    this.msdSent_ = {
      request: false,
      response: false,
    };

    this.video_ = null;
    this.eventManager_.removeAll();
  }

  /**
   * Set the buffering state
   *
   * @param {boolean} buffering
   */
  setBuffering(buffering) {
    if (!buffering && !this.playbackStarted_) {
      this.playbackStarted_ = true;
    }

    if (this.playbackStarted_ && buffering) {
      this.starved_ = true;
    }

    this.buffering_ = buffering;
  }

  /**
   * Set the low latency
   *
   * @param {boolean} lowLatency
   */
  setLowLatency(lowLatency) {
    this.lowLatency_ = lowLatency;

    const StreamingFormat = shaka.util.CmcdManager.StreamingFormat;
    if (this.lowLatency_) {
      if (this.sf_ == StreamingFormat.DASH) {
        this.sf_ = StreamingFormat.LOW_LATENCY_DASH;
      } else if (this.sf_ == StreamingFormat.HLS) {
        this.sf_ = StreamingFormat.LOW_LATENCY_HLS;
      }
    } else {
      if (this.sf_ == StreamingFormat.LOW_LATENCY_DASH) {
        this.sf_ = StreamingFormat.DASH;
      } else if (this.sf_ == StreamingFormat.LOW_LATENCY_HLS) {
        this.sf_ = StreamingFormat.HLS;
      }
    }
  }

  /**
   * Set start time of load if autoplay is enabled
   *
   * @param {number} startTimeOfLoad
   */
  setStartTimeOfLoad(startTimeOfLoad) {
    if (!this.config_ || !this.config_.enabled) {
      return;
    }
    if (this.video_ && this.video_.autoplay) {
      const playResult = this.video_.play();
      if (playResult) {
        playResult.then(() => {
          this.startTimeOfLoad_ = startTimeOfLoad;
        }).catch((e) => {
          this.startTimeOfLoad_ = 0;
        });
      }
    }
  }

  /**
   * Apply CMCD data to a request.
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   *   The request type
   * @param {!shaka.extern.Request} request
   *   The request to apply CMCD data to
   * @param {shaka.extern.RequestContext=} context
   *   The request context
   */
  applyRequestData(type, request, context = {}) {
    if (!this.config_.enabled) {
      return;
    }

    if (request.method === 'HEAD') {
      this.applyRequest_(request, {});
      return;
    }

    const RequestType = shaka.net.NetworkingEngine.RequestType;
    const ObjectType = shaka.util.CmcdManager.ObjectType;

    switch (type) {
      case RequestType.MANIFEST:
        this.applyManifestData(request, context);
        break;

      case RequestType.SEGMENT:
        this.applyRequestSegmentData(request, context);
        break;

      case RequestType.LICENSE:
      case RequestType.SERVER_CERTIFICATE:
      case RequestType.KEY:
        this.applyRequest_(request, {ot: ObjectType.KEY});
        break;

      case RequestType.TIMING:
        this.applyRequest_(request, {ot: ObjectType.OTHER});
        break;
    }
  }

  /**
   * Apply CMCD data to a response.
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   *   The request type
   * @param {!shaka.extern.Response} response
   *   The response to apply CMCD data to
   * @param {shaka.extern.RequestContext=} context
   *   The request context
   */
  applyResponseData(type, response, context = {}) {
    const RequestType = shaka.net.NetworkingEngine.RequestType;

    switch (type) {
      case RequestType.SEGMENT:
        this.applyResponseSegmentData(response, context);
        break;
    }
  }

  /**
   * Apply CMCD data to a manifest request.
   *
   * @param {!shaka.extern.Request} request
   *   The request to apply CMCD data to
   * @param {shaka.extern.RequestContext} context
   *   The request context
   */
  applyManifestData(request, context) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      if (context.type) {
        this.sf_ = this.getStreamFormat_(context.type);
      }

      this.applyRequest_(request, {
        ot: shaka.util.CmcdManager.ObjectType.MANIFEST,
        su: !this.playbackStarted_,
      });
    } catch (error) {
      shaka.log.warnOnce('CMCD_MANIFEST_ERROR',
          'Could not generate manifest CMCD data.', error);
    }
  }

  /**
   * Apply CMCD data to a segment response
   *
   * @param {!shaka.extern.Response} response
   * @param {shaka.extern.RequestContext} context
   *   The request context
   */
  applyResponseSegmentData(response, context) {
    try {
      const data = this.getDataForSegment_(context, response.uri);
      this.applyResponse_(response, data);
    } catch (error) {
      shaka.log.warnOnce(
          'CMCD_SEGMENT_ERROR',
          'Could not generate response segment CMCD data.',
          error,
      );
    }
  }

  /**
   * Apply CMCD data to a segment request
   *
   * @param {!shaka.extern.Request} request
   * @param {shaka.extern.RequestContext} context
   *   The request context
   */
  applyRequestSegmentData(request, context) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      const data = this.getDataForSegment_(context, request.uris[0]);
      this.applyRequest_(request, data);
    } catch (error) {
      shaka.log.warnOnce(
          'CMCD_SEGMENT_ERROR',
          'Could not generate segment CMCD data.', error,
      );
    }
  }

  /**
   * Apply CMCD data to a text request
   *
   * @param {!shaka.extern.Request} request
   */
  applyTextData(request) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      this.applyRequest_(request, {
        ot: shaka.util.CmcdManager.ObjectType.CAPTION,
        su: true,
      });
    } catch (error) {
      shaka.log.warnOnce('CMCD_TEXT_ERROR',
          'Could not generate text CMCD data.', error);
    }
  }

  /**
   * Apply CMCD data to streams loaded via src=.
   *
   * @param {string} uri
   * @param {string} mimeType
   * @return {string}
   */
  appendSrcData(uri, mimeType) {
    try {
      if (!this.config_.enabled) {
        return uri;
      }

      const data = this.createData_();
      data.ot = this.getObjectTypeFromMimeType_(mimeType);
      data.su = true;

      const query = shaka.util.CmcdManager.toQuery(data);

      return shaka.util.CmcdManager.appendQueryToUri(uri, query);
    } catch (error) {
      shaka.log.warnOnce('CMCD_SRC_ERROR',
          'Could not generate src CMCD data.', error);
      return uri;
    }
  }

  /**
   * Apply CMCD data to side car text track uri.
   *
   * @param {string} uri
   * @return {string}
   */
  appendTextTrackData(uri) {
    try {
      if (!this.config_.enabled) {
        return uri;
      }

      const data = this.createData_();
      data.ot = shaka.util.CmcdManager.ObjectType.CAPTION;
      data.su = true;

      const query = shaka.util.CmcdManager.toQuery(data);

      return shaka.util.CmcdManager.appendQueryToUri(uri, query);
    } catch (error) {
      shaka.log.warnOnce('CMCD_TEXT_TRACK_ERROR',
          'Could not generate text track CMCD data.', error);
      return uri;
    }
  }

  /**
   * Set playbackPlayTime_ when the play event is triggered
   * @private
   */
  onPlaybackPlay_() {
    if (!this.playbackPlayTime_) {
      this.playbackPlayTime_ = Date.now();
    }
  }

  /**
   * Set playbackPlayingTime_
   * @private
   */
  onPlaybackPlaying_() {
    if (!this.playbackPlayingTime_) {
      this.playbackPlayingTime_ = Date.now();
    }
  }

  /**
   * Setup event listeners.
   * @private
   */
  setupEventListeners_() {
    const onPlaybackPlay = () => this.onPlaybackPlay_();
    this.eventManager_.listenOnce(
        this.video_, 'play', onPlaybackPlay);

    const onPlaybackPlaying = () => this.onPlaybackPlaying_();
    this.eventManager_.listenOnce(
        this.video_, 'playing', onPlaybackPlaying);
  }

  /**
   * Create baseline CMCD data
   *
   * @return {CmcdData}
   * @private
   */
  createData_() {
    if (!this.config_.sessionId) {
      this.config_.sessionId = window.crypto.randomUUID();
    }
    return {
      v: this.config_.version,
      sf: this.sf_,
      sid: this.config_.sessionId,
      cid: this.config_.contentId,
      mtp: this.playerInterface_.getBandwidthEstimate() / 1000,
    };
  }

  /**
   * Apply CMCD data to a request.
   *
   * @param {!shaka.extern.Request} request The request to apply CMCD data to
   * @param {!CmcdData} data The data object
   * @private
   */
  applyRequest_(request, data) {
    if (!this.config_.enabled) {
      return;
    }

    const rawOutput = this.getGenericData_(
        data, shaka.util.CmcdManager.CmcdMode.REQUEST,
    );

    const includeKeys = this.config_.includeKeys || [];
    const version = this.config_.version;
    const allowedKeys = (version == shaka.util.CmcdManager.Version.VERSION_2) ?
        Array.from(new Set([
          ...shaka.util.CmcdManager.CmcdKeys.V2CommonKeys,
          ...shaka.util.CmcdManager.CmcdKeys.V2RequestModeKeys,
        ])) :
        shaka.util.CmcdManager.CmcdKeys.V1Keys;

    const allowedKeysRequestMode = this.checkValidKeys_(
        includeKeys,
        allowedKeys,
        shaka.util.CmcdManager.CmcdMode.REQUEST,
    );

    const output = this.filterKeys_(rawOutput, allowedKeysRequestMode);

    this.applyCmcdDataToRequest_(output, request, this.config_.useHeaders);
  }

  /**
   * Apply CMCD data to a response.
   *
   * @param {!shaka.extern.Response} response The request to apply CMCD data to
   * @param {!CmcdData} data The data object
   * @private
   */
  applyResponse_(response, data) {
    const targets = this.config_.targets;
    if (!targets) {
      return;
    }

    const responseTargets = targets.filter(
        (target) =>
          target.mode === shaka.util.CmcdManager.CmcdMode.RESPONSE &&
        target.enabled === true,
    );

    const version = this.config_.version;
    const allowedKeys = (version == shaka.util.CmcdManager.Version.VERSION_2) ?
        Array.from(new Set([
          ...shaka.util.CmcdManager.CmcdKeys.V2CommonKeys,
          ...shaka.util.CmcdManager.CmcdKeys.V2ResponseModeKeys,
        ])) :
        shaka.util.CmcdManager.CmcdKeys.V1Keys;

    const rawOutput = this.getGenericData_(
        data,
        shaka.util.CmcdManager.CmcdMode.RESPONSE,
    );

    for (const target of responseTargets) {
      const includeKeys = target.includeKeys || [];
      const allowedKeysResponseMode = this.checkValidKeys_(
          includeKeys,
          allowedKeys,
          shaka.util.CmcdManager.CmcdMode.RESPONSE,
      );

      const output = this.filterKeys_(rawOutput, allowedKeysResponseMode);
      this.sendCmcdRequest_(output, target, response);
    }
  }

  /**
   * Creates and sends a new, out-of-band request to a CMCD endpoint.
   * This is used for event and response reporting.
   *
   * @param {!CmcdData} cmcdData The CMCD data to send.
   * @param {shaka.extern.CmcdTarget} target The CMCD target configuration.
   * @param {shaka.extern.Response=} response Optional response object
   *  to update, used by the applyResponse flow.
   * @private
   */
  sendCmcdRequest_(cmcdData, target, response) {
    const retryParams = shaka.net.NetworkingEngine.defaultRetryParameters();
    let request = null;
    const baseURL = target.url;

    if (target.useHeaders) {
      const headers = shaka.util.CmcdManager.toHeaders(cmcdData);
      if (!Object.keys(headers).length) {
        return;
      }
      if (response) {
        Object.assign(response.headers, headers);
      }
      request = shaka.net.NetworkingEngine.makeRequest([baseURL], retryParams);
      Object.assign(request.headers, headers);
    } else {
      const queryString = shaka.util.CmcdManager.toQuery(cmcdData);
      if (!queryString) {
        return;
      }
      const finalUri = shaka.util.CmcdManager.appendQueryToUri(
          baseURL, queryString);
      if (response) {
        response.uri = finalUri;
      }
      request = shaka.net.NetworkingEngine.makeRequest([finalUri], retryParams);
    }
    const requestType = shaka.net.NetworkingEngine.RequestType.CMCD;
    const networkingEngine = this.playerInterface_.getNetworkingEngine();
    networkingEngine.request(requestType, request);
  }

  /**
   * Modifies an existing request object by adding CMCD data to it.
   *
   * @param {!CmcdData} output The CMCD data to apply.
   * @param {!shaka.extern.Request} request The request object to modify.
   * @param {boolean} useHeaders Whether to use headers or query parameters.
   * @private
   */
  applyCmcdDataToRequest_(output, request, useHeaders) {
    if (useHeaders) {
      const headers = shaka.util.CmcdManager.toHeaders(output);
      if (!Object.keys(headers).length) {
        return;
      }

      Object.assign(request.headers, headers);
    } else {
      const query = shaka.util.CmcdManager.toQuery(output);
      if (!query) {
        return;
      }

      request.uris = request.uris.map((uri) => {
        return shaka.util.CmcdManager.appendQueryToUri(uri, query);
      });
    }
  }

  /**
   * Checks if the keys in `includeKeys` are valid against a list of
   * `allowedKeys`. It logs an error for any invalid key and returns a new array
   * containing only the valid keys. If `includeKeys` is empty or not provided,
   * it returns all `allowedKeys`.
   *
   * @param {Array<string>} includeKeys Keys to validate.
   * @param {Array<string>} allowedKeys The list of allowed keys.
   * @param {string} mode Mode ('query', 'header' or 'event') for error logging.
   *
   * @return {Array<string>} A new array containing only the valid keys.
   * @private
   */
  checkValidKeys_(includeKeys, allowedKeys, mode) {
    if (!includeKeys || includeKeys.length === 0) {
      return allowedKeys;
    }

    for (const key of includeKeys) {
      if (!allowedKeys.includes(key)) {
        shaka.log.error(`CMCD Key "${key}" is not allowed for ${mode} mode`);
      }
    }

    includeKeys = includeKeys.filter((key) =>
      allowedKeys.includes(key),
    );

    return includeKeys;
  }

  /**
   * Filter the CMCD data object to include only the keys specified in the
   * configuration.
   *
   * @param {CmcdData} data
   * @param {Array<string>} includeKeys
   *
   * @return {CmcdData}
   * @private
   */
  filterKeys_(data, includeKeys) {
    return Object.keys(data).reduce((acc, key) => {
      if (includeKeys.includes(key)) {
        acc[key] = data[key];
      }
      return acc;
    }, {});
  }

  /**
   * The CMCD object type.
   *
   * @param {shaka.extern.RequestContext} context
   *   The request context
   * @return {shaka.util.CmcdManager.ObjectType|undefined}
   * @private
   */
  getObjectType_(context) {
    if (context.type ===
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT) {
      return shaka.util.CmcdManager.ObjectType.INIT;
    }

    const stream = context.stream;

    if (!stream) {
      return undefined;
    }

    const type = stream.type;

    if (type == 'video') {
      if (stream.codecs && stream.codecs.includes(',')) {
        return shaka.util.CmcdManager.ObjectType.MUXED;
      }
      return shaka.util.CmcdManager.ObjectType.VIDEO;
    }

    if (type == 'audio') {
      return shaka.util.CmcdManager.ObjectType.AUDIO;
    }

    if (type == 'text') {
      if (stream.mimeType === 'application/mp4') {
        return shaka.util.CmcdManager.ObjectType.TIMED_TEXT;
      }
      return shaka.util.CmcdManager.ObjectType.CAPTION;
    }

    return undefined;
  }

  /**
   * The CMCD object type from mimeType.
   *
   * @param {!string} mimeType
   * @return {(shaka.util.CmcdManager.ObjectType|undefined)}
   * @private
   */
  getObjectTypeFromMimeType_(mimeType) {
    switch (mimeType.toLowerCase()) {
      case 'audio/mp4':
      case 'audio/webm':
      case 'audio/ogg':
      case 'audio/mpeg':
      case 'audio/aac':
      case 'audio/flac':
      case 'audio/wav':
        return shaka.util.CmcdManager.ObjectType.AUDIO;

      case 'video/webm':
      case 'video/mp4':
      case 'video/mpeg':
      case 'video/mp2t':
        return shaka.util.CmcdManager.ObjectType.MUXED;

      case 'application/x-mpegurl':
      case 'application/vnd.apple.mpegurl':
      case 'application/dash+xml':
      case 'video/vnd.mpeg.dash.mpd':
      case 'application/vnd.ms-sstr+xml':
        return shaka.util.CmcdManager.ObjectType.MANIFEST;

      default:
        return undefined;
    }
  }

  /**
   * Get the buffer length for a media type in milliseconds
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getBufferLength_(type) {
    const ranges = this.playerInterface_.getBufferedInfo()[type];

    if (!ranges.length) {
      return NaN;
    }

    const start = this.playerInterface_.getCurrentTime();
    const range = ranges.find((r) => r.start <= start && r.end >= start);

    if (!range) {
      return NaN;
    }

    return (range.end - start) * 1000;
  }

  /**
   * Get the remaining buffer length for a media type in milliseconds
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getRemainingBufferLength_(type) {
    const ranges = this.playerInterface_.getBufferedInfo()[type];

    if (!ranges.length) {
      return 0;
    }

    const start = this.playerInterface_.getCurrentTime();
    const range = ranges.find((r) => r.start <= start && r.end >= start);

    if (!range) {
      return 0;
    }

    return (range.end - start) * 1000;
  }

  /**
   * Constructs a relative path from a URL
   *
   * @param {string} url
   * @param {string} base
   * @return {string}
   * @private
   */
  urlToRelativePath_(url, base) {
    const to = new URL(url);
    const from = new URL(base);

    if (to.origin !== from.origin) {
      return url;
    }

    const toPath = to.pathname.split('/').slice(1);
    const fromPath = from.pathname.split('/').slice(1, -1);

    // remove common parents
    while (toPath[0] === fromPath[0]) {
      toPath.shift();
      fromPath.shift();
    }

    // add back paths
    while (fromPath.length) {
      fromPath.shift();
      toPath.unshift('..');
    }

    return toPath.join('/');
  }

  /**
   * Calculate measured start delay
   *
   * @return {number|undefined}
   * @param {!string} mode CMCD Mode [Response, Request]
   * @private
   */
  calculateMSD_(mode) {
    if (!this.msdSent_[mode] &&
        this.playbackPlayingTime_ &&
        this.playbackPlayTime_) {
      const startTime = this.startTimeOfLoad_ || this.playbackPlayTime_;
      return this.playbackPlayingTime_ - startTime;
    }
    return undefined;
  }


  /**
   * Calculate requested maximum throughput
   *
   * @param {shaka.extern.Stream} stream
   * @param {shaka.media.SegmentReference} segment
   * @return {number}
   * @private
   */
  calculateRtp_(stream, segment) {
    const playbackRate = this.playerInterface_.getPlaybackRate() || 1;
    const currentBufferLevel =
        this.getRemainingBufferLength_(stream.type) || 500;
    const bandwidth = stream.bandwidth;
    if (!bandwidth) {
      return NaN;
    }
    const segmentDuration = segment.endTime - segment.startTime;
    // Calculate file size in kilobits
    const segmentSize = bandwidth * segmentDuration / 1000;
    // Calculate time available to load file in seconds
    const timeToLoad = (currentBufferLevel / playbackRate) / 1000;
    // Calculate the exact bandwidth required
    const minBandwidth = segmentSize / timeToLoad;
    // Include a safety buffer
    return minBandwidth * this.config_.rtpSafetyFactor;
  }

  /**
   * Get the stream format
   *
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType} type
   *   The request's advanced type
   * @return {(shaka.util.CmcdManager.StreamingFormat|undefined)}
   * @private
   */
  getStreamFormat_(type) {
    const AdvancedRequestType = shaka.net.NetworkingEngine.AdvancedRequestType;

    switch (type) {
      case AdvancedRequestType.MPD:
        if (this.lowLatency_) {
          return shaka.util.CmcdManager.StreamingFormat.LOW_LATENCY_DASH;
        }
        return shaka.util.CmcdManager.StreamingFormat.DASH;

      case AdvancedRequestType.MASTER_PLAYLIST:
      case AdvancedRequestType.MEDIA_PLAYLIST:
        if (this.lowLatency_) {
          return shaka.util.CmcdManager.StreamingFormat.LOW_LATENCY_HLS;
        }
        return shaka.util.CmcdManager.StreamingFormat.HLS;

      case AdvancedRequestType.MSS:
        return shaka.util.CmcdManager.StreamingFormat.SMOOTH;
    }

    return undefined;
  }

  /**
   * Get the stream type
   *
   * @return {shaka.util.CmcdManager.StreamType}
   * @private
   */
  getStreamType_() {
    const isLive = this.playerInterface_.isLive();
    if (isLive) {
      return shaka.util.CmcdManager.StreamType.LIVE;
    } else {
      return shaka.util.CmcdManager.StreamType.VOD;
    }
  }

  /**
   * Get the highest bandwidth for a given type.
   *
   * @param {shaka.util.CmcdManager.ObjectType|undefined} type
   * @return {number}
   * @private
   */
  getTopBandwidth_(type) {
    const variants = this.playerInterface_.getVariantTracks();
    if (!variants.length) {
      return NaN;
    }

    let top = variants[0];

    for (const variant of variants) {
      if (variant.type === 'variant' && variant.bandwidth > top.bandwidth) {
        top = variant;
      }
    }

    const ObjectType = shaka.util.CmcdManager.ObjectType;

    switch (type) {
      case ObjectType.VIDEO:
        return top.videoBandwidth || NaN;

      case ObjectType.AUDIO:
        return top.audioBandwidth || NaN;

      default:
        return top.bandwidth;
    }
  }

  /**
   * Get CMCD data for a segment.
   *
   * @param {shaka.extern.RequestContext} context
   *   The request context
   * @param {?string} requestUri
   * @return {!CmcdData}
   * @private
   */
  getDataForSegment_(context, requestUri) {
    const segment = context.segment;

    let duration = 0;
    if (segment) {
      duration = segment.endTime - segment.startTime;
    }

    const data = {
      d: duration * 1000,
      st: this.getStreamType_(),
    };

    data.ot = this.getObjectType_(context);

    const ObjectType = shaka.util.CmcdManager.ObjectType;
    const isMedia = data.ot === ObjectType.VIDEO ||
        data.ot === ObjectType.AUDIO ||
        data.ot === ObjectType.MUXED ||
        data.ot === ObjectType.TIMED_TEXT;

    const stream = context.stream;
    if (stream) {
      const playbackRate = this.playerInterface_.getPlaybackRate();
      if (isMedia) {
        data.bl = this.getBufferLength_(stream.type);
        if (data.ot !== ObjectType.TIMED_TEXT) {
          const remainingBufferLength =
              this.getRemainingBufferLength_(stream.type);
          if (playbackRate) {
            data.dl = remainingBufferLength / Math.abs(playbackRate);
          } else {
            data.dl = remainingBufferLength;
          }
        }
      }

      if (stream.bandwidth) {
        data.br = stream.bandwidth / 1000;
      }

      if (stream.segmentIndex && segment) {
        const reverse = playbackRate < 0;
        const iterator = stream.segmentIndex.getIteratorForTime(
            segment.endTime, /* allowNonIndependent= */ true, reverse);
        if (iterator) {
          const nextSegment = iterator.next().value;
          if (nextSegment && nextSegment != segment) {
            if (requestUri && !shaka.util.ArrayUtils.equal(
                segment.getUris(), nextSegment.getUris())) {
              data.nor = this.urlToRelativePath_(
                  nextSegment.getUris()[0], requestUri);
            }
            if ((nextSegment.startByte || nextSegment.endByte) &&
                (segment.startByte != nextSegment.startByte ||
                segment.endByte != nextSegment.endByte)) {
              let range = nextSegment.startByte + '-';
              if (nextSegment.endByte) {
                range += nextSegment.endByte;
              }
              data.nrr = range;
            }
          }
        }
        const rtp = this.calculateRtp_(stream, segment);
        if (!isNaN(rtp)) {
          data.rtp = rtp;
        }
      }
    }

    if (isMedia && data.ot !== ObjectType.TIMED_TEXT) {
      data.tb = this.getTopBandwidth_(data.ot) / 1000;
    }

    return data;
  }


  /**
   * Get generic CMCD data.
   *
   * @param {!CmcdData} data The data object
   * @param {!shaka.util.CmcdManager.CmcdMode} mode
   * @return {!CmcdData}
   * @private
   */
  getGenericData_(data, mode) {
    // Apply baseline data
    Object.assign(data, this.createData_());

    data.pr = this.playerInterface_.getPlaybackRate();

    const isVideo = data.ot === shaka.util.CmcdManager.ObjectType.VIDEO ||
        data.ot === shaka.util.CmcdManager.ObjectType.MUXED;

    if (this.starved_ && isVideo) {
      data.bs = true;
      data.su = true;
      this.starved_ = false;
    }

    if (data.su == null) {
      data.su = this.buffering_;
    }

    if (this.playerInterface_.isLive()) {
      data.ltc = this.playerInterface_.getLiveLatency();
    }

    const msd = this.calculateMSD_(mode);
    if (msd != undefined && !this.msdSent_[mode]) {
      data.msd = msd;
      this.msdSent_[mode] = true;
    }

    return data;
  }

  /**
   * Serialize a CMCD data object according to the rules defined in the
   * section 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {CmcdData} data The CMCD data object
   * @return {string}
   */
  static serialize(data) {
    const results = [];
    const isValid = (value) =>
      !Number.isNaN(value) && value != null && value !== '' && value !== false;
    const toRounded = (value) => Math.round(value);
    const toHundred = (value) => toRounded(value / 100) * 100;
    const toUrlSafe = (value) => encodeURIComponent(value);
    const formatters = {
      br: toRounded,
      d: toRounded,
      bl: toHundred,
      dl: toHundred,
      mtp: toHundred,
      nor: toUrlSafe,
      rtp: toHundred,
      tb: toRounded,
    };

    const keys = Object.keys(data || {}).sort();

    for (const key of keys) {
      let value = data[key];

      // ignore invalid values
      if (!isValid(value)) {
        continue;
      }

      // Version should only be reported if not equal to 1.
      if (key === 'v' && value === 1) {
        continue;
      }

      // Playback rate should only be sent if not equal to 1.
      if (key == 'pr' && value === 1) {
        continue;
      }

      // Certain values require special formatting
      const formatter = formatters[key];
      if (formatter) {
        value = formatter(value);
      }

      // Serialize the key/value pair
      const type = typeof value;
      let result;

      if (type === 'string' && key !== 'ot' && key !== 'sf' && key !== 'st') {
        result = `${key}=${JSON.stringify(value)}`;
      } else if (type === 'boolean') {
        result = key;
      } else if (type === 'symbol') {
        result = `${key}=${value.description}`;
      } else {
        result = `${key}=${value}`;
      }

      results.push(result);
    }

    return results.join(',');
  }

  /**
   * Convert a CMCD data object to request headers according to the rules
   * defined in the section 2.1 and 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {CmcdData} data The CMCD data object
   * @return {!Object}
   */
  static toHeaders(data) {
    const keys = Object.keys(data);
    const headers = {};
    const headerNames = ['Object', 'Request', 'Session', 'Status'];
    const headerGroups = [{}, {}, {}, {}];
    const headerMap = {
      br: 0, d: 0, ot: 0, tb: 0,
      bl: 1, dl: 1, mtp: 1, nor: 1, nrr: 1, su: 1, ltc: 1,
      cid: 2, pr: 2, sf: 2, sid: 2, st: 2, v: 2, msd: 2,
      bs: 3, rtp: 3,
    };

    for (const key of keys) {
      // Unmapped fields are mapped to the Request header
      const index = (headerMap[key] != null) ? headerMap[key] : 1;
      headerGroups[index][key] = data[key];
    }

    for (let i = 0; i < headerGroups.length; i++) {
      const value = shaka.util.CmcdManager.serialize(headerGroups[i]);
      if (value) {
        headers[`CMCD-${headerNames[i]}`] = value;
      }
    }

    return headers;
  }

  /**
   * Convert a CMCD data object to query args according to the rules
   * defined in the section 2.2 and 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {CmcdData} data The CMCD data object
   * @return {string}
   */
  static toQuery(data) {
    return shaka.util.CmcdManager.serialize(data);
  }

  /**
   * Append query args to a uri.
   *
   * @param {string} uri
   * @param {string} query
   * @return {string}
   */
  static appendQueryToUri(uri, query) {
    if (!query) {
      return uri;
    }

    if (uri.includes('offline:')) {
      return uri;
    }

    const url = new goog.Uri(uri);
    url.getQueryData().set('CMCD', query);
    return url.toString();
  }
};


/**
 * @typedef {{
 *   getBandwidthEstimate: function():number,
 *   getBufferedInfo: function():shaka.extern.BufferedInfo,
 *   getCurrentTime: function():number,
 *   getPlaybackRate: function():number,
 *   getVariantTracks: function():Array<shaka.extern.Track>,
 *   isLive: function():boolean,
 *   getLiveLatency: function():number,
 *   getNetworkingEngine: function():shaka.net.NetworkingEngine,
 * }}
 *
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {function():shaka.extern.BufferedInfo} getBufferedInfo
 *   Get information about what the player has buffered.
 * @property {function():number} getCurrentTime
 *   Get the current time
 * @property {function():number} getPlaybackRate
 *   Get the playback rate
 * @property {function():Array<shaka.extern.Track>} getVariantTracks
 *   Get the variant tracks
 * @property {function():boolean} isLive
 *   Get if the player is playing live content.
 * @property {function():number} getLiveLatency
 *   Get latency in milliseconds between the live edge and what's currently
 *   playing.
 * @property {function():shaka.net.NetworkingEngine} getNetworkingEngine
 *  Gets a reference to the Player's networking engine.
 * Used to make requests through Shaka's networking plugins.
 */
shaka.util.CmcdManager.PlayerInterface;


/**
 * @enum {string}
 */
shaka.util.CmcdManager.ObjectType = {
  MANIFEST: 'm',
  AUDIO: 'a',
  VIDEO: 'v',
  MUXED: 'av',
  INIT: 'i',
  CAPTION: 'c',
  TIMED_TEXT: 'tt',
  KEY: 'k',
  OTHER: 'o',
};

/**
 * @enum {number}
 */
shaka.util.CmcdManager.Version = {
  VERSION_1: 1,
  VERSION_2: 2,
};

/**
 * @enum {string}
 */
shaka.util.CmcdManager.StreamType = {
  VOD: 'v',
  LIVE: 'l',
};


/**
 * @enum {string}
 * @export
 */
shaka.util.CmcdManager.StreamingFormat = {
  DASH: 'd',
  LOW_LATENCY_DASH: 'ld',
  HLS: 'h',
  LOW_LATENCY_HLS: 'lh',
  SMOOTH: 's',
  OTHER: 'o',
};


/**
 * @enum {Array<string>}
 */
shaka.util.CmcdManager.CmcdKeys = {
  V1Keys: [
    'br', 'bl', 'bs', 'cid', 'd',
    'dl', 'mtp', 'nor', 'nrr',
    'ot', 'pr', 'rtp', 'sf', 'sid', 'st',
    'su', 'tb', 'v',
  ],
  V2CommonKeys: [
    'br', 'ab', 'bl', 'tbl', 'bs',
    'cdn', 'cid', 'ltc', 'mtp',
    'pr', 'sf', 'sid', 'bg', 'sta',
    'st', 'ts', 'tpb', 'tb', 'lb',
    'tab', 'lab', 'pt', 'ec', 'msd',
    'v',
  ],
  V2RequestModeKeys: [
    'ab', 'bl', 'tbl', 'bs', 'cdn',
    'cid', 'd', 'dl', 'ltc', 'mtp',
    'nor', 'ot', 'pr', 'rtp', 'sf',
    'sid', 'bg', 'sta', 'st', 'su',
    'ts', 'tpb', 'tb', 'lb', 'tab',
    'lab', 'pt', 'ec', 'msd', 'v',
  ],
  V2ResponseModeKeys: [
    'd', 'dl', 'nor', 'ot', 'rtp',
    'rc', 'su', 'ttfb', 'ttfbb',
    'ttlb', 'url', 'cmsdd', 'cmsds',
  ],
};

/**
 * @enum {string}
 */
shaka.util.CmcdManager.CmcdMode = {
  REQUEST: 'request',
  RESPONSE: 'response',
};
