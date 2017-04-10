/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.util.Error');



/**
 * Creates a new Error.
 *
 * @param {shaka.util.Error.Severity} severity
 * @param {shaka.util.Error.Category} category
 * @param {shaka.util.Error.Code} code
 * @param {...*} var_args
 *
 * @constructor
 * @struct
 * @export
 * @extends {Error}
 */
shaka.util.Error = function(severity, category, code, var_args) {
  this.severity = severity;
  this.category = category;
  this.code = code;
  this.data = Array.prototype.slice.call(arguments, 3);

  // This improves formatting of Errors in failure messages in the tests.
  if (!COMPILED) {
    var categoryName = 'UNKNOWN';
    var codeName = 'UNKNOWN';

    for (var k in shaka.util.Error.Category) {
      if (shaka.util.Error.Category[k] == this.category)
        categoryName = k;
    }
    for (var k in shaka.util.Error.Code) {
      if (shaka.util.Error.Code[k] == this.code)
        codeName = k;
    }

    /**
     * A human-readable version of the category and code.
     * <i>(Only available in uncompiled mode.)</i>
     *
     * @const {string}
     * @exportDoc
     */
    this.message = 'Shaka Error ' + categoryName + '.' + codeName +
                   ' (' + this.data.toString() + ')';
    try {
      throw new Error(this.message);
    } catch (e) {
      /**
       * A stack-trace showing where the error occurred.
       * <i>(Only available in uncompiled mode.)</i>
       *
       * @const {string}
       * @exportDoc
       */
      this.stack = e.stack;
    }
  }
};


/**
 * @type {shaka.util.Error.Severity}
 * @expose
 */
shaka.util.Error.prototype.severity;


/**
 * @const {shaka.util.Error.Category}
 * @expose
 */
shaka.util.Error.prototype.category;


/**
 * @const {shaka.util.Error.Code}
 * @expose
 */
shaka.util.Error.prototype.code;


/**
 * @const {!Array.<*>}
 * @expose
 */
shaka.util.Error.prototype.data;


/**
 * @return {string}
 * @override
 */
shaka.util.Error.prototype.toString = function() {
  return 'shaka.util.Error ' + JSON.stringify(this, null, '  ');
};


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
  'CRITICAL': 2
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
  'STORAGE': 9
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
   *   be interpretted as text.
   * <br> error.data[3] is the map of response headers.
   */
  'BAD_HTTP_STATUS': 1001,

  /**
   * An HTTP network request failed with an error, but not from the server.
   * <br> error.data[0] is the URI.
   */
  'HTTP_ERROR': 1002,

  /**
   * A network request timed out.
   * <br> error.data[0] is the URI.
   */
  'TIMEOUT': 1003,

  /**
   * A network request was made with a malformed data URI.
   * <br> error.data[0] is the URI.
   */
  'MALFORMED_DATA_URI': 1004,

  /**
   * A network request was made with a data URI using an unknown encoding.
   * <br> error.data[0] is the URI.
   */
  'UNKNOWN_DATA_URI_ENCODING': 1005,

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


  /** The text parser failed to parse a text stream due to an invalid header. */
  'INVALID_TEXT_HEADER': 2000,

  /** The text parser failed to parse a text stream due to an invalid cue. */
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
   */
  'MEDIA_SOURCE_OPERATION_FAILED': 3014,

  /**
   * A MediaSource operation threw an exception.
   * <br> error.data[0] is the exception that was thrown.
   */
  'MEDIA_SOURCE_OPERATION_THREW': 3015,

  /**
   * The video element reported an error.
   * <br> error.data[0] is a MediaError code from the video element.
   * <br> On Edge & IE, error.data[1] is a Microsoft extended error code in hex.
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
   * The Player was unable to guess the manifest type based on file extension
   * or MIME type.  To fix, try one of the following:
   * <br><ul>
   *   <li>Rename the manifest so that the URI ends in a well-known extension.
   *   <li>Configure the server to send a recognizable Content-Type header.
   *   <li>Configure the server to accept a HEAD request for the manifest.
   * </ul>
   * <br> error.data[0] is the manifest URI.
   */
  'UNABLE_TO_GUESS_MANIFEST_TYPE': 4000,

  /** The DASH Manifest contained invalid XML markup. */
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

  /**
   * The manifest contains a period with no playable streams.
   * Either the period was originally empty, or the streams within cannot be
   * played on this browser or platform.
   */
  'UNPLAYABLE_PERIOD': 4011,

  /**
   * There exist some streams that could be decoded, but restrictions imposed
   * by the application or the key system prevent us from playing.  This may
   * happen under the following conditions:
   * <ul>
   *   <li>The application has given restrictions to the Player that restrict
   *       at least one content type completely (e.g. no playable audio).
   *   <li>The key system has imposed output restrictions that cannot be met
   *       (such as HDCP) and there are no unrestricted alternatives.
   * </ul>
   */
  'RESTRICTIONS_CANNOT_BE_MET': 4012,

  // RETIRED: 'INTERNAL_ERROR_KEY_STATUS': 4013,

  /**
   * No valid periods were found in the manifest.  Please check that your
   * manifest is correct and free of typos.
   */
  'NO_PERIODS': 4014,

  /**
   * HLS playlist doesn't start with a mandory #EXTM3U tag.
   */
  'HLS_PLAYLIST_HEADER_MISSING': 4015,

  /**
   * HLS tag has an invalid name that doesn't start with '#EXT'
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

  /**
   * HLS parser was unable to guess mime type of a stream.
   * <br> error.data[0] is the stream file's extension.
   */
  'HLS_COULD_NOT_GUESS_MIME_TYPE': 4021,

  /**
   * No Master Playlist has been provided. Master playlist provides
   * vital information about the streams (like codecs) that is
   * required for MediaSource. We don't support directly providing
   * a Media Playlist.
   */
  'HLS_MASTER_PLAYLIST_NOT_PROVIDED': 4022,

  /**
   * One of the required attributes was not provided.
   * HLS manifest is invalid.
   * <br> error.data[0] is the missing attribute's name.
   */
  'HLS_REQUIRED_ATTRIBUTE_MISSING': 4023,

  /**
   * One of the required tags was not provided.
   * HLS manifest is invalid.
   * <br> error.data[0] is the missing tag's name.
   */
  'HLS_REQUIRED_TAG_MISSING': 4024,

  /**
   * HLS parser was unable to guess codecs of a stream.
   * <br> error.data[0] is the list of all codecs for the variant.
   */
  'HLS_COULD_NOT_GUESS_CODECS': 4025,

  /**
   * HLS parser has encountered encrypted content with unsupported
   * KEYFORMAT attributes.
   */
  'HLS_KEYFORMATS_NOT_SUPPORTED': 4026,


  // RETIRED: 'INCONSISTENT_BUFFER_STATE': 5000,
  // RETIRED: 'INVALID_SEGMENT_INDEX': 5001,
  // RETIRED: 'SEGMENT_DOES_NOT_EXIST': 5002,
  // RETIRED: 'CANNOT_SATISFY_BYTE_LIMIT': 5003,
  // RETIRED: 'BAD_SEGMENT': 5004,

  /**
   * The StreamingEngine called onChooseStreams() but the callback receiver
   * did not return the correct number or type of Streams.
   *
   * This can happen when there is multi-Period content where one Period is
   * video+audio and another is video-only or audio-only.  We don't support this
   * case because it is incompatible with MSE.  When the browser reaches the
   * transition, it will pause, waiting for the audio stream.
   */
  'INVALID_STREAMS_CHOSEN': 5005,


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
   *   <li> The key system is not available from unsecure contexts. (ie.
            requires HTTPS) See https://goo.gl/EEhZqT.
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
   */
  'FAILED_TO_GENERATE_LICENSE_REQUEST': 6006,

  /**
   * The license request failed.  This could be a timeout, a network failure, or
   * a rejection by the server.
   * <br> error.data[0] is a shaka.util.Error from the networking engine.
   */
  'LICENSE_REQUEST_FAILED': 6007,

  /**
   * The license response was rejected by the CDM.  The server's response may be
   * invalid or malformed for this CDM.
   * <br> error.data[0] is an error message string from the browser.
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
   */
  'NO_LICENSE_SERVER_GIVEN': 6012,

  /**
   * A required offline session was removed.  The content is not playable.
   */
  'OFFLINE_SESSION_REMOVED': 6013,

  /**
   * The license has expired.  This is triggered when playback is stalled on a
   * 'waitingforkeys' event and there are any expired keys in the key status map
   * of any active session.
   */
  'EXPIRED': 6014,


  /**
   * The call to Player.load() was interrupted by a call to Player.unload()
   * or another call to Player.load().
   */
  'LOAD_INTERRUPTED': 7000,


  /**
   * The Cast API is unavailable.  This may be because of one of the following:
   * - The browser may not have Cast support
   * - The browser may be missing a necessary Cast extension
   * - The Cast sender library may not be loaded in your app
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


  /**
   * Offline storage is not supported on this browser; it is required for
   * offline support.
   */
  'STORAGE_NOT_SUPPORTED': 9000,

  /**
   * An unknown error occurred in the IndexedDB.
   * <br> On Firefox, one common source for UnknownError calls is reverting
   * Firefox to an old version. This makes the indexedDB storage inaccessible
   * for older versions. The only way to fix this is to delete the storage
   * data in your profile. See https://goo.gl/eKVPPe.
   * <br> error.data[0] is the error object.
   */
  'INDEXED_DB_ERROR': 9001,

  /**
   * The operation was aborted.  For example, by a call to destroy().
   */
  'OPERATION_ABORTED': 9002,

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

  /**
   * There is already a store operation in-progress, wait until it completes
   * before starting another.
   */
  'STORE_ALREADY_IN_PROGRESS': 9006,

  /**
   * The specified manifest is encrypted but does not specify any init data.
   * Without init data specified in the manifest, the content will not be
   * playable offline.
   * <br> error.data[0] is the URI.
   */
  'NO_INIT_DATA_FOR_OFFLINE': 9007
};
