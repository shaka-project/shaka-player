/**
 * @license
 * Copyright 2015 Google Inc.
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
 * @param {shaka.util.Error.Category} category
 * @param {shaka.util.Error.Code} code
 * @param {...*} var_args
 * @constructor
 * @struct
 * @export
 */
shaka.util.Error = function(category, code, var_args) {
  /**
   * @const {shaka.util.Error.Category}
   * @expose
   */
  this.category = category;

  /**
   * @const {shaka.util.Error.Code}
   * @expose
   */
  this.code = code;

  /**
   * @const {!Array.<*>}
   * @expose
   */
  this.data = Array.prototype.slice.call(arguments, 2);
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
  'MANIFEST': 4
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
  'UNSUPPORTED_SCHEME': 1,

  /**
   * An HTTP network request returned an HTTP status that indicated a failure.
   * <br> error.data[0] is the URI.
   * <br> error.data[1] is the status code.
   */
  'BAD_HTTP_STATUS': 2,

  /**
   * An HTTP network request failed with an error, but not from the server.
   * <br> error.data[0] is the URI.
   */
  'HTTP_ERROR': 3,

  /**
   * A network request timed out.
   * <br> error.data[0] is the URI.
   */
  'TIMEOUT': 4,

  /**
   * A network request was made with a malformed data URI.
   * <br> error.data[0] is the URI.
   */
  'MALFORMED_DATA_URI': 5,

  /**
   * A network request was made with a data URI using an unknown encoding.
   * <br> error.data[0] is the URI.
   */
  'UNKNOWN_DATA_URI_ENCODING': 6,

  /** The text parser failed to parse a text stream due to an invalid header. */
  'INVALID_TEXT_HEADER': 7,

  /** The text parser failed to parse a text stream due to an invalid cue. */
  'INVALID_TEXT_CUE': 8,

  /**
   * The text parser failed to parse a text stream due to invalid cue settings.
   */
  'INVALID_TEXT_SETTINGS': 9,

  /**
   * Some component tried to read past the end of a buffer.  The segment index,
   * init segment, or PSSH may be malformed.
   */
  'BUFFER_READ_OUT_OF_BOUNDS': 10,

  /**
   * Some component tried to parse an integer that was too large to fit in a
   * JavaScript number without rounding error.  JavaScript can only natively
   * represent integers up to 53 bits.
   */
  'JS_INTEGER_OVERFLOW': 11,

  /**
   * The EBML parser used to parse the WebM container encountered an integer,
   * ID, or other field larger than the maximum supported by the parser.
   */
  'EBML_OVERFLOW': 12,

  /**
   * The EBML parser used to parse the WebM container encountered a floating-
   * point field of a size not supported by the parser.
   */
  'EBML_BAD_FLOATING_POINT_SIZE': 13,

  /**
   * The MP4 SIDX parser found the wrong box type.
   * Either the segment index range is incorrect or the data is corrupt.
   */
  'MP4_SIDX_WRONG_BOX_TYPE': 14,

  /**
   * The MP4 SIDX parser encountered an invalid timescale.
   * The segment index data may be corrupt.
   */
  'MP4_SIDX_INVALID_TIMESCALE': 15,

  /** The MP4 SIDX parser encountered a type of SIDX that is not supported. */
  'MP4_SIDX_TYPE_NOT_SUPPORTED': 16,

  /**
   * The WebM Cues parser was unable to locate the Cues element.
   * The segment index data may be corrupt.
   */
  'WEBM_CUES_ELEMENT_MISSING': 17,

  /**
   * The WebM header parser was unable to locate the Ebml element.
   * The init segment data may be corrupt.
   */
  'WEBM_EBML_HEADER_ELEMENT_MISSING': 18,

  /**
   * The WebM header parser was unable to locate the Segment element.
   * The init segment data may be corrupt.
   */
  'WEBM_SEGMENT_ELEMENT_MISSING': 19,

  /**
   * The WebM header parser was unable to locate the Info element.
   * The init segment data may be corrupt.
   */
  'WEBM_INFO_ELEMENT_MISSING': 20,

  /**
   * The WebM header parser was unable to locate the Duration element.
   * The init segment data may be corrupt or may have been incorrectly encoded.
   * Shaka requires a duration in WebM DASH content.
   */
  'WEBM_DURATION_ELEMENT_MISSING': 21,

  /**
   * The WebM Cues parser was unable to locate the Cue Track Positions element.
   * The segment index data may be corrupt.
   */
  'WEBM_CUE_TRACK_POSITIONS_ELEMENT_MISSING': 22,

  /**
   * The WebM Cues parser was unable to locate the Cue Time element.
   * The segment index data may be corrupt.
   */
  'WEBM_CUE_TIME_ELEMENT_MISSING': 23,

  /** The DASH Manifest contained invalid XML markup. */
  'DASH_INVALID_XML': 24,

  /**
   * The DASH Manifest contained a representation with no Segment info.  This
   * can occur if there are no Segment* in a Representation or if one of the
   * Segment* elements do not contain enough Segment information.
   */
  'DASH_NO_SEGMENT_INFO': 25,

  /** The DASH Manifest contained an AdaptationSet with no Representations. */
  'DASH_EMPTY_ADAPTATION_SET': 26,

  /** The DASH Manifest contained an Period with no AdaptationSets. */
  'DASH_EMPTY_PERIOD': 27,

  /**
   * The DASH Manifest does not specify an init segment with a WebM container.
   */
  'DASH_WEBM_MISSING_INIT': 28,

  /** The DASH Manifest contained an unsupported container format */
  'DASH_UNSUPPORTED_CONTAINER': 30
};
