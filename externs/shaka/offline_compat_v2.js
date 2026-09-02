/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * @typedef {{
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   expiration: number,
 *   periods: !Array<shaka.extern.PeriodDBV2>,
 *   sessionIds: !Array<string>,
 *   drmInfo: ?shaka.extern.DrmInfo,
 *   appMetadata: Object
 * }}
 *
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
 * @property {!Array<shaka.extern.PeriodDBV2>} periods
 *   The Periods that are stored.
 * @property {!Array<string>} sessionIds
 *   The DRM offline session IDs for the media.
 * @property {?shaka.extern.DrmInfo} drmInfo
 *   The DRM info used to initialize EME.
 * @property {Object} appMetadata
 *   A metadata object passed from the application.
 */
shaka.extern.ManifestDBV2;


/**
 * @typedef {{
 *   startTime: number,
 *   streams: !Array<shaka.extern.StreamDBV2>
 * }}
 *
 * @property {number} startTime
 *   The start time of the period, in seconds.
 * @property {!Array<shaka.extern.StreamDBV2>} streams
 *   The streams that define the Period.
 */
shaka.extern.PeriodDBV2;


/**
 * @typedef {{
 *   id: number,
 *   originalId: ?string,
 *   primary: boolean,
 *   presentationTimeOffset: number,
 *   contentType: string,
 *   mimeType: string,
 *   codecs: string,
 *   frameRate: (number|undefined),
 *   pixelAspectRatio: (string|undefined),
 *   kind: (string|undefined),
 *   language: string,
 *   label: ?string,
 *   width: ?number,
 *   height: ?number,
 *   initSegmentKey: ?number,
 *   encrypted: boolean,
 *   keyId: ?string,
 *   segments: !Array<shaka.extern.SegmentDBV2>,
 *   variantIds: !Array<number>
 * }}
 *
 * @property {number} id
 *   The unique id of the stream.
 * @property {?string} originalId
 *   The original ID, if any, that appeared in the manifest.  For example, in
 *   DASH, this is the "id" attribute of the Representation element.
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
 * @property {(string|undefined)} pixelAspectRatio
 *   The Stream's pixel aspect ratio
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
 * @property {?number} initSegmentKey
 *   The storage key where the init segment is found; null if no init segment.
 * @property {boolean} encrypted
 *   Whether this stream is encrypted.
 * @property {?string} keyId
 *   The key ID this stream is encrypted with.
 * @property {!Array<shaka.extern.SegmentDBV2>} segments
 *   An array of segments that make up the stream.
 * @property {!Array<number>} variantIds
 *   An array of ids of variants the stream is a part of.
 */
shaka.extern.StreamDBV2;


/**
 * @typedef {{
 *   startTime: number,
 *   endTime: number,
 *   dataKey: number
 * }}
 *
 * @property {number} startTime
 *   The start time of the segment, in seconds from the start of the Period.
 * @property {number} endTime
 *   The end time of the segment, in seconds from the start of the Period.
 * @property {number} dataKey
 *   The key to the data in storage.
 */
shaka.extern.SegmentDBV2;


/**
 * @typedef {{
 *   data: !ArrayBuffer
 * }}
 *
 * @property {!ArrayBuffer} data
 *   The data contents of the segment.
 */
shaka.extern.SegmentDataDBV2;
