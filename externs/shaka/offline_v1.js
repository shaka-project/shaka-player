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
 *   key: number,
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   periods: !Array.<shakaExtern.PeriodDBV1>,
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
 * @property {!Array.<shakaExtern.PeriodDBV1>} periods
 *   The Periods that are stored.
 * @property {!Array.<string>} sessionIds
 *   The DRM offline session IDs for the media.
 * @property {?shakaExtern.DrmInfo} drmInfo
 *   The DRM info used to initialize EME.
 * @property {Object} appMetadata
 *   A metadata object passed from the application.
 */
shakaExtern.ManifestDBV1;


/**
 * @typedef {{
 *   startTime: number,
 *   streams: !Array.<shakaExtern.StreamDBV1>
 * }}
 *
 * @property {number} startTime
 *   The start time of the period, in seconds.
 * @property {!Array.<shakaExtern.StreamDBV1>} streams
 *   The streams that define the Period.
 */
shakaExtern.PeriodDBV1;


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
 *   segments: !Array.<shakaExtern.SegmentDBV1>
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
 * @property {!Array.<shakaExtern.SegmentDBV1>} segments
 *   An array of segments that make up the stream
 */
shakaExtern.StreamDBV1;


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
shakaExtern.SegmentDBV1;


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
shakaExtern.SegmentDataDBV1;
