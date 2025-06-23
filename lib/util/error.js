/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Error');


/**
 * @summary
 * Describes an error that happened.
 *
 * @description
 * This uses numerical codes to describe
 * which error happened.
 *
 * Some error are caused by errors from the browser.  In these cases, the error
 * object is provided as part of the <code>data</code> field.  System codes come
 * from the browser and may or may not be documented.  Here are some places
 * where the errors may be documented:
 * <ul>
 *   <li><a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaError">MediaError</a>
 *   <li><a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Status">HTTP Codes</a>
 *   <li><a href="https://hresult.info">Edge/PlayReady errors</a>
 * </ul>
 *
 * @export
 * @implements {shaka.extern.Error}
 * @extends {Error}
 */
shaka.util.Error = class {
  /**
   * @param {shaka.util.Error.Severity} severity
   * @param {shaka.util.Error.Category} category
   * @param {shaka.util.Error.Code} code
   * @param {...*} varArgs
   */
  constructor(severity, category, code, ...varArgs) {
    /**
     * @override
     * @exportInterface
     */
    this.severity = severity;
    /**
     * @override
     * @exportInterface
     */
    this.category = category;
    /**
     * @override
     * @exportInterface
     */
    this.code = code;
    /**
     * @override
     * @exportInterface
     */
    this.data = varArgs;
    /**
     * @override
     * @exportInterface
     */
    this.handled = false;

    // A basic message for compiled mode.
    let formattedMessage = 'Shaka Error ' + this.code;
    if (goog.DEBUG) {
      // This improves the formatting of Errors in failure messages in the
      // tests in debug mode.
      let categoryName = 'UNKNOWN';
      let codeName = 'UNKNOWN';

      for (const k in shaka.util.Error.Category) {
        if (shaka.util.Error.Category[k] == this.category) {
          categoryName = k;
        }
      }
      for (const k in shaka.util.Error.Code) {
        if (shaka.util.Error.Code[k] == this.code) {
          codeName = k;
        }
      }

      formattedMessage = 'Shaka Error ' + categoryName + '.' + codeName +
                         ' (' + this.data.toString() + ')';
    }

    /**
     * In compiled mode, contains a basic message string with the error code.
     * In uncompiled and debug modes, contains a human-readable version of the
     * category and code as enums.
     *
     * @const {string}
     * @exportDoc
     */
    this.message = formattedMessage;

    if (shaka.util.Error.createStack) {
      try {
        throw new Error(this.message || 'Shaka Error');
      } catch (e) {
        /**
         * A stack-trace showing where the error occurred.
         *
         * @const {string}
         * @exportDoc
         */
        this.stack = e.stack;
      }
    }
  }


  /**
   * @return {string}
   * @override
   */
  toString() {
    return 'shaka.util.Error ' + JSON.stringify(this, null, '  ');
  }
};


/**
 * If true, create a stack trace in Error objects.
 *
 * Disabled in tests to avoid issues with karma-jasmine.
 * See comments in test/test/boot.js for details.
 *
 * @type {boolean}
 */
shaka.util.Error.createStack = true;

/**
 * @enum {number}
 * @export
 */
shaka.util.Error.Severity = {
  /**
   * An error occurred, but the Player is attempting to recover from the error.
   *
   * If the Player cannot ultimately recover, it still may not throw a CRITICAL
   * error.  For example, retrying for a media segment will never result in
   * a CRITICAL error (the Player will just retry forever).
   */
  'RECOVERABLE': 1,

  /**
   * A critical error that the library cannot recover from.  These usually cause
   * the Player to stop loading or updating.  A new manifest must be loaded
   * to reset the library.
   */
  'CRITICAL': 2,
};


/**
 * @enum {number}
 * @export
 */
shaka.util.Error.Category = {
  /** Errors from the network stack. */
  'NETWORK': 1,

  /** Errors parsing text streams. */
  'TEXT': 2,

  /** Errors parsing or processing audio or video streams. */
  'MEDIA': 3,

  /** Errors parsing the Manifest. */
  'MANIFEST': 4,

  /** Errors related to streaming. */
  'STREAMING': 5,

  /** Errors related to DRM. */
  'DRM': 6,

  /** Miscellaneous errors from the player. */
  'PLAYER': 7,

  /** Errors related to cast. */
  'CAST': 8,

  /** Errors in the database storage (offline). */
  'STORAGE': 9,

  /** Errors related to ad insertion. */
  'ADS': 10,
};


/**
 * @enum {number}
 * @export
 */
shaka.util.Error.Code = {
  /**
   * A network request was made using an unsupported URI scheme.
   * <br> error.data[0] is the URI.
   */
  'UNSUPPORTED_SCHEME': 1000,

  /**
   * An HTTP network request returned an HTTP status that indicated a failure.
   * <br> error.data[0] is the URI.
   * <br> error.data[1] is the status code.
   * <br> error.data[2] is the response text, or null if the response could not
   *   be interpreted as text.
   * <br> error.data[3] is the map of response headers.
   * <br> error.data[4] is the NetworkingEngine.RequestType of the request,
   *   if one was provided.
   * <br> error.data[5] is the final URI. This may be different if the initial
   *   URI (error.data[0]) issued a redirect.
   */
  'BAD_HTTP_STATUS': 1001,

  /**
   * An HTTP network request failed with an error, but not from the server.
   * <br> error.data[0] is the URI.
   * <br> error.data[1] is the original error.
   * <br> error.data[2] is the NetworkingEngine.RequestType of the request.
   */
  'HTTP_ERROR': 1002,

  /**
   * A network request timed out.
   * <br> error.data[0] is the URI.
   * <br> error.data[1] is the NetworkingEngine.RequestType of the request,
   *   if one was provided.
   */
  'TIMEOUT': 1003,

  /**
   * A network request was made with a malformed data URI.
   * <br> error.data[0] is the URI.
   */
  'MALFORMED_DATA_URI': 1004,

  // RETIRED: 'UNKNOWN_DATA_URI_ENCODING': 1005,

  /**
   * A request filter threw an error.
   * <br> error.data[0] is the original error.
   */
  'REQUEST_FILTER_ERROR': 1006,

  /**
   * A response filter threw an error.
   * <br> error.data[0] is the original error.
   */
  'RESPONSE_FILTER_ERROR': 1007,

  /**
   * A testing network request was made with a malformed URI.
   * This error is only used by unit and integration tests.
   */
  'MALFORMED_TEST_URI': 1008,

  /**
   * An unexpected network request was made to the FakeNetworkingEngine.
   * This error is only used by unit and integration tests.
   */
  'UNEXPECTED_TEST_REQUEST': 1009,

  /**
   * The number of retry attempts have run out.
   * This is an internal error and shouldn't be propagated.
   */
  'ATTEMPTS_EXHAUSTED': 1010,

  /**
   * The segment is missing.
   * <br> error.data[0] is the URI.
   */
  'SEGMENT_MISSING': 1011,


  /** The text parser failed to parse a text stream due to an invalid header. */
  'INVALID_TEXT_HEADER': 2000,

  /**
   * The text parser failed to parse a text stream due to an invalid cue.
   * <br> error.data[0] is extra context, if available.
   */
  'INVALID_TEXT_CUE': 2001,

  // RETIRED: 'INVALID_TEXT_SETTINGS': 2002,

  /**
   * Was unable to detect the encoding of the response text.  Suggest adding
   * byte-order-markings to the response data.
   */
  'UNABLE_TO_DETECT_ENCODING': 2003,

  /** The response data contains invalid Unicode character encoding. */
  'BAD_ENCODING': 2004,

  /**
   * The XML parser failed to parse an xml stream, or the XML lacks mandatory
   * elements for TTML.
   * <br> error.data[0] is extra context, if available.
   */
  'INVALID_XML': 2005,

  // RETIRED: 'INVALID_TTML': 2006,

  /**
   * MP4 segment does not contain TTML.
   */
  'INVALID_MP4_TTML': 2007,

  /**
   * MP4 segment does not contain VTT.
   */
  'INVALID_MP4_VTT': 2008,

  /**
   * When examining media in advance, we were unable to extract the cue time.
   * This should only be possible with HLS, where we do not have explicit
   * segment start times.
   * <br> error.data[0] is the underlying exception or Error object.
   */
  'UNABLE_TO_EXTRACT_CUE_START_TIME': 2009,

  /**
   * MP4 segment for CEA data is invalid.
   */
  'INVALID_MP4_CEA': 2010,

  /**
   * Unable to guess mime type of the text.
   * <br> error.data[0] is the text file's uri.
   */
  'TEXT_COULD_NOT_GUESS_MIME_TYPE': 2011,

  /**
   * External text tracks cannot be added in src= because native platform
   * doesn't support it.
   */
  'CANNOT_ADD_EXTERNAL_TEXT_TO_SRC_EQUALS': 2012,

  /**
   * Only WebVTT is supported when using src=.
   * <br> error.data[0] is the text MIME type.
   */
  'TEXT_ONLY_WEBVTT_SRC_EQUALS': 2013,

  /**
   * The compilation does not contain a required text plugin for this
   * operation.
   * <br> error.data[0] is the text MIME type.
   */
  'MISSING_TEXT_PLUGIN': 2014,

  // RETIRED: 'CHAPTERS_TRACK_FAILED': 2015,

  // RETIRED: 'CANNOT_ADD_EXTERNAL_THUMBNAILS_TO_SRC_EQUALS': 2016,

  /**
   * Only external urls of WebVTT type are supported.
   * <br> error.data[0] is the uri.
   */
  'UNSUPPORTED_EXTERNAL_THUMBNAILS_URI': 2017,

  /**
   * Some component tried to read past the end of a buffer.  The segment index,
   * init segment, or PSSH may be malformed.
   */
  'BUFFER_READ_OUT_OF_BOUNDS': 3000,

  /**
   * Some component tried to parse an integer that was too large to fit in a
   * JavaScript number without rounding error.  JavaScript can only natively
   * represent integers up to 53 bits.
   */
  'JS_INTEGER_OVERFLOW': 3001,

  /**
   * The EBML parser used to parse the WebM container encountered an integer,
   * ID, or other field larger than the maximum supported by the parser.
   */
  'EBML_OVERFLOW': 3002,

  /**
   * The EBML parser used to parse the WebM container encountered a floating-
   * point field of a size not supported by the parser.
   */
  'EBML_BAD_FLOATING_POINT_SIZE': 3003,

  /**
   * The MP4 SIDX parser found the wrong box type.
   * Either the segment index range is incorrect or the data is corrupt.
   */
  'MP4_SIDX_WRONG_BOX_TYPE': 3004,

  /**
   * The MP4 SIDX parser encountered an invalid timescale.
   * The segment index data may be corrupt.
   */
  'MP4_SIDX_INVALID_TIMESCALE': 3005,

  /** The MP4 SIDX parser encountered a type of SIDX that is not supported. */
  'MP4_SIDX_TYPE_NOT_SUPPORTED': 3006,

  /**
   * The WebM Cues parser was unable to locate the Cues element.
   * The segment index data may be corrupt.
   */
  'WEBM_CUES_ELEMENT_MISSING': 3007,

  /**
   * The WebM header parser was unable to locate the Ebml element.
   * The init segment data may be corrupt.
   */
  'WEBM_EBML_HEADER_ELEMENT_MISSING': 3008,

  /**
   * The WebM header parser was unable to locate the Segment element.
   * The init segment data may be corrupt.
   */
  'WEBM_SEGMENT_ELEMENT_MISSING': 3009,

  /**
   * The WebM header parser was unable to locate the Info element.
   * The init segment data may be corrupt.
   */
  'WEBM_INFO_ELEMENT_MISSING': 3010,

  /**
   * The WebM header parser was unable to locate the Duration element.
   * The init segment data may be corrupt or may have been incorrectly encoded.
   * Shaka requires a duration in WebM DASH content.
   */
  'WEBM_DURATION_ELEMENT_MISSING': 3011,

  /**
   * The WebM Cues parser was unable to locate the Cue Track Positions element.
   * The segment index data may be corrupt.
   */
  'WEBM_CUE_TRACK_POSITIONS_ELEMENT_MISSING': 3012,

  /**
   * The WebM Cues parser was unable to locate the Cue Time element.
   * The segment index data may be corrupt.
   */
  'WEBM_CUE_TIME_ELEMENT_MISSING': 3013,

  /**
   * A MediaSource operation failed.
   * <br> error.data[0] is a MediaError code from the video element.
   * <br> error.data[1] is the segment URI that triggered the error, if any.
   */
  'MEDIA_SOURCE_OPERATION_FAILED': 3014,

  /**
   * A MediaSource operation threw an exception.
   * <br> error.data[0] is the exception that was thrown.
   * <br> error.data[1] is the error object from the video element.
   * <br> error.data[2] is the segment URI that triggered the error, if any.
   */
  'MEDIA_SOURCE_OPERATION_THREW': 3015,

  /**
   * The video element reported an error.
   * <br> error.data[0] is a MediaError code from the video element.
   * <br> On Edge, error.data[1] is a Microsoft extended error code in hex.
   * <br> On Chrome, error.data[2] is a string with details on the error.
   * <br> See top of file for links to browser error codes.
   */
  'VIDEO_ERROR': 3016,

  /**
   * A MediaSource operation threw QuotaExceededError and recovery failed. The
   * content cannot be played correctly because the segments are too large for
   * the browser/platform. This may occur when attempting to play very high
   * quality, very high bitrate content on low-end devices.
   * <br> error.data[0] is the type of content which caused the error.
   */
  'QUOTA_EXCEEDED_ERROR': 3017,

  /**
   * Transmuxing with our internal transmuxer failed.
   * <br> error.data[0] is the segment URI that triggered the error, if any.
   */
  'TRANSMUXING_FAILED': 3018,

  /**
   * Content transformations required by the platform could not be performed for
   * some reason (unsupported container, etc.)
   * <br> @see https://github.com/shaka-project/shaka-player/issues/2759
   * <br> error.data[0] is the segment URI that triggered the error, if any.
   */
  'CONTENT_TRANSFORMATION_FAILED': 3019,

  /**
   * Important data is missing to be able to do the transmuxing of MSS.
   * <br> error.data[0] is the segment URI that triggered the error, if any.
   */
  'MSS_MISSING_DATA_FOR_TRANSMUXING': 3020,

  // RETIRED: 'MSS_TRANSMUXING_CODEC_UNKNOWN': 3021,

  /**
   * MSS transmuxing failed for unknown reason.
   * <br> error.data[0] is the segment URI that triggered the error, if any.
   */
  'MSS_TRANSMUXING_FAILED': 3022,

  /**
   * An internal error which indicates that transmuxing operation has no video
   * data. This should not be seen by applications.
   * <br> error.data[0] is the segment URI that triggered the error, if any.
   */
  'TRANSMUXING_NO_VIDEO_DATA': 3023,

  /**
   * A MediaSource operation is not allowed because the streaming is not
   * allowed.
   * <br> error.data[0] is the type of content which caused the error.
   */
  'STREAMING_NOT_ALLOWED': 3024,


  /**
   * The Player was unable to guess the manifest type based on file extension
   * or MIME type.  To fix, try one of the following:
   * <br><ul>
   *   <li>Rename the manifest so that the URI ends in a well-known extension.
   *   <li>Configure the server to send a recognizable Content-Type header.
   *   <li>Configure the server to accept a HEAD request for the manifest.
   * </ul>
   * <br> error.data[0] is the manifest URI.
   * <br> error.data[1] is the detected or specified MIME type.
   */
  'UNABLE_TO_GUESS_MANIFEST_TYPE': 4000,

  /**
   * The DASH Manifest contained invalid XML markup.
   * <br> error.data[0] is the URI associated with the XML.
   */
  'DASH_INVALID_XML': 4001,

  /**
   * The DASH Manifest contained a Representation with insufficient segment
   * information.
   */
  'DASH_NO_SEGMENT_INFO': 4002,

  /** The DASH Manifest contained an AdaptationSet with no Representations. */
  'DASH_EMPTY_ADAPTATION_SET': 4003,

  /** The DASH Manifest contained an Period with no AdaptationSets. */
  'DASH_EMPTY_PERIOD': 4004,

  /**
   * The DASH Manifest does not specify an init segment with a WebM container.
   */
  'DASH_WEBM_MISSING_INIT': 4005,

  /** The DASH Manifest contained an unsupported container format. */
  'DASH_UNSUPPORTED_CONTAINER': 4006,

  /** The embedded PSSH data has invalid encoding. */
  'DASH_PSSH_BAD_ENCODING': 4007,

  /**
   * There is an AdaptationSet whose Representations do not have any common
   * key-systems.
   */
  'DASH_NO_COMMON_KEY_SYSTEM': 4008,

  /** Having multiple key IDs per Representation is not supported. */
  'DASH_MULTIPLE_KEY_IDS_NOT_SUPPORTED': 4009,

  /** The DASH Manifest specifies conflicting key IDs. */
  'DASH_CONFLICTING_KEY_IDS': 4010,

  // RETIRED: 'UNPLAYABLE_PERIOD': 4011,

  /**
   * There exist some streams that could be decoded, but restrictions imposed
   * by the application or the key system prevent us from playing.  This may
   * happen under the following conditions:
   * <ul>
   *   <li>The application has given restrictions to the Player that restrict
   *       at least one content type completely (e.g. no playable audio).
   *   <li>The manifest specifies different keys than were given to us from the
   *       license server.
   *   <li>The key system has imposed output restrictions that cannot be met
   *       (such as HDCP) and there are no unrestricted alternatives.
   * </ul>
   * <br> error.data[0] is a {@link shaka.extern.RestrictionInfo} object
   * describing the kinds of restrictions that caused this error.
   */
  'RESTRICTIONS_CANNOT_BE_MET': 4012,

  // RETIRED: 'INTERNAL_ERROR_KEY_STATUS': 4013,

  // RETIRED: 'NO_PERIODS': 4014,

  /**
   * HLS playlist doesn't start with a mandatory #EXTM3U tag.
   */
  'HLS_PLAYLIST_HEADER_MISSING': 4015,

  /**
   * HLS tag has an invalid name that doesn't start with '#EXT'
   * <br> error.data[0] is the invalid tag.
   */
  'INVALID_HLS_TAG': 4016,

  /**
   * HLS playlist has both Master and Media/Segment tags.
   */
  'HLS_INVALID_PLAYLIST_HIERARCHY': 4017,

  /**
   * A Representation has an id that is the same as another Representation in
   * the same Period.  This makes manifest updates impossible since we cannot
   * map the updated Representation to the old one.
   */
  'DASH_DUPLICATE_REPRESENTATION_ID': 4018,

  // RETIRED: 'HLS_MEDIA_INIT_SECTION_INFO_MISSING': 4019,

  /**
   * HLS manifest has several #EXT-X-MAP tags. We can only
   * support one at the moment.
   */
  'HLS_MULTIPLE_MEDIA_INIT_SECTIONS_FOUND': 4020,

  // RETIRED: 'HLS_COULD_NOT_GUESS_MIME_TYPE': 4021,

  // RETIRED: 'HLS_MASTER_PLAYLIST_NOT_PROVIDED': 4022,

  /**
   * One of the required attributes was not provided, so the
   * HLS manifest is invalid.
   * <br> error.data[0] is the missing attribute's name.
   */
  'HLS_REQUIRED_ATTRIBUTE_MISSING': 4023,

  /**
   * One of the required tags was not provided, so the
   * HLS manifest is invalid.
   * <br> error.data[0] is the missing tag's name.
   */
  'HLS_REQUIRED_TAG_MISSING': 4024,

  /**
   * The HLS parser was unable to guess codecs of a stream.
   * <br> error.data[0] is the list of all codecs for the variant.
   */
  'HLS_COULD_NOT_GUESS_CODECS': 4025,

  /**
   * The HLS parser has encountered encrypted content with unsupported
   * KEYFORMAT attributes.
   */
  'HLS_KEYFORMATS_NOT_SUPPORTED': 4026,

  /**
   * The manifest parser only supports xlink links with xlink:actuate="onLoad".
   */
  'DASH_UNSUPPORTED_XLINK_ACTUATE': 4027,

  /**
   * The manifest parser has hit its depth limit on xlink link chains.
   */
  'DASH_XLINK_DEPTH_LIMIT': 4028,

  // RETIRED: 'HLS_LIVE_CONTENT_NOT_SUPPORTED': 4029,

  // RETIRED: 'HLS_COULD_NOT_PARSE_SEGMENT_START_TIME': 4030,

  // RETIRED: 'HLS_MEDIA_SEQUENCE_REQUIRED_IN_LIVE_STREAMS': 4031,

  /**
   * The content container or codecs are not supported by this browser. For
   * example, this could happen if the content is WebM, but your browser does
   * not support the WebM container, or if the content uses HEVC, but your
   * browser does not support the HEVC codec.  This can also occur for
   * multi codec or multi container manifests if none of the codecs
   * or containers are supported by the browser.
   *
   * To see what your browser supports, you can check the JSON data dumped by
   * http://support.shaka-player-demo.appspot.com/
   */
  'CONTENT_UNSUPPORTED_BY_BROWSER': 4032,

  /**
   * External text tracks cannot be added to live streams.
   */
  'CANNOT_ADD_EXTERNAL_TEXT_TO_LIVE_STREAM': 4033,

  // RETIRED: 'HLS_AES_128_ENCRYPTION_NOT_SUPPORTED': 4034,
  // RETIRED: 'HLS_INTERNAL_SKIP_STREAM': 4035,

  /** The Manifest contained no Variants. */
  'NO_VARIANTS': 4036,

  /**
   * We failed to find matching streams across DASH Periods, and the
   * period-flattening algorithm introduced in v3.0 has failed.
   */
  'PERIOD_FLATTENING_FAILED': 4037,

  /**
   * We failed to find matching streams across DASH Periods due to inconsistent
   * DRM systems across periods.
   */
  'INCONSISTENT_DRM_ACROSS_PERIODS': 4038,

  /**
   * The HLS manifest refers to an undeclared variables.
   * <br> error.data[0] is the variable undeclared.
   */
  'HLS_VARIABLE_NOT_FOUND': 4039,

  /**
   * We do not support playing encrypted mp2t with MSE
   */
  'HLS_MSE_ENCRYPTED_MP2T_NOT_SUPPORTED': 4040,

  /**
   * We do not support playing encrypted content (different than mp2t) with MSE
   * and legacy Apple MediaKeys API.
   */
  'HLS_MSE_ENCRYPTED_LEGACY_APPLE_MEDIA_KEYS_NOT_SUPPORTED': 4041,

  /**
   * Web Crypto API is not available (to decrypt AES-128 streams). Web Crypto
   * only exists in secure origins like https.
   */
  'NO_WEB_CRYPTO_API': 4042,

  // RETIRED: 'HLS_AES_128_INVALID_IV_LENGTH': 4043,
  // RETIRED: 'HLS_AES_128_INVALID_KEY_LENGTH': 4044,

  /**
   * External thumbnails tracks cannot be added to live streams.
   */
  'CANNOT_ADD_EXTERNAL_THUMBNAILS_TO_LIVE_STREAM': 4045,

  /**
   * The MSS Manifest contained invalid XML markup.
   * <br> error.data[0] is the URI associated with the XML.
   */
  'MSS_INVALID_XML': 4046,

  /**
   * MSS parser encountered a live playlist.
   */
  'MSS_LIVE_CONTENT_NOT_SUPPORTED': 4047,

  /**
   * AES-128 iv length should be 16 bytes.
   */
  'AES_128_INVALID_IV_LENGTH': 4048,

  /**
   * AES-128 encryption key length should be 16 bytes.
   */
  'AES_128_INVALID_KEY_LENGTH': 4049,

  /**
   * The DASH Manifest specifies conflicting AES-128 keys.
   */
  'DASH_CONFLICTING_AES_128': 4050,

  /**
   * The DASH Manifest specifies a unsupported AES-128 encryption.
   */
  'DASH_UNSUPPORTED_AES_128': 4051,

  /**
   * Patch requested during an update did not match original manifest.
   */
  'DASH_INVALID_PATCH': 4052,

  /**
   * The media playlist has not segments or all segments are gap.
   */
  'HLS_EMPTY_MEDIA_PLAYLIST': 4053,

  /**
   * We do not support playing encrypted content with MSE
   * and legacy Apple MediaKeys API.
   */
  'DASH_MSE_ENCRYPTED_LEGACY_APPLE_MEDIA_KEYS_NOT_SUPPORTED': 4054,

  /**
   * External chapters cannot be added to live streams.
   */
  'CANNOT_ADD_EXTERNAL_CHAPTERS_TO_LIVE_STREAM': 4054,

  // RETIRED: 'INCONSISTENT_BUFFER_STATE': 5000,
  // RETIRED: 'INVALID_SEGMENT_INDEX': 5001,
  // RETIRED: 'SEGMENT_DOES_NOT_EXIST': 5002,
  // RETIRED: 'CANNOT_SATISFY_BYTE_LIMIT': 5003,
  // RETIRED: 'BAD_SEGMENT': 5004,
  // RETIRED: 'INVALID_STREAMS_CHOSEN': 5005,

  /**
   * This would only happen if StreamingEngine were not started correctly, and
   * should not be seen in production.
   */
  'STREAMING_ENGINE_STARTUP_INVALID_STATE': 5006,


  /**
   * The manifest indicated protected content, but the manifest parser was
   * unable to determine what key systems should be used.
   */
  'NO_RECOGNIZED_KEY_SYSTEMS': 6000,

  /**
   * None of the requested key system configurations are available.  This may
   * happen under the following conditions:
   * <ul>
   *   <li> The key system is not supported.
   *   <li> The key system does not support the features requested (e.g.
   *        persistent state).
   *   <li> A user prompt was shown and the user denied access.
   *   <li> The key system is not available from unsecure contexts. (i.e.
            requires HTTPS) See https://bit.ly/2K9X1nY
   * </ul>
   */
  'REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE': 6001,

  /**
   * The browser found one of the requested key systems, but it failed to
   * create an instance of the CDM for some unknown reason.
   * <br> error.data[0] is an error message string from the browser.
   */
  'FAILED_TO_CREATE_CDM': 6002,

  /**
   * The browser found one of the requested key systems and created an instance
   * of the CDM, but it failed to attach the CDM to the video for some unknown
   * reason.
   * <br> error.data[0] is an error message string from the browser.
   */
  'FAILED_TO_ATTACH_TO_VIDEO': 6003,

  /**
   * The CDM rejected the server certificate supplied by the application.
   * The certificate may be malformed or in an unsupported format.
   * <br> error.data[0] is an error message string from the browser.
   */
  'INVALID_SERVER_CERTIFICATE': 6004,

  /**
   * The CDM refused to create a session for some unknown reason.
   * <br> error.data[0] is an error message string from the browser.
   */
  'FAILED_TO_CREATE_SESSION': 6005,

  /**
   * The CDM was unable to generate a license request for the init data it was
   * given.  The init data may be malformed or in an unsupported format.
   * <br> error.data[0] is an error message string from the browser.
   * <br> error.data[1] is the error object from the browser.
   * <br> error.data[2] is a string with the extended error code, if available.
   * <br> See top of file for links to browser error codes.
   */
  'FAILED_TO_GENERATE_LICENSE_REQUEST': 6006,

  /**
   * The license request failed.  This could be a timeout, a network failure, or
   * a rejection by the server.
   * <br> error.data[0] is a shaka.util.Error from the networking engine.
   * <br> error.data[1] is a shaka.extern.DrmSessionMetadata.
   */
  'LICENSE_REQUEST_FAILED': 6007,

  /**
   * The license response was rejected by the CDM.  The server's response may be
   * invalid or malformed for this CDM.
   * <br> error.data[0] is an error message string from the browser.
   * <br> See top of file for links to browser error codes.
   */
  'LICENSE_RESPONSE_REJECTED': 6008,

  // RETIRED: 'NO_LICENSE_SERVER_SPECIFIED': 6009,

  /**
   * The manifest does not specify any DRM info, but the content is encrypted.
   * Either the manifest or the manifest parser are broken.
   */
  'ENCRYPTED_CONTENT_WITHOUT_DRM_INFO': 6010,

  // RETIRED: 'WRONG_KEYS': 6011,

  /**
   * No license server was given for the key system signaled by the manifest.
   * A license server URI is required for every key system.
   * <br> error.data[0] is the key system identifier.
   */
  'NO_LICENSE_SERVER_GIVEN': 6012,

  /**
   * A required offline session was removed. The content might not be playable
   * depending of the playback context.
   */
  'OFFLINE_SESSION_REMOVED': 6013,

  /**
   * The license has expired.  This is triggered when all keys in the key
   * status map have a status of 'expired'.
   */
  'EXPIRED': 6014,

  /**
   * A server certificate wasn't given when it is required.  FairPlay requires
   * setting an explicit server certificate in the configuration.
   */
  'SERVER_CERTIFICATE_REQUIRED': 6015,

  /**
   * An error was thrown while executing the init data transformation.
   * <br> error.data[0] is the original error.
   */
  'INIT_DATA_TRANSFORM_ERROR': 6016,

  /**
   * The server certificate request failed.
   * <br> error.data[0] is a shaka.util.Error from the networking engine.
   */
  'SERVER_CERTIFICATE_REQUEST_FAILED': 6017,

  /**
   * The HDCP version does not meet the requirements.
   */
  'MIN_HDCP_VERSION_NOT_MATCH': 6018,

  /**
   * Error when checking HDCP version.
   * <br> error.data[0] is an error message string from the browser.
   */
  'ERROR_CHECKING_HDCP_VERSION': 6019,

  /**
   * The browser does not support EME APIs, so DRM content cannot be played.
   */
  'MISSING_EME_SUPPORT': 6020,


  /**
   * The call to Player.load() was interrupted by a call to Player.unload()
   * or another call to Player.load().
   */
  'LOAD_INTERRUPTED': 7000,

  /**
   * An internal error which indicates that an operation was aborted.  This
   * should not be seen by applications.
   */
  'OPERATION_ABORTED': 7001,

  /**
   * The call to Player.load() failed because the Player does not have a video
   * element.  The video element must either be provided to the constructor or
   * to Player.attach() before Player.load() is called.
   */
  'NO_VIDEO_ELEMENT': 7002,

  /**
   * The operation failed because the object has been destroyed.
   */
  'OBJECT_DESTROYED': 7003,

  /**
   * The content has not been loaded in the Player.
   */
  'CONTENT_NOT_LOADED': 7004,

  /**
   * The call to preload failed, due to being called on src= content.
   */
  'SRC_EQUALS_PRELOAD_NOT_SUPPORTED': 7005,

  /**
   * The operation failed because the preload has been destroyed. This can
   * happen by reusing the same preload in multiple load calls.
   */
  'PRELOAD_DESTROYED': 7006,

  /**
   * It occurs when trying to reproduce an index in the QueueManager that is
   * out of bounds.
   */
  'QUEUE_INDEX_OUT_OF_BOUNDS': 7007,

  /**
   * The Cast API is unavailable.  This may be because of one of the following:
   *  1. The browser may not have Cast support
   *  2. The browser may be missing a necessary Cast extension
   *  3. The Cast sender library may not be loaded in your app
   */
  'CAST_API_UNAVAILABLE': 8000,

  /**
   * No cast receivers are available at this time.
   */
  'NO_CAST_RECEIVERS': 8001,

  /**
   * The library is already casting.
   */
  'ALREADY_CASTING': 8002,

  /**
   * A Cast SDK error that we did not explicitly plan for has occurred.
   * Check data[0] and refer to the Cast SDK documentation for details.
   * <br> error.data[0] is an error object from the Cast SDK.
   */
  'UNEXPECTED_CAST_ERROR': 8003,

  /**
   * The cast operation was canceled by the user.
   * <br> error.data[0] is an error object from the Cast SDK.
   */
  'CAST_CANCELED_BY_USER': 8004,

  /**
   * The cast connection timed out.
   * <br> error.data[0] is an error object from the Cast SDK.
   */
  'CAST_CONNECTION_TIMED_OUT': 8005,

  /**
   * The requested receiver app ID does not exist or is unavailable.
   * Check the requested app ID for typos.
   * <br> error.data[0] is an error object from the Cast SDK.
   */
  'CAST_RECEIVER_APP_UNAVAILABLE': 8006,


  // RETIRED: CAST_RECEIVER_APP_ID_MISSING': 8007,


  /**
   * Offline storage is not supported on this browser; it is required for
   * offline support.
   */
  'STORAGE_NOT_SUPPORTED': 9000,

  /**
   * An unknown error occurred in the IndexedDB.
   * <br> On Firefox, one common source for UnknownError calls is reverting
   * Firefox to an old version. This makes the IndexedDB storage inaccessible
   * for older versions. The only way to fix this is to delete the storage
   * data in your profile. See https://mzl.la/2yCGWCm
   * <br> error.data[0] is the error object.
   */
  'INDEXED_DB_ERROR': 9001,

  /**
   * The storage operation was aborted.  Deprecated in favor of more general
   * OPERATION_ABORTED.
   */
  'DEPRECATED_OPERATION_ABORTED': 9002,

  /**
   * The specified item was not found in the IndexedDB.
   * <br> error.data[0] is the offline URI.
   */
  'REQUESTED_ITEM_NOT_FOUND': 9003,

  /**
   * A network request was made with a malformed offline URI.
   * <br> error.data[0] is the URI.
   */
  'MALFORMED_OFFLINE_URI': 9004,

  /**
   * The specified content is live or in-progress.
   * Live and in-progress streams cannot be stored offline.
   * <br> error.data[0] is the URI.
   */
  'CANNOT_STORE_LIVE_OFFLINE': 9005,

  // RETIRED: 'STORE_ALREADY_IN_PROGRESS': 9006,

  /**
   * There was no init data available for offline storage.  This happens when
   * there is no init data in the manifest nor could we find any in the
   * segments.  We currently only support searching MP4 init segments for init
   * data.
   */
  'NO_INIT_DATA_FOR_OFFLINE': 9007,

  /**
   * shaka.offline.Storage was constructed with a Player proxy instead of a
   * local player instance.  To fix this, use Player directly with Storage
   * instead of the results of CastProxy.prototype.getPlayer().
   */
  'LOCAL_PLAYER_INSTANCE_REQUIRED': 9008,

  // RETIRED/MOVED TO 4000's: 'CONTENT_UNSUPPORTED_BY_BROWSER': 9009,

  // RETIRED: 'UNSUPPORTED_UPGRADE_REQUEST': 9010,

  /**
   * The storage cell does not allow new operations that require new keys.
   */
  'NEW_KEY_OPERATION_NOT_SUPPORTED': 9011,

  /**
   * A key was not found in a storage cell.
   */
  'KEY_NOT_FOUND': 9012,

  /**
   * A storage cell was not found.
   */
  'MISSING_STORAGE_CELL': 9013,

  /**
   * The storage limit defined in <code>downloadSizeCallback</code> has been
   * reached.
   */
  'STORAGE_LIMIT_REACHED': 9014,

  /**
   * <code>downloadSizeCallback</code> has produced an unexpected error.
   */
  'DOWNLOAD_SIZE_CALLBACK_ERROR': 9015,

  /**
   * The storage cell does not allow new operations that significantly change
   * existing data.
   */
  'MODIFY_OPERATION_NOT_SUPPORTED': 9016,

  /**
   * When attempting to open an indexedDB instance, nothing happened for long
   * enough for us to time out.  This keeps the storage mechanism from hanging
   * indefinitely, if neither the success nor error callbacks are called.
   */
  'INDEXED_DB_INIT_TIMED_OUT': 9017,

  /**
   * CS IMA SDK, required for ad insertion, has not been included on the page.
   */
  'CS_IMA_SDK_MISSING': 10000,

  /**
   * Client Side Ad Manager needs to be initialized to enable Client Side
   * Ad Insertion. Call adManager.initClientSide() to do it.
   */
  'CS_AD_MANAGER_NOT_INITIALIZED': 10001,

  /**
   * SS IMA SDK, required for ad insertion, has not been included on the page.
   */
  'SS_IMA_SDK_MISSING': 10002,

  /**
   * Server Side Ad Manager needs to be initialized to enable Server Side
   * Ad Insertion. Call adManager.initServerSide() to do it.
   */
  'SS_AD_MANAGER_NOT_INITIALIZED': 10003,

  /**
   * A new DAI steam was requested before the previous request had been
   * resolved. Only one stream request at a time is supported. Please wait
   * for the previous request to complete before initiating a new one.
   */
  'CURRENT_DAI_REQUEST_NOT_FINISHED': 10004,

  /**
   * MediaTailor Ad Manager needs to be initialized to enable MediaTailor
   * Ad Insertion. Call adManager.initMediaTailor() to do it.
   */
  'MT_AD_MANAGER_NOT_INITIALIZED': 10005,

  /**
   * Interstitial Ad Manager needs to be initialized to enable interstitial
   * Ad Insertion. Call adManager.initInterstitial() to do it.
   */
  'INTERSTITIAL_AD_MANAGER_NOT_INITIALIZED': 10006,

  /**
   * The VAST contained invalid XML markup.
   */
  'VAST_INVALID_XML': 10007,
};
