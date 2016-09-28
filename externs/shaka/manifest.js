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
 *   presentationTimeline: !shaka.media.PresentationTimeline,
 *   periods: !Array.<!shakaExtern.Period>,
 *   offlineSessionIds: !Array.<string>,
 *   minBufferTime: number
 * }}
 *
 * @description
 * <p>
 * A Manifest object describes a collection of streams (segmented audio, video,
 * or text data) that share a common timeline. We call the collection of
 * streams "the presentation" and their timeline "the presentation timeline".
 * A Manifest describes one of two types of presentations: live and
 * video-on-demand.
 * </p>
 *
 * <p>
 * A live presentation begins at some point in time and either continues
 * indefinitely or ends when the presentation stops broadcasting. For a live
 * presentation, wall-clock time maps onto the presentation timeline, and the
 * current wall-clock time maps to the live-edge (AKA "the current presentation
 * time"). In contrast, a video-on-demand presentation exists entirely
 * independent of wall-clock time.
 * </p>
 *
 * <p>
 * The presentation timeline is divided into one or more Periods, and each of
 * these Periods contains its own collection of streams. Periods group their
 * streams by type (e.g., 'audio', 'video', or 'text') and logical content, and
 * each individual group defines a StreamSet.
 * </p>
 *
 * <p>
 * A stream has the same logical content as another stream if the only
 * difference between the two is their quality. For example, an SD video stream
 * and an HD video stream that depict the same scene have the same logical
 * content; whereas an English audio stream and a French audio stream have
 * different logical content. The player can automatically switch between
 * streams which have the same logical content to adapt to network conditions.
 * </p>
 *
 * @property {!shaka.media.PresentationTimeline} presentationTimeline
 *   <i>Required.</i> <br>
 *   The presentation timeline.
 * @property {!Array.<!shakaExtern.Period>} periods
 *   <i>Required.</i> <br>
 *   The presentation's Periods. There must be at least one Period.
 * @property {!Array.<string>} offlineSessionIds
 *   <i>Defaults to [].</i> <br>
 *   An array of EME sessions to load for offline playback.
 * @property {number} minBufferTime
 *   <i>Defaults to 0.</i> <br>
 *   The minimum number of seconds of content that must be buffered before
 *   playback can begin.  Can be overridden by a higher value from the Player
 *   configuration.
 *
 * @exportDoc
 */
shakaExtern.Manifest;


/**
 * @typedef {{
 *   startTime: number,
 *   streamSets: !Array.<shakaExtern.StreamSet>
 * }}
 *
 * @description
 * A Period object contains the Streams for part of the presentation.
 *
 * @property {number} startTime
 *   <i>Required.</i> <br>
 *   The Period's start time, in seconds, relative to the start of the
 *   presentation. The first Period must begin at the start of the
 *   presentation. The Period ends immediately before the next Period's start
 *   time or exactly at the end of the presentation timeline. Periods which
 *   begin after the end of the presentation timeline are ignored.
 * @property {!Array.<shakaExtern.StreamSet>} streamSets
 *   <i>Required.</i> <br>
 *   The Period's StreamSets. There must be at least one StreamSet.
 *
 * @exportDoc
 */
shakaExtern.Period;


/**
 * @typedef {{
 *   initData: !Uint8Array,
 *   initDataType: string
 * }}
 *
 * @description
 * Explicit initialization data, which override any initialization data in the
 * content. The initDataType values and the formats that they correspond to
 * are specified {@link https://goo.gl/TNjYwn here}.
 *
 * @property {!Uint8Array} initData
 *   Initialization data in the format indicated by initDataType.
 * @property {string} initDataType
 *   A string to indicate what format initData is in.
 *
 * @exportDoc
 */
shakaExtern.InitDataOverride;


/**
 * @typedef {{
 *   keySystem: string,
 *   licenseServerUri: string,
 *   distinctiveIdentifierRequired: boolean,
 *   persistentStateRequired: boolean,
 *   audioRobustness: string,
 *   videoRobustness: string,
 *   serverCertificate: Uint8Array,
 *   initData: Array.<!shakaExtern.InitDataOverride>,
 *   keyIds: Array.<string>
 * }}
 *
 * @description
 * DRM configuration for a single key system.
 *
 * @property {string} keySystem
 *   <i>Required.</i> <br>
 *   The key system, e.g., "com.widevine.alpha".
 * @property {string} licenseServerUri
 *   <i>Filled in by DRM config if missing.</i> <br>
 *   The license server URI.
 * @property {boolean} distinctiveIdentifierRequired
 *   <i>Defaults to false.  Can be filled in by advanced DRM config.</i> <br>
 *   True if the application requires the key system to support distinctive
 *   identifiers.
 * @property {boolean} persistentStateRequired
 *   <i>Defaults to false.  Can be filled in by advanced DRM config.</i> <br>
 *   True if the application requires the key system to support persistent
 *   state, e.g., for persistent license storage.
 * @property {string} audioRobustness
 *   <i>Defaults to '', e.g., no specific robustness required.  Can be filled in
 *   by advanced DRM config.</i> <br>
 *   A key-system-specific string that specifies a required security level.
 * @property {string} videoRobustness
 *   <i>Defaults to '', e.g., no specific robustness required.  Can be filled in
 *   by advanced DRM config.</i> <br>
 *   A key-system-specific string that specifies a required security level.
 * @property {Uint8Array} serverCertificate
 *   <i>Defaults to null, e.g., certificate will be requested from the license
 *   server if required.  Can be filled in by advanced DRM config.</i> <br>
 *   A key-system-specific server certificate used to encrypt license requests.
 *   Its use is optional and is meant as an optimization to avoid a round-trip
 *   to request a certificate.
 * @property {Array.<!shakaExtern.InitDataOverride>} initData
 *   <i>Defaults to [], e.g., no override.</i> <br>
 *   A list of initialization data which override any initialization data found
 *   in the content.  See also shakaExtern.InitDataOverride.
 * @property {Array.<string>} keyIds
 *   <i>Defaults to []</i> <br>
 *   If not empty, contains the default key IDs for this key system.
 * @exportDoc
 */
shakaExtern.DrmInfo;


/**
 * @typedef {{
 *   language: string,
 *   type: string,
 *   primary: boolean,
 *   drmInfos: Array.<!shakaExtern.DrmInfo>,
 *   streams: !Array.<!shakaExtern.Stream>
 * }}
 *
 * @description
 * A StreamSet object contains a set of Streams which have the same type,
 * container/format, and logical content. A StreamSet's type and
 * container/format define its MIME type.
 *
 * @property {string} language
 *   <i>Defaults to '' (i.e., unknown).</i> <br>
 *   The Streams' language, specified as a language code. <br>
 *   See {@link https://tools.ietf.org/html/rfc5646} <br>
 *   See {@link http://www.iso.org/iso/home/standards/language_codes.htm}
 * @property {string} type
 *   <i>Required.</i> <br>
 *   The Streams' type, e.g., 'audio', 'video', or 'text'.
 * @property {boolean} primary
 *   <i>Defaults to false.</i> <br>
 *   True indicates that the player should use this StreamSet over others of
 *   the same type in the same Period. However, the player may use another
 *   StreamSet to meet application preferences, or to achieve better MIME type
 *   or DRM compatibility among other StreamSets.
 * @property {Array.<!shakaExtern.DrmInfo>} drmInfos
 *   <i>Defaults to [] (i.e., no DRM).</i> <br>
 *   An array of DrmInfo objects which describe DRM schemes are compatible with
 *   the content.
 * @property {!Array.<!shakaExtern.Stream>} streams
 *   <i>Required.</i> <br>
 *   The StreamSets's Streams. There must be at least one Stream.
 *
 * @exportDoc
 */
shakaExtern.StreamSet;


/**
 * Creates a SegmentIndex; returns a Promise that resolves after the
 * SegmentIndex has been created.
 *
 * @typedef {function(): !Promise}
 * @exportDoc
 */
shakaExtern.CreateSegmentIndexFunction;


/**
 * Finds the position of the segment for the given time, in seconds, relative
 * to the start of a particular Period; returns null if the position of the
 * segment could not be determined. Note: the position of a segment is unique
 * only among segments within the same Period.
 *
 * @typedef {function(number): ?number}
 * @exportDoc
 */
shakaExtern.FindSegmentPositionFunction;


/**
 * Gets the SegmentReference for the segment at the given position; returns
 * null if no such SegmentReference exists. Note: the position of a segment is
 * unique only among segments within the same Period.

 * @typedef {function(number): shaka.media.SegmentReference}
 * @exportDoc
 */
shakaExtern.GetSegmentReferenceFunction;


/**
 * @typedef {{
 *   id: number,
 *   createSegmentIndex: shakaExtern.CreateSegmentIndexFunction,
 *   findSegmentPosition: shakaExtern.FindSegmentPositionFunction,
 *   getSegmentReference: shakaExtern.GetSegmentReferenceFunction,
 *   initSegmentReference: shaka.media.InitSegmentReference,
 *   presentationTimeOffset: (number|undefined),
 *   mimeType: string,
 *   codecs: string,
 *   frameRate: (number|undefined),
 *   bandwidth: (number|undefined),
 *   width: (number|undefined),
 *   height: (number|undefined),
 *   kind: (string|undefined),
 *   encrypted: boolean,
 *   keyId: ?string,
 *   language: string,
 *   allowedByApplication: boolean,
 *   allowedByKeySystem: boolean
 * }}
 *
 * @description
 * A Stream object describes a single stream (segmented media data).
 *
 * @property {number} id
 *   <i>Required.</i> <br>
 *   A unique ID among all Stream objects within the same Manifest.
 * @property {shakaExtern.CreateSegmentIndexFunction} createSegmentIndex
 *   <i>Required.</i> <br>
 *   Creates the Stream's SegmentIndex (asynchronously).
 * @property {shakaExtern.FindSegmentPositionFunction} findSegmentPosition
 *   <i>Required.</i> <br>
 *   Finds the position of the segment for the given time. The caller must call
 *   createSegmentIndex() and wait until the returned Promise resolves before
 *   calling this function.
 * @property {shakaExtern.GetSegmentReferenceFunction} getSegmentReference
 *   <i>Required.</i> <br>
 *   Gets the SegmentReference for the segment at the given position. The
 *   caller must call createSegmentIndex() and wait until the returned Promise
 *   resolves before calling this function.
 * @property {shaka.media.InitSegmentReference} initSegmentReference
 *   The Stream's initialization segment metadata, or null if the segments are
 *   self-initializing.
 * @property {(number|undefined)} presentationTimeOffset
 *   <i>Defaults to 0.</i> <br>
 *   The amount of time, in seconds, that the stream's presentation timestamps
 *   are offset from the start of the Stream's Period, i.e., this value should
 *   equal the first presentation timestamp of the first frame/sample in the
 *   period. <br>
 *   <br>
 *   For example, for MP4 based streams, this value should equal the first
 *   segment's tfdt box's 'baseMediaDecodeTime' field (after it has been
 *   converted to seconds).
 * @property {string} mimeType
 *   <i>Required.</i> <br>
 *   The Stream's MIME type, e.g., 'audio/mp4', 'video/webm', or 'text/vtt'.
 * @property {string} codecs
 *   <i>Defaults to '' (i.e., unknown / not needed).</i> <br>
 *   The Stream's codecs, e.g., 'avc1.4d4015' or 'vp9', which must be
 *   compatible with the Stream's MIME type. <br>
 *   See {@link https://tools.ietf.org/html/rfc6381}
 * @property {(number|undefined)} frameRate
 *   <i>Video streams only.</i> <br>
 *   The Stream's framerate in frames per second
 * @property {(number|undefined)} bandwidth
 *   <i>Audio and video streams only.</i> <br>
 *   The stream's required bandwidth in bits per second.
 * @property {(number|undefined)} width
 *   <i>Video streams only.</i> <br>
 *   The stream's width in pixels.
 * @property {(number|undefined)} height
 *   <i>Video streams only.</i> <br>
 *   The stream's height in pixels.
 * @property {(string|undefined)} kind
 *   <i>Text streams only.</i> <br>
 *   The kind of text stream.  For example, 'captions' or 'subtitles'.
 *   @see https://goo.gl/k1HWA6
 * @property {boolean} encrypted
 *   <i>Defaults to false.</i><br>
 *   True if the stream is encrypted.
 * @property {?string} keyId
 *   <i>Defaults to null (i.e., unencrypted or key ID unknown).</i> <br>
 *   The stream's key ID as a lowercase hex string. This key ID identifies the
 *   encryption key that the browser (key system) can use to decrypt the
 *   stream.
 * @property {string} language
 *   The Stream's language, specified as a language code. <br>
 *   Must be identical to the language of the containing StreamSet.
 * @property {boolean} allowedByApplication
 *   <i>Defaults to true.</i><br>
 *   Set by the Player to indicate whether the stream is allowed to be played
 *   by the application.
 * @property {boolean} allowedByKeySystem
 *   <i>Defaults to true.</i><br>
 *   Set by the Player to indicate whether the stream is allowed to be played
 *   by the key system.
 *
 * @exportDoc
 */
shakaExtern.Stream;
