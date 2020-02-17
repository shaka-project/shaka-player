/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * @typedef {{
 *   key: number,
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   expiration: number,
 *   periods: !Array.<shaka.extern.PeriodDBV1>,
 *   sessionIds: !Array.<string>,
 *   drmInfo: ?shaka.extern.DrmInfo,
 *   appMetadata: Object
 * }}
 *
 * @property {number} key
 *   A unique key to identify this item.
 * @property {string} originalManifestUri
 *   The URI that the manifest was originally loaded from.
 * @property {number} duration
 *   The total duration of the media, in seconds.
 * @property {number} size
 *   The total size of all stored segments, in bytes.
 * @property {number} expiration
 *   The license expiration, in milliseconds; or Infinity if not applicable.
 *   Note that upon JSON serialization, Infinity becomes null, and must be
 *   converted back upon loading from storage.
 * @property {!Array.<shaka.extern.PeriodDBV1>} periods
 *   The Periods that are stored.
 * @property {!Array.<string>} sessionIds
 *   The DRM offline session IDs for the media.
 * @property {?shaka.extern.DrmInfo} drmInfo
 *   The DRM info used to initialize EME.
 * @property {Object} appMetadata
 *   A metadata object passed from the application.
 */
shaka.extern.ManifestDBV1;


/**
 * @typedef {{
 *   startTime: number,
 *   streams: !Array.<shaka.extern.StreamDBV1>
 * }}
 *
 * @property {number} startTime
 *   The start time of the period, in seconds.
 * @property {!Array.<shaka.extern.StreamDBV1>} streams
 *   The streams that define the Period.
 */
shaka.extern.PeriodDBV1;


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
 *   label: ?string,
 *   width: ?number,
 *   height: ?number,
 *   initSegmentUri: ?string,
 *   encrypted: boolean,
 *   keyId: ?string,
 *   segments: !Array.<shaka.extern.SegmentDBV1>,
 *   variantIds: !Array.<number>
 * }}
 *
 * @property {number} id
 *   The unique id of the stream.
 * @property {boolean} primary
 *   Whether the stream set was primary.
 * @property {number} presentationTimeOffset
 *   The presentation time offset of the stream, in seconds.  Note that this is
 *   the inverse of the timestampOffset as defined in the manifest types.
 * @property {string} contentType
 *   The type of the stream, 'audio', 'text', or 'video'.
 * @property {string} mimeType
 *   The MIME type of the stream.
 * @property {string} codecs
 *   The codecs of the stream.
 * @property {(number|undefined)} frameRate
 *   The Stream's framerate in frames per second.
 * @property {(string|undefined)} kind
 *   The kind of text stream; undefined for audio/video.
 * @property {string} language
 *   The language of the stream; '' for video.
 * @property {?string} label
 *   The label of the stream; '' for video.
 * @property {?number} width
 *   The width of the stream; null for audio/text.
 * @property {?number} height
 *   The height of the stream; null for audio/text.
 * @property  {?number} initSegmentUri
 *   The offline URI where the init segment is found; null if no init segment.
 * @property {boolean} encrypted
 *   Whether this stream is encrypted.
 * @property {?string} keyId
 *   The key ID this stream is encrypted with.
 * @property {!Array.<shaka.extern.SegmentDBV1>} segments
 *   An array of segments that make up the stream.
 * @property {!Array.<number>} variantIds
 *   An array of ids of variants the stream is a part of.
 */
shaka.extern.StreamDBV1;


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
 *   The offline URI of the segment.
 */
shaka.extern.SegmentDBV1;


/**
 * @typedef {{
 *   key: number,
 *   data: !ArrayBuffer
 * }}
 *
 * @property {number} key
 *   A unique key to identify this item.
 * @property {!ArrayBuffer} data
 *   The data contents of the segment.
 */
shaka.extern.SegmentDataDBV1;
