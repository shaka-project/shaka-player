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
 * @summary A set of utility functions for dealing with MIME types.
 */
shaka.util.MimeUtils = class {
  /**
   * Takes a MIME type and optional codecs string and produces the full MIME
   * type.
   *
   * @param {string} mimeType
   * @param {string=} codecs
   * @return {string}
   */
  static getFullType(mimeType, codecs) {
    let fullMimeType = mimeType;
    if (codecs) {
      fullMimeType += '; codecs="' + codecs + '"';
    }
    return fullMimeType;
  }

  /**
   * Takes a Stream object and produces an extended MIME type with information
   * beyond the container and codec type, when available.
   *
   * @param {shaka.extern.Stream} stream
   * @return {string}
   */
  static getExtendedType(stream) {
    const components = [stream.mimeType];

    const extendedMimeParams = shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_;
    extendedMimeParams.forEach((mimeKey, streamKey) => {
      const value = stream[streamKey];
      if (value) {
        components.push(mimeKey + '="' + value + '"');
      }
    });

    return components.join(';');
  }

  /**
   * Split a list of codecs encoded in a string into a list of codecs.
   * @param {string} codecs
   * @return {!Array.<string>}
   */
  static splitCodecs(codecs) {
    return codecs.split(',');
  }

  /**
   * Get the base codec from a codec string.
   *
   * @param {string} codecString
   * @return {string}
   */
  static getCodecBase(codecString) {
    const parts = shaka.util.MimeUtils.getCodecParts_(codecString);
    return parts[0];
  }

  /**
   * Get the base and profile of a codec string. Where [0] will be the codec
   * base and [1] will be the profile.
   * @param {string} codecString
   * @return {!Array.<string>}
   * @private
   */
  static getCodecParts_(codecString) {
    const parts = codecString.split('.');

    const base = parts[0];

    parts.pop();
    const profile = parts.join('.');

    // Make sure that we always return a "base" and "profile".
    return [base, profile];
  }
};


/**
 * A map from Stream object keys to MIME type parameters.  These should be
 * ignored by platforms that do not recognize them.
 *
 * This initial set of parameters are all recognized by Chromecast.
 *
 * @const {!Map.<string, string>}
 * @private
 */
shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_ = new Map()
  .set('codecs', 'codecs')
  .set('frameRate', 'framerate')  // Ours is camelCase, theirs is lowercase.
  .set('bandwidth', 'bitrate')  // They are in the same units: bits/sec.
  .set('width', 'width')
  .set('height', 'height')
  .set('channelsCount', 'channels');


/**
 * A mimetype created for CEA closed captions.
 * @const {string}
 */
shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE = 'application/cea-608';

