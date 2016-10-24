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
 *   timestamp: number,
 *   id: number,
 *   type: string,
 *   fromAdaptation: boolean
 * }}
 *
 * @property {number} timestamp
 *   The timestamp the choice was made, in seconds since 1970
 *   (i.e. Date.now() / 1000).
 * @property {number} id
 *   The id of the stream that was chosen.
 * @property {string} type
 *   The type of stream chosen ('audio', 'text', or 'video')
 * @property {boolean} fromAdaptation
 *   True if the choice was made by AbrManager for adaptation; false if it
 *   was made by the application through selectTrack.
 * @exportDoc
 */
shakaExtern.StreamChoice;


/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   streamBandwidth: number,
 *
 *   decodedFrames: number,
 *   droppedFrames: number,
 *   estimatedBandwidth: number,
 *   playTime: number,
 *   bufferingTime: number,
 *
 *   switchHistory: !Array.<shakaExtern.StreamChoice>
 * }}
 *
 * @description
 * Contains statistics and information about the current state of the player.
 * This is meant for applications that want to log quality-of-experience (QoE)
 * or other stats.  These values will reset when load() is called again.
 *
 * @property {number} width
 *   The width of the current video track.
 * @property {number} height
 *   The height of the current video track.
 * @property {number} streamBandwidth
 *   The bandwidth required for the current streams (total, in bit/sec).
 *
 * @property {number} decodedFrames
 *   The total number of frames decoded by the Player.  This may be NaN if this
 *   is not supported by the browser.
 * @property {number} droppedFrames
 *   The total number of frames dropped by the Player.  This may be NaN if this
 *   is not supported by the browser.
 * @property {number} estimatedBandwidth
 *   The current estimated network bandwidth (in bit/sec).
 * @property {number} playTime
 *   The total time spent in a playing state in seconds.
 * @property {number} bufferingTime
 *   The total time spent in a buffering state in seconds.
 *
 * @property {!Array.<shakaExtern.StreamChoice>} switchHistory
 *   A history of the stream changes.
 * @exportDoc
 */
shakaExtern.Stats;


/**
 * @typedef {{
 *   id: number,
 *   active: boolean,
 *
 *   type: string,
 *   bandwidth: number,
 *
 *   language: string,
 *   kind: ?string,
 *   width: ?number,
 *   height: ?number,
 *   frameRate: ?number,
 *   codecs: ?string
 * }}
 *
 * @description
 * An object describing a media track.  This object should be treated as
 * read-only as changing any values does not have any effect.  This is the
 * public view of the Stream type.
 *
 * @property {number} id
 *   The unique ID of the track.
 * @property {boolean} active
 *   If true, this is the track is being streamed (another track may be
 *   visible/audible in the buffer).
 *
 * @property {string} type
 *   The type of track, one of 'audio', 'text', or 'video'.
 * @property {number} bandwidth
 *   The bandwidth required to play the track, in bits/sec.
 *
 * @property {string} language
 *   The language of the track, or '' for video tracks.  This is the exact
 *   value provided in the manifest; it may need to be normalized.
 * @property {?string} kind
 *   (only for text tracks) The kind of text track, either 'captions' or
 *   'subtitles'.
 * @property {?number} width
 *   (only for video tracks) The width of the track in pixels.
 * @property {?number} height
 *   (only for video tracks) The height of the track in pixels.
 * @property {?number} frameRate
 *   The video framerate provided in the manifest, if present.
 * @property {?string} codecs
 *   The audio/video codecs string provided in the manifest, if present.
 * @exportDoc
 */
shakaExtern.Track;


/**
 * @typedef {{
 *   minWidth: number,
 *   maxWidth: number,
 *   minHeight: number,
 *   maxHeight: number,
 *   minPixels: number,
 *   maxPixels: number,
 *
 *   minAudioBandwidth: number,
 *   maxAudioBandwidth: number,
 *   minVideoBandwidth: number,
 *   maxVideoBandwidth: number
 * }}
 *
 * @description
 * An object describing application restrictions on what tracks can play.  All
 * restrictions must be fulfilled for a track to be playable.  If a track does
 * not meet the restrictions, it will not appear in the track list and it will
 * not be played.
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
 *   The minimum number of total pixels in a video track (i.e. width * height).
 * @property {number} maxPixels
 *   The maximum number of total pixels in a video track (i.e. width * height).
 *
 * @property {number} minAudioBandwidth
 *   The minimum bandwidth of an audio track, in bit/sec.
 * @property {number} maxAudioBandwidth
 *   The maximum bandwidth of an audio track, in bit/sec.
 * @property {number} minVideoBandwidth
 *   The minimum bandwidth of a video track, in bit/sec.
 * @property {number} maxVideoBandwidth
 *   The maximum bandwidth of a video track, in bit/sec.
 * @exportDoc
 */
shakaExtern.Restrictions;


/**
 * @typedef {{
 *   persistentState: boolean
 * }}
 *
 * @property {boolean} persistentState
 *   Whether this key system supports persistent state.
 */
shakaExtern.DrmSupportType;


/**
 * @typedef {{
 *   manifest: !Object.<string, boolean>,
 *   media: !Object.<string, boolean>,
 *   drm: !Object.<string, ?shakaExtern.DrmSupportType>
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
 * @property {!Object.<string, ?shakaExtern.DrmSupportType>} drm
 *   A map of supported key systems.
 *   The keys are the key system names.  The value is null if it is not
 *   supported.  Key systems not probed will not be in this dictionary.
 *
 * @exportDoc
 */
shakaExtern.SupportType;


/**
 * @typedef {function(!Element):Array.<shakaExtern.DrmInfo>}
 * @see shakaExtern.DashManifestConfiguration
 * @exportDoc
 */
shakaExtern.DashContentProtectionCallback;


/**
 * @typedef {{
 *   distinctiveIdentifierRequired: boolean,
 *   persistentStateRequired: boolean,
 *   videoRobustness: string,
 *   audioRobustness: string,
 *   serverCertificate: Uint8Array
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
 *   <i>Defaults to '', i.e., no specific robustness required.</i> <br>
 * @property {string} audioRobustness
 *   A key-system-specific string that specifies a required security level for
 *   audio.
 *   <i>Defaults to '', i.e., no specific robustness required.</i> <br>
 * @property {Uint8Array} serverCertificate
 *   <i>Defaults to null, i.e., certificate will be requested from the license
 *   server if required.</i> <br>
 *   A key-system-specific server certificate used to encrypt license requests.
 *   Its use is optional and is meant as an optimization to avoid a round-trip
 *   to request a certificate.
 *
 * @exportDoc
 */
shakaExtern.AdvancedDrmConfiguration;


/**
 * @typedef {{
 *   retryParameters: shakaExtern.RetryParameters,
 *   servers: !Object.<string, string>,
 *   clearKeys: !Object.<string, string>,
 *   advanced: Object.<string, shakaExtern.AdvancedDrmConfiguration>
 * }}
 *
 * @property {shakaExtern.RetryParameters} retryParameters
 *   Retry parameters for license requests.
 * @property {!Object.<string, string>} servers
 *   <i>Required for all but the clear key CDM.</i> <br>
 *   A dictionary which maps key system IDs to their license servers.
 *   For example, {'com.widevine.alpha': 'http://example.com/drm'}.
 * @property {!Object.<string, string>} clearKeys
 *   <i>Forces the use of the Clear Key CDM.</i>
 *   A map of key IDs (hex) to keys (hex).
 * @property {Object.<string, shakaExtern.AdvancedDrmConfiguration>} advanced
 *   <i>Optional.</i> <br>
 *   A dictionary which maps key system IDs to advanced DRM configuration for
 *   those key systems.
 *
 * @exportDoc
 */
shakaExtern.DrmConfiguration;


/**
 * @typedef {{
 *   customScheme: shakaExtern.DashContentProtectionCallback,
 *   clockSyncUri: string
 * }}
 *
 * @property {shakaExtern.DashContentProtectionCallback} customScheme
 *   If given, invoked by a DASH manifest parser to interpret custom or
 *   non-standard DRM schemes found in the manifest.  The argument is a
 *   ContentProtection node.  Return null if not recognized.
 * @property {string} clockSyncUri
 *   A default clock sync URI to be used with live streams which do not
 *   contain any clock sync information.  The "Date" header from this URI
 *   will be used to determine the current time.
 *
 * @exportDoc
 */
shakaExtern.DashManifestConfiguration;


/**
 * @typedef {{
 *   retryParameters: shakaExtern.RetryParameters,
 *   dash: shakaExtern.DashManifestConfiguration
 * }}
 *
 * @property {shakaExtern.RetryParameters} retryParameters
 *   Retry parameters for manifest requests.
 * @property {shakaExtern.DashManifestConfiguration} dash
 *   Advanced parameters used by the DASH manifest parser.
 *
 * @exportDoc
 */
shakaExtern.ManifestConfiguration;


/**
 * @typedef {{
 *   retryParameters: shakaExtern.RetryParameters,
 *   rebufferingGoal: number,
 *   bufferingGoal: number,
 *   bufferBehind: number,
 *   ignoreTextStreamFailures: boolean,
 *   useRelativeCueTimestamps: boolean
 * }}
 *
 * @description
 * The StreamingEngine's configuration options.
 *
 * @property {shakaExtern.RetryParameters} retryParameters
 *   Retry parameters for segment requests.
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
 *   If true, the player will ignore text stream failures and proceed to play
 *   other streams.
 * @property {boolean} useRelativeCueTimestamps
 *   If true, WebVTT cue timestamps will be treated as relative to the start
 *   time of the VTT segment. Defaults to false.
 * @exportDoc
 */
shakaExtern.StreamingConfiguration;


/**
 * @typedef {{
 *   manager: shakaExtern.AbrManager,
 *   enabled: boolean,
 *   defaultBandwidthEstimate: number
 * }}
 *
 * @property {shakaExtern.AbrManager} manager
 *   The AbrManager instance.
 * @property {boolean} enabled
 *   If true, enable adaptation by the current AbrManager.  Defaults to true.
 * @property {number} defaultBandwidthEstimate
 *   The default bandwidth estimate to use if there is not enough data, in
 *   bit/sec.
 * @exportDoc
 */
shakaExtern.AbrConfiguration;


/**
 * @typedef {{
 *   drm: shakaExtern.DrmConfiguration,
 *   manifest: shakaExtern.ManifestConfiguration,
 *   streaming: shakaExtern.StreamingConfiguration,
 *   abr: shakaExtern.AbrConfiguration,
 *   preferredAudioLanguage: string,
 *   preferredTextLanguage: string,
 *   restrictions: shakaExtern.Restrictions
 * }}
 *
 * @property {shakaExtern.DrmConfiguration} drm
 *   DRM configuration and settings.
 * @property {shakaExtern.ManifestConfiguration} manifest
 *   Manifest configuration and settings.
 * @property {shakaExtern.StreamingConfiguration} streaming
 *   Streaming configuration and settings.
 * @property {shakaExtern.AbrConfiguration} abr
 *   ABR configuration and settings.
 * @property {string} preferredAudioLanguage
 *   The preferred language to use for audio tracks.  If not given it will use
 *   the 'main' track.
 *   Changing this during playback will cause the language selection algorithm
 *   to run again, and may change the active audio track.
 * @property {string} preferredTextLanguage
 *   The preferred language to use for text tracks.  If a matching text track
 *   is found, and the selected audio and text tracks have different languages,
 *   the text track will be shown.
 *   Changing this during playback will cause the language selection algorithm
 *   to run again, and may change the active text track.
 * @property {shakaExtern.Restrictions} restrictions
 *   The application restrictions to apply to the tracks.  The track must
 *   meet all the restrictions to be playable.
 * @exportDoc
 */
shakaExtern.PlayerConfiguration;
