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
 *   currentCodecs: string,
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
 *   manifestSizeBytes: number,
 *   bytesDownloaded: number,
 *
 *   nonFatalErrorCount: number,
 *   manifestPeriodCount: number,
 *   manifestGapCount: number,
 *
 *   switchHistory: !Array<shaka.extern.TrackChoice>,
 *   stateHistory: !Array<shaka.extern.StateChange>
 * }}
 *
 * @description
 * Contains statistics and information about the current state of the player.
 * This is meant for applications that want to log quality-of-experience (QoE)
 * or other stats.  These values will reset when <code>load()</code> is called
 * again.
 *
 * @property {number} width
 *   The width of the current video track. If nothing is loaded or the content
 *   is audio-only, NaN.
 * @property {number} height
 *   The height of the current video track. If nothing is loaded or the content
 *   is audio-only, NaN.
 * @property {number} streamBandwidth
 *   The bandwidth required for the current streams (total, in bit/sec).
 *   It takes into account the playbackrate. If nothing is loaded, NaN.
 * @property {string} currentCodecs
 *   The current codec of the current streams.
 *
 * @property {number} decodedFrames
 *   The total number of frames decoded by the Player. If not reported by the
 *   browser, NaN.
 * @property {number} droppedFrames
 *   The total number of frames dropped by the Player. If not reported by the
 *   browser, NaN.
 * @property {number} corruptedFrames
 *   The total number of corrupted frames dropped by the browser. If not
 *   reported by the browser, NaN.
 * @property {number} estimatedBandwidth
 *   The current estimated network bandwidth (in bit/sec). If no estimate
 *   available, NaN.
 *
 * @property {number} gapsJumped
 *   The total number of playback gaps jumped by the GapJumpingController.
 *   If nothing is loaded, NaN.
 * @property {number} stallsDetected
 *   The total number of playback stalls detected by the StallDetector.
 *   If nothing is loaded, NaN.
 *
 * @property {number} completionPercent
 *   This is the greatest completion percent that the user has experienced in
 *   playback. Also known as the "high water mark". If nothing is loaded, or
 *   the stream is live (and therefore indefinite), NaN.
 * @property {number} loadLatency
 *   This is the number of seconds it took for the video element to have enough
 *   data to begin playback.  This is measured from the time load() is called to
 *   the time the <code>'loadeddata'</code> event is fired by the media element.
 *   If nothing is loaded, NaN.
 * @property {number} manifestTimeSeconds
 *   The amount of time it took to download and parse the manifest.
 *   If nothing is loaded, NaN.
 * @property {number} drmTimeSeconds
 *   The amount of time it took to download the first drm key, and load that key
 *   into the drm system. If nothing is loaded or DRM is not in use, NaN.
 * @property {number} playTime
 *   The total time spent in a playing state in seconds. If nothing is loaded,
 *   NaN.
 * @property {number} pauseTime
 *   The total time spent in a paused state in seconds. If nothing is loaded,
 *   NaN.
 * @property {number} bufferingTime
 *   The total time spent in a buffering state in seconds. If nothing is
 *   loaded, NaN.
 * @property {number} licenseTime
 *   The time spent on license requests during this session in seconds. If DRM
 *   is not in use, NaN.
 * @property {number} liveLatency
 *   The time between the capturing of a frame and the end user having it
 *   displayed on their screen. If nothing is loaded or the content is VOD,
 *   NaN.
 *
 * @property {number} maxSegmentDuration
 *   The presentation's max segment duration in seconds. If nothing is loaded,
 *   NaN.
 *
 * @property {number} manifestSizeBytes
 *   Size of the manifest payload. For DASH & MSS it will match the latest
 *   downloaded manifest. For HLS, it will match the lastly downloaded playlist.
 *   If nothing is loaded or in src= mode, NaN.
 * @property {number} bytesDownloaded
 *   The bytes downloaded during the playback. If nothing is loaded, NaN.
 *
 * @property {number} nonFatalErrorCount
 *   The amount of non fatal errors that occurred.  If nothing is loaded, NaN.
 * @property {number} manifestPeriodCount
 *   The amount of periods occurred in the manifest. For DASH it represents
 *   number of Period elements in a manifest. For HLS & MSS it is always 1.
 *   In src= mode or if nothing is loaded, NaN.
 * @property {number} manifestGapCount
 *   The amount of gaps found in a manifest. For DASH, it represents number of
 *   discontinuities found between periods. For HLS, it is a number of EXT-X-GAP
 *   and GAP=YES occurrences. For MSS, it is always set to 0.
 *   If in src= mode or nothing is loaded, NaN.
 *
 * @property {!Array<shaka.extern.TrackChoice>} switchHistory
 *   A history of the stream changes.
 * @property {!Array<shaka.extern.StateChange>} stateHistory
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
 *   total: !Array<shaka.extern.BufferedRange>,
 *   audio: !Array<shaka.extern.BufferedRange>,
 *   video: !Array<shaka.extern.BufferedRange>,
 *   text: !Array<shaka.extern.BufferedRange>
 * }}
 *
 * @description
 * Contains information about the current buffered ranges.
 *
 * @property {!Array<shaka.extern.BufferedRange>} total
 *   The combined audio/video buffered ranges, reported by
 *   <code>video.buffered</code>.
 * @property {!Array<shaka.extern.BufferedRange>} audio
 *   The buffered ranges for audio content.
 * @property {!Array<shaka.extern.BufferedRange>} video
 *   The buffered ranges for video content.
 * @property {!Array<shaka.extern.BufferedRange>} text
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
 *   videoLabel: ?string,
 *   kind: ?string,
 *   width: ?number,
 *   height: ?number,
 *   frameRate: ?number,
 *   pixelAspectRatio: ?string,
 *   hdr: ?string,
 *   colorGamut: ?string,
 *   videoLayout: ?string,
 *   mimeType: ?string,
 *   audioMimeType: ?string,
 *   videoMimeType: ?string,
 *   codecs: ?string,
 *   audioCodec: ?string,
 *   videoCodec: ?string,
 *   primary: boolean,
 *   roles: !Array<string>,
 *   audioRoles: Array<string>,
 *   videoRoles: Array<string>,
 *   accessibilityPurpose: ?shaka.media.ManifestParser.AccessibilityPurpose,
 *   forced: boolean,
 *   videoId: ?number,
 *   audioId: ?number,
 *   audioGroupId: ?string,
 *   channelsCount: ?number,
 *   audioSamplingRate: ?number,
 *   tilesLayout: ?string,
 *   audioBandwidth: ?number,
 *   videoBandwidth: ?number,
 *   spatialAudio: boolean,
 *   originalVideoId: ?string,
 *   originalAudioId: ?string,
 *   originalTextId: ?string,
 *   originalImageId: ?string,
 *   originalLanguage: ?string
 * }}
 *
 * @description
 * An object describing a media track.  This object should be treated as
 * read-only as changing any values does not have any effect.  This is the
 * public view of an audio/video paring (variant type).
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
 *   The language of the track, or <code>'und'</code> if not given.  This value
 *   is normalized as follows - language part is always lowercase and translated
 *   to ISO-639-1 when possible, locale part is always uppercase,
 *   i.e. <code>'en-US'</code>.
 * @property {?string} label
 *   The track label, which is unique text that should describe the track.
 * @property {?string} videoLabel
 *   The video track label, which is unique text that should describe the video
 *   track.
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
 * @property {?string} colorGamut
 *   The video color gamut provided in the manifest, if present.
 * @property {?string} videoLayout
 *   The video layout provided in the manifest, if present.
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
 * @property {!Array<string>} roles
 *   The roles of the track, e.g. <code>'main'</code>, <code>'caption'</code>,
 *   or <code>'commentary'</code>.
 * @property {Array<string>} audioRoles
 *   The roles of the audio in the track, e.g. <code>'main'</code> or
 *   <code>'commentary'</code>. Will be null for text tracks or variant tracks
 *   without audio.
 * @property {Array<string>} videoRoles
 *   The roles of the video in the track, e.g. <code>'main'</code> or
 *   <code>'sign'</code>. Will be null for text tracks or variant tracks
 *   without video.
 * @property {?shaka.media.ManifestParser.AccessibilityPurpose
 *           } accessibilityPurpose
 *   The DASH accessibility descriptor, if one was provided for this track.
 *   For text tracks, this describes the text; otherwise, this is for the audio.
 * @property {boolean} forced
 *   True indicates that this in the forced text language for the content.
 *   This flag is based on signals from the manifest.
 * @property {?number} videoId
 *   (only for variant tracks) The video stream id.
 * @property {?number} audioId
 *   (only for variant tracks) The audio stream id.
 * @property {?string} audioGroupId
 *   (only for variant tracks)
 *   The ID of the stream's parent element. In DASH, this will be a unique
 *   ID that represents the representation's parent adaptation element
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
 * @property {?string} originalLanguage
 *   The original language of the track, if any, as it appeared in the original
 *   manifest.  This is the exact value provided in the manifest; for normalized
 *   value use <code>language</code> property.
 * @exportDoc
 */
shaka.extern.Track;

/**
 * @typedef {{
 *   active: boolean,
 *   language: string,
 *   label: ?string,
 *   mimeType: ?string,
 *   codecs: ?string,
 *   primary: boolean,
 *   roles: !Array<string>,
 *   accessibilityPurpose: ?shaka.media.ManifestParser.AccessibilityPurpose,
 *   channelsCount: ?number,
 *   audioSamplingRate: ?number,
 *   spatialAudio: boolean,
 *   originalLanguage: ?string
 * }}
 *
 * @description
 * An object describing a audio track.  This object should be treated as
 * read-only as changing any values does not have any effect.
 *
 * @property {boolean} active
 *   If true, this is the track being streamed (another track may be
 *   visible/audible in the buffer).
 *
 * @property {string} language
 *   The language of the track, or <code>'und'</code> if not given.  This value
 *   is normalized as follows - language part is always lowercase and translated
 *   to ISO-639-1 when possible, locale part is always uppercase,
 *   i.e. <code>'en-US'</code>.
 * @property {?string} label
 *   The track label, which is unique text that should describe the track.
 * @property {?string} mimeType
 *   The MIME type of the content provided in the manifest.
 * @property {?string} codecs
 *   The audio codecs string provided in the manifest, if present.
 * @property {boolean} primary
 *   True indicates that this in the primary language for the content.
 *   This flag is based on signals from the manifest.
 *   This can be a useful hint about which language should be the default, and
 *   indicates which track Shaka will use when the user's language preference
 *   cannot be satisfied.
 * @property {!Array<string>} roles
 *   The roles of the track, e.g. <code>'main'</code>, <code>'caption'</code>,
 *   or <code>'commentary'</code>.
 * @property {?shaka.media.ManifestParser.AccessibilityPurpose
 *           } accessibilityPurpose
 *   The DASH accessibility descriptor, if one was provided for this track.
 * @property {?number} channelsCount
 *   The count of the audio track channels.
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content.
 * @property {boolean} spatialAudio
 *   True indicates that the content has spatial audio.
 *   This flag is based on signals from the manifest.
 * @property {?string} originalLanguage
 *   The original language of the track, if any, as it appeared in the original
 *   manifest.  This is the exact value provided in the manifest; for normalized
 *   value use <code>language</code> property.
 * @exportDoc
 */
shaka.extern.AudioTrack;


/**
 * @typedef {{
 *   id: number,
 *   active: boolean,
 *   type: string,
 *   bandwidth: number,
 *   language: string,
 *   label: ?string,
 *   kind: ?string,
 *   mimeType: ?string,
 *   codecs: ?string,
 *   primary: boolean,
 *   roles: !Array<string>,
 *   accessibilityPurpose: ?shaka.media.ManifestParser.AccessibilityPurpose,
 *   forced: boolean,
 *   originalTextId: ?string,
 *   originalLanguage: ?string
 * }}
 *
 * @description
 * An object describing a text track.  This object should be treated as
 * read-only as changing any values does not have any effect.
 *
 * @property {number} id
 *   The unique ID of the track.
 * @property {boolean} active
 *   If true, this is the track being streamed (another track may be
 *   visible in the buffer).
 * @property {string} type
 *   The type of track, either <code>'variant'</code> or <code>'text'</code>
 *   or <code>'image'</code>.
 * @property {number} bandwidth
 *   The bandwidth required to play the track, in bits/sec.
 * @property {string} language
 *   The language of the track, or <code>'und'</code> if not given.  This value
 *   is normalized as follows - language part is always lowercase and translated
 *   to ISO-639-1 when possible, locale part is always uppercase,
 *   i.e. <code>'en-US'</code>.
 * @property {?string} label
 *   The track label, which is unique text that should describe the track.
 * @property {?string} kind
 *   The kind of text track, either <code>'caption'</code> or
 *  <code>'subtitle'</code>.
 * @property {?string} mimeType
 *   The MIME type of the content provided in the manifest.
 * @property {?string} codecs
 *   The codecs string provided in the manifest, if present.
 * @property {boolean} primary
 *   True indicates that this in the primary language for the content.
 *   This flag is based on signals from the manifest.
 *   This can be a useful hint about which language should be the default, and
 *   indicates which track Shaka will use when the user's language preference
 *   cannot be satisfied.
 * @property {!Array<string>} roles
 *   The roles of the track, e.g. <code>'main'</code>, <code>'caption'</code>,
 *   or <code>'commentary'</code>.
 * @property {?shaka.media.ManifestParser.AccessibilityPurpose
 *           } accessibilityPurpose
 *   The DASH accessibility descriptor, if one was provided for this track.
 * @property {boolean} forced
 *   True indicates that this in the forced text language for the content.
 *   This flag is based on signals from the manifest.
 * @property {?string} originalTextId
 *   The original ID of the text track, if any, as it
 *   appeared in the original manifest.
 * @property {?string} originalLanguage
 *   The original language of the track, if any, as it appeared in the original
 *   manifest.  This is the exact value provided in the manifest; for normalized
 *   value use <code>language</code> property.
 * @exportDoc
 */
shaka.extern.TextTrack;


/**
 * @typedef {{
 *   active: boolean,
 *   bandwidth: number,
 *   width: ?number,
 *   height: ?number,
 *   frameRate: ?number,
 *   pixelAspectRatio: ?string,
 *   hdr: ?string,
 *   colorGamut: ?string,
 *   videoLayout: ?string,
 *   mimeType: ?string,
 *   codecs: ?string,
 *   roles: !Array<string>,
 *   label: ?string,
 * }}
 *
 * @description
 * An object describing a video track.  This object should be treated as
 * read-only as changing any values does not have any effect.
 *
 * @property {boolean} active
 *   If true, this is the track being streamed (another track may be
 *   visible/audible in the buffer).
 * @property {number} bandwidth
 *   The bandwidth required to play the track, in bits/sec.
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
 * @property {?string} colorGamut
 *   The video color gamut provided in the manifest, if present.
 * @property {?string} videoLayout
 *   The video layout provided in the manifest, if present.
 * @property {?string} mimeType
 *   The video MIME type of the content provided in the manifest.
 * @property {?string} codecs
 *   The video codecs string provided in the manifest, if present.
 * @property {!Array<string>} roles
 *   The roles of the track, e.g. <code>'main'</code>, <code>'sign'</code>.
 * @property {?string} label
 *   The track label, which is unique text that should describe the track.
 * @exportDoc
 */
shaka.extern.VideoTrack;


/**
 * @typedef {{
 *   id: number,
 *   type: string,
 *   bandwidth: number,
 *   width: ?number,
 *   height: ?number,
 *   mimeType: ?string,
 *   codecs: ?string,
 *   tilesLayout: ?string,
 *   originalImageId: ?string
 * }}
 *
 * @description
 * An object describing a image track.  This object should be treated as
 * read-only as changing any values does not have any effect.
 *
 * @property {number} id
 *   The unique ID of the track.
 * @property {string} type
 *   The type of track, either <code>'variant'</code> or <code>'text'</code>
 *   or <code>'image'</code>.
 * @property {number} bandwidth
 *   The bandwidth required to play the track, in bits/sec.
 * @property {?number} width
 *   The width provided in the manifest, if present.
 * @property {?number} height
 *   The height provided in the manifest, if present.
 * @property {?string} mimeType
 *   The MIME type of the content provided in the manifest.
 * @property {?string} codecs
 *   The image codecs string provided in the manifest, if present.
 * @property {?string} tilesLayout
 *   The value is a grid-item-dimension consisting of two positive decimal
 *   integers in the format: column-x-row ('4x3'). It describes the arrangement
 *   of Images in a Grid. The minimum valid LAYOUT is '1x1'.
 * @property {?string} originalImageId
 *   The original ID of the image track, if any, as it appeared in the original
 *   manifest.
 * @exportDoc
 */
shaka.extern.ImageTrack;


/**
 * @typedef {!Array<!shaka.extern.Track>}
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
 *   maxBandwidth: number,
 *
 *   minChannelsCount: number,
 *   maxChannelsCount: number
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
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} maxWidth
 *   The maximum width of a video track, in pixels.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 * @property {number} minHeight
 *   The minimum height of a video track, in pixels.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} maxHeight
 *   The maximum height of a video track, in pixels.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 * @property {number} minPixels
 *   The minimum number of total pixels in a video track (i.e.
 *   <code>width * height</code>).
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} maxPixels
 *   The maximum number of total pixels in a video track (i.e.
 *   <code>width * height</code>).
 *   <br>
 *   Defaults to <code>Infinity</code>.
 *
 * @property {number} minFrameRate
 *   The minimum framerate of a variant track.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} maxFrameRate
 *   The maximum framerate of a variant track.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 *
 * @property {number} minBandwidth
 *   The minimum bandwidth of a variant track, in bit/sec.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} maxBandwidth
 *   The maximum bandwidth of a variant track, in bit/sec.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 *
 * @property {number} minChannelsCount
 *   The minimum channels count of a variant track.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} maxChannelsCount
 *   The maximum channels count of a variant track.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 * @exportDoc
 */
shaka.extern.Restrictions;


/**
 * @typedef {{
 *   persistentState: boolean,
 *   encryptionSchemes: !Array<string|null>,
 *   videoRobustnessLevels: !Array<string>,
 *   audioRobustnessLevels: !Array<string>,
 *   minHdcpVersions: !Array<string>
 * }}
 *
 * @property {boolean} persistentState
 *   Whether this key system supports persistent state.
 * @property {!Array<string|null>} encryptionSchemes
 *   An array of encryption schemes that are reported to work, through either
 *   EME or MCap APIs. An empty array indicates that encryptionScheme queries
 *   are not supported. This should not happen if our polyfills are installed.
 * @property {!Array<string>} videoRobustnessLevels
 *   An array of video robustness levels that are reported to work. An empty
 *   array indicates that none were tested. Not all key systems have a list of
 *   known robustness levels built into probeSupport().
 * @property {!Array<string>} audioRobustnessLevels
 *   An array of audio robustness levels that are reported to work. An empty
 *   array indicates that none were tested. Not all key systems have a list of
 *   known robustness levels built into probeSupport().
 * @property {!Array<string>} minHdcpVersions
 *   An array of min HDCP levels that are reported to work. An empty
 *   array indicates that none were tested. Not all key systems have support to
 *   check min HDCP levels.
 * @exportDoc
 */
shaka.extern.DrmSupportType;


/**
 * @typedef {{
 *   manifest: !Object<string, boolean>,
 *   media: !Object<string, boolean>,
 *   drm: !Object<string, ?shaka.extern.DrmSupportType>,
 *   hardwareResolution: shaka.extern.Resolution
 * }}
 *
 * @description
 * An object detailing browser support for various features.
 *
 * @property {!Object<string, boolean>} manifest
 *   A map of supported manifest types.
 *   The keys are manifest MIME types and file extensions.
 * @property {!Object<string, boolean>} media
 *   A map of supported media types.
 *   The keys are media MIME types.
 * @property {!Object<string, ?shaka.extern.DrmSupportType>} drm
 *   A map of supported key systems.
 *   The keys are the key system names.  The value is <code>null</code> if it is
 *   not supported.  Key systems not probed will not be in this dictionary.
 * @property {shaka.extern.Resolution} hardwareResolution
 *   The maximum detected hardware resolution, which may have
 *   height==width==Infinity for devices without a maximum resolution or
 *   without a way to detect the maximum.
 *
 * @exportDoc
 */
shaka.extern.SupportType;

/**
 * @typedef {{
 *   cueTime: ?number,
 *   data: !Uint8Array,
 *   frames: !Array<shaka.extern.MetadataFrame>,
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
 * @property {!Array<shaka.extern.MetadataFrame>} frames
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
 *   description: string,
 *   mimeType: ?string,
 *   pictureType: ?number
 * }}
 *
 * @description metadata frame parsed.
 * @property {string} key
 * @property {ArrayBuffer|string|number} data
 * @property {string} description
 * @property {?string} mimeType
 * @property {?number} pictureType
 * @exportDoc
 */
shaka.extern.MetadataFrame;


/**
 * @typedef {{
 *   video: ?shaka.extern.PlaybackStreamInfo,
 *   audio: ?shaka.extern.PlaybackStreamInfo,
 *   text: ?shaka.extern.PlaybackStreamInfo
 * }}
 *
 * @description Represents the state of the current variant and text.
 * @property {?shaka.extern.PlaybackStreamInfo} video
 * @property {?shaka.extern.PlaybackStreamInfo} audio
 * @property {?shaka.extern.PlaybackStreamInfo} text
 * @exportDoc
 */
shaka.extern.PlaybackInfo;


/**
 * @typedef {{
 *   codecs: string,
 *   mimeType: string,
 *   bandwidth: number,
 *   width: ?number,
 *   height: ?number
 * }}
 *
 * @description Represents the state of the given stream.
 * @property {string} codecs
 * @property {string} mimeType
 * @property {number} bandwidth
 * @property {?number} width
 * @property {?number} height
 * @exportDoc
 */
shaka.extern.PlaybackStreamInfo;


/**
 * @typedef {{
 *   startTime: number,
 *   endTime: ?number,
 *   values: !Array<shaka.extern.MetadataFrame>
 * }}
 *
 * @property {number} startTime
 * @property {?number} endTime
 * @property {!Array<shaka.extern.MetadataFrame>} values
 * @exportDoc
 */
shaka.extern.HLSInterstitial;


/**
 * @typedef {{
 *   schemeIdUri: string,
 *   value: string,
 *   startTime: number,
 *   endTime: number,
 *   id: string,
 *   timescale: number,
 *   eventElement: Element,
 *   eventNode: ?shaka.extern.xml.Node
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
 * @property {number} timescale
 *   Provides the timescale, in ticks per second.
 * @property {Element} eventElement
 *   <b>DEPRECATED</b>: Use eventNode instead.
 *   The XML element that defines the Event.
 * @property {?shaka.extern.xml.Node} eventNode
 *   The XML element that defines the Event.
 * @exportDoc
 */
shaka.extern.TimelineRegionInfo;


/**
 * @typedef {{
 *   schemeIdUri: string,
 *   startTime: number,
 *   endTime: number,
 *   id: string,
 *   emsg: shaka.extern.EmsgInfo
 * }}
 *
 * @description
 * Contains information about a region of the timeline that will cause an event
 * to be raised when the playhead enters or exits it.
 *
 * @property {string} schemeIdUri
 *   Identifies the metadata type.
 * @property {number} startTime
 *   The presentation time (in seconds) that the region should start.
 * @property {number} endTime
 *   The presentation time (in seconds) that the region should end.
 * @property {string} id
 *   Specifies an identifier for this instance of the region.
 * @property {shaka.extern.EmsgInfo} emsg
 *   Specifies the EMSG info.
 * @exportDoc
 */
shaka.extern.EmsgTimelineRegionInfo;


/**
 * @typedef {{
 *   schemeIdUri: string,
 *   startTime: number,
 *   endTime: number,
 *   id: string,
 *   payload: shaka.extern.MetadataFrame
 * }}
 *
 * @description
 * Contains information about a region of the timeline that will cause an event
 * to be raised when the playhead enters or exits it.
 *
 * @property {string} schemeIdUri
 *   Identifies the metadata type.
 * @property {number} startTime
 *   The presentation time (in seconds) that the region should start.
 * @property {number} endTime
 *   The presentation time (in seconds) that the region should end.
 * @property {string} id
 *   Specifies an identifier for this instance of the region.
 * @property {shaka.extern.MetadataFrame} payload
 *   Specifies the metadata frame.
 * @exportDoc
 */
shaka.extern.MetadataTimelineRegionInfo;

/**
 * @typedef {{
 *   audioSamplingRate: ?number,
 *   bandwidth: number,
 *   codecs: string,
 *   contentType: string,
 *   frameRate: ?number,
 *   height: ?number,
 *   mimeType: ?string,
 *   label: ?string,
 *   roles: ?Array<string>,
 *   language: ?string,
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
 * @property {?string} label
 *   The stream's label, when available.
 * @property {?Array<string>} roles
 *   The stream's role, when available.
 * @property {?string} language
 *   The stream's language, when available.
 * @property {?number} channelsCount
 *   The number of audio channels, or null if unknown.
 * @property {?string} pixelAspectRatio
 *   The pixel aspect ratio value; e.g. "1:1".
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
 *   videoRobustness: Array<string>,
 *   audioRobustness: Array<string>,
 *   serverCertificate: Uint8Array,
 *   serverCertificateUri: string,
 *   individualizationServer: string,
 *   sessionType: string,
 *   headers: !Object<string, string>
 * }}
 *
 * @property {boolean} distinctiveIdentifierRequired
 *   True if the application requires the key system to support distinctive
 *   identifiers.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} persistentStateRequired
 *   True if the application requires the key system to support persistent
 *   state, e.g., for persistent license storage.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {Array<string>} videoRobustness
 *   A key-system-specific Array of strings that specifies a required security
 *   level for video. For multiple robustness levels, list items in priority
 *   order.
 *   <br>
 *   Defaults to <code>[]</code>, i.e., no specific robustness required.
 * @property {Array<string>} audioRobustness
 *   A key-system-specific Array of strings that specifies a required security
 *   level for audio. For multiple robustness levels, list items in priority
 *   order.
 *   <br>
 *   Defaults to <code>[]</code>, i.e., no specific robustness required.
 * @property {Uint8Array} serverCertificate
 *   <i>An empty certificate (<code>byteLength==0</code>) will be treated as
 *   <code>null</code>.</i> <br>
 *   <i>A certificate will be requested from the license server if
 *   required.</i> <br>
 *   A key-system-specific server certificate used to encrypt license requests.
 *   Its use is optional and is meant as an optimization to avoid a round-trip
 *   to request a certificate.
 *   <br>
 *   Defaults to <code>null</code>.
 * @property {string} serverCertificateUri
 *   If given, will make a request to the given URI to get the server
 *   certificate. This is ignored if <code>serverCertificate</code> is set.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} individualizationServer
 *   The server that handles an <code>'individualization-request'</code>.
 *   If the server isn't given, it will default to the license server.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} sessionType
 *   The MediaKey session type to create streaming licenses with.  This doesn't
 *   affect offline storage.
 *   <br>
 *   Defaults to <code>'temporary'</code>.
 * @property {!Object<string, string>} headers
 *   The headers to use in the license request.
 *   <br>
 *   Defaults to <code>{}</code>.
 *
 * @exportDoc
 */
shaka.extern.AdvancedDrmConfiguration;


/**
 * @typedef {{
 *   sessionId: string,
 *   sessionType: string,
 *   initData: ?Uint8Array,
 *   initDataType: ?string
 * }}
 *
 * @description
 * DRM Session Metadata for an active session
 *
 * @property {string} sessionId
 *   Session id
 * @property {string} sessionType
 *   Session type
 * @property {?Uint8Array} initData
 *   Initialization data in the format indicated by initDataType.
 * @property {string} initDataType
 *   A string to indicate what format initData is in.
 * @exportDoc
 */
shaka.extern.DrmSessionMetadata;


/**
 * @typedef {{
 *   sessionId: string,
 *   initData: ?Uint8Array,
 *   initDataType: ?string
 * }}
 *
 * @description
 * DRM Session Metadata for saved persistent session
 *
 * @property {string} sessionId
 *   Session id
 * @property {?Uint8Array} initData
 *   Initialization data in the format indicated by initDataType.
 * @property {?string} initDataType
 *   A string to indicate what format initData is in.
 * @exportDoc
 */
shaka.extern.PersistentSessionMetadata;


/**
 * @typedef {{
 *   retryParameters: shaka.extern.RetryParameters,
 *   servers: !Object<string, string>,
 *   clearKeys: !Object<string, string>,
 *   delayLicenseRequestUntilPlayed: boolean,
 *   persistentSessionOnlinePlayback: boolean,
 *   persistentSessionsMetadata:
 *       !Array<shaka.extern.PersistentSessionMetadata>,
 *   advanced: Object<string, shaka.extern.AdvancedDrmConfiguration>,
 *   initDataTransform:(shaka.extern.InitDataTransform|undefined),
 *   logLicenseExchange: boolean,
 *   updateExpirationTime: number,
 *   preferredKeySystems: !Array<string>,
 *   keySystemsMapping: !Object<string, string>,
 *   parseInbandPsshEnabled: boolean,
 *   minHdcpVersion: string,
 *   ignoreDuplicateInitData: boolean,
 *   defaultAudioRobustnessForWidevine: string,
 *   defaultVideoRobustnessForWidevine: string
 * }}
 *
 * @property {shaka.extern.RetryParameters} retryParameters
 *   Retry parameters for license requests.
 * @property {!Object<string, string>} servers
 *   <i>Required for all but the clear key CDM.</i> <br>
 *   A dictionary which maps key system IDs to their license servers.
 *   For example,
 *   <code>{'com.widevine.alpha': 'https://example.com/drm'}</code>.
 *   <br>
 *   Defaults to <code>{}</code>.
 * @property {!Object<string, string>} clearKeys
 *   <i>Forces the use of the Clear Key CDM.</i>
 *   A map of key IDs (hex or base64) to keys (hex or base64).
 *   <br>
 *   Defaults to <code>{}</code>.
 * @property {boolean} delayLicenseRequestUntilPlayed
 *   True to configure drm to delay sending a license request until a user
 *   actually starts playing content.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} persistentSessionOnlinePlayback
 *   True to configure drm to try playback with given persistent session ids
 *   before requesting a license. Also prevents the session removal at playback
 *   stop, as-to be able to re-use it later.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {!Array<PersistentSessionMetadata>} persistentSessionsMetadata
 *   Persistent sessions metadata to load before starting playback.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {Object<string, shaka.extern.AdvancedDrmConfiguration>} advanced
 *   <i>Optional.</i> <br>
 *   A dictionary which maps key system IDs to advanced DRM configuration for
 *   those key systems.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {shaka.extern.InitDataTransform|undefined} initDataTransform
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
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} updateExpirationTime
 *   The frequency in seconds with which to check the expiration of a session.
 *   <br>
 *   Defaults to <code>1</code>.
 * @property {!Array<string>} preferredKeySystems
 *   Specifies the priorities of available DRM key systems.
 *   <br>
 *   Defaults <code>['com.microsoft.playready']</code> on Xbox One and
 *   PlayStation 4, and <code>[]</code> for all other browsers.
 * @property {Object<string, string>} keySystemsMapping
 *   A map of key system name to key system name.
 *   <br>
 *   Defaults to <code>{}</code>.
 * @property {boolean} parseInbandPsshEnabled
 *   When true parse DRM init data from pssh boxes in media and init segments
 *   and ignore 'encrypted' events.
 *   This is required when using in-band key rotation on Xbox One.
 *   <br>
 *   Defaults to <code>true</code> on Xbox One, and <code>false</code> for all
 *   other browsers.
 * @property {string} minHdcpVersion
 *   Indicates the minimum version of HDCP to start the playback of encrypted
 *   streams. <b>May be ignored if not supported by the device.</b>
 *   <br>
 *   Defaults to <code>''</code>, do not check the HDCP version.
 * @property {boolean} ignoreDuplicateInitData
 *   When true indicate that the player doesn't ignore duplicate init data.
 *   Note: Tizen 2015 and 2016 models will send multiple webkitneedkey events
 *   with the same init data. If the duplicates are suppressed, playback
 *   will stall without errors.
 *   <br>
 *   Defaults to <code>false</code> on Tizen 2, and <code>true</code> for all
 *   other browsers.
 * @property {string} defaultAudioRobustnessForWidevine
 *   Specify the default audio security level for Widevine when audio robustness
 *   is not specified.
 *   <br>
 *   Defaults to <code>'SW_SECURE_CRYPTO'</code> except on Android where the
 *   default value <code>''</code>.
 * @property {string} defaultVideoRobustnessForWidevine
 *   Specify the default video security level for Widevine when video robustness
 *   is not specified.
 *   <br>
 *   Defaults to <code>'SW_SECURE_DECODE'</code> except on Android where the
 *   default value <code>''</code>.
 * @exportDoc
 */
shaka.extern.DrmConfiguration;

/**
 * @typedef {function(!Uint8Array, string, ?shaka.extern.DrmInfo):!Uint8Array}
 *
 * @description
 * A callback function to handle custom content ID signaling for FairPlay
 * content.
 *
 * @exportDoc
 */
shaka.extern.InitDataTransform;


/**
 * @typedef {{
 *   tagName: !string,
 *   attributes: !Object<string, string>,
 *   children: !Array<shaka.extern.xml.Node | string>,
 *   parent: ?shaka.extern.xml.Node
 * }}
 *
 * @description
 *   Data structure for xml nodes as simple objects
 *
 * @property {!string} tagName
 *   The name of the element
 * @property {!object} attributes
 *   The attributes of the element
 * @property {!Array<shaka.extern.xml.Node | string>} children
 *   The child nodes or string body of the element
 * @property {?shaka.extern.xml.Node} parent
 *   The parent of the current element
 *
 * @exportDoc
 */
shaka.extern.xml.Node;

/**
 * @typedef {{
 *   clockSyncUri: string,
 *   disableXlinkProcessing: boolean,
 *   xlinkFailGracefully: boolean,
 *   ignoreMinBufferTime: boolean,
 *   autoCorrectDrift: boolean,
 *   initialSegmentLimit: number,
 *   ignoreSuggestedPresentationDelay: boolean,
 *   ignoreEmptyAdaptationSet: boolean,
 *   ignoreMaxSegmentDuration: boolean,
 *   keySystemsByURI: !Object<string, string>,
 *   manifestPreprocessor: function(!Element),
 *   manifestPreprocessorTXml: function(!shaka.extern.xml.Node),
 *   sequenceMode: boolean,
 *   useStreamOnceInPeriodFlattening: boolean,
 *   enableFastSwitching: boolean
 * }}
 *
 * @property {string} clockSyncUri
 *   A default clock sync URI to be used with live streams which do not
 *   contain any clock sync information.  The <code>Date</code> header from this
 *   URI will be used to determine the current time.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {boolean} disableXlinkProcessing
 *   If true, xlink-related processing will be disabled.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} xlinkFailGracefully
 *   If true, xlink-related errors will result in a fallback to the tag's
 *   existing contents. If false, xlink-related errors will be propagated
 *   to the application and will result in a playback failure.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} ignoreMinBufferTime
 *   If true will cause DASH parser to ignore <code>minBufferTime</code> from
 *   manifest.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} autoCorrectDrift
 *   If <code>true</code>, ignore the <code>availabilityStartTime</code> in the
 *   manifest and instead use the segments to determine the live edge.  This
 *   allows us to play streams that have a lot of drift.  If <code>false</code>,
 *   we can't play content where the manifest specifies segments in the future.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} initialSegmentLimit
 *   The maximum number of initial segments to generate for
 *   <code>SegmentTemplate</code> with fixed-duration segments.  This is limited
 *   to avoid excessive memory consumption with very large
 *   <code>timeShiftBufferDepth</code> values.
 *   <br>
 *   Defaults to <code>1000</code>.
 * @property {boolean} ignoreSuggestedPresentationDelay
 *   If true will cause DASH parser to ignore
 *   <code>suggestedPresentationDelay</code> from manifest.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} ignoreEmptyAdaptationSet
 *   If true will cause DASH parser to ignore
 *   empty <code>AdaptationSet</code> from manifest.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} ignoreMaxSegmentDuration
 *   If true will cause DASH parser to ignore
 *   <code>maxSegmentDuration</code> from manifest.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {Object<string, string>} keySystemsByURI
 *   A map of scheme URI to key system name. Defaults to default key systems
 *   mapping handled by Shaka.
 * @property {function(!Element)} manifestPreprocessor
 *   <b>DEPRECATED</b>: Use manifestPreprocessorTXml instead.
 *   Called immediately after the DASH manifest has been parsed into an
 *   XMLDocument. Provides a way for applications to perform efficient
 *   preprocessing of the manifest.
 * @property {function(!shaka.extern.xml.Node)} manifestPreprocessorTXml
 *   Called immediately after the DASH manifest has been parsed into an
 *   XMLDocument. Provides a way for applications to perform efficient
 *   preprocessing of the manifest.
 * @property {boolean} sequenceMode
 *   If true, the media segments are appended to the SourceBuffer in
 *   "sequence mode" (ignoring their internal timestamps).
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} useStreamOnceInPeriodFlattening
 *   If period combiner is used, this option ensures every stream is used
 *   only once in period flattening. It speeds up underlying algorithm
 *   but may raise issues if manifest does not have stream consistency
 *   between periods.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} enableFastSwitching
 *   If false, disables fast switching track recognition.
 *   <br>
 *   Defaults to <code>true</code>.
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
 *   ignoreManifestProgramDateTimeForTypes: !Array<string>,
 *   mediaPlaylistFullMimeType: string,
 *   liveSegmentsDelay: number,
 *   sequenceMode: boolean,
 *   ignoreManifestTimestampsInSegmentsMode: boolean,
 *   disableCodecGuessing: boolean,
 *   disableClosedCaptionsDetection: boolean,
 *   allowLowLatencyByteRangeOptimization: boolean,
 *   allowRangeRequestsToGuessMimeType: boolean
 * }}
 *
 * @property {boolean} ignoreTextStreamFailures
 *   If <code>true</code>, ignore any errors in a text stream and filter out
 *   those streams.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} ignoreImageStreamFailures
 *   If <code>true</code>, ignore any errors in a image stream and filter out
 *   those streams.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {string} defaultAudioCodec
 *   The default audio codec if it is not specified in the HLS playlist.
 *   <br>
 *   Defaults to <code>'mp4a.40.2'</code>.
 * @property {string} defaultVideoCodec
 *   The default video codec if it is not specified in the HLS playlist.
 *   <br>
 *   Defaults to <code>'avc1.42E01E'</code>.
 * @property {boolean} ignoreManifestProgramDateTime
 *   If <code>true</code>, the HLS parser will ignore the
 *   <code>EXT-X-PROGRAM-DATE-TIME</code> tags in the manifest and use media
 *   sequence numbers instead. It also causes EXT-X-DATERANGE tags to be
 *   ignored.  Meant for streams where <code>EXT-X-PROGRAM-DATE-TIME</code> is
 *   incorrect or malformed.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {!Array<string>} ignoreManifestProgramDateTimeForTypes
 *   An array of strings representing types for which
 *   <code>EXT-X-PROGRAM-DATE-TIME</code> should be ignored. Only used if the
 *   the main ignoreManifestProgramDateTime is set to false.
 *   For example, setting this to ['text', 'video'] will cause the PDT values
 *   text and video streams to be ignored, while still using the PDT values for
 *   audio.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {string} mediaPlaylistFullMimeType
 *   A string containing a full mime type, including both the basic mime type
 *   and also the codecs. Used when the HLS parser parses a media playlist
 *   directly, required since all of the mime type and codecs information is
 *   contained within the master playlist.
 *   You can use the <code>shaka.util.MimeUtils.getFullType()</code> utility to
 *   format this value.
 *   <br>
 *   Defaults to <code>'video/mp2t; codecs="avc1.42E01E, mp4a.40.2"'</code>.
 * @property {number} liveSegmentsDelay
 *   The default presentation delay will be calculated as a number of segments.
 *   This is the number of segments for this calculation.
 *   <br>
 *   Defaults to <code>3</code>.
 * @property {boolean} sequenceMode
 *   If true, the media segments are appended to the SourceBuffer in
 *   "sequence mode" (ignoring their internal timestamps).
 *   <br>
 *   Defaults to <code>true</code> except on WebOS 3, Tizen 2,
 *   Tizen 3 and PlayStation 4 whose default value is <code>false</code>.
 * @property {boolean} ignoreManifestTimestampsInSegmentsMode
 *   If true, don't adjust the timestamp offset to account for manifest
 *   segment durations being out of sync with segment durations. In other
 *   words, assume that there are no gaps in the segments when appending
 *   to the SourceBuffer, even if the manifest and segment times disagree.
 *   Only applies when sequenceMode is <code>false</code>.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableCodecGuessing
 *   If set to true, the HLS parser won't automatically guess or assume default
 *   codec for playlists with no "CODECS" attribute. Instead, it will attempt to
 *   extract the missing information from the media segment.
 *   As a consequence, lazy-loading media playlists won't be possible for this
 *   use case, which may result in longer video startup times.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableClosedCaptionsDetection
 *   If true, disables the automatic detection of closed captions.
 *   Otherwise, in the absence of a EXT-X-MEDIA tag with TYPE="CLOSED-CAPTIONS",
 *   Shaka Player will attempt to detect captions based on the media data.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} allowLowLatencyByteRangeOptimization
 *   If set to true, the HLS parser will optimize operation with LL and partial
 *   byte range segments. More info in
 *   https://www.akamai.com/blog/performance/-using-ll-hls-with-byte-range-addressing-to-achieve-interoperabi
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} allowRangeRequestsToGuessMimeType
 *   If set to true, the HLS parser will use range request (only first byte) to
 *   guess the mime type.
 *   <br>
 *   Defaults to <code>false</code>.
 * @exportDoc
 */
shaka.extern.HlsManifestConfiguration;


/**
 * @typedef {{
 *   manifestPreprocessor: function(!Element),
 *   manifestPreprocessorTXml: function(!shaka.extern.xml.Node),
 *   sequenceMode: boolean,
 *   keySystemsBySystemId: !Object<string, string>
 * }}
 *
 * @property {function(!Element)} manifestPreprocessor
 *   <b>DEPRECATED</b>: Use manifestPreprocessorTXml instead.
 *   Called immediately after the MSS manifest has been parsed into an
 *   XMLDocument. Provides a way for applications to perform efficient
 *   preprocessing of the manifest.
 * @property {function(!shaka.extern.xml.Node)} manifestPreprocessorTXml
 *   Called immediately after the MSS manifest has been parsed into an
 *   XMLDocument. Provides a way for applications to perform efficient
 *   preprocessing of the manifest.
 * @property {boolean} sequenceMode
 *   If true, the media segments are appended to the SourceBuffer in
 *   "sequence mode" (ignoring their internal timestamps).
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {Object<string, string>} keySystemsBySystemId
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
 *   disableIFrames: boolean,
 *   defaultPresentationDelay: number,
 *   segmentRelativeVttTiming: boolean,
 *   dash: shaka.extern.DashManifestConfiguration,
 *   hls: shaka.extern.HlsManifestConfiguration,
 *   mss: shaka.extern.MssManifestConfiguration,
 *   raiseFatalErrorOnManifestUpdateRequestFailure: boolean,
 *   continueLoadingWhenPaused: boolean,
 *   ignoreSupplementalCodecs: boolean,
 *   updatePeriod: number,
 *   ignoreDrmInfo: boolean,
 *   enableAudioGroups: boolean
 * }}
 *
 * @property {shaka.extern.RetryParameters} retryParameters
 *   Retry parameters for manifest requests.
 * @property {number} availabilityWindowOverride
 *   A number, in seconds, that overrides the availability window in the
 *   manifest, or <code>NaN</code> if the default value should be used.  This is
 *   enforced by the manifest parser, so custom manifest parsers should take
 *   care to honor this parameter.
 *   <br>
 *   Defaults to <code>NaN</code>.
 * @property {boolean} disableAudio
 *   If <code>true</code>, the audio tracks are ignored.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableVideo
 *   If <code>true</code>, the video tracks are ignored.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableText
 *   If <code>true</code>, the text tracks are ignored.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableThumbnails
 *   If <code>true</code>, the image tracks are ignored.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableIFrames
 *   If <code>true</code>, the I-Frames tracks are ignored.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} defaultPresentationDelay
 *   For DASH, it's a default <code>presentationDelay</code> value if
 *   <code>suggestedPresentationDelay</code> is missing in the MPEG DASH
 *   manifest. The default value is the lower of <code>1.5 *
 *   minBufferTime</code> and <code>segmentAvailabilityDuration</code> if not
 *   configured or set as 0.
 *   For HLS, the default value is 3 segments duration if not configured or
 *   set as 0.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {boolean} segmentRelativeVttTiming
 *   Option to calculate VTT text timings relative to the segment start
 *   instead of relative to the period start (which is the default).
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {shaka.extern.DashManifestConfiguration} dash
 *   Advanced parameters used by the DASH manifest parser.
 * @property {shaka.extern.HlsManifestConfiguration} hls
 *   Advanced parameters used by the HLS manifest parser.
 * @property {shaka.extern.MssManifestConfiguration} mss
 *   Advanced parameters used by the MSS manifest parser.
 * @property {boolean} raiseFatalErrorOnManifestUpdateRequestFailure
 *   If true, manifest update request failures will cause a fatal error.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} continueLoadingWhenPaused
 *   If true, live manifest will be updated with the regular intervals even if
 *   the video is paused.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} ignoreSupplementalCodecs
 *   If true, ignores supplemental codecs.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} updatePeriod
 *   For DASH:
 *   Override the minimumUpdatePeriod of the manifest. The value is in seconds.
 *   If the value is greater than the minimumUpdatePeriod, it will update the
 *   manifest less frequently. If you update the value during for a dynamic
 *   manifest, it will directly trigger a new download of the manifest.
 *   <br>
 *   For HLS:
 *   Override the update period of the playlist. The value is in seconds.
 *   If the value is less than 0, the period will be determined based on the
 *   segment length.  If the value is greater than 0, it will update the target
 *   duration.  If you update the value during the live, it will directly
 *   trigger a new download of the manifest.
 *   <br>
 *   Defaults to <code>-1</code>.
 * @property {boolean} ignoreDrmInfo
 *   If true will cause DASH/HLS parser to ignore DRM information specified
 *   by the manifest and treat it as if it signaled no particular key
 *   system and contained no init data.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} enableAudioGroups
 *   If set, audio streams will be grouped and filtered by their parent
 *   adaptation set ID.
 *   <br>
 *   Defaults to <code>true</code>.
 * @exportDoc
 */
shaka.extern.ManifestConfiguration;

/**
 * @typedef {{
 *   enabled: boolean,
 *   stabilityThreshold: number,
 *   rebufferIncrement: number,
 *   maxAttempts: number,
 *   maxLatency: number,
 *   minLatency: number
 * }}
 *
 * @description
 * Dynamic Target Latency configuration options.
 *
 * @property {boolean} enabled
 *   If <code>true</code>, dynamic latency for live sync is enabled. When
 *   enabled, the target latency will be adjusted closer to the min latency
 *   when playback is stable (see <code>stabilityThreshold</code>). If
 *   there are rebuffering events, then the target latency will move towards
 *   the max latency value in increments of <code>rebufferIncrement</code>.
 *   <br>
 *   Defaults to <code>false</code>
 * @property {number} rebufferIncrement
 *   The value, in seconds, to increment the target latency towards
 *   <code>maxLatency</code> after a rebuffering event.
 *   <br>
 *   Defaults to <code>0.5</code>
 * @property {number} stabilityThreshold
 *   Number of seconds after a rebuffering before we are considered stable and
 *   will move the target latency towards <code>minLatency</code>
 *   value.
 *   <br>
 *   Defaults to <code>60</code>.
 * @property {number} maxAttempts
 *   Number of times that dynamic target latency will back off to
 *   <code>maxLatency</code> and attempt to adjust it closer to
 *   <code>minLatency</code>.
 *   <br>
 *   Defaults to <code>10</code>.
 * @property {number} maxLatency
 *   The latency to use when a rebuffering event causes us to back off from
 *   the live edge.
 *   <br>
 *   Defaults to <code>4</code>.
 * @property {number} minLatency
 *   The latency to work towards when the network is stable and we want to get
 *   closer to the live edge.
 *   <br>
 *   Defaults to <code>1</code>.
 * @exportDoc
 */
shaka.extern.DynamicTargetLatencyConfiguration;


/**
 * @typedef {{
 *   enabled: boolean,
 *   targetLatency: number,
 *   targetLatencyTolerance: number,
 *   maxPlaybackRate: number,
 *   minPlaybackRate: number,
 *   panicMode: boolean,
 *   panicThreshold: number,
 *   dynamicTargetLatency: shaka.extern.DynamicTargetLatencyConfiguration
 * }}
 *
 * @description
 * LiveSync configuration options.
 *
 * @property {boolean} enabled
 *   Enable the live stream sync against the live edge by changing the playback
 *   rate.
 *   Note: on some SmartTVs, if this is activated, it may not work or the sound
 *   may be lost when activated.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} targetLatency
 *   Preferred latency, in seconds. Effective only if liveSync is true.
 *   <br>
 *   Defaults to <code>0.5</code>.
 * @property {number} targetLatencyTolerance
 *   Latency tolerance for target latency, in seconds. Effective only if
 *   liveSync is enabled.
 *   <br>
 *   Defaults to <code>0.5</code>.
 * @property {number} maxPlaybackRate
 *   Max playback rate used for latency chasing. It is recommended to use a
 *   value between 1 and 2. Effective only if liveSync is enabled.
 *   <br>
 *   Defaults to <code>1.1</code>.
 * @property {number} minPlaybackRate
 *   Minimum playback rate used for latency chasing. It is recommended to use a
 *   value between 0 and 1. Effective only if liveSync is enabled.
 *   <br>
 *   Defaults to <code>0.95</code>.
 * @property {boolean} panicMode
 *   If <code>true</code>, panic mode for live sync is enabled. When enabled,
 *   will set the playback rate to the <code>minPlaybackRate</code>
 *   until playback has continued past a rebuffering for longer than the
 *   <code>panicThreshold</code>.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} panicThreshold
 *   Number of seconds that playback stays in panic mode after a rebuffering.
 *   <br>
 *   Defaults to <code>60</code>.
 * @property {shaka.extern.DynamicTargetLatencyConfiguration
 *           } dynamicTargetLatency
 *
 *   The dynamic target latency config for dynamically adjusting the target
 *   latency to be closer to edge when network conditions are good and to back
 *   off when network conditions are bad.
 * @exportDoc
 */
shaka.extern.LiveSyncConfiguration;


/**
 * @typedef {{
 *   retryParameters: shaka.extern.RetryParameters,
 *   failureCallback: function(!shaka.util.Error),
 *   rebufferingGoal: number,
 *   bufferingGoal: number,
 *   bufferBehind: number,
 *   evictionGoal: number,
 *   ignoreTextStreamFailures: boolean,
 *   alwaysStreamText: boolean,
 *   startAtSegmentBoundary: boolean,
 *   gapDetectionThreshold: number,
 *   gapPadding: number,
 *   gapJumpTimerTime: number,
 *   durationBackoff: number,
 *   safeSeekOffset: number,
 *   safeSeekEndOffset: number,
 *   stallEnabled: boolean,
 *   stallThreshold: number,
 *   stallSkip: number,
 *   useNativeHlsForFairPlay: boolean,
 *   inaccurateManifestTolerance: number,
 *   lowLatencyMode: boolean,
 *   preferNativeDash: boolean,
 *   preferNativeHls: boolean,
 *   updateIntervalSeconds: number,
 *   observeQualityChanges: boolean,
 *   maxDisabledTime: number,
 *   segmentPrefetchLimit: number,
 *   prefetchAudioLanguages: !Array<string>,
 *   disableAudioPrefetch: boolean,
 *   disableTextPrefetch: boolean,
 *   disableVideoPrefetch: boolean,
 *   liveSync: shaka.extern.LiveSyncConfiguration,
 *   allowMediaSourceRecoveries: boolean,
 *   minTimeBetweenRecoveries: number,
 *   vodDynamicPlaybackRate: boolean,
 *   vodDynamicPlaybackRateLowBufferRate: number,
 *   vodDynamicPlaybackRateBufferRatio: number,
 *   preloadNextUrlWindow: number,
 *   loadTimeout: number,
 *   clearDecodingCache: boolean,
 *   dontChooseCodecs: boolean,
 *   shouldFixTimestampOffset: boolean,
 *   avoidEvictionOnQuotaExceededError: boolean,
 *   crossBoundaryStrategy: shaka.config.CrossBoundaryStrategy,
 *   returnToEndOfLiveWindowWhenOutside: boolean
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
 *   When the value is 0, the playback rate is not used to control the buffer.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} bufferingGoal
 *   The number of seconds of content that the StreamingEngine will attempt to
 *   buffer ahead of the playhead. This value must be greater than or equal to
 *   the rebuffering goal.
 *   <br>
 *   Defaults to <code>10</code>.
 * @property {number} bufferBehind
 *   The maximum number of seconds of content that the StreamingEngine will keep
 *   in buffer behind the playhead when it appends a new media segment.
 *   The StreamingEngine will evict content to meet this limit.
 *   <br>
 *   Defaults to <code>30</code>.
 * @property {number} evictionGoal
 *   The minimum duration in seconds of buffer overflow the StreamingEngine
 *   requires to start removing content from the buffer.
 *   Values less than <code>1.0</code> are not recommended.
 *   <br>
 *   Defaults to <code>1.0</code>.
 * @property {boolean} ignoreTextStreamFailures
 *   If <code>true</code>, the player will ignore text stream failures and
 *   continue playing other streams.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} alwaysStreamText
 *   If <code>true</code>, always stream text tracks, regardless of whether or
 *   not they are shown.  This is necessary when using the browser's built-in
 *   controls, which are not capable of signaling display state changes back to
 *   Shaka Player.
 *   Defaults to <code>false</code>.
 * @property {boolean} startAtSegmentBoundary
 *   If <code>true</code>, adjust the start time backwards so it is at the start
 *   of a segment. This affects both explicit start times and calculated start
 *   time for live streams. This can put us further from the live edge.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} gapDetectionThreshold
 *   The maximum distance (in seconds) before a gap when we'll automatically
 *   jump.
 *   <br>
 *   Defaults to <code>0.5</code>.
 * @property {number} gapPadding
 *   Padding added only for Xbox, Legacy Edge and Tizen.
 *   Based on our research (specific to Tizen), the gapPadding value must be
 *   greater than your GOP length.
 *   It’s crucial to verify this value according to your actual stream.
 *   <br>
 *   Defaults to <code>0.01</code> for Xbox and Legacy Edge, Tizen at 2.
 * @property {number} gapJumpTimerTime
 *   The polling time in seconds to check for gaps in the media.
 *   <br>
 *   Defaults to <code>0.25</code>.
 * @property {number} durationBackoff
 *   By default, we will not allow seeking to exactly the duration of a
 *   presentation.  This field is the number of seconds before duration we will
 *   seek to when the user tries to seek to or start playback at the duration.
 *   To disable this behavior, the config can be set to 0.  We recommend using
 *   the default value unless you have a good reason not to.
 *   <br>
 *   Defaults to <code>1</code>.
 * @property {number} safeSeekOffset
 *   The amount of seconds that should be added when repositioning the playhead
 *   after falling out of the availability window or seek. This gives the player
 *   more time to buffer before falling outside again, but increases the forward
 *   jump in the stream skipping more content. This is helpful for lower
 *   bandwidth scenarios.
 *   <br>
 *   Defaults to <code>5</code>.
 * @property {number} safeSeekEndOffset
 *   The amount of seconds that should be added when repositioning the playhead
 *   after falling out of the seekable end range. This is helpful for live
 *   stream with a lot of GAP. This will reposition the playback in the past
 *   and avoid to be block at the edge and buffer at the next GAP
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {boolean} stallEnabled
 *   When set to <code>true</code>, the stall detector logic will run.  If the
 *   playhead stops moving for <code>stallThreshold</code> seconds, the player
 *   will either seek or pause/play to resolve the stall, depending on the value
 *   of <code>stallSkip</code>.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} stallThreshold
 *   The maximum number of seconds that may elapse without the playhead moving
 *   (when playback is expected) before it will be labeled as a stall.
 *   <br>
 *   Defaults to <code>1</code>.
 * @property {number} stallSkip
 *   The number of seconds that the player will skip forward when a stall has
 *   been detected.  If 0, the player will pause and immediately play instead of
 *   seeking.  A value of 0 is recommended and provided as default on TV
 *   platforms (WebOS, Tizen, Chromecast, etc).
 *   <br>
 *   Defaults to <code>0.1</code>  except on Tizen, WebOS, Chromecast,
 *   Hisense whose default value is <code>0</code>.
 * @property {boolean} useNativeHlsForFairPlay
 *   Desktop Safari has both MediaSource and their native HLS implementation.
 *   Depending on the application's needs, it may prefer one over the other.
 *   Warning when disabled: Where single-key DRM streams work fine, multi-keys
 *   streams is showing unexpected behaviours (stall, audio playing with video
 *   freezes, ...). Use with care.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} inaccurateManifestTolerance
 *   The maximum difference, in seconds, between the times in the manifest and
 *   the times in the segments.  Larger values allow us to compensate for more
 *   drift (up to one segment duration).  Smaller values reduce the incidence of
 *   extra segment requests necessary to compensate for drift.
 *   <br>
 *   Defaults to <code>2</code>.
 * @property {boolean} lowLatencyMode
 *   If <code>true</code>, low latency streaming mode is enabled. If
 *   lowLatencyMode is set to true, it changes the default config values for
 *   other things, only on streams that supports low latency,
 *   see: docs/tutorials/config.md
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} preferNativeDash
 *   If true, prefer native DASH playback when possible, regardless of platform.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} preferNativeHls
 *   If true, prefer native HLS playback when possible, regardless of platform.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} updateIntervalSeconds
 *   The minimum number of seconds to see if the manifest has changes.
 *   <br>
 *   Defaults to <code>1</code>.
 * @property {boolean} observeQualityChanges
 *   If true, monitor media quality changes and emit
 *   <code>shaka.Player.MediaQualityChangedEvent</code>.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} maxDisabledTime
 *   The maximum time a variant can be disabled when NETWORK HTTP_ERROR
 *   is reached, in seconds.
 *   If all variants are disabled this way, NETWORK HTTP_ERROR will be thrown.
 *   <br>
 *   Defaults to <code>30</code>.
 * @property {number} segmentPrefetchLimit
 *   The maximum number of segments for each active stream to be prefetched
 *   ahead of playhead in parallel.
 *   If <code>0</code>, the segments will be fetched sequentially.
 *   <br>
 *   Defaults to <code>1</code>.
 * @property {!Array<string>} prefetchAudioLanguages
 *   The audio languages to prefetch.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {boolean} disableAudioPrefetch
 *   If set and prefetch limit is defined, it will prevent from prefetching data
 *   for audio.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableTextPrefetch
 *   If set and prefetch limit is defined, it will prevent from prefetching data
 *   for text.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableVideoPrefetch
 *   If set and prefetch limit is defined, it will prevent from prefetching data
 *   for video.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {shaka.extern.LiveSyncConfiguration} liveSync
 *   The live sync configuration for keeping near the live edge.
 * @property {boolean} allowMediaSourceRecoveries
 *   Indicate if we should recover from VIDEO_ERROR resetting Media Source.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} minTimeBetweenRecoveries
 *   The minimum time between recoveries when VIDEO_ERROR is reached, in
 *   seconds.
 *   <br>
 *   Defaults to <code>5</code>.
 * @property {boolean} vodDynamicPlaybackRate
 *   Adapt the playback rate of the player to keep the buffer full.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} vodDynamicPlaybackRateLowBufferRate
 *   Playback rate to use if the buffer is too small.
 *   <br>
 *   Defaults to <code>0.95</code>.
 * @property {number} vodDynamicPlaybackRateBufferRatio
 *   Ratio of the <code>bufferingGoal</code> as the low threshold for
 *   setting the playback rate to
 *   <code>vodDynamicPlaybackRateLowBufferRate</code>.
 *   <br>
 *   Defaults to <code>0.5</code>.
 * @property {number} preloadNextUrlWindow
 *   The window of time at the end of the presentation to begin preloading the
 *   next URL, such as one specified by a urn:mpeg:dash:chaining:2016 element
 *   in DASH. Measured in seconds. If the value is 0, the next URL will not
 *   be preloaded at all.
 *   <br>
 *   Defaults to <code>30</code>.
 * @property {number} loadTimeout
 *   The maximum timeout to reject the load when using src= in case the content
 *   does not work correctly.  Measured in seconds.
 *   <br>
 *   Defaults to <code>30</code>.
 * @property {boolean} clearDecodingCache
 *   Clears decodingInfo and MediaKeySystemAccess cache during player unload
 *   as these objects may become corrupt and cause issues during subsequent
 *   playbacks on some platforms.
 *   <br>
 *   Defaults to <code>true</code> on PlayStation devices and to
 *   <code>false</code> on other devices.
 * @property {boolean} dontChooseCodecs
 *   If true, we don't choose codecs in the player, and keep all the variants.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} shouldFixTimestampOffset
 *   If true, we will try to fix problems when the timestampOffset is less than
 *   the baseMediaDecodeTime. This only works when the manifest is DASH with
 *   MP4 segments.
 *   <br>
 *   Defaults to <code>false</code> except on Tizen, WebOS whose default value
 *   is <code>true</code>.
 * @property {boolean} avoidEvictionOnQuotaExceededError
 *   Avoid evict content on QuotaExceededError.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {shaka.config.CrossBoundaryStrategy} crossBoundaryStrategy
 *   Allows MSE to be reset when crossing a boundary. Optionally, we can stop
 *   resetting MSE when MSE passed an encrypted boundary.
 *   Defaults to <code>KEEP</code> except on Tizen 3 where the default value
 *   is <code>RESET_TO_ENCRYPTED</code> and WebOS 3 where the default value
 *   is <code>RESET</code>.
 * @property {boolean} returnToEndOfLiveWindowWhenOutside
 *   If true, when the playhead is behind the start of the live window,
 *   it will be moved to the end of the live window, instead of the start.
 *   <br>
 *   Defaults to <code>false</code>.
 * @exportDoc
 */
shaka.extern.StreamingConfiguration;


/**
 * @typedef {{
 *   forceHTTP: boolean,
 *   forceHTTPS: boolean,
 *   minBytesForProgressEvents: number
 * }}
 *
 * @description
 * The Networking's configuration options.
 *
 * @property {boolean} forceHTTP
 *   If true, if the protocol is HTTPs change it to HTTP.
 *   If both forceHTTP and forceHTTPS are set, forceHTTPS wins.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} forceHTTPS
 *   If true, if the protocol is HTTP change it to HTTPs.
 *   If both forceHTTP and forceHTTPS are set, forceHTTPS wins.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} minBytesForProgressEvents
 *   Defines minimum number of bytes that should be used to emit progress event,
 *   if possible. To avoid issues around feeding ABR with request history, this
 *   value should be greater than or equal to `abr.advanced.minBytes`.
 *   By default equals 16e3 (the same value as `abr.advanced.minBytes`).
 * @exportDoc
 */
shaka.extern.NetworkingConfiguration;


/**
 * @typedef {{
 *   codecSwitchingStrategy: shaka.config.CodecSwitchingStrategy,
 *   addExtraFeaturesToSourceBuffer: function(string): string,
 *   forceTransmux: boolean,
 *   insertFakeEncryptionInInit: boolean,
 *   correctEc3Enca: boolean,
 *   modifyCueCallback: shaka.extern.TextParser.ModifyCueCallback,
 *   dispatchAllEmsgBoxes: boolean,
 *   useSourceElements: boolean,
 *   durationReductionEmitsUpdateEnd: boolean
 * }}
 *
 * @description
 *   Media source configuration.
 *
 * @property {shaka.config.CodecSwitchingStrategy} codecSwitchingStrategy
 *   Allow codec switching strategy. SMOOTH loading uses
 *   SourceBuffer.changeType. RELOAD uses cycling of MediaSource.
 *   <br>
 *   Defaults to SMOOTH if SMOOTH codec switching is supported, RELOAD
 *   overwise.
 * @property {function(string): string} addExtraFeaturesToSourceBuffer
 *   Callback to generate extra features string based on used MIME type.
 *   Some platforms may need to pass features when initializing the
 *   sourceBuffer.
 *   This string is ultimately appended to a MIME type in addSourceBuffer() &
 *   changeType().
 * @property {boolean} forceTransmux
 *   If this is <code>true</code>, we will transmux AAC and TS content even if
 *   not strictly necessary for the assets to be played.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} insertFakeEncryptionInInit
 *   If true, will apply a work-around for non-encrypted init segments on
 *   encrypted content for some platforms.
 *   <br><br>
 *   See https://github.com/shaka-project/shaka-player/issues/2759.
 *   <br><br>
 *   If you know you don't need this, you can set this value to
 *   <code>false</code> to gain a few milliseconds on loading time and seek
 *   time.
 *   <br><br>
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} correctEc3Enca
 *   If true, will apply a work-around for Audio init segments signaling
 *   EC-3 codec with protection. This will force the ChannelCount field
 *   of the 'enca' box to be set to 2, which is required via the dolby
 *   spec.
 *   <br>
 *   This value defaults to <code>false</code>.
 * @property {shaka.extern.TextParser.ModifyCueCallback} modifyCueCallback
 *    A callback called for each cue after it is parsed, but right before it
 *    is appended to the presentation.
 *    Gives a chance for client-side editing of cue text, cue timing, etc.
 * @property {boolean} dispatchAllEmsgBoxes
 *   If true, all emsg boxes are parsed and dispatched.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} useSourceElements
 *   If true, uses <source> element. Otherwise,
 *   sets the mediaSource url blob to src attribute.
 *   Disabling it will prevent using AirPlay on MSE.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} durationReductionEmitsUpdateEnd
 *   https://www.w3.org/TR/media-source-2/#duration-change-algorithm
 *   "Duration reductions that would truncate currently buffered media are
 *   disallowed.
 *   When truncation is necessary, use remove() to reduce the buffered range
 *   before updating duration."
 *   When set indicates media source duration change can truncate buffer, hence
 *   updateend event is expected on setDuration operation if new duration is
 *   smaller than existing value.
 *   <br>
 *   Defaults to <code>true</code>.
 * @exportDoc
 */
shaka.extern.MediaSourceConfiguration;


/**
 * @typedef {{
 *   customPlayheadTracker: boolean,
 *   skipPlayDetection: boolean,
 *   supportsMultipleMediaElements: boolean,
 *   disableHLSInterstitial: boolean,
 *   disableDASHInterstitial: boolean,
 *   allowPreloadOnDomElements: boolean,
 *   allowStartInMiddleOfInterstitial: boolean
 * }}
 *
 * @description
 *   Ads configuration.
 *
 * @property {boolean} customPlayheadTracker
 *   If this is <code>true</code>, we create a custom playhead tracker for
 *   Client Side. This is useful because it allows you to implement the use of
 *   IMA on platforms that do not support multiple video elements.
 *   <br>
 *   Defaults to <code>false</code> except on Tizen, WebOS, Chromecast,
 *   Hisense, PlayStation 4, PlayStation5, Xbox, Vizio whose default value is
 *   <code>true</code>.
 * @property {boolean} skipPlayDetection
 *   If this is true, we will load Client Side ads without waiting for a play
 *   event.
 *   <br>
 *   Defaults to <code>false</code> except on Tizen, WebOS, Chromecast,
 *   Hisense, PlayStation 4, PlayStation5, Xbox, Vizio whose default value is
 *   <code>true</code>.
 * @property {boolean} supportsMultipleMediaElements
 *   If this is true, the browser supports multiple media elements.
 *   <br>
 *   Defaults to <code>true</code> except on Tizen, WebOS, Chromecast,
 *   Hisense, PlayStation 4, PlayStation5, Xbox, Vizio whose default value is
 *   <code>false</code>.
 * @property {boolean} disableHLSInterstitial
 *   If this is true, we ignore HLS interstitial events.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} disableDASHInterstitial
 *   If this is true, we ignore DASH interstitial events.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} allowPreloadOnDomElements
 *   If this is true, we will use HTMLLinkElement to preload some resources.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} allowStartInMiddleOfInterstitial
 *   If this is true, we will allow start in the middle of an interstitial.
 *   <br>
 *   Defaults to <code>true</code>.
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
 *   ignoreDevicePixelRatio: boolean,
 *   clearBufferSwitch: boolean,
 *   safeMarginSwitch: number,
 *   cacheLoadThreshold: number,
 *   minTimeToSwitch: number,
 *   preferNetworkInformationBandwidth: boolean,
 *   removeLatencyFromFirstPacketTime: boolean
 * }}
 *
 * @property {boolean} enabled
 *   If true, enable adaptation by the current AbrManager.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} useNetworkInformation
 *   If true, use the Network Information API in the current AbrManager, if it
 *   is available in the browser environment.  If the Network Information API is
 *   used, Shaka Player will ignore the defaultBandwidthEstimate config.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} defaultBandwidthEstimate
 *   The default bandwidth estimate to use if there is not enough data, in
 *   bit/sec.  Only used if useNetworkInformation is false, or if the Network
 *   Information API is not available.
 *   <br>
 *   Defaults to <code>1e6</code>.
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
 *   <br>
 *   Defaults to <code>8</code>.
 * @property {number} bandwidthUpgradeTarget
 *   The fraction of the estimated bandwidth which we should try to use when
 *   upgrading.
 *   <br>
 *   Defaults to <code>0.85</code>.
 * @property {number} bandwidthDowngradeTarget
 *   The largest fraction of the estimated bandwidth we should use. We should
 *   downgrade to avoid this.
 *   <br>
 *   Defaults to <code>0.95</code>.
 * @property {shaka.extern.AdvancedAbrConfiguration} advanced
 *   Advanced ABR configuration
 * @property {boolean} restrictToElementSize
 *   If true, restrict the quality to media element size.
 *   Note: The use of ResizeObserver is required for it to work properly. If
 *   true without ResizeObserver, it behaves as false.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} restrictToScreenSize
 *   If true, restrict the quality to screen size.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} ignoreDevicePixelRatio
 *   If true,device pixel ratio is ignored when restricting the quality to
 *   media element size or screen size.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} clearBufferSwitch
 *   If true, the buffer will be cleared during the switch.
 *   The default automatic behavior is false to have a smoother transition.
 *   On some device it's better to clear buffer.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {number} safeMarginSwitch
 *   Optional amount of buffer (in seconds) to
 *   retain when clearing the buffer during the automatic switch.
 *   Useful for switching variant quickly without causing a buffering event.
 *   Ignored if clearBuffer is false.
 *   Can cause hiccups on some browsers if chosen too small, e.g.
 *   The amount of two segments is a fair minimum to consider as safeMargin
 *   value.
 *   <br>
 *   Defaults to <code>o</code>.
 * @property {number} cacheLoadThreshold
 *   Indicates the value in milliseconds from which a request is not
 *   considered cached.
 *   <br>
 *   Defaults to <code>5</code>.
 * @property {number} minTimeToSwitch
 *   Indicates the minimum time to change quality once the real bandwidth is
 *   available, in seconds. This time is only used on the first load.
 *   <br>
 *   Defaults to <code>0</code> seconds except in Apple browsers whose default
 *   value  is <code>0.5</code> seconds.
 * @property {boolean} preferNetworkInformationBandwidth
 *   If true, use the Network Information API bandwidth estimation in the
 *   current AbrManager, if it is available in the browser environment. This
 *   way Shaka Player will never estimate the bandwidth and we will always
 *   trust the information provided by the browser.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} removeLatencyFromFirstPacketTime
 *   If true, we remove the latency from first packet time. This time is
 *   used to calculate the real bandwidth.
 *   <br>
 *   Defaults to <code>true</code>.
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
 *   <br>
 *   Defaults to <code>128e3</code>.
 * @property {number} minBytes
 *   Minimum number of bytes, under which samples are discarded.  Our models
 *   do not include latency information, so connection startup time (time to
 *   first byte) is considered part of the download time.  Because of this, we
 *   should ignore very small downloads which would cause our estimate to be
 *   too low.
 *   <br>
 *   Defaults to <code>16e3</code>.
 * @property {number} fastHalfLife
 *   The quantity of prior samples (by weight) used when creating a new
 *   estimate, in seconds.  Those prior samples make up half of the
 *   new estimate.
 *   <br>
 *   Defaults to <code>2</code>.
 * @property {number} slowHalfLife
 *   The quantity of prior samples (by weight) used when creating a new
 *   estimate, in seconds.  Those prior samples make up half of the
 *   new estimate.
 *   <br>
 *   Defaults to <code>5</code>.
 * @exportDoc
 */
shaka.extern.AdvancedAbrConfiguration;


/**
 * @typedef {{
 *   mode: string,
 *   enabled: boolean,
 *   useHeaders: boolean,
 *   url: string,
 *   includeKeys: !Array<string>,
 *   events: !Array<string>,
 *   timeInterval: number,
 * }}
 *
 * @description
 *  Common Media Client Data (CMCD) Target Configuration
 *
 * @property {string} mode
 * Specifies the transmission strategy for the CMCD data.
 * <br>
 * Possible values are:
 * <ul><li><b>'response'</b>: This mode reports data to one or more alternate
 * destinations after either the full response or an error has been received
 * to a media object request, using one of the Data Transmission Modes
 * (header, query parameters, json object)
 * </li></ul>
 * @property {boolean} enabled
 * If <code>true</code>, enable CMCD data to be sent with media requests.
 * <br>
 * Defaults to <code>false</code>.
 * @property {boolean} useHeaders
 * If <code>true</code>, the CMCD data is sent as HTTP request headers.
 * If <code>false</code>, it is sent as query parameters in the URL.
 * <br>
 * Defaults to <code>false</code>.
 * @property {string} url
 * A specific URL to which the CMCD data will be sent.
 * @property {!Array<string>} includeKeys
 * An array of keys to include in the CMCD data.
 * If not provided, all keys will be included.
 * <br>
 * Defaults to <code>[]</code>.
 * @property {!Array<string>} events
 * An array of events to include as part of ps and sta in the CMCD data.
 * If not provided, all events will be included.
 * <br>
 * Defaults to <code>[]</code>.
 * @property {number} timeInterval
 *   Time Interval config in seconds
 *   <br>
 *   Defaults to <code>10</code>.
 * @exportDoc
 */
shaka.extern.CmcdTarget;

/**
 * @typedef {{
 *   enabled: boolean,
 *   useHeaders: boolean,
 *   sessionId: string,
 *   contentId: string,
 *   rtpSafetyFactor: number,
 *   includeKeys: !Array<string>,
 *   version: number,
 *   targets: ?Array<shaka.extern.CmcdTarget>
 * }}
 *
 * @description
 *   Common Media Client Data (CMCD) configuration.
 *
 * @property {boolean} enabled
 *   If <code>true</code>, enable CMCD data to be sent with media requests.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} useHeaders
 *   If <code>true</code>, send CMCD data using the header transmission mode
 *   instead of query args.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {string} sessionId
 *   A GUID identifying the current playback session. A playback session
 *   typically ties together segments belonging to a single media asset.
 *   Maximum length is 64 characters. It is RECOMMENDED to conform to the UUID
 *   specification.
 *   <br>
 *   By default the sessionId is automatically generated on each
 *   <code>load()</code> call.
 * @property {string} contentId
 *   A unique string identifying the current content. Maximum length is 64
 *   characters. This value is consistent across multiple different sessions and
 *   devices and is defined and updated at the discretion of the service
 *   provider.
 *   <br>
 *   Defaults to <code>'false'</code>.
 * @property {number} rtpSafetyFactor
 *   RTP safety factor.
 *   <br>
 *   Defaults to <code>5</code>.
 * @property {!Array<string>} includeKeys
 *   An array of keys to include in the CMCD data. If not provided, all keys
 *   will be included.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {number} version
 *   The CMCD version.
 *   Valid values are <code>1</code> or <code>2</code>, corresponding to CMCD v1
 *   and CMCD v2 specifications, respectively.
 *   <br>
 *   Defaults to <code>1</code>.
 * @property {Array<shaka.extern.CmcdTarget>=} targets
 *   The event/response mode targets.
 *   <br>
 * @exportDoc
 */
shaka.extern.CmcdConfiguration;


/**
 * @typedef {{
 *   enabled: boolean,
 *   applyMaximumSuggestedBitrate: boolean,
 *   estimatedThroughputWeightRatio: number
 * }}
 *
 * @description
 *   Common Media Server Data (CMSD) configuration.
 *
 * @property {boolean} enabled
 *   If <code>true</code>, enables reading CMSD data in media requests.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {boolean} applyMaximumSuggestedBitrate
 *   If true, we must apply the maximum suggested bitrate. If false, we ignore
 *   this.
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} estimatedThroughputWeightRatio
 *   How much the estimatedThroughput of the CMSD data should be weighted
 *   against the default estimate, between 0 and 1.
 *   <br>
 *   Defaults to <code>0.5</code>.
 * @exportDoc
 */
shaka.extern.CmsdConfiguration;

/**
 * @typedef {{
 *   enabled: boolean,
 *   dynamicPerformanceScaling: boolean,
 *   logLevel: number,
 *   drawLogo: boolean,
 *   poster: boolean
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
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} logLevel
 *   Loglevel 0-5 for logging.
 *   NONE = 0
 *   ERROR = 1
 *   WARNING = 2
 *   INFO = 3
 *   DEBUG = 4
 *   VERBOSE = 5
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {boolean} drawLogo
 *   If <code>true</code>, LCEVC Logo is placed on the top left hand corner
 *   which only appears when the LCEVC enhanced frames are being rendered.
 *   Defaults to true for the lib but is forced to false in this integration
 *   unless explicitly set to true through config.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} poster
 *   If <code>true</code>, render a poster frame before the video is started.
 *   Defaults to true for the lib and set to true in the integration.
 *   <br>
 *   Defaults to <code>true</code>.
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
 * @property {function(shaka.extern.TrackList):
 *              !Promise<shaka.extern.TrackList>} trackSelectionCallback
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
 *   <br>
 *   Defaults to <code>true</code>.
 * @property {number} numberOfParallelDownloads
 *   Number of parallel downloads. If the value is 0, downloads will be
 *   sequential for each stream.
 *   Note: normally browsers limit to 5 request in parallel, so putting a
 *   number higher than this will not help it download faster.
 *   <br>
 *   Defaults to <code>5</code>.
 * @exportDoc
 */
shaka.extern.OfflineConfiguration;


/**
 * @typedef {{
 *   captionsUpdatePeriod: number,
 *   fontScaleFactor: number
 * }}
 *
 * @description
 *   Text displayer configuration.
 *
 * @property {number} captionsUpdatePeriod
 *   The number of seconds to see if the captions should be updated.
 *   <br>
 *   Defaults to <code>0.25</code>.
 * @property {number} fontScaleFactor
 *   The font scale factor used to increase or decrease the font size.
 *   <br>
 *   Defaults to <code>1</code>.
 * @exportDoc
 */
shaka.extern.TextDisplayerConfiguration;


/**
 * @typedef {{
 *   ads: shaka.extern.AdsConfiguration,
 *   autoShowText: shaka.config.AutoShowText,
 *   drm: shaka.extern.DrmConfiguration,
 *   manifest: shaka.extern.ManifestConfiguration,
 *   streaming: shaka.extern.StreamingConfiguration,
 *   networking: shaka.extern.NetworkingConfiguration,
 *   mediaSource: shaka.extern.MediaSourceConfiguration,
 *   abrFactory: shaka.extern.AbrManager.Factory,
 *   adaptationSetCriteriaFactory: shaka.extern.AdaptationSetCriteria.Factory,
 *   abr: shaka.extern.AbrConfiguration,
 *   cmcd: shaka.extern.CmcdConfiguration,
 *   cmsd: shaka.extern.CmsdConfiguration,
 *   lcevc: shaka.extern.LcevcConfiguration,
 *   offline: shaka.extern.OfflineConfiguration,
 *   ignoreHardwareResolution: boolean,
 *   preferredAudioLanguage: string,
 *   preferredAudioLabel: string,
 *   preferredTextLanguage: string,
 *   preferredAudioRole: string,
 *   preferredVideoRole: string,
 *   preferredTextRole: string,
 *   preferredVideoCodecs: !Array<string>,
 *   preferredAudioCodecs: !Array<string>,
 *   preferredTextFormats: !Array<string>,
 *   preferredAudioChannelCount: number,
 *   preferredVideoHdrLevel: string,
 *   preferredVideoLayout: string,
 *   preferredVideoLabel: string,
 *   preferredDecodingAttributes: !Array<string>,
 *   preferForcedSubs: boolean,
 *   preferSpatialAudio: boolean,
 *   queue: shaka.extern.QueueConfiguration,
 *   restrictions: shaka.extern.Restrictions,
 *   playRangeStart: number,
 *   playRangeEnd: number,
 *   textDisplayer: shaka.extern.TextDisplayerConfiguration,
 *   textDisplayFactory: shaka.extern.TextDisplayer.Factory
 * }}
 *
 * @property {shaka.extern.AdsConfiguration} ads
 *   Ads configuration and settings.
 * @property {shaka.config.AutoShowText} autoShowText
 *   Controls behavior of auto-showing text tracks on load().
 *   <br>
 *   Defaults to
 *   {@link shaka.config.AutoShowText#IF_SUBTITLES_MAY_BE_NEEDED}.
 * @property {shaka.extern.DrmConfiguration} drm
 *   DRM configuration and settings.
 * @property {shaka.extern.ManifestConfiguration} manifest
 *   Manifest configuration and settings.
 * @property {shaka.extern.StreamingConfiguration} streaming
 *   Streaming configuration and settings.
 * @property {shaka.extern.NetworkingConfiguration} networking
 *   Networking configuration and settings.
 * @property {shaka.extern.MediaSourceConfiguration} mediaSource
 *   Media source configuration and settings.
 * @property {shaka.extern.AbrManager.Factory} abrFactory
 *   A factory to construct an abr manager.
 * @property {shaka.extern.AdaptationSetCriteria.Factory
 *           } adaptationSetCriteriaFactory
 *   A factory to construct an adaptation set criteria.
 * @property {shaka.extern.AbrConfiguration} abr
 *   ABR configuration and settings.
 * @property {shaka.extern.CmcdConfiguration} cmcd
 *   CMCD configuration and settings. (Common Media Client Data)
 * @property {shaka.extern.CmsdConfiguration} cmsd
 *   CMSD configuration and settings. (Common Media Server Data)
 * @property {shaka.extern.LcevcConfiguration} lcevc
 *   MPEG-5 LCEVC configuration and settings.
 *   (Low Complexity Enhancement Video Codec)
 * @property {shaka.extern.OfflineConfiguration} offline
 *   Offline configuration and settings.
 * @property {boolean} ignoreHardwareResolution
 *   Do not detect the hardware resolution.  For some niche cases where content
 *   is only available at resolutions beyond the device's native resolution,
 *   and you are confident it can be decoded and downscaled, this flag can
 *   allow playback when it would otherwise fail.
 * @property {string} preferredAudioLanguage
 *   The preferred language to use for audio tracks.  If not given it will use
 *   the <code>'main'</code> track.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} preferredAudioLabel
 *   The preferred label to use for audio tracks.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} preferredVideoLabel
 *   The preferred label to use for video tracks.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} preferredTextLanguage
 *   The preferred language to use for text tracks.  If a matching text track
 *   is found, and the selected audio and text tracks have different languages,
 *   the text track will be shown.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} preferredAudioRole
 *   The preferred audio role to use for variants.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} preferredVideoRole
 *   The preferred video role to use for variants.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {string} preferredTextRole
 *   The preferred role to use for text tracks.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {!Array<string>} preferredVideoCodecs
 *   The list of preferred video codecs, in order of highest to lowest priority.
 *   This is used to do a filtering of the variants available for the player.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {!Array<string>} preferredAudioCodecs
 *   The list of preferred audio codecs, in order of highest to lowest priority.
 *   This is used to do a filtering of the variants available for the player.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {!Array<string>} preferredTextFormats
 *   The list of preferred text formats, in order of highest to lowest priority.
 *   This is used to do a filtering of the text tracks available for the player.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {number} preferredAudioChannelCount
 *   The preferred number of audio channels.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>2</code>.
 * @property {string} preferredVideoHdrLevel
 *   The preferred HDR level of the video. If possible, this will cause the
 *   player to filter to assets that either have that HDR level, or no HDR level
 *   at all.
 *   Can be 'SDR', 'PQ', 'HLG', 'AUTO' for auto-detect, or '' for no preference.
 *   Note that one some platforms, such as Chrome, attempting to play PQ content
 *   may cause problems.
 *   <br>
 *   Defaults to <code>'AUTO'</code>.
 * @property {string} preferredVideoLayout
 *   The preferred video layout of the video.
 *   Can be 'CH-STEREO', 'CH-MONO', or '' for no preference.
 *   If the content is predominantly stereoscopic you should use 'CH-STEREO'.
 *   If the content is predominantly monoscopic you should use 'CH-MONO'.
 *   <br>
 *   Defaults to <code>''</code>.
 * @property {!Array<string>} preferredDecodingAttributes
 *   The list of preferred attributes of decodingInfo, in the order of their
 *   priorities.
 *   This is used to do a filtering of the variants available for the player.
 *   <br>
 *   Defaults to <code>[]</code>.
 * @property {boolean} preferForcedSubs
 *   If true, a forced text track is preferred.
 *   If the content has no forced captions and the value is true,
 *   no text track is chosen.
 *   Changing this during playback will not affect the current playback.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {boolean} preferSpatialAudio
 *   If true, a spatial audio track is preferred.
 *   <br>
 *   Defaults to <code>false</code>.
 * @property {shaka.extern.QueueConfiguration} queue
 *   Queue manager configuration and settings.
 * @property {shaka.extern.Restrictions} restrictions
 *   The application restrictions to apply to the tracks.  These are "hard"
 *   restrictions.  Any track that fails to meet these restrictions will not
 *   appear in the track list.  If no tracks meet these restrictions, playback
 *   will fail.
 * @property {number} playRangeStart
 *   Optional playback and seek start time in seconds. Defaults to 0 if
 *   not provided.
 *   <br>
 *   Defaults to <code>0</code>.
 * @property {number} playRangeEnd
 *   Optional playback and seek end time in seconds. Defaults to the end of
 *   the presentation if not provided.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 * @property {shaka.extern.TextDisplayerConfiguration} textDisplayer
 *   Text displayer configuration and settings.
 * @property {shaka.extern.TextDisplayer.Factory} textDisplayFactory
 *   A factory to construct a text displayer. If this is changed during
 *   playback, it will cause the text tracks to be reloaded. During playback it
 *   may be called automatically if a change in
 *   <code>webkitPresentationMode</code> is detected and
 *   <code>setVideoContainer</code> has been called.
 * @exportDoc
 */
shaka.extern.PlayerConfiguration;


/**
 * @typedef {{
 *   preloadNextUrlWindow: number,
 *   preloadPrevItem: boolean,
 *   repeatMode: shaka.config.RepeatMode
 * }}
 *
 * @description
 * The Queue Manager's configuration options.
 *
 * @property {number} preloadNextUrlWindow
 *   The window of time at the end of the presentation to begin preloading the
 *   next item. Measured in seconds. If the value is 0, the next URL will not
 *   be preloaded at all.
 *   <br>
 *   Defaults to <code>Infinity</code>.
 * @property {boolean} preloadPrevItem
 *   Defaults to <code>true</code>.
 * @property {shaka.config.RepeatMode} repeatMode
 *   Controls behavior of the queue when all items have been played.
 *   <br>
 *   Defaults to {@link shaka.config.RepeatMode#OFF}.
 * @exportDoc
 */
shaka.extern.QueueConfiguration;


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
 *   segment: shaka.media.SegmentReference,
 *   imageHeight: number,
 *   imageWidth: number,
 *   height: number,
 *   positionX: number,
 *   positionY: number,
 *   startTime: number,
 *   duration: number,
 *   uris: !Array<string>,
 *   startByte: number,
 *   endByte: ?number,
 *   width: number,
 *   sprite: boolean,
 *   mimeType: ?string,
 *   codecs: ?string
 * }}
 *
 * @property {shaka.media.SegmentReference} segment
 *    The segment of this thumbnail.
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
 * @property {!Array<string>} uris
 *   An array of URIs to attempt.  They will be tried in the order they are
 *   given.
 * @property {number} startByte
 *   The offset from the start of the uri resource.
 * @property {?number} endByte
 *   The offset from the start of the resource to the end of the segment,
 *   inclusive.  A value of null indicates that the segment extends to the end
 *   of the resource.
 * @property {number} width
 *    The thumbnail width in px.
 * @property {boolean} sprite
 *    Indicate if the thumbnail is a sprite.
 * @property {?string} mimeType
 *   The thumbnail MIME type, if present.
 * @property {?string} codecs
 *   The thumbnail codecs, if present.
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


/**
 * @typedef {{
 *   uri: string,
 *   language: string,
 *   kind: string,
 *   mime: string,
 *   codecs: (string|undefined)
 * }}
 *
 * @property {string} uri
 *   The URI of the text.
 * @property {string} language
 *   The language of the text (e.g. 'en').
 * @property {string} kind
 *   The kind of text (e.g. 'subtitles').
 * @property {?string} mime
 *   The MIME type of the text (e.g. 'text/vtt')
 * @property {?string} codecs
 *   The codecs string, if needed to refine the MIME type.
 * @exportDoc
 */
shaka.extern.ExtraText;


/**
 * @typedef {{
 *   uri: string,
 *   language: string,
 *   mime: string
 * }}
 *
 * @property {string} uri
 *   The URI of the chapter.
 * @property {string} language
 *   The language of the chapter (e.g. 'en').
 * @property {string} mime
 *   The MIME type of the chapter (e.g. 'text/vtt')
 */
shaka.extern.ExtraChapter;
