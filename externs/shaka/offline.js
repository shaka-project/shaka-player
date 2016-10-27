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


/** @externs */


/**
 * @typedef {{
 *   basic: boolean,
 *   encrypted: !Object.<string, boolean>
 * }}
 *
 * @property {boolean} basic
 *   True if offline is usable at all.
 * @property {!Object.<string, boolean>} encrypted
 *   A map of key system name to whether it supports offline playback.
 * @exportDoc
 */
shakaExtern.OfflineSupport;


/**
 * @typedef {{
 *   trackSelectionCallback:
 *       function(!Array.<shakaExtern.Track>):!Array.<shakaExtern.Track>,
 *   progressCallback: function(shakaExtern.StoredContent,number)
 * }}
 *
 * @property {function(!Array.<shakaExtern.Track>):!Array.<shakaExtern.Track>}
 *     trackSelectionCallback
 *   Called inside store() to determine which tracks to save from a manifest.
 *   It is passed an array of Tracks from the manifest and it should return
 *   an array of the tracks to store.  This is called for each Period in the
 *   manifest (in order).
 * @property {function(shakaExtern.StoredContent,number)} progressCallback
 *   Called inside store() to give progress info back to the app.  It is given
 *   the current manifest being stored and the progress of it being stored.
 * @exportDoc
 */
shakaExtern.OfflineConfiguration;


/**
 * @typedef {{
 *   offlineUri: string,
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   tracks: !Array.<shakaExtern.Track>,
 *   appMetadata: Object
 * }}
 *
 * @property {string} offlineUri
 *   An offline URI to access the content.  This can be passed directly to
 *   Player.
 * @property {string} originalManifestUri
 *   The original manifest URI of the content stored.
 * @property {number} duration
 *   The duration of the content, in seconds.
 * @property {number} size
 *   The size of the content, in bytes.
 * @property {!Array.<shakaExtern.Track>} tracks
 *   The tracks that are stored.  This only lists those found in the first
 *   Period.
 * @property {Object} appMetadata
 *   The metadata passed to store().
 * @exportDoc
 */
shakaExtern.StoredContent;


/**
 * @typedef {{
 *   key: number,
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   periods: !Array.<shakaExtern.PeriodDB>,
 *   sessionIds: !Array.<string>,
 *   drmInfo: ?shakaExtern.DrmInfo,
 *   appMetadata: Object
 * }}
 *
 * @property {number} key
 *   The key that uniquely identifies the manifest.
 * @property {string} originalManifestUri
 *   The URI that the manifest was originally loaded from.
 * @property {number} duration
 *   The total duration of the media, in seconds.
 * @property {number} size
 *   The total size of all stored segments, in bytes.
 * @property {!Array.<shakaExtern.PeriodDB>} periods
 *   The Periods that are stored.
 * @property {!Array.<string>} sessionIds
 *   The DRM offline session IDs for the media.
 * @property {?shakaExtern.DrmInfo} drmInfo
 *   The DRM info used to initialize EME.
 * @property {Object} appMetadata
 *   A metadata object passed from the application.
 */
shakaExtern.ManifestDB;


/**
 * @typedef {{
 *   startTime: number,
 *   streams: !Array.<shakaExtern.StreamDB>
 * }}
 *
 * @property {number} startTime
 *   The start time of the period, in seconds.
 * @property {!Array.<shakaExtern.StreamDB>} streams
 *   The streams that define the Period.
 */
shakaExtern.PeriodDB;


/**
 * @typedef {{
 *   id: number,
 *   primary: boolean,
 *   presentationTimeOffset: number,
 *   contentType: string,
 *   mimeType: string,
 *   codecs: string,
 *   frameRate: (number|undefined),
 *   kind: (string|undefined),
 *   language: string,
 *   width: ?number,
 *   height: ?number,
 *   initSegmentUri: ?string,
 *   encrypted: boolean,
 *   keyId: ?string,
 *   segments: !Array.<shakaExtern.SegmentDB>
 * }}
 *
 * @property {number} id
 *   The unique id of the stream.
 * @property {boolean} primary
 *   Whether the stream set was primary.
 * @property {number} presentationTimeOffset
 *   The presentation time offset of the stream.
 * @property {string} contentType
 *   The type of the stream, 'audio', 'text', or 'video'.
 * @property {string} mimeType
 *   The MIME type of the stream.
 * @property {string} codecs
 *   The codecs of the stream.
 * @property {(number|undefined)} frameRate
 *   The Stream's framerate in frames per second
 * @property {(string|undefined)} kind
 *   The kind of text stream; undefined for audio/video.
 * @property {string} language
 *   The language of the stream; '' for video.
 * @property {?number} width
 *   The width of the stream; null for audio/text.
 * @property {?number} height
 *   The height of the stream; null for audio/text.
 * @property  {?string} initSegmentUri
 *   The offline URI where the init segment is found; null if no init segment.
 * @property {boolean} encrypted
 *   Whether this stream is encrypted.
 * @property {?string} keyId
 *   The key ID this stream is encrypted with.
 * @property {!Array.<shakaExtern.SegmentDB>} segments
 *   An array of segments that make up the stream
 */
shakaExtern.StreamDB;


/**
 * @typedef {{
 *   startTime: number,
 *   endTime: number,
 *   uri: string
 * }}
 *
 * @property {number} startTime
 *   The start time of the segment, in seconds from the start of the Period.
 * @property {number} endTime
 *   The end time of the segment, in seconds from the start of the Period.
 * @property {string} uri
 *   The offline URI where the segment is found.
 */
shakaExtern.SegmentDB;


/**
 * @typedef {{
 *   key: number,
 *   data: !ArrayBuffer,
 *   manifestKey: number,
 *   streamNumber: number,
 *   segmentNumber: number
 * }}
 *
 * @property {number} key
 *   A key that uniquely describes the segment.
 * @property {!ArrayBuffer} data
 *   The data contents of the segment.
 * @property {number} manifestKey
 *   The key of the manifest this belongs to.
 * @property {number} streamNumber
 *   The index of the stream this belongs to.
 * @property {number} segmentNumber
 *   The index of the segment within the stream.
 */
shakaExtern.SegmentDataDB;
