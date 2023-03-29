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
 *   timestamp: number,
 *   id: number,
 *   type: string,
 *   fromAdaptation: boolean,
 *   bandwidth: ?number
 * }}
 *
 * @property {number} timestamp
 *   The timestamp the choice was made, in seconds since 1970
 *   (i.e. <code>Date.now() / 1000</code>).
 * @property {number} id
 *   The id of the track that was chosen.
 * @property {string} type
 *   The type of track chosen (<code>'variant'</code> or <code>'text'</code>).
 * @property {boolean} fromAdaptation
 *   <code>true</code> if the choice was made by AbrManager for adaptation;
 *   <code>false</code> if it was made by the application through
 *   <code>selectTrack</code>.
 * @property {?number} bandwidth
 *   The bandwidth of the chosen track (<code>null</code> for text).
 * @exportDoc
 */
shaka.extern.TrackChoice;


/**
 * @typedef {{
 *   timestamp: number,
 *   state: string,
 *   duration: number
 * }}
 *
 * @property {number} timestamp
 *   The timestamp the state was entered, in seconds since 1970
 *   (i.e. <code>Date.now() / 1000</code>).
 * @property {string} state
 *   The state the player entered.  This could be <code>'buffering'</code>,
 *   <code>'playing'</code>, <code>'paused'</code>, or <code>'ended'</code>.
 * @property {number} duration
 *   The number of seconds the player was in this state.  If this is the last
 *   entry in the list, the player is still in this state, so the duration will
 *   continue to increase.
 * @exportDoc
 */
shaka.extern.StateChange;


/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   streamBandwidth: number,
 *
 *   decodedFrames: number,
 *   droppedFrames: number,
 *   corruptedFrames: number,
 *   estimatedBandwidth: number,
 *
 *   completionPercent: number,
 *   loadLatency: number,
 *   manifestTimeSeconds: number,
 *   drmTimeSeconds: number,
 *   playTime: number,
 *   pauseTime: number,
 *   bufferingTime: number,
 *   licenseTime: number,
 *   liveLatency: number,
 *
 *   maxSegmentDuration: number,
 *
 *   gapsJumped: number,
 *   stallsDetected: number,
 *
 *   switchHistory: !Array.<shaka.extern.TrackChoice>,
 *   stateHistory: !Array.<shaka.extern.StateChange>
 * }}
 *
 * @description
 * Contains statistics and information about the current state of the player.
 * This is meant for applications that want to log quality-of-experience (QoE)
 * or other stats.  These values will reset when <code>load()</code> is called
 * again.
 *
 * @property {number} width
 *   The width of the current video track.
 * @property {number} height
 *   The height of the current video track.
 * @property {number} streamBandwidth
 *   The bandwidth required for the current streams (total, in bit/sec).
 *   It takes into account the playbackrate.
 *
 * @property {number} decodedFrames
 *   The total number of frames decoded by the Player.  This may be
 *   <code>NaN</code> if this is not supported by the browser.
 * @property {number} droppedFrames
 *   The total number of frames dropped by the Player.  This may be
 *   <code>NaN</code> if this is not supported by the browser.
 * @property {number} corruptedFrames
 *   The total number of corrupted frames dropped by the browser.  This may be
 *   <code>NaN</code> if this is not supported by the browser.
 * @property {number} estimatedBandwidth
 *   The current estimated network bandwidth (in bit/sec).
 *
 * @property {number} gapsJumped
 *   The total number of playback gaps jumped by the GapJumpingController.
 * @property {number} stallsDetected
 *   The total number of playback stalls detected by the StallDetector.
 *
 * @property {number} completionPercent
 *   This is the greatest completion percent that the user has experienced in
 *   playback.  Also known as the "high water mark".  Is NaN when there is no
 *   known duration, such as for livestreams.
 * @property {number} loadLatency
 *   This is the number of seconds it took for the video element to have enough
 *   data to begin playback.  This is measured from the time load() is called to
 *   the time the <code>'loadeddata'</code> event is fired by the media element.
 * @property {number} manifestTimeSeconds
 *   The amount of time it took to download and parse the manifest.
 * @property {number} drmTimeSeconds
 *   The amount of time it took to download the first drm key, and load that key
 *   into the drm system.
 * @property {number} playTime
 *   The total time spent in a playing state in seconds.
 * @property {number} pauseTime
 *   The total time spent in a paused state in seconds.
 * @property {number} bufferingTime
 *   The total time spent in a buffering state in seconds.
 * @property {number} licenseTime
 *   The time spent on license requests during this session in seconds, or NaN.
 * @property {number} liveLatency
 *   The time between the capturing of a frame and the end user having it
 *   displayed on their screen.
 *
 * @property {number} maxSegmentDuration
 *   The presentation's max segment duration in seconds, or NaN.
 *
 * @property {!Array.<shaka.extern.TrackChoice>} switchHistory
 *   A history of the stream changes.
 * @property {!Array.<shaka.extern.StateChange>} stateHistory
 *   A history of the state changes.
 * @exportDoc
 */
shaka.extern.Stats;


/**
 * @typedef {{
 *   start: number,
 *   end: number
 * }}
 *
 * @description
 * Contains the times of a range of buffered content.
 *
 * @property {number} start
 *   The start time of the range, in seconds.
 * @property {number} end
 *   The end time of the range, in seconds.
 * @exportDoc
 */
shaka.extern.BufferedRange;


/**
 * @typedef {{
 *   total: !Array.<shaka.extern.BufferedRange>,
 *   audio: !Array.<shaka.extern.BufferedRange>,
 *   video: !Array.<shaka.extern.BufferedRange>,
 *   text: !Array.<shaka.extern.BufferedRange>
 * }}
 *
 * @description
 * Contains information about the current buffered ranges.
 *
 * @property {!Array.<shaka.extern.BufferedRange>} total
 *   The combined audio/video buffered ranges, reported by
 *   <code>video.buffered</code>.
 * @property {!Array.<shaka.extern.BufferedRange>} audio
 *   The buffered ranges for audio content.
 * @property {!Array.<shaka.extern.BufferedRange>} video
 *   The buffered ranges for video content.
 * @property {!Array.<shaka.extern.BufferedRange>} text
 *   The buffered ranges for text content.
 * @exportDoc
 */
shaka.extern.BufferedInfo;


/**
 * @typedef {{
 *   id: number,
 *   active: boolean,
 *
 *   type: string,
 *   bandwidth: number,
 *
 *   language: string,
 *   label: ?string,
 *   kind: ?string,
 *   width: ?number,
 *   height: ?number,
 *   frameRate: ?number,
 *   pixelAspectRatio: ?string,
 *   hdr: ?string,
 *   mimeType: ?string,
 *   audioMimeType: ?string,
 *   videoMimeType: ?string,
 *   codecs: ?string,
 *   audioCodec: ?string,
 *   videoCodec: ?string,
 *   primary: boolean,
 *   roles: !Array.<string>,
 *   audioRoles: Array.<string>,
 *   forced: boolean,
 *   videoId: ?number,
 *   audioId: ?number,
 *   channelsCount: ?number,
 *   audioSamplingRate: ?number,
 *   tilesLayout: ?string,
 *   audioBandwidth: ?number,
 *   videoBandwidth: ?number,
 *   spatialAudio: boolean,
 *   originalVideoId: ?string,
 *   originalAudioId: ?string,
 *   originalTextId: ?string,
 *   originalImageId: ?string
 * }}
 *
 * @description
 * An object describing a media track.  This object should be treated as
 * read-only as changing any values does not have any effect.  This is the
 * public view of an audio/video paring (variant type) or text track (text
 * type) or image track (image type).
 *
 * @property {number} id
 *   The unique ID of the track.
 * @property {boolean} active
 *   If true, this is the track being streamed (another track may be
 *   visible/audible in the buffer).
 *
 * @property {string} type
 *   The type of track, either <code>'variant'</code> or <code>'text'</code>
 *   or <code>'image'</code>.
 * @property {number} bandwidth
 *   The bandwidth required to play the track, in bits/sec.
 *
 * @property {string} language
 *   The language of the track, or <code>'und'</code> if not given.  This is the
 *   exact value provided in the manifest; it may need to be normalized.
 * @property {?string} label
 *   The track label, which is unique text that should describe the track.
 * @property {?string} kind
 *   (only for text tracks) The kind of text track, either
 *   <code>'caption'</code> or <code>'subtitle'</code>.
 * @property {?number} width
 *   The video width provided in the manifest, if present.
 * @property {?number} height
 *   The video height provided in the manifest, if present.
 * @property {?number} frameRate
 *   The video framerate provided in the manifest, if present.
 * @property {?string} pixelAspectRatio
 *   The video pixel aspect ratio provided in the manifest, if present.
 * @property {?string} hdr
 *   The video HDR provided in the manifest, if present.
 * @property {?string} mimeType
 *   The MIME type of the content provided in the manifest.
 * @property {?string} audioMimeType
 *   The audio MIME type of the content provided in the manifest.
 * @property {?string} videoMimeType
 *   The video MIME type of the content provided in the manifest.
 * @property {?string} codecs
 *   The audio/video codecs string provided in the manifest, if present.
 * @property {?string} audioCodec
 *   The audio codecs string provided in the manifest, if present.
 * @property {?string} videoCodec
 *   The video codecs string provided in the manifest, if present.
 * @property {boolean} primary
 *   True indicates that this in the primary language for the content.
 *   This flag is based on signals from the manifest.
 *   This can be a useful hint about which language should be the default, and
 *   indicates which track Shaka will use when the user's language preference
 *   cannot be satisfied.
 * @property {!Array.<string>} roles
 *   The roles of the track, e.g. <code>'main'</code>, <code>'caption'</code>,
 *   or <code>'commentary'</code>.
 * @property {Array.<string>} audioRoles
 *   The roles of the audio in the track, e.g. <code>'main'</code> or
 *   <code>'commentary'</code>. Will be null for text tracks or variant tracks
 *   without audio.
 * @property {boolean} forced
 *   True indicates that this in the forced text language for the content.
 *   This flag is based on signals from the manifest.
 * @property {?number} videoId
 *   (only for variant tracks) The video stream id.
 * @property {?number} audioId
 *   (only for variant tracks) The audio stream id.
 * @property {?number} channelsCount
 *   The count of the audio track channels.
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content.
 * @property {?string} tilesLayout
 *   The value is a grid-item-dimension consisting of two positive decimal
 *   integers in the format: column-x-row ('4x3'). It describes the arrangement
 *   of Images in a Grid. The minimum valid LAYOUT is '1x1'.
 * @property {boolean} spatialAudio
 *   True indicates that the content has spatial audio.
 *   This flag is based on signals from the manifest.
 * @property {?number} audioBandwidth
 *   (only for variant tracks) The audio stream's bandwidth if known.
 * @property {?number} videoBandwidth
 *   (only for variant tracks) The video stream's bandwidth if known.
 * @property {?string} originalVideoId
 *   (variant tracks only) The original ID of the video part of the track, if
 *   any, as it appeared in the original manifest.
 * @property {?string} originalAudioId
 *   (variant tracks only) The original ID of the audio part of the track, if
 *   any, as it appeared in the original manifest.
 * @property {?string} originalTextId
 *   (text tracks only) The original ID of the text track, if any, as it
 *   appeared in the original manifest.
 * @property {?string} originalImageId
 *   (image tracks only) The original ID of the image track, if any, as it
 *   appeared in the original manifest.
 * @exportDoc
 */
shaka.extern.Track;


/**
 * @typedef {!Array.<!shaka.extern.Track>}
 */
shaka.extern.TrackList;


/**
 * @typedef {{
 *   minWidth: number,
 *   maxWidth: number,
 *   minHeight: number,
 *   maxHeight: number,
 *   minPixels: number,
 *   maxPixels: number,
 *
 *   minFrameRate: number,
 *   maxFrameRate: number,
 *
 *   minBandwidth: number,
 *   maxBandwidth: number
 * }}
 *
 * @description
 * An object describing application restrictions on what tracks can play.  All
 * restrictions must be fulfilled for a track to be playable/selectable.
 * The restrictions system behaves somewhat differently at the ABR level and the
 * player level, so please refer to the documentation for those specific
 * settings.
 *
 * @see shaka.extern.PlayerConfiguration
 * @see shaka.extern.AbrConfiguration
 *
 * @property {number} minWidth
 *   The minimum width of a video track, in pixels.
 * @property {number} maxWidth
 *   The maximum width of a video track, in pixels.
 * @property {number} minHeight
 *   The minimum height of a video track, in pixels.
 * @property {number} maxHeight
 *   The maximum height of a video track, in pixels.
 * @property {number} minPixels
 *   The minimum number of total pixels in a video track (i.e.
 *   <code>width * height</code>).
 * @property {number} maxPixels
 *   The maximum number of total pixels in a video track (i.e.
 *   <code>width * height</code>).
 *
 * @property {number} minFrameRate
 *   The minimum framerate of a variant track.
 * @property {number} maxFrameRate
 *   The maximum framerate of a variant track.
 *
 * @property {number} minBandwidth
 *   The minimum bandwidth of a variant track, in bit/sec.
 * @property {number} maxBandwidth
 *   The maximum bandwidth of a variant track, in bit/sec.
 * @exportDoc
 */
shaka.extern.Restrictions;


/**
 * @typedef {{
 *   persistentState: boolean
 * }}
 *
 * @property {boolean} persistentState
 *   Whether this key system supports persistent state.
 * @exportDoc
 */
shaka.extern.DrmSupportType;


/**
 * @typedef {{
 *   manifest: !Object.<string, boolean>,
 *   media: !Object.<string, boolean>,
 *   drm: !Object.<string, ?shaka.extern.DrmSupportType>
 * }}
 *
 * @description
 * An object detailing browser support for various features.
 *
 * @property {!Object.<string, boolean>} manifest
 *   A map of supported manifest types.
 *   The keys are manifest MIME types and file extensions.
 * @property {!Object.<string, boolean>} media
 *   A map of supported media types.
 *   The keys are media MIME types.
 * @property {!Object.<string, ?shaka.extern.DrmSupportType>} drm
 *   A map of supported key systems.
 *   The keys are the key system names.  The value is <code>null</code> if it is
 *   not supported.  Key systems not probed will not be in this dictionary.
 *
 * @exportDoc
 */
shaka.extern.SupportType;

/**
 * @typedef {{
 *   cueTime: ?number,
 *   data: !Uint8Array,
 *   frames: !Array.<shaka.extern.MetadataFrame>,
 *   dts: ?number,
 *   pts: ?number
 * }}
 *
 * @description
 * ID3 metadata in format defined by
 * https://id3.org/id3v2.3.0#Declared_ID3v2_frames
 * The content of the field.
 *
 * @property {?number} cueTime
 * @property {!Uint8Array} data
 * @property {!Array.<shaka.extern.MetadataFrame>} frames
 * @property {?number} dts
 * @property {?number} pts
 *
 * @exportDoc
 */
shaka.extern.ID3Metadata;


/**
 * @typedef {{
 *   type: string,
 *   size: number,
 *   data: Uint8Array
 * }}
 *
 * @description metadata raw frame.
 * @property {string} type
 * @property {number} size
 * @property {Uint8Array} data
 * @exportDoc
 */
shaka.extern.MetadataRawFrame;


/**
 * @typedef {{
 *   key: string,
 *   data: (ArrayBuffer|string|number),
 *   description: string
 * }}
 *
 * @description metadata frame parsed.
 * @property {string} key
 * @property {ArrayBuffer|string|number} data
 * @property {string} description
 * @exportDoc
 */
shaka.extern.MetadataFrame;


/**
 * @typedef {{
 *   schemeIdUri: string,
 *   value: string,
 *   startTime: number,
 *   endTime: number,
 *   id: string,
 *   eventElement: Element
 * }}
 *
 * @description
 * Contains information about a region of the timeline that will cause an event
 * to be raised when the playhead enters or exits it.  In DASH this is the
 * EventStream element.
 *
 * @property {string} schemeIdUri
 *   Identifies the message scheme.
 * @property {string} value
 *   Specifies the value for the region.
 * @property {number} startTime
 *   The presentation time (in seconds) that the region should start.
 * @property {number} endTime
 *   The presentation time (in seconds) that the region should end.
 * @property {string} id
 *   Specifies an identifier for this instance of the region.
 * @property {Element} eventElement
 *   The XML element that defines the Event.
 * @exportDoc
 */
shaka.extern.TimelineRegionInfo;

/**
 * @typedef {{
 *   audioSamplingRate: ?number,
 *   bandwidth: number,
 *   codecs: string,
 *   contentType: string,
 *   frameRate: ?number,
 *   height: ?number,
 *   mimeType: ?string,
 *   channelsCount: ?number,
 *   pixelAspectRatio: ?string,
 *   width: ?number
 * }}
 *
 * @description
 * Contains information about the quality of an audio or video media stream.
 *
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content.
 * @property {number} bandwidth
 *   The bandwidth in bits per second.
 * @property {string} codecs
 *   The Stream's codecs, e.g., 'avc1.4d4015' or 'vp9', which must be
 * compatible with the Stream's MIME type.
 * @property {string} contentType
 *   The type of content, which may be "video" or "audio".
 * @property {?number} frameRate
 *   The video frame rate.
 * @property {?number} height
 *   The video height in pixels.
 * @property {string} mimeType
 *   The MIME type.
 * @property {?number} channelsCount
 *   The number of audio channels, or null if unknown.
 * @property {?string} pixelAspectRatio
 *   The pixel aspect ratio value; e.g "1:1".
 * @property {?number} width
 *   The video width in pixels.
 * @exportDoc
 */
shaka.extern.MediaQualityInfo;


/**
 * @typedef {{
 *   schemeIdUri: string,
 *   value: string,
 *   startTime: number,
 *   endTime: number,
 *   timescale: number,
 *   presentationTimeDelta: number,
 *   eventDuration: number,
 *   id: number,
 *   messageData: Uint8Array
 * }}
 *
 * @description
 * Contains information about an EMSG MP4 box.
 *
 * @property {string} schemeIdUri
 *   Identifies the message scheme.
 * @property {string} value
 *   Specifies the value for the event.
 * @property {number} startTime
 *   The time that the event starts (in presentation time).
 * @property {number} endTime
 *   The time that the event ends (in presentation time).
 * @property {number} timescale
 *   Provides the timescale, in ticks per second.
 * @property {number} presentationTimeDelta
 *   The offset that the event starts, relative to the start of the segment
 *   this is contained in (in units of timescale).
 * @property {number} eventDuration
 *   The duration of the event (in units of timescale).
 * @property {number} id
 *   A field identifying this instance of the message.
 * @property {Uint8Array} messageData
 *   Body of the message.
 * @exportDoc
 */
shaka.extern.EmsgInfo;


/**
 * @typedef {{
 *   wallClockTime: number,
 *   programStartDate: Date
 * }}
 *
 * @description
 * Contains information about an PRFT MP4 box.
 *
 * @property {number} wallClockTime
 *   A UTC timestamp corresponding to decoding time in milliseconds.
 * @property {Date} programStartDate
 *   The derived start date of the program.
 * @exportDoc
 */
shaka.extern.ProducerReferenceTime;


/**
 * @typedef {{
 *   distinctiveIdentifierRequired: boolean,
 *   persistentStateRequired: boolean,
 *   videoRobustness: string,
 *   audioRobustness: string,
 *   serverCertificate: Uint8Array,
 *   serverCertificateUri: string,
 *   individualizationServer: string,
 *   sessionType: string
 * }}
 *
 * @property {boolean} distinctiveIdentifierRequired
 *   <i>Defaults to false.</i> <br>
 *   True if the application requires the key system to support distinctive
 *   identifiers.
 * @property {boolean} persistentStateRequired
 *   <i>Defaults to false.</i> <br>
 *   True if the application requires the key system to support persistent
 *   state, e.g., for persistent license storage.
 * @property {string} videoRobustness
 *   A key-system-specific string that specifies a required security level for
 *   video.
 *   <i>Defaults to <code>''</code>, i.e., no specific robustness required.</i>
 * @property {string} audioRobustness
 *   A key-system-specific string that specifies a required security level for
 *   audio.
 *   <i>Defaults to <code>''</code>, i.e., no specific robustness required.</i>
 * @property {Uint8Array} serverCertificate
 *   <i>Defaults to null.</i> <br>
 *   <i>An empty certificate (<code>byteLength==0</code>) will be treated as
 *   <code>null</code>.</i> <br>
 *   <i>A certificate will be requested from the license server if
 *   required.</i> <br>
 *   A key-system-specific server certificate used to encrypt license requests.
 *   Its use is optional and is meant as an optimization to avoid a round-trip
 *   to request a certificate.
 * @property {string} serverCertificateUri
 *   <i>Defaults to <code>''</code>.</i><br>
 *   If given, will make a request to the given URI to get the server
 *   certificate. This is ignored if <code>serverCertificate</code> is set.
 * @property {string} individualizationServer
 *   The server that handles an <code>'individualiation-request'</code>.  If the
 *   server isn't given, it will default to the license server.
 * @property {string} sessionType
 *   <i>Defaults to <code>'temporary'</code> for streaming.</i> <br>
 *   The MediaKey session type to create streaming licenses with.  This doesn't
 *   affect offline storage.
 *
 * @exportDoc
 */
shaka.extern.AdvancedDrmConfiguration;


/**
 * @typedef {{
 *   retryParameters: shaka.extern.RetryParameters,
 *   servers: !Object.<string, string>,
 *   clearKeys: !Object.<string, string>,
 *   delayLicenseRequestUntilPlayed: boolean,
 *   advanced: Object.<string, shaka.extern.AdvancedDrmConfiguration>,
 *   initDataTransform:
 *       ((function(!Uint8Array, string, ?shaka.extern.DrmInfo):!Uint8Array)|
 *         undefined),
 *   logLicenseExchange: boolean,
 *   updateExpirationTime: number,
 *   preferredKeySystems: !Array.<string>,
 *   keySystemsMapping: !Object.<string, string>,
 *   parseInbandPsshEnabled: boolean,
 *   minHdcpVersion: string
 * }}
 *
 * @property {shaka.extern.RetryParameters} retryParameters
 *   Retry parameters for license requests.
 * @property {!Object.<string, string>} servers
 *   <i>Required for all but the clear key CDM.</i> <br>
 *   A dictionary which maps key system IDs to their license servers.
 *   For example,
 *   <code>{'com.widevine.alpha': 'https://example.com/drm'}</code>.
 * @property {!Object.<string, string>} clearKeys
 *   <i>Forces the use of the Clear Key CDM.</i>
 *   A map of key IDs (hex or base64) to keys (hex or base64).
 * @property {boolean} delayLicenseRequestUntilPlayed
 *   <i>Defaults to false.</i> <br>
 *   True to configure drm to delay sending a license request until a user
 *   actually starts playing content.
 * @property {Object.<string, shaka.extern.AdvancedDrmConfiguration>} advanced
 *   <i>Optional.</i> <br>
 *   A dictionary which maps key system IDs to advanced DRM configuration for
 *   those key systems.
 * @property
 *     {((function(!Uint8Array, string, ?shaka.extern.DrmInfo):!Uint8Array)|
 *        undefined)}
 *   initDataTransform
 *   <i>Optional.</i><br>
 *   If given, this function is called with the init data from the
 *   manifest/media and should return the (possibly transformed) init data to
 *   pass to the browser.
 * @property {boolean} logLicenseExchange
 *   <i>Optional.</i><br>
 *   If set to <code>true</code>, prints logs containing the license exchange.
 *   This includes the init data, request, and response data, printed as base64
 *   strings.  Don't use in production, for debugging only; has no affect in
 *   release builds as logging is removed.
 * @property {number} updateExpirationTime
 *   <i>Defaults to 1.</i> <br>
 *   The frequency in seconds with which to check the expiration of a session.
 * @property {!Array.<string>} preferredKeySystems
 *   <i>Defaults to an empty array. </i> <br>
 *   Specifies the priorties of available DRM key systems.
 * @property {Object.<string, string>} keySystemsMapping
 *   A map of key system name to key system name.
 * @property {boolean} parseInbandPsshEnabled
 *   <i>Defaults to true on Xbox One, and false for all other browsers.</i><br>
 *   When true parse DRM init data from pssh boxes in media and init segments
 *   and ignore 'encrypted' events.
 *   This is required when using in-band key rotation on Xbox One.
 * @property {string} minHdcpVersion
 *   <i>By default (''), do not check the HDCP version.</i><br>
 *   Indicates the minimum version of HDCP to start the playback of encrypted
 *   streams. <b>May be ignored if not supported by the device.</b>
 *
 * @exportDoc
 */
shaka.extern.DrmConfiguration;


/**
 * @typedef {{
 *   clockSyncUri: string,
 *   ignoreDrmInfo: boolean,
 *   disableXlinkProcessing: boolean,
 *   xlinkFailGracefully: boolean,
 *   ignoreMinBufferTime: boolean,
 *   autoCorrectDrift: boolean,
 *   initialSegmentLimit: number,
 *   ignoreSuggestedPresentationDelay: boolean,
 *   ignoreEmptyAdaptationSet: boolean,
 *   ignoreMaxSegmentDuration: boolean,
 *   keySystemsByURI: !Object.<string, string>,
 *   manifestPreprocessor: function(!Element),
 *   sequenceMode: boolean
 * }}
 *
 * @property {string} clockSyncUri
 *   A default clock sync URI to be used with live streams which do not
 *   contain any clock sync information.  The <code>Date</code> header from this
 *   URI will be used to determine the current time.
 * @property {boolean} ignoreDrmInfo
 *   If true will cause DASH parser to ignore DRM information specified
 *   by the manifest and treat it as if it signaled no particular key
 *   system and contained no init data. Defaults to false if not provided.
 * @property {boolean} disableXlinkProcessing
 *   If true, xlink-related processing will be disabled. Defaults to
 *   <code>false</code> if not provided.
 * @property {boolean} xlinkFailGracefully
 *   If true, xlink-related errors will result in a fallback to the tag's
 *   existing contents. If false, xlink-related errors will be propagated
 *   to the application and will result in a playback failure. Defaults to
 *   false if not provided.
 * @property {boolean} ignoreMinBufferTime
 *   If true will cause DASH parser to ignore <code>minBufferTime</code> from
 *   manifest. It allows player config to take precedence over manifest for
 *   <code>rebufferingGoal</code>. Defaults to <code>false</code> if not
 *   provided.
 * @property {boolean} autoCorrectDrift
 *   If <code>true</code>, ignore the <code>availabilityStartTime</code> in the
 *   manifest and instead use the segments to determine the live edge.  This
 *   allows us to play streams that have a lot of drift.  If <code>false</code>,
 *   we can't play content where the manifest specifies segments in the future.
 *   Defaults to <code>true</code>.
 * @property {number} initialSegmentLimit
 *   The maximum number of initial segments to generate for
 *   <code>SegmentTemplate</code> with fixed-duration segments.  This is limited
 *   to avoid excessive memory consumption with very large
 *   <code>timeShiftBufferDepth</code> values.
 * @property {boolean} ignoreSuggestedPresentationDelay
 *   If true will cause DASH parser to ignore
 *   <code>suggestedPresentationDelay</code> from manifest. Defaults to
 *   <code>false</code> if not provided.
 * @property {boolean} ignoreEmptyAdaptationSet
 *   If true will cause DASH parser to ignore
 *   empty <code>AdaptationSet</code> from manifest. Defaults to
 *   <code>false</code> if not provided.
 * @property {boolean} ignoreMaxSegmentDuration
 *   If true will cause DASH parser to ignore
 *   <code>maxSegmentDuration</code> from manifest. Defaults to
 *   <code>false</code> if not provided.
 * @property {Object.<string, string>} keySystemsByURI
 *   A map of scheme URI to key system name. Defaults to default key systems
 *   mapping handled by Shaka.
 * @property {function(!Element)} manifestPreprocessor
 *   Called immediately after the DASH manifest has been parsed into an
 *   XMLDocument. Provides a way for applications to perform efficient
 *   preprocessing of the manifest.
 * @property {boolean} sequenceMode
 *   If true, the media segments are appended to the SourceBuffer in
 *   "sequence mode" (ignoring their internal timestamps).
 *   <i>Defaults to <code>false</code>.</i>
 * @exportDoc
 */
shaka.extern.DashManifestConfiguration;


/**
 * @typedef {{
 *   ignoreTextStreamFailures: boolean,
 *   ignoreImageStreamFailures: boolean,
 *   defaultAudioCodec: string,
 *   defaultVideoCodec: string,
 *   ignoreManifestProgramDateTime: boolean,
 *   mediaPlaylistFullMimeType: string,
 *   useSafariBehaviorForLive: boolean,
 *   liveSegmentsDelay: number,
 *   sequenceMode: boolean,
 *   ignoreManifestTimestampsInSegmentsMode: boolean
 * }}
 *
 * @property {boolean} ignoreTextStreamFailures
 *   If <code>true</code>, ignore any errors in a text stream and filter out
 *   those streams.
 * @property {boolean} ignoreImageStreamFailures
 *   If <code>true</code>, ignore any errors in a image stream and filter out
 *   those streams.
 * @property {string} defaultAudioCodec
 *   The default audio codec if it is not specified in the HLS playlist.
 *   <i>Defaults to <code>'mp4a.40.2'</code>.</i>
 * @property {string} defaultVideoCodec
 *   The default video codec if it is not specified in the HLS playlist.
 *   <i>Defaults to <code>'avc1.42E01E'</code>.</i>
 * @property {boolean} ignoreManifestProgramDateTime
 *   If <code>true</code>, the HLS parser will ignore the
 *   <code>EXT-X-PROGRAM-DATE-TIME</code> tags in the manifest and use media
 *   sequence numbers instead.
 *   Meant for streams where <code>EXT-X-PROGRAM-DATE-TIME</code> is incorrect
 *   or malformed.
 *   <i>Defaults to <code>false</code>.</i>
 * @property {string} mediaPlaylistFullMimeType
 *   A string containing a full mime type, including both the basic mime type
 *   and also the codecs. Used when the HLS parser parses a media playlist
 *   directly, required since all of the mime type and codecs information is
 *   contained within the master playlist.
 *   You can use the <code>shaka.util.MimeUtils.getFullType()</code> utility to
 *   format this value.
 *   <i>Defaults to
 *   <code>'video/mp2t; codecs="avc1.42E01E, mp4a.40.2"'</code>.</i>
 * @property {boolean} useSafariBehaviorForLive
 *   If this is true, playback will set the availability window to the
 *   presentation delay. The player will be able to buffer ahead three
 *   segments, but the seek window will be zero-sized, to be consistent with
 *   Safari. If this is false, the seek window will be the entire duration.
 *   <i>Defaults to <code>true</code>.</i>
 * @property {number} liveSegmentsDelay
 *   The default presentation delay will be calculated as a number of segments.
 *   This is the number of segments for this calculation..
 *   <i>Defaults to <code>3</code>.</i>
 * @property {boolean} sequenceMode
 *   If true, the media segments are appended to the SourceBuffer in
 *   "sequence mode" (ignoring their internal timestamps).
 *   Defaults to <code>true</code> except on WebOS 3, Tizen 2,
 *   Tizen 3 and PlayStation 4 whose default value is <code>false</code>.
 * @property {boolean} ignoreManifestTimestampsInSegmentsMode
 *   If true, don't adjust the timestamp offset to account for manifest
 *   segment durations being out of sync with segment durations. In other
 *   words, assume that there are no gaps in the segments when appending
 *   to the SourceBuffer, even if the manifest and segment times disagree.
 *   Only applies when sequenceMode is <code>false</code>.
 *   <i>Defaults to <code>false</code>.</i>
 * @exportDoc
 */
shaka.extern.HlsManifestConfiguration;


/**
 * @typedef {{
 *   manifestPreprocessor: function(!Element),
 *   sequenceMode: boolean,
 *   keySystemsBySystemId: !Object.<string, string>
 * }}
 *
 * @property {function(!Element)} manifestPreprocessor
 *   Called immediately after the MSS manifest has been parsed into an
 *   XMLDocument. Provides a way for applications to perform efficient
 *   preprocessing of the manifest.
 * @property {boolean} sequenceMode
 *   If true, the media segments are appended to the SourceBuffer in
 *   "sequence mode" (ignoring their internal timestamps).
 *   <i>Defaults to <code>false</code>.</i>
 * @property {Object.<string, string>} keySystemsBySystemId
 *   A map of system id to key system name. Defaults to default key systems
 *   mapping handled by Shaka.
 * @exportDoc
 */
shaka.extern.MssManifestConfiguration;


/**
 * @typedef {{
 *   retryParameters: shaka.extern.RetryParameters,
 *   availabilityWindowOverride: number,
 *   disableAudio: boolean,
 *   disableVideo: boolean,
 *   disableText: boolean,
 *   disableThumbnails: boolean,
 *   defaultPresentationDelay: number,
 *   segmentRelativeVttTiming: boolean,
 *   dash: shaka.extern.DashManifestConfiguration,
 *   hls: shaka.extern.HlsManifestConfiguration,
 *   mss: shaka.extern.MssManifestConfiguration
 * }}
 *
 * @property {shaka.extern.RetryParameters} retryParameters
 *   Retry parameters for manifest requests.
 * @property {number} availabilityWindowOverride
 *   A number, in seconds, that overrides the availability window in the
 *   manifest, or <code>NaN</code> if the default value should be used.  This is
 *   enforced by the manifest parser, so custom manifest parsers should take
 *   care to honor this parameter.
 * @property {boolean} disableAudio
 *   If <code>true</code>, the audio tracks are ignored.
 *   Defaults to <code>false</code>.
 * @property {boolean} disableVideo
 *   If <code>true</code>, the video tracks are ignored.
 *   Defaults to <code>false</code>.
 * @property {boolean} disableText
 *   If <code>true</code>, the text tracks are ignored.
 *   Defaults to <code>false</code>.
 * @property {boolean} disableThumbnails
 *   If <code>true</code>, the image tracks are ignored.
 *   Defaults to <code>false</code>.
 * @property {number} defaultPresentationDelay
 *   A default <code>presentationDelay</code> value.
 *   For DASH, it's a default <code>presentationDelay</code> value if
 *   <code>suggestedPresentationDelay</code> is missing in the MPEG DASH
 *   manifest. The default value is <code>1.5 * minBufferTime</code> if not
 *   configured or set as 0.
 *   For HLS, the default value is 3 segments duration if not configured or
 *   set as 0.
 * @property {boolean} segmentRelativeVttTiming
 *   Option to calculate VTT text timings relative to the segment start
 *   instead of relative to the period start (which is the default).
 *   Defaults to <code>false</code>.
 * @property {shaka.extern.DashManifestConfiguration} dash
 *   Advanced parameters used by the DASH manifest parser.
 * @property {shaka.extern.HlsManifestConfiguration} hls
 *   Advanced parameters used by the HLS manifest parser.
 * @property {shaka.extern.MssManifestConfiguration} mss
 *   Advanced parameters used by the MSS manifest parser.
 *
 * @exportDoc
 */
shaka.extern.ManifestConfiguration;


/**
 * @typedef {{
 *   retryParameters: shaka.extern.RetryParameters,
 *   failureCallback: function(!shaka.util.Error),
 *   rebufferingGoal: number,
 *   bufferingGoal: number,
 *   bufferBehind: number,
 *   ignoreTextStreamFailures: boolean,
 *   alwaysStreamText: boolean,
 *   startAtSegmentBoundary: boolean,
 *   gapDetectionThreshold: number,
 *   durationBackoff: number,
 *   safeSeekOffset: number,
 *   stallEnabled: boolean,
 *   stallThreshold: number,
 *   stallSkip: number,
 *   useNativeHlsOnSafari: boolean,
 *   inaccurateManifestTolerance: number,
 *   lowLatencyMode: boolean,
 *   autoLowLatencyMode: boolean,
 *   forceHTTPS: boolean,
 *   preferNativeHls: boolean,
 *   updateIntervalSeconds: number,
 *   dispatchAllEmsgBoxes: boolean,
 *   observeQualityChanges: boolean,
 *   maxDisabledTime: number,
 *   parsePrftBox: boolean,
 *   segmentPrefetchLimit: number
 * }}
 *
 * @description
 * The StreamingEngine's configuration options.
 *
 * @property {shaka.extern.RetryParameters} retryParameters
 *   Retry parameters for segment requests.
 * @property {function(!shaka.util.Error)} failureCallback
 *   A callback to decide what to do on a streaming failure.  Default behavior
 *   is to retry on live streams and not on VOD.
 * @property {number} rebufferingGoal
 *   The minimum number of seconds of content that the StreamingEngine must
 *   buffer before it can begin playback or can continue playback after it has
 *   entered into a buffering state (i.e., after it has depleted one more
 *   more of its buffers).
 * @property {number} bufferingGoal
 *   The number of seconds of content that the StreamingEngine will attempt to
 *   buffer ahead of the playhead. This value must be greater than or equal to
 *   the rebuffering goal.
 * @property {number} bufferBehind
 *   The maximum number of seconds of content that the StreamingEngine will keep
 *   in buffer behind the playhead when it appends a new media segment.
 *   The StreamingEngine will evict content to meet this limit.
 * @property {boolean} ignoreTextStreamFailures
 *   If <code>true</code>, the player will ignore text stream failures and
 *   continue playing other streams.
 * @property {boolean} alwaysStreamText
 *   If <code>true</code>, always stream text tracks, regardless of whether or
 *   not they are shown.  This is necessary when using the browser's built-in
 *   controls, which are not capable of signaling display state changes back to
 *   Shaka Player.
 *   Defaults to <code>false</code>.
 * @property {boolean} startAtSegmentBoundary
 *   If <code>true</code>, adjust the start time backwards so it is at the start
 *   of a segment. This affects both explicit start times and calculated start
 *   time for live streams. This can put us further from the live edge. Defaults
 *   to <code>false</code>.
 * @property {number} gapDetectionThreshold
 *   TThe maximum distance (in seconds) before a gap when we'll automatically
 *   jump. This value  defaults to <code>0.1</code>, except in Edge Legacy,
 *   Tizen, Chromecast that value defaults value is <code>0.5</code>
 * @property {number} durationBackoff
 *   By default, we will not allow seeking to exactly the duration of a
 *   presentation.  This field is the number of seconds before duration we will
 *   seek to when the user tries to seek to or start playback at the duration.
 *   To disable this behavior, the config can be set to 0.  We recommend using
 *   the default value unless you have a good reason not to.
 * @property {number} safeSeekOffset
 *   The amount of seconds that should be added when repositioning the playhead
 *   after falling out of the availability window or seek. This gives the player
 *   more time to buffer before falling outside again, but increases the forward
 *   jump in the stream skipping more content. This is helpful for lower
 *   bandwidth scenarios. Defaults to 5 if not provided.
 * @property {boolean} stallEnabled
 *   When set to <code>true</code>, the stall detector logic will run.  If the
 *   playhead stops moving for <code>stallThreshold</code> seconds, the player
 *   will either seek or pause/play to resolve the stall, depending on the value
 *   of <code>stallSkip</code>.
 * @property {number} stallThreshold
 *   The maximum number of seconds that may elapse without the playhead moving
 *   (when playback is expected) before it will be labeled as a stall.
 * @property {number} stallSkip
 *   The number of seconds that the player will skip forward when a stall has
 *   been detected.  If 0, the player will pause and immediately play instead of
 *   seeking.  A value of 0 is recommended and provided as default on TV
 *   platforms (WebOS, Tizen, Chromecast, etc).
 * @property {boolean} useNativeHlsOnSafari
 *   Desktop Safari has both MediaSource and their native HLS implementation.
 *   Depending on the application's needs, it may prefer one over the other.
 *   Warning when disabled: Where single-key DRM streams work fine, multi-keys
 *   streams is showing unexpected behaviours (stall, audio playing with video
 *   freezes, ...). Use with care.
 * @property {number} inaccurateManifestTolerance
 *   The maximum difference, in seconds, between the times in the manifest and
 *   the times in the segments.  Larger values allow us to compensate for more
 *   drift (up to one segment duration).  Smaller values reduce the incidence of
 *   extra segment requests necessary to compensate for drift.
 * @property {boolean} lowLatencyMode
 *   If <code>true</code>, low latency streaming mode is enabled. If
 *   lowLatencyMode is set to true, inaccurateManifestTolerance is set to 0
 *   unless specified, and rebufferingGoal to 0.01 unless specified at the same
 *   time.
 * @property {boolean} autoLowLatencyMode
 *   If the stream is low latency and the user has not configured the
 *   lowLatencyMode, but if it has been configured to activate the
 *   lowLatencyMode if a stream of this type is detected, we automatically
 *   activate the lowLatencyMode. Defaults to false.
 * @property {boolean} forceHTTPS
 *   If true, if the protocol is HTTP change it to HTTPs.
 * @property {boolean} preferNativeHls
 *   If true, prefer native HLS playback when possible, regardless of platform.
 * @property {number} updateIntervalSeconds
 *   The minimum number of seconds to see if the manifest has changes.
 * @property {boolean} dispatchAllEmsgBoxes
 *   If true, all emsg boxes are parsed and dispatched.
 * @property {boolean} observeQualityChanges
 *   If true, monitor media quality changes and emit
 *   <code.shaka.Player.MediaQualityChangedEvent</code>.
 * @property {number} maxDisabledTime
 *   The maximum time a variant can be disabled when NETWORK HTTP_ERROR
 *   is reached, in seconds.
 *   If all variants are disabled this way, NETWORK HTTP_ERROR will be thrown.
 * @property {boolean} parsePrftBox
 *   If <code>true</code>, will raise a shaka.extern.ProducerReferenceTime
 *   player event (event name 'prft').
 *   The event will be raised only once per playback session as program
 *   start date will not change, and would save parsing the segment multiple
 *   times needlessly.
 *   Defaults to <code>false</code>.
 * @property {boolean} segmentPrefetchLimit
 *   The maximum number of segments for each active stream to be prefetched
 *   ahead of playhead in parallel.
 *   If <code>0</code>, the segments will be fetched sequentially.
 *   Defaults to <code>0</code>.
 * @exportDoc
 */
shaka.extern.StreamingConfiguration;


/**
 * @typedef {{
 *   sourceBufferExtraFeatures: string,
 *   forceTransmux: boolean
 * }}
 *
 * @description
 *   Media source configuration.
 *
 * @property {string} sourceBufferExtraFeatures
 *   Some platforms may need to pass features when initializing the
 *   sourceBuffer.
 *   This string is ultimately appended to MIME types in addSourceBuffer().
 * @property {boolean} forceTransmux
 *   If this is <code>true</code>, we will transmux AAC and TS content even if
 *   not strictly necessary for the assets to be played.
 *   This value defaults to <code>false</code>.
 * @exportDoc
 */
shaka.extern.MediaSourceConfiguration;


/**
 * @typedef {Object}
 *
 * @description
 *   Ads configuration.
 *
 * @exportDoc
 */
shaka.extern.AdsConfiguration;


/**
 * @typedef {{
 *   enabled: boolean,
 *   useNetworkInformation: boolean,
 *   defaultBandwidthEstimate: number,
 *   restrictions: shaka.extern.Restrictions,
 *   switchInterval: number,
 *   bandwidthUpgradeTarget: number,
 *   bandwidthDowngradeTarget: number,
 *   advanced: shaka.extern.AdvancedAbrConfiguration,
 *   restrictToElementSize: boolean,
 *   restrictToScreenSize: boolean,
 *   ignoreDevicePixelRatio: boolean
 * }}
 *
 * @property {boolean} enabled
 *   If true, enable adaptation by the current AbrManager.  Defaults to true.
 * @property {boolean} useNetworkInformation
 *   If true, use Network Information API in the current AbrManager.
 *   Defaults to true.
 * @property {number} defaultBandwidthEstimate
 *   The default bandwidth estimate to use if there is not enough data, in
 *   bit/sec.
 * @property {shaka.extern.Restrictions} restrictions
 *   The restrictions to apply to ABR decisions.  These are "soft" restrictions.
 *   Any track that fails to meet these restrictions will not be selected
 *   automatically, but will still appear in the track list and can still be
 *   selected via <code>selectVariantTrack()</code>.  If no tracks meet these
 *   restrictions, AbrManager should not fail, but choose a low-res or
 *   low-bandwidth variant instead.  It is the responsibility of AbrManager
 *   implementations to follow these rules and implement this behavior.
 * @property {number} switchInterval
 *   The minimum amount of time that must pass between switches, in
 *   seconds. This keeps us from changing too often and annoying the user.
 * @property {number} bandwidthUpgradeTarget
 *   The fraction of the estimated bandwidth which we should try to use when
 *   upgrading.
 * @property {number} bandwidthDowngradeTarget
 *   The largest fraction of the estimated bandwidth we should use. We should
 *   downgrade to avoid this.
 * @property {shaka.extern.AdvancedAbrConfiguration} advanced
 *   Advanced ABR configuration
 * @property {boolean} restrictToElementSize
 *   If true, restrict the quality to media element size.
 *   Note: The use of ResizeObserver is required for it to work properly. If
 *   true without ResizeObserver, it behaves as false.
 *   Defaults false.
 * @property {boolean} restrictToScreenSize
 *   If true, restrict the quality to screen size.
 *   Defaults false.
 * @property {boolean} ignoreDevicePixelRatio
 *   If true,device pixel ratio is ignored when restricting the quality to
 *   media element size or screen size.
 *   Defaults false.
 * @exportDoc
 */
shaka.extern.AbrConfiguration;


/**
 * @typedef {{
 *   minTotalBytes: number,
 *   minBytes: number,
 *   fastHalfLife: number,
 *   slowHalfLife: number
 * }}
 *
 * @property {number} minTotalBytes
 *   Minimum number of bytes sampled before we trust the estimate.  If we have
 *   not sampled much data, our estimate may not be accurate enough to trust.
 * @property {number} minBytes
 *   Minimum number of bytes, under which samples are discarded.  Our models
 *   do not include latency information, so connection startup time (time to
 *   first byte) is considered part of the download time.  Because of this, we
 *   should ignore very small downloads which would cause our estimate to be
 *   too low.
 * @property {number} fastHalfLife
 *   The quantity of prior samples (by weight) used when creating a new
 *   estimate, in seconds.  Those prior samples make up half of the
 *   new estimate.
 * @property {number} slowHalfLife
 *   The quantity of prior samples (by weight) used when creating a new
 *   estimate, in seconds.  Those prior samples make up half of the
 *   new estimate.
 * @exportDoc
 */
shaka.extern.AdvancedAbrConfiguration;


/**
 * @typedef {{
 *   enabled: boolean,
 *   useHeaders: boolean,
 *   sessionId: string,
 *   contentId: string
 * }}
 *
 * @description
 *   Common Media Client Data (CMCD) configuration.
 *
 * @property {boolean} enabled
 *   If <code>true</code>, enable CMCD data to be sent with media requests.
 *   Defaults to <code>false</code>.
 * @property {boolean} useHeaders
 *   If <code>true</code>, send CMCD data using the header transmission mode
 *   instead of query args.  Defaults to <code>false</code>.
 * @property {string} sessionId
 *   A GUID identifying the current playback session. A playback session
 *   typically ties together segments belonging to a single media asset.
 *   Maximum length is 64 characters. It is RECOMMENDED to conform to the UUID
 *   specification. By default the sessionId is automatically generated on each
 *   <code>load()</code> call.
 * @property {string} contentId
 *   A unique string identifying the current content. Maximum length is 64
 *   characters. This value is consistent across multiple different sessions and
 *   devices and is defined and updated at the discretion of the service
 *   provider.
 * @exportDoc
 */
shaka.extern.CmcdConfiguration;

/**
 * @typedef {{
 *   enabled: boolean,
 *   dynamicPerformanceScaling: boolean,
 *   logLevel: number,
 *   drawLogo: boolean
 * }}
 *
 * @description
 *   Decoding for MPEG-5 Part2 LCEVC.
 *
 * @property {boolean} enabled
 *   If <code>true</code>, enable LCEVC.
 *   Defaults to <code>false</code>.
 * @property {boolean} dynamicPerformanceScaling
 *   If <code>true</code>, LCEVC Dynamic Performance Scaling or dps is enabled
 *   to be triggered, when the system is not able to decode frames within a
 *   specific tolerance of the fps of the video and disables LCEVC decoding
 *   for some time. The base video will be shown upscaled to target resolution.
 *   If it is triggered again within a short period of time, the disabled
 *   time will be higher and if it is triggered three times in a row the LCEVC
 *   decoding will be disabled for that playback session.
 *   If dynamicPerformanceScaling is false, LCEVC decode will be forced
 *   and will drop frames appropriately if performance is sub optimal.
 *   Defaults to <code>true</code>.
 * @property {number} logLevel
 *   Loglevel 0-5 for logging.
 *   NONE = 0
 *   ERROR = 1
 *   WARNING = 2
 *   INFO = 3
 *   DEBUG = 4
 *   VERBOSE = 5
 *   Defaults to <code>0</code>.
 * @property {boolean} drawLogo
 *   If <code>true</code>, LCEVC Logo is placed on the top left hand corner
 *   which only appears when the LCEVC enhanced frames are being rendered.
 *   Defaults to true for the lib but is forced to false in this integration
 *   unless explicitly set to true through config.
 *   Defaults to <code>false</code>.
 * @exportDoc
 */
shaka.extern.LcevcConfiguration;

/**
 * @typedef {{
 *   trackSelectionCallback:
 *       function(shaka.extern.TrackList):!Promise<shaka.extern.TrackList>,
 *   downloadSizeCallback: function(number):!Promise<boolean>,
 *   progressCallback: function(shaka.extern.StoredContent,number),
 *   usePersistentLicense: boolean,
 *   numberOfParallelDownloads: number
 * }}
 *
 * @property {function(shaka.extern.TrackList):!Promise<shaka.extern.TrackList>}
 *     trackSelectionCallback
 *   Called inside <code>store()</code> to determine which tracks to save from a
 *   manifest. It is passed an array of Tracks from the manifest and it should
 *   return an array of the tracks to store.
 * @property {function(number):!Promise<boolean>} downloadSizeCallback
 *   Called inside <code>store()</code> to determine if the content can be
 *   downloaded due to its estimated size. The estimated size of the download is
 *   passed and it must return if the download is allowed or not.
 * @property {function(shaka.extern.StoredContent,number)} progressCallback
 *   Called inside <code>store()</code> to give progress info back to the app.
 *   It is given the current manifest being stored and the progress of it being
 *   stored.
 * @property {boolean} usePersistentLicense
 *   If <code>true</code>, store protected content with a persistent license so
 *   that no network is required to view.
 *   If <code>false</code>, store protected content without a persistent
 *   license.  A network will be required to retrieve a temporary license to
 *   view.
 *   Defaults to <code>true</code>.
 * @property {number} numberOfParallelDownloads
 *   Number of parallel downloads.
 *   Note: normally browsers limit to 5 request in parallel, so putting a
 *   number higher than this will not help it download faster.
 *   Defaults to <code>5</code>.
 * @exportDoc
 */
shaka.extern.OfflineConfiguration;


/**
 * @typedef {{
 *   ads: shaka.extern.AdsConfiguration,
 *   autoShowText: shaka.config.AutoShowText,
 *   drm: shaka.extern.DrmConfiguration,
 *   manifest: shaka.extern.ManifestConfiguration,
 *   streaming: shaka.extern.StreamingConfiguration,
 *   mediaSource: shaka.extern.MediaSourceConfiguration,
 *   abrFactory: shaka.extern.AbrManager.Factory,
 *   abr: shaka.extern.AbrConfiguration,
 *   cmcd: shaka.extern.CmcdConfiguration,
 *   lcevc: shaka.extern.LcevcConfiguration,
 *   offline: shaka.extern.OfflineConfiguration,
 *   preferredAudioLanguage: string,
 *   preferredAudioLabel: string,
 *   preferredTextLanguage: string,
 *   preferredVariantRole: string,
 *   preferredTextRole: string,
 *   preferredVideoCodecs: !Array.<string>,
 *   preferredAudioCodecs: !Array.<string>,
 *   preferredAudioChannelCount: number,
 *   preferredDecodingAttributes: !Array.<string>,
 *   preferForcedSubs: boolean,
 *   restrictions: shaka.extern.Restrictions,
 *   playRangeStart: number,
 *   playRangeEnd: number,
 *   textDisplayFactory: shaka.extern.TextDisplayer.Factory
 * }}
 *
 * @property {shaka.extern.AdsConfiguration} ads
 *   Ads configuration and settings.
 * @property {shaka.config.AutoShowText} autoShowText
 *   Controls behavior of auto-showing text tracks on load().
 * @property {shaka.extern.DrmConfiguration} drm
 *   DRM configuration and settings.
 * @property {shaka.extern.ManifestConfiguration} manifest
 *   Manifest configuration and settings.
 * @property {shaka.extern.StreamingConfiguration} streaming
 *   Streaming configuration and settings.
 * @property {shaka.extern.MediaSourceConfiguration} mediaSource
 *   Media source configuration and settings.
 * @property {shaka.extern.AbrManager.Factory} abrFactory
 *   A factory to construct an abr manager.
 * @property {shaka.extern.AbrConfiguration} abr
 *   ABR configuration and settings.
 * @property {shaka.extern.CmcdConfiguration} cmcd
 *   CMCD configuration and settings. (Common Media Client Data)
 * @property {shaka.extern.LcevcConfiguration} lcevc
 *   MPEG-5 LCEVC configuration and settings.
 *   (Low Complexity Enhancement Video Codec)
 * @property {shaka.extern.OfflineConfiguration} offline
 *   Offline configuration and settings.
 * @property {string} preferredAudioLanguage
 *   The preferred language to use for audio tracks.  If not given it will use
 *   the <code>'main'</code> track.
 *   Changing this during playback will not affect the current playback.
 * @property {string} preferredAudioLabel
 *   The preferred label to use for audio tracks
 * @property {string} preferredTextLanguage
 *   The preferred language to use for text tracks.  If a matching text track
 *   is found, and the selected audio and text tracks have different languages,
 *   the text track will be shown.
 *   Changing this during playback will not affect the current playback.
 * @property {string} preferredVariantRole
 *   The preferred role to use for variants.
 * @property {string} preferredTextRole
 *   The preferred role to use for text tracks.
 * @property {!Array.<string>} preferredVideoCodecs
 *   The list of preferred video codecs, in order of highest to lowest priority.
 * @property {!Array.<string>} preferredAudioCodecs
 *   The list of preferred audio codecs, in order of highest to lowest priority.
 * @property {number} preferredAudioChannelCount
 *   The preferred number of audio channels.
 * @property {!Array.<string>} preferredDecodingAttributes
 *   The list of preferred attributes of decodingInfo, in the order of their
 *   priorities.
 * @property {boolean} preferForcedSubs
 *   If true, a forced text track is preferred.  Defaults to false.
 *   If the content has no forced captions and the value is true,
 *   no text track is chosen.
 *   Changing this during playback will not affect the current playback.
 * @property {shaka.extern.Restrictions} restrictions
 *   The application restrictions to apply to the tracks.  These are "hard"
 *   restrictions.  Any track that fails to meet these restrictions will not
 *   appear in the track list.  If no tracks meet these restrictions, playback
 *   will fail.
 * @property {number} playRangeStart
 *   Optional playback and seek start time in seconds. Defaults to 0 if
 *   not provided.
 * @property {number} playRangeEnd
 *   Optional playback and seek end time in seconds. Defaults to the end of
 *   the presentation if not provided.
 * @property {shaka.extern.TextDisplayer.Factory} textDisplayFactory
 *   A factory to construct a text displayer. Note that, if this is changed
 *   during playback, it will cause the text tracks to be reloaded.
 * @exportDoc
 */
shaka.extern.PlayerConfiguration;


/**
 * @typedef {{
 *   language: string,
 *   role: string,
 *   label: ?string
 * }}
 *
 * @property {string} language
 *    The language code for the stream.
 * @property {string} role
 *    The role name for the stream. If the stream has no role, <code>role</code>
 *    will be <code>''</code>.
 * @property {?string} label
 *    The label of the audio stream, if it has one.
 * @exportDoc
 */
shaka.extern.LanguageRole;


/**
 * @typedef {{
 *   imageHeight: number,
 *   imageWidth: number,
 *   height: number,
 *   positionX: number,
 *   positionY: number,
 *   startTime: number,
 *   duration: number,
 *   uris: !Array.<string>,
 *   width: number,
 *   sprite: boolean
 * }}
 *
 * @property {number} imageHeight
 *    The image height in px. The image height could be different to height if
 *    the layout is different to 1x1.
 * @property {number} imageWidth
 *    The image width in px. The image width could be different to width if
 *    the layout is different to 1x1.
 * @property {number} height
 *    The thumbnail height in px.
 * @property {number} positionX
 *    The thumbnail left position in px.
 * @property {number} positionY
 *    The thumbnail top position in px.
 * @property {number} startTime
 *    The start time of the thumbnail in the presentation timeline, in seconds.
 * @property {number} duration
 *    The duration of the thumbnail, in seconds.
 * @property {!Array.<string>} uris
 *   An array of URIs to attempt.  They will be tried in the order they are
 *   given.
 * @property {number} width
 *    The thumbnail width in px.
 * @property {boolean} sprite
 *    Indicate if the thumbnail is a sprite.
 * @exportDoc
 */
shaka.extern.Thumbnail;


/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   startTime: number,
 *   endTime: number
 * }}
 *
 * @property {string} id
 *    The id of the chapter.
 * @property {string} title
 *    The title of the chapter.
 * @property {number} startTime
 *    The time that describes the beginning of the range of the chapter.
 * @property {number} endTime
 *    The time that describes the end of the range of chapter.
 * @exportDoc
 */
shaka.extern.Chapter;
