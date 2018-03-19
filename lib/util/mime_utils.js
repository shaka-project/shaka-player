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

goog.provide('shaka.util.MimeUtils');


/**
 * @namespace shaka.util.MimeUtils
 * @summary A set of utility functions for dealing with MIME types.
 */


/**
 * Takes a MIME type and optional codecs string and produces the full MIME type.
 *
 * @param {string} mimeType
 * @param {string=} opt_codecs
 * @return {string}
 */
shaka.util.MimeUtils.getFullType = function(mimeType, opt_codecs) {
  let fullMimeType = mimeType;
  if (opt_codecs) {
    fullMimeType += '; codecs="' + opt_codecs + '"';
  }
  return fullMimeType;
};


/**
 * Takes a Stream object and produces an extended MIME type with information
 * beyond the container and codec type, when available.
 *
 * @param {shakaExtern.Stream} stream
 * @return {string}
 */
shaka.util.MimeUtils.getExtendedType = function(stream) {
  let mimeType = stream.mimeType;

  for (let streamKey in shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_) {
    let value = stream[streamKey];
    let mimeKey = shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_[streamKey];
    if (value) {
      mimeType += '; ' + mimeKey + '="' + value + '"';
    }
  }

  return mimeType;
};


/**
 * A map from Stream object keys to MIME type parameters.  These should be
 * ignored by platforms that do not recognize them.
 *
 * This initial set of parameters are all recognized by Chromecast.
 *
 * @const {!Object.<string, string>}
 * @private
 */
shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_ = {
  'codecs': 'codecs',
  'frameRate': 'framerate',  // Ours is camelCase, theirs is lowercase.
  'bandwidth': 'bitrate',  // Thankfully these are in the same unit, bits/sec.
  'width': 'width',
  'height': 'height',
  'channelsCount': 'channels'
};
