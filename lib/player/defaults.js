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

goog.provide('shaka.player.Defaults');

/**
 * @namespace shaka.player.Defaults
 * @summary Default values used by the Shaka Player.
 * @exportDoc
 */


/**
 * The maximum amount of content, in seconds, that audio and video streams
 * will buffer ahead of the playhead. For DASH streams, this will be
 * overridden if 'minBufferTime' is larger.
 *
 * @const {number}
 * @exportDoc
 */
shaka.player.Defaults.STREAM_BUFFER_SIZE = 15;


/**
 * The license request timeout in seconds. A value of zero indicates no timeout.
 *
 * @const {number}
 * @exportDoc
 */
shaka.player.Defaults.LICENSE_REQUEST_TIMEOUT = 0;


/**
 * The MPD request timeout in seconds. A value of zero indicates no timeout.
 *
 * @const {number}
 * @exportDoc
 */
shaka.player.Defaults.MPD_REQUEST_TIMEOUT = 0;


/**
 * The segment request timeout in seconds. A value of zero indicates no timeout.
 *
 * @const {number}
 * @exportDoc
 */
shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT = 0;


/**
 * The preferred language for audio and text tracks.
 *
 * @const {string}
 * @see {@link https://tools.ietf.org/html/rfc5646 IETF RFC 5646}
 * @see {@link http://www.iso.org/iso/home/standards/language_codes.htm ISO 639}
 * @exportDoc
 */
shaka.player.Defaults.PREFERRED_LANGUAGE = 'en';

