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

goog.provide('shaka.routing.Payload');


/**
 * @typedef {{
 *   factory: ?function():!shaka.extern.ManifestParser,
 *   mediaElement: HTMLMediaElement,
 *   mimeType: ?string,
 *   startTime: ?number,
 *   uri: ?string
 * }}
 *
 * @description
 *   The payload is the information to "deliver" to our destination. When
 *   moving from node-to-node, the payload may be modified.
 *
 * @property {?function():!shaka.extern.ManifestParser} factory
 *   The manifest parser factory that should be used to parse the manifest
 *   at |uri|. This should be |null| when |mimeType| is not |null|.
 *
 * @property {HTMLMediaElement} mediaElement
 *   The media element that we are or will be using.
 *
 * @property {?string} mimeType
 *   The mime type of the content that we will parse. This will be used when
 *   picking which parser to use. This should be |null|  when |factory| is not
 *   |null|.
 *
 * @property {?number} startTime
 *   The time (in seconds) where playback should start. When |null| we will
 *   use the content's default start time (0 for VOD and live edge for LIVE).
 *
 * @property  {?string} uri
 *   The address of the content that will be loaded.
 */
shaka.routing.Payload;
