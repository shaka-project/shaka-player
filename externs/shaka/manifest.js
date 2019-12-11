/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * @typedef {{
 *   presentationTimeline: !shaka.media.PresentationTimeline,
 *   periods: !Array.<!shaka.extern.Period>,
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
 * these Periods contains its own collection of Variants and text streams.
 * A variant is a combination of an audio and a video streams that can be played
 * together.
 * </p>
 *
 * <p>
 * A stream has the same logical content as another stream if the only
 * difference between the two is their quality. For example, an SD video stream
 * and an HD video stream that depict the same scene have the same logical
 * content; whereas an English audio stream and a French audio stream have
 * different logical contents. The player can automatically switch between
 * streams which have the same logical content to adapt to network conditions.
 * </p>
 *
 * @property {!shaka.media.PresentationTimeline} presentationTimeline
 *   <i>Required.</i> <br>
 *   The presentation timeline.
 * @property {!Array.<!shaka.extern.Period>} periods
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
shaka.extern.Manifest;


/**
 * @typedef {{
 *   startTime: number,
 *   variants: !Array.<shaka.extern.Variant>,
 *   textStreams: !Array.<shaka.extern.Stream>
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
 * @property {!Array.<shaka.extern.Variant>} variants
 *   <i>Required.</i> <br>
 *   The Period's Variants. There must be at least one Variant.
 * @property {!Array.<shaka.extern.Stream>} textStreams
 *   <i>Required.</i> <br>
 *   The Period's text streams.
 *
 * @exportDoc
 */
shaka.extern.Period;


/**
 * @typedef {{
 *   initData: !Uint8Array,
 *   initDataType: string,
 *   keyId: ?string
 * }}
 *
 * @description
 * Explicit initialization data, which override any initialization data in the
 * content. The initDataType values and the formats that they correspond to
 * are specified {@link https://bit.ly/EmeInitTypes here}.
 *
 * @property {!Uint8Array} initData
 *   Initialization data in the format indicated by initDataType.
 * @property {string} initDataType
 *   A string to indicate what format initData is in.
 * @property {?string} keyId
 *   The key Id that corresponds to this initData.
 *
 * @exportDoc
 */
shaka.extern.InitDataOverride;


/**
 * @typedef {{
 *   keySystem: string,
 *   licenseServerUri: string,
 *   distinctiveIdentifierRequired: boolean,
 *   persistentStateRequired: boolean,
 *   audioRobustness: string,
 *   videoRobustness: string,
 *   serverCertificate: Uint8Array,
 *   initData: Array.<!shaka.extern.InitDataOverride>,
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
 * @property {Array.<!shaka.extern.InitDataOverride>} initData
 *   <i>Defaults to [], e.g., no override.</i> <br>
 *   A list of initialization data which override any initialization data found
 *   in the content.  See also shaka.extern.InitDataOverride.
 * @property {Array.<string>} keyIds
 *   <i>Defaults to []</i> <br>
 *   If not empty, contains the default key IDs for this key system, as
 *   lowercase hex strings.
 * @exportDoc
 */
shaka.extern.DrmInfo;


/**
 * @typedef {{
 *   id: number,
 *   language: string,
 *   primary: boolean,
 *   audio: ?shaka.extern.Stream,
 *   video: ?shaka.extern.Stream,
 *   bandwidth: number,
 *   drmInfos: !Array.<shaka.extern.DrmInfo>,
 *   allowedByApplication: boolean,
 *   allowedByKeySystem: boolean
 * }}
 *
 * @description
 * A Variant describes a combination of an audio and video streams which
 * could be played together. It's possible to have a video/audio only
 * variant.
 *
 * @property {number} id
 *   <i>Required.</i> <br>
 *   A unique ID among all Variant objects within the same Manifest.
 * @property {string} language
 *   <i>Defaults to '' (i.e., unknown).</i> <br>
 *   The Variant's language, specified as a language code. <br>
 *   See {@link https://tools.ietf.org/html/rfc5646} <br>
 *   See {@link http://www.iso.org/iso/home/standards/language_codes.htm}
 * @property {boolean} primary
 *   <i>Defaults to false.</i> <br>
 *   True indicates that the player should use this Variant over others in the
 *   same Period. The player may still use another Variant to meet application
 *   preferences.
 * @property {?shaka.extern.Stream} audio
 *   The audio stream of the variant.
 * @property {?shaka.extern.Stream} video
 *   The video stream of the variant.
 * @property {number} bandwidth
 *   The variant's required bandwidth in bits per second.
 * @property {!Array.<!shaka.extern.DrmInfo>} drmInfos
 *   <i>Defaults to [] (i.e., no DRM).</i> <br>
 *   An array of DrmInfo objects which describe DRM schemes are compatible with
 *   the content.
 * @property {boolean} allowedByApplication
 *   <i>Defaults to true.</i><br>
 *   Set by the Player to indicate whether the variant is allowed to be played
 *   by the application.
 * @property {boolean} allowedByKeySystem
 *   <i>Defaults to true.</i><br>
 *   Set by the Player to indicate whether the variant is allowed to be played
 *   by the key system.
 *
 * @exportDoc
 */
shaka.extern.Variant;


/**
 * Creates a SegmentIndex; returns a Promise that resolves after the
 * SegmentIndex has been created.
 *
 * @typedef {function(): !Promise}
 * @exportDoc
 */
shaka.extern.CreateSegmentIndexFunction;


/**
 * @typedef {{
 *   id: number,
 *   originalId: ?string,
 *   createSegmentIndex: shaka.extern.CreateSegmentIndexFunction,
 *   segmentIndex: shaka.media.SegmentIndex,
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
 *   label: ?string,
 *   type: string,
 *   primary: boolean,
 *   trickModeVideo: ?shaka.extern.Stream,
 *   emsgSchemeIdUris: ?Array.<string>,
 *   roles: !Array.<string>,
 *   channelsCount: ?number,
 *   audioSamplingRate: ?number,
 *   closedCaptions: Map.<string, string>
 * }}
 *
 * @description
 * A Stream object describes a single stream (segmented media data).
 *
 * @property {number} id
 *   <i>Required.</i> <br>
 *   A unique ID among all Stream objects within the same Manifest.
 * @property {?string} originalId
 *   <i>Optional.</i> <br>
 *   The original ID, if any, that appeared in the manifest.  For example, in
 *   DASH, this is the "id" attribute of the Representation element.  In HLS,
 *   this is the "NAME" attribute.
 * @property {shaka.extern.CreateSegmentIndexFunction} createSegmentIndex
 *   <i>Required.</i> <br>
 *   Creates the Stream's segmentIndex (asynchronously).
 * @property {shaka.media.SegmentIndex} segmentIndex
 *   <i>Required.</i> <br>
 *   May be null until createSegmentIndex() is complete.
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
 *   The kind of text stream.  For example, 'caption' or 'subtitle'.
 *   @see https://bit.ly/TextKind
 * @property {boolean} encrypted
 *   <i>Defaults to false.</i><br>
 *   True if the stream is encrypted.
 * @property {?string} keyId
 *   <i>Defaults to null (i.e., unencrypted or key ID unknown).</i> <br>
 *   The stream's key ID as a lowercase hex string. This key ID identifies the
 *   encryption key that the browser (key system) can use to decrypt the stream.
 * @property {string} language
 *   The Stream's language, specified as a language code. <br>
 *   Audio stream's language must be identical to the language of the containing
 *   Variant.
 * @property {?string} label
 *   The Stream's label, unique text that should describe the audio/text track.
 * @property {string} type
 *   <i>Required.</i> <br>
 *   Content type (e.g. 'video', 'audio' or 'text')
 * @property {boolean} primary
 *   <i>Defaults to false.</i> <br>
 *   True indicates that the player should prefer this Stream over others
 *   in the same Period. The player may still use another Stream to meet
 *   application preferences.
 * @property {?shaka.extern.Stream} trickModeVideo
 *   <i>Video streams only.</i> <br>
 *   An alternate video stream to use for trick mode playback.
 * @property {?Array.<string>} emsgSchemeIdUris
 *   <i>Defaults to empty.</i><br>
 *   Array of registered emsg box scheme_id_uri that should result in
 *   Player events.
 * @property {!Array.<string>} roles
 *   The roles of the stream as they appear on the manifest,
 *   e.g. 'main', 'caption', or 'commentary'.
 * @property {?number} channelsCount
 *   The channel count information for the audio stream.
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content.
 * @property {Map.<string, string>} closedCaptions
 *   A map containing the description of closed captions, with the caption
 *   channel number (CC1 | CC2 | CC3 | CC4) as the key and the language code
 *   as the value. If the channel number is not provided by the description,
 *   we'll set an 0-based index as the key.
 *   Example: {'CC1': 'eng'; 'CC3': 'swe'}, or {'1', 'eng'; '2': 'swe'}, etc.
 * @exportDoc
 */
shaka.extern.Stream;
