/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.routing.Payload');


/**
 * @typedef {{
 *   factory: ?function():!shaka.extern.ManifestParser,
 *   mediaElement: HTMLMediaElement,
 *   mimeType: ?string,
 *   startTime: ?number,
 *   startTimeOfLoad: ?number,
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
 * @property {?number} startTimeOfLoad
 *    The time (in seconds) of when a load request is created. This is used to
 *    track the latency between when the call to |Player.load| and the start
 *    of playback. When the payload is not for a load request, this should be
 *    |null|.
 *
 * @property  {?string} uri
 *   The address of the content that will be loaded.
 */
shaka.routing.Payload;
