/**
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
 *
 * @fileoverview Default values for the player.
 */

goog.provide('shaka.player.Defaults');

/**
 * @namespace shaka.player.Defaults
 * @summary Default values used by the shaka library.
 */


/**
 * The amount of content that streams will buffer, in seconds, after
 * startup. Where startup consists of waiting until the streams have buffered
 * some minimum amount of content, which is determined by the VideoSource
 * implementation; for DASH content, the minimum amount of content is equal
 * to the 'minBufferTime' attribute from the MPD.
 * @type {number}
 * @const
 */
shaka.player.Defaults.STREAM_BUFFER_SIZE = 15;


/**
 * The license request timeout in seconds. A value of zero indicates no timeout.
 * @type {number}
 * @const
 */
shaka.player.Defaults.LICENSE_REQUEST_TIMEOUT = 0;


/**
 * The MPD request timeout in seconds. A value of zero indicates no timeout.
 * @type {number}
 * @const
 */
shaka.player.Defaults.MPD_REQUEST_TIMEOUT = 0;


/**
 * The segment request timeout in seconds. A value of zero indicates no timeout.
 * @type {number}
 * @const
 */
shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT = 0;


/**
 * The preferred language for audio and text tracks.
 * @type {string}
 * @const
 * @see {@link https://tools.ietf.org/html/rfc5646 IETF RFC 5646}
 * @see {@link http://www.iso.org/iso/home/standards/language_codes.htm ISO 639}
 */
shaka.player.Defaults.PREFERRED_LANGUAGE = 'en';

