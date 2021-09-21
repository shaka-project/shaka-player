/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cmcd.CmcdManager');

goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamingEngine');


/**
 * @summary
 * A CmcdManager maintains CMCD state as well as a collection of utility
 * functions.
 */
shaka.cmcd.CmcdManager = class {
  /**
   * @param {shaka.cmcd.PlayerInterface} playerInterface
   * @param {?string} mimeType
   */
  constructor(playerInterface, mimeType) {
    /** @private {shaka.cmcd.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.CmcdConfiguration} */
    this.config_ = null;

    /**
     * Session ID
     *
     * @private {string}
     */
    this.sid_ = '';

    /**
     * Streaming format
     *
     * @private {(shaka.cmcd.StreamingFormat|undefined)}
     */
    this.sf = this.getStreamingFormat(mimeType);
  }

  /**
   * Get the streaming format by MIME type.
   *
   * @param {?string} mimeType
   * @return {(shaka.cmcd.StreamingFormat|undefined)}
   */
  getStreamingFormat(mimeType) {
    switch (mimeType) {
      case 'application/dash+xml':
        return shaka.cmcd.StreamingFormat.DASH;

      case 'application/x-mpegurl':
      case 'application/vnd.apple.mpegurl':
        return shaka.cmcd.StreamingFormat.HLS;

      case 'application/vnd.ms-sstr+xml':
        return shaka.cmcd.StreamingFormat.SMOOTH;

      default:
        return undefined;
    }
  }

  /**
   * @param {shaka.extern.CmcdConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.sid_ = config.sessionId || shaka.cmcd.CmcdManager.uuid();
  }

  /**
   * Apply CMCD data to an request.
   *
   * @param {!shaka.extern.Request} request The request to apply CMCD data to
   * @param {!shaka.cmcd.Data} data The data object
   */
  apply(request, data = {}) {
    if (!this.config_.enabled) {
      return;
    }

    // generic data
    data.sid = this.sid_;
    data.cid = this.config_.contentId;
    data.sf = this.sf;
    data.pr = this.playerInterface_.getPlaybackRate();
    data.v = shaka.cmcd.Version;
    data.mtp = this.playerInterface_.getBandwidthEstimate();

    const tracks = this.playerInterface_.getVariantTracks();
    const top = tracks.sort((a, b) => b.bandwidth - a.bandwidth)[0];
    data.tb = top ? top.bandwidth : undefined;

    // TODO: st, su, rtp, nrr, nor, dl, bs, bl

    if (this.config_.useHeaders) {
      const headers = shaka.cmcd.CmcdManager.toHeaders(data);
      if (!Object.keys(headers).length) {
        return;
      }

      Object.assign(request.headers, headers);
    } else {
      const query = shaka.cmcd.CmcdManager.toQuery(data);
      if (!query) {
        return;
      }

      request.uris = request.uris.map((uri) => {
        const separator = uri.includes('?') ? '&' : '?';
        return `${uri}${separator}${query}`;
      });
    }
  }

  /**
   * Apply segment level CMCD data to a request
   *
   * @param {!shaka.extern.Request} request
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
   *   reference
   */
  applySegmentData(request, mediaState, reference) {
    const ot = this.getObjectType_(mediaState, reference);
    const isMedia = (ot === 'v' || ot === 'a' || ot === 'av');
    const bl = isMedia ? this.getBufferLength_(mediaState.type) : undefined;

    this.apply(request, {
      ot: ot,
      d: reference.endTime - reference.startTime,
      br: mediaState.stream.bandwidth,
      bl: bl,
    });
  }

  /**
   * The CMCD object type.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
   *   reference
   * @return {(shaka.cmcd.ObjectType|undefined)}
   * @private
   */
  getObjectType_(mediaState, reference) {
    if (!reference.initSegmentReference) {
      return shaka.cmcd.ObjectType.INIT;
    }

    if (mediaState.type == 'video') {
      return shaka.cmcd.ObjectType.VIDEO;
    }

    if (mediaState.type == 'audio') {
      return shaka.cmcd.ObjectType.AUDIO;
    }

    if (mediaState.type == 'text') {
      if (mediaState.stream.mimeType === 'application/mp4') {
        return shaka.cmcd.ObjectType.TIMED_TEXT;
      }
      return shaka.cmcd.ObjectType.CAPTION;
    }

    return undefined;
  }

  /**
   * Get the buffer length for a media type
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getBufferLength_(type) {
    const ranges = this.playerInterface_.getBufferedInfo()[type];
    let start = 0;
    let end = 0;

    for (const range of ranges) {
      if (range.start < start) {
        start = range.start;
      }
      if (range.end > end) {
        end = range.end;
      }
    }

    return end - start;
  }

  /**
   * Generate a random v4 UUID
   *
   * @return {string}
   */
  static uuid() {
    const url = URL.createObjectURL(new Blob());
    const uuid = url.toString();
    URL.revokeObjectURL(url);
    return uuid.substr(uuid.lastIndexOf('/') + 1);
  }

  /**
   * Serialize a CMCD data object according to the rules defined in the
   * section 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {shaka.cmcd.Data} data The CMCD data object
   * @return {string}
   */
  static serialize(data) {
    const results = [];
    const isValid = (value) =>
      !Number.isNaN(value) && value != null && value !== '' && value !== false;
    const toRounded = (value) => Math.round(value);
    const toHundred = (value) => toRounded(value / 100) * 100;
    const toKbits = (value) => toRounded(value / 1000);
    const toHundredKbits = (value) => toHundred(toKbits(value));
    const toMs = (value) => toRounded(value * 1000);
    const toHundredMs = (value) => toHundred(toMs(value));

    const toUrlSafe = (value) => encodeURIComponent(value);
    const formatters = {
      br: toKbits,
      d: toMs,
      bl: toHundredMs,
      dl: toHundred,
      mtp: toHundredKbits,
      nor: toUrlSafe,
      rtp: toHundred,
      tb: toKbits,
    };

    const keys = Object.keys(data || {});

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
        result = `${key}="${value.replace(/"/g, '"')}"`;
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
   * @param {shaka.cmcd.Data} data The CMCD data object
   * @return {!Object}
   */
  static toHeaders(data) {
    const headers = {};
    const shards = {
      object: ['br', 'd', 'ot', 'tb'],
      request: ['bl', 'dl', 'mtp', 'nor', 'nrr', 'su'],
      session: ['cid', 'pr', 'sf', 'sid', 'st', 'v'],
      status: ['bs', 'rtp'],
    };

    const entries = Object.entries(data);
    for (const entry of Object.entries(shards)) {
      const [shard, props] = entry;
      const header = entries.filter((entry) => props.includes(entry[0]));
      const value = shaka.cmcd.CmcdManager
          .serialize(Object.fromEntries(header));
      if (value) {
        headers[`cmcd-${shard}`] = value;
      }
    }

    return headers;
  }

  /**
   * Convert a CMCD data object to query args according to the rules
   * defined in the section 2.2 and 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {shaka.cmcd.Data} data The CMCD data object
   * @return {string}
   */
  static toQuery(data) {
    return `CMCD=${encodeURIComponent(shaka.cmcd.CmcdManager.serialize(data))}`;
  }
};


/**
 * @typedef {{
 *   getPlaybackRate: function():number,
 *   getBandwidthEstimate: function():number,
 *   getVariantTracks: function():!Array.<shaka.extern.Track>,
 *   getBufferedInfo: function():shaka.extern.BufferedInfo
 * }}
 *
 * @property {function():number} getPlaybackRate
 *   Get the playback rate
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {function():!Array.<shaka.extern.Track>} getVariantTracks
 *   Get the list of variant tracks.
 * @property {function():shaka.extern.BufferedInfo} getBufferedInfo
 *   Get information about what the player has buffered.
 */
shaka.cmcd.PlayerInterface;


/**
 * @typedef {{
 *   br: (number|undefined),
 *   d: (number|undefined),
 *   ot: (shaka.cmcd.ObjectType|undefined),
 *   tb: (number|undefined),
 *   bl: (number|undefined),
 *   dl: (number|undefined),
 *   mtp: (number|undefined),
 *   nor: (string|undefined),
 *   nrr: (string|undefined),
 *   su: (boolean|undefined),
 *   cid: (string|undefined),
 *   pr: (number|undefined),
 *   sf: (shaka.cmcd.StreamingFormat|undefined),
 *   sid: (string|undefined),
 *   st: (shaka.cmcd.StreamType|undefined),
 *   v: (number|undefined),
 *   bs: (boolean|undefined),
 *   rtp: (number|undefined)
 * }}
 *
 * @description
 *   Client Media Common Data (CMCD) data.
 *
 * @property {number} br
 *   The encoded bitrate of the audio or video object being requested. This may
 *   not be known precisely by the player; however, it MAY be estimated based
 *   upon playlist/manifest declarations. If the playlist declares both peak and
 *   average bitrate values, the peak value should be transmitted.
 *
 * @property {number} d
 *   The playback duration in milliseconds of the object being requested. If a
 *   partial segment is being requested, then this value MUST indicate the
 *   playback duration of that part and not that of its parent segment. This
 *   value can be an approximation of the estimated duration if the explicit
 *   value is not known.
 *
 * @property {shaka.cmcd.ObjectType} ot
 *   The media type of the current object being requested:
 *   - `m` = text file, such as a manifest or playlist
 *   - `a` = audio only
 *   - `v` = video only
 *   - `av` = muxed audio and video
 *   - `i` = init segment
 *   - `c` = caption or subtitle
 *   - `tt` = ISOBMFF timed text track
 *   - `k` = cryptographic key, license or certificate.
 *   - `o` = other
 *
 *   If the object type being requested is unknown, then this key MUST NOT be
 *   used.
 *
 * @property {number} tb
 *   The highest bitrate rendition in the manifest or playlist that the client
 *   is allowed to play, given current codec, licensing and sizing constraints.
 *
 * @property {number} bl
 *   The buffer length associated with the media object being requested. This
 *   value MUST be rounded to the nearest 100 ms. This key SHOULD only be sent
 *   with an object type of ‘a’, ‘v’ or ‘av’.
 *
 * @property {number} dl
 *   Deadline from the request time until the first sample of this
 *   Segment/Object needs to be available in order to not create a buffer
 *   underrun or any other playback problems. This value MUST be rounded to the
 *   nearest 100ms. For a playback rate of 1, this may be equivalent to the
 *   player’s remaining buffer length.
 *
 * @property {number} mtp
 *   The throughput between client and server, as measured by the client and
 *   MUST be rounded to the nearest 100 kbps. This value, however derived,
 *   SHOULD be the value that the client is using to make its next Adaptive
 *   Bitrate switching decision. If the client is connected to multiple
 *   servers concurrently, it must take care to report only the throughput
 *   measured against the receiving server. If the client has multiple
 *   concurrent connections to the server, then the intent is that this value
 *   communicates the aggregate throughput the client sees across all those
 *   connections.
 *
 * @property {string} nor
 *   Relative path of the next object to be requested. This can be used to
 *   trigger pre-fetching by the CDN. This MUST be a path relative to the
 *   current request. This string MUST be URLEncoded. The client SHOULD NOT
 *   depend upon any pre-fetch action being taken - it is merely a request for
 *   such a pre-fetch to take place.
 *
 * @property {string} nrr
 *   If the next request will be a partial object request, then this string
 *   denotes the byte range to be requested. If the ‘nor’ field is not set, then
 *   the object is assumed to match the object currently being requested. The
 *   client SHOULD NOT depend upon any pre-fetch action being taken – it is
 *   merely a request for such a pre-fetch to take place. Formatting is similar
 *   to the HTTP Range header, except that the unit MUST be ‘byte’, the ‘Range:’
 *   prefix is NOT required and specifying multiple ranges is NOT allowed. Valid
 *   combinations are:
 *
 *   - `"\<range-start\>-"`
 *   - `"\<range-start\>-\<range-end\>"`
 *   - `"-\<suffix-length\>"`
 *
 * @property {boolean} su
 *   Key is included without a value if the object is needed urgently due to
 *   startup, seeking or recovery after a buffer-empty event. The media SHOULD
 *   not be rendering when this request is made. This key MUST not be sent if it
 *   is FALSE.
 *
 * @property {string} cid
 *   A unique string identifying the current content. Maximum length is 64
 *   characters. This value is consistent across multiple different sessions and
 *   devices and is defined and updated at the discretion of the service
 *   provider.
 *
 * @property {number} pr
 *   The playback rate. `1` if real-time, `2` if double speed, `0` if not
 *   playing. SHOULD only be sent if not equal to `1`.
 *
 * @property {shaka.cmcd.StreamingFormat} sf
 *   The streaming format that defines the current request.
 *
 *   - `d` = MPEG DASH
 *   - `h` = HTTP Live Streaming (HLS)
 *   - `s` = Smooth Streaming
 *   - `o` = other
 *
 *   If the streaming format being requested is unknown, then this key MUST NOT
 *   be used.
 *
 * @property {string} sid
 *   A GUID identifying the current playback session. A playback session
 *   typically ties together segments belonging to a single media asset. Maximum
 *   length is 64 characters. It is RECOMMENDED to conform to the UUID
 *   specification.
 *
 * @property {shaka.cmcd.StreamType} st
 *   Stream type
 *   - `v` = all segments are available – e.g., VOD
 *   - `l` = segments become available over time – e.g., LIVE
 *
 * @property {number} v
 *   The version of this specification used for interpreting the defined key
 *   names and values. If this key is omitted, the client and server MUST
 *   interpret the values as being defined by version 1. Client SHOULD omit this
 *   field if the version is 1.
 *
 * @property {boolean} bs
 *   Buffer starvation key is included without a value if the buffer was starved
 *   at some point between the prior request and this object request, resulting
 *   in the player being in a rebuffering state and the video or audio playback
 *   being stalled. This key MUST NOT be sent if the buffer was not starved
 *   since the prior request.
 *
 *   If the object type `ot` key is sent along with this key, then the `bs` key
 *   refers to the buffer associated with the particular object type. If no
 *   object type is communicated, then the buffer state applies to the current
 *   session.
 *
 * @property {number} rtp
 *   Requested maximum throughput
 *
 *   The requested maximum throughput that the client considers sufficient for
 *   delivery of the asset. Values MUST be rounded to the nearest 100kbps. For
 *   example, a client would indicate that the current segment, encoded at
 *   2Mbps, is to be delivered at no more than 10Mbps, by using rtp=10000.
 *
 *   Note: This can benefit clients by preventing buffer saturation through
 *   over-delivery and can also deliver a community benefit through fair-share
 *   delivery. The concept is that each client receives the throughput necessary
 *   for great performance, but no more. The CDN may not support the rtp
 *   feature.
 */
shaka.cmcd.Data;


/**
 * @enum {string}
 */
shaka.cmcd.ObjectType = {
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
shaka.cmcd.StreamType = {
  VOD: 'v',
  LIVE: 'l',
};


/**
 * @enum {string}
 */
shaka.cmcd.StreamingFormat = {
  DASH: 'd',
  HLS: 'h',
  SMOOTH: 's',
  OTHER: 'o',
};


/**
 * The CMCD spec version
 * @const {number}
 */
shaka.cmcd.Version = 1;
