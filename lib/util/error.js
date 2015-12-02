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
  'NETWORK': 1,
  'TEXT': 2,
  'MEDIA': 3
};


/**
 * @enum {number}
 * @export
 */
shaka.util.Error.Code = {
  'UNSUPPORTED_SCHEME': 1,
  'BAD_HTTP_STATUS': 2,
  'HTTP_ERROR': 3,
  'TIMEOUT': 4,
  'MALFORMED_DATA_URI': 5,
  'UNKNOWN_DATA_URI_ENCODING': 6,
  'INVALID_TEXT_HEADER': 7,
  'INVALID_TEXT_CUE': 8,
  'INVALID_TEXT_SETTINGS': 9,
  'SEGMENT_OUT_OF_RANGE': 10,
  'BUFFER_READ_OUT_OF_BOUNDS': 11,
  'JS_INTEGER_OVERFLOW': 12,
  'EBML_OVERFLOW': 13,
  'EBML_BAD_FLOATING_POINT_SIZE': 14,
  'MP4_SIDX_WRONG_BOX_TYPE': 15,
  'MP4_SIDX_INVALID_TIMESCALE': 16,
  'MP4_SIDX_TYPE_NOT_SUPPORTED': 17,
  'WEBM_CUES_ELEMENT_MISSING': 18,
  'WEBM_EBML_ELEMENT_MISSING': 19,
  'WEBM_SEGMENT_ELEMENT_MISSING': 20,
  'WEBM_INFO_ELEMENT_MISSING': 21,
  'WEBM_DURATION_ELEMENT_MISSING': 22,
  'WEBM_CUE_TRACK_POSITIONS_ELEMENT_MISSING': 23,
  'WEBM_CUE_TIME_ELEMENT_MISSING': 24
};
