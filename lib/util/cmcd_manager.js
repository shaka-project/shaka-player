/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.CmcdManager');

goog.require('goog.Uri');
goog.require('shaka.log');


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
     * Session ID
     *
     * @private {string}
     */
    this.sid_ = '';

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
   * Apply CMCD data to a manifest request.
   *
   * @param {!shaka.extern.Request} request
   *   The request to apply CMCD data to
   * @param {shaka.util.CmcdManager.ManifestInfo} manifestInfo
   *   The manifest format
   */
  applyManifestData(request, manifestInfo) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      this.sf_ = manifestInfo.format;

      this.apply_(request, {
        ot: shaka.util.CmcdManager.ObjectType.MANIFEST,
        su: !this.playbackStarted_,
      });
    } catch (error) {
      shaka.log.warnOnce('CMCD_MANIFEST_ERROR',
          'Could not generate manifest CMCD data.', error);
    }
  }

  /**
   * Apply CMCD data to a segment request
   *
   * @param {!shaka.extern.Request} request
   * @param {shaka.util.CmcdManager.SegmentInfo} segmentInfo
   */
  applySegmentData(request, segmentInfo) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      const data = {
        d: segmentInfo.duration * 1000,
        st: this.getStreamType_(),
      };

      data.ot = this.getObjectType_(segmentInfo);

      const ObjectType = shaka.util.CmcdManager.ObjectType;
      const isMedia = data.ot === ObjectType.VIDEO ||
                      data.ot === ObjectType.AUDIO ||
                      data.ot === ObjectType.MUXED ||
                      data.ot === ObjectType.TIMED_TEXT;

      if (isMedia) {
        data.bl = this.getBufferLength_(segmentInfo.type);
      }

      if (segmentInfo.bandwidth) {
        data.br = segmentInfo.bandwidth / 1000;
      }

      if (isMedia && data.ot !== ObjectType.TIMED_TEXT) {
        data.tb = this.getTopBandwidth_(data.ot) / 1000;
      }

      this.apply_(request, data);
    } catch (error) {
      shaka.log.warnOnce('CMCD_SEGMENT_ERROR',
          'Could not generate segment CMCD data.', error);
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

      this.apply_(request, {
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
   * Create baseline CMCD data
   *
   * @return {CmcdData}
   * @private
   */
  createData_() {
    if (!this.sid_) {
      this.sid_ = this.config_.sessionId || window.crypto.randomUUID();
    }
    return {
      v: shaka.util.CmcdManager.Version,
      sf: this.sf_,
      sid: this.sid_,
      cid: this.config_.contentId,
      mtp: this.playerInterface_.getBandwidthEstimate() / 1000,
    };
  }

  /**
   * Apply CMCD data to a request.
   *
   * @param {!shaka.extern.Request} request The request to apply CMCD data to
   * @param {!CmcdData} data The data object
   * @param {boolean} useHeaders Send data via request headers
   * @private
   */
  apply_(request, data = {}, useHeaders = this.config_.useHeaders) {
    if (!this.config_.enabled) {
      return;
    }

    // apply baseline data
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

    // TODO: Implement rtp, nrr, nor, dl

    if (useHeaders) {
      const headers = shaka.util.CmcdManager.toHeaders(data);
      if (!Object.keys(headers).length) {
        return;
      }

      Object.assign(request.headers, headers);
    } else {
      const query = shaka.util.CmcdManager.toQuery(data);
      if (!query) {
        return;
      }

      request.uris = request.uris.map((uri) => {
        return shaka.util.CmcdManager.appendQueryToUri(uri, query);
      });
    }
  }

  /**
   * The CMCD object type.
   *
   * @param {shaka.util.CmcdManager.SegmentInfo} segmentInfo
   * @private
   */
  getObjectType_(segmentInfo) {
    const type = segmentInfo.type;

    if (segmentInfo.init) {
      return shaka.util.CmcdManager.ObjectType.INIT;
    }

    if (type == 'video') {
      if (segmentInfo.codecs.includes(',')) {
        return shaka.util.CmcdManager.ObjectType.MUXED;
      }
      return shaka.util.CmcdManager.ObjectType.VIDEO;
    }

    if (type == 'audio') {
      return shaka.util.CmcdManager.ObjectType.AUDIO;
    }

    if (type == 'text') {
      if (segmentInfo.mimeType === 'application/mp4') {
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
    switch (mimeType) {
      case 'video/webm':
      case 'video/mp4':
        return shaka.util.CmcdManager.ObjectType.MUXED;

      case 'application/x-mpegurl':
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
   * @param {string} type
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
      bl: 1, dl: 1, mtp: 1, nor: 1, nrr: 1, su: 1,
      cid: 2, pr: 2, sf: 2, sid: 2, st: 2, v: 2,
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
 *   getVariantTracks: function():Array.<shaka.extern.Track>,
 *   getPlaybackRate: function():number,
 *   isLive: function():boolean
 * }}
 *
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {function():shaka.extern.BufferedInfo} getBufferedInfo
 *   Get information about what the player has buffered.
 * @property {function():number} getCurrentTime
 *   Get the current time
 * @property {function():Array.<shaka.extern.Track>} getVariantTracks
 *   Get the variant tracks
 * @property {function():number} getPlaybackRate
 *   Get the playback rate
 * @property {function():boolean} isLive
 *   Get if the player is playing live content.
 */
shaka.util.CmcdManager.PlayerInterface;


/**
 * @typedef {{
 *   type: string,
 *   init: boolean,
 *   duration: number,
 *   mimeType: string,
 *   codecs: string,
 *   bandwidth: (number|undefined)
 * }}
 *
 * @property {string} type
 *   The media type
 * @property {boolean} init
 *   Flag indicating whether the segment is an init segment
 * @property {number} duration
 *   The duration of the segment in seconds
 * @property {string} mimeType
 *   The segment's mime type
 * @property {string} codecs
 *   The segment's codecs
 * @property {(number|undefined)} bandwidth
 *   The segment's variation bandwidth
 *
 * @export
 */
shaka.util.CmcdManager.SegmentInfo;


/**
 * @typedef {{
 *   format: shaka.util.CmcdManager.StreamingFormat
 * }}
 *
 * @property {shaka.util.CmcdManager.StreamingFormat} format
 *   The manifest's stream format
 *
 * @export
 */
shaka.util.CmcdManager.ManifestInfo;


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
  HLS: 'h',
  SMOOTH: 's',
  OTHER: 'o',
};


/**
 * The CMCD spec version
 * @const {number}
 */
shaka.util.CmcdManager.Version = 1;
