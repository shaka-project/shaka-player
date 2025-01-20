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
 *   basic: boolean,
 *   encrypted: !Object<string, boolean>
 * }}
 *
 * @property {boolean} basic
 *   True if offline is usable at all.
 * @property {!Object<string, boolean>} encrypted
 *   A map of key system name to whether it supports offline playback.
 * @exportDoc
 */
shaka.extern.OfflineSupport;


/**
 * @typedef {{
 *   offlineUri: ?string,
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   expiration: number,
 *   tracks: !Array<shaka.extern.Track>,
 *   appMetadata: Object,
 *   isIncomplete: boolean
 * }}
 *
 * @property {?string} offlineUri
 *   An offline URI to access the content. This can be passed directly to
 *   Player. If the uri is null, it means that the content has not finished
 *   downloading and is not ready to play.
 * @property {string} originalManifestUri
 *   The original manifest URI of the content stored.
 * @property {number} duration
 *   The duration of the content, in seconds.
 * @property {number} size
 *   The size of the content, in bytes.
 * @property {number} expiration
 *   The time that the encrypted license expires, in milliseconds.  If the media
 *   is clear or the license never expires, this will equal Infinity.
 * @property {!Array<shaka.extern.Track>} tracks
 *   The tracks that are stored.
 * @property {Object} appMetadata
 *   The metadata passed to store().
 * @property {boolean} isIncomplete
 *   If true, the content is still downloading.  Manifests with this set cannot
 *   be played yet.
 * @exportDoc
 */
shaka.extern.StoredContent;


/**
 * @typedef {{
 *   creationTime: number,
 *   originalManifestUri: string,
 *   duration: number,
 *   size: number,
 *   expiration: number,
 *   streams: !Array<shaka.extern.StreamDB>,
 *   sessionIds: !Array<string>,
 *   drmInfo: ?shaka.extern.DrmInfo,
 *   appMetadata: Object,
 *   isIncomplete: (boolean|undefined),
 *   sequenceMode: (boolean|undefined),
 *   type: (string|undefined)
 * }}
 *
 * @property {number} creationTime
 *   The date time when the asset was created.
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
 * @property {!Array<shaka.extern.StreamDB>} streams
 *   The Streams that are stored.
 * @property {!Array<string>} sessionIds
 *   The DRM offline session IDs for the media.
 * @property {?shaka.extern.DrmInfo} drmInfo
 *   The DRM info used to initialize EME.
 * @property {Object} appMetadata
 *   A metadata object passed from the application.
 * @property {(boolean|undefined)} isIncomplete
 *   If true, the content is still downloading.
 * @property {(boolean|undefined)} sequenceMode
 *   If true, we will append the media segments using sequence mode; that is to
 *   say, ignoring any timestamps inside the media files.
 * @property {(string|undefined)} type
 *   Indicates the type of the manifest. It can be <code>'HLS'</code> or
 *   <code>'DASH'</code>.
 */
shaka.extern.ManifestDB;


/**
 * @typedef {{
 *   id: number,
 *   originalId: ?string,
 *   groupId: ?string,
 *   primary: boolean,
 *   type: string,
 *   mimeType: string,
 *   codecs: string,
 *   frameRate: (number|undefined),
 *   pixelAspectRatio: (string|undefined),
 *   hdr: (string|undefined),
 *   colorGamut: (string|undefined),
 *   videoLayout: (string|undefined),
 *   kind: (string|undefined),
 *   language: string,
 *   originalLanguage: (?string|undefined),
 *   label: ?string,
 *   width: ?number,
 *   height: ?number,
 *   encrypted: boolean,
 *   keyIds: !Set<string>,
 *   segments: !Array<shaka.extern.SegmentDB>,
 *   variantIds: !Array<number>,
 *   roles: !Array<string>,
 *   forced: boolean,
 *   channelsCount: ?number,
 *   audioSamplingRate: ?number,
 *   spatialAudio: boolean,
 *   closedCaptions: Map<string, string>,
 *   tilesLayout: (string|undefined),
 *   mssPrivateData: (shaka.extern.MssPrivateData|undefined),
 *   external: boolean,
 *   fastSwitching: boolean,
 *   isAudioMuxedInVideo: boolean
 * }}
 *
 * @property {number} id
 *   The unique id of the stream.
 * @property {?string} originalId
 *   The original ID, if any, that appeared in the manifest.  For example, in
 *   DASH, this is the "id" attribute of the Representation element.
 * @property {?string} groupId
 *   The ID of the stream's parent element. In DASH, this will be a unique
 *   ID that represents the representation's parent adaptation element
 * @property {boolean} primary
 *   Whether the stream set was primary.
 * @property {string} type
 *   The type of the stream, 'audio', 'text', or 'video'.
 * @property {string} mimeType
 *   The MIME type of the stream.
 * @property {string} codecs
 *   The codecs of the stream.
 * @property {(number|undefined)} frameRate
 *   The Stream's framerate in frames per second.
 * @property {(string|undefined)} pixelAspectRatio
 *   The Stream's pixel aspect ratio
 * @property {(string|undefined)} hdr
 *   The Stream's HDR info
 * @property {(string|undefined)} colorGamut
 *   The Stream's color gamut info
 * @property {(string|undefined)} videoLayout
 *   The Stream's video layout info.
 * @property {(string|undefined)} kind
 *   The kind of text stream; undefined for audio/video.
 * @property {string} language
 *   The language of the stream; '' for video.
 * @property {(?string|undefined)} originalLanguage
 *   The original language, if any, that appeared in the manifest.
 * @property {?string} label
 *   The label of the stream; '' for video.
 * @property {?number} width
 *   The width of the stream; null for audio/text.
 * @property {?number} height
 *   The height of the stream; null for audio/text.
 * @property {boolean} encrypted
 *   Whether this stream is encrypted.
 * @property {!Set<string>} keyIds
 *   The key IDs this stream is encrypted with.
 * @property {!Array<shaka.extern.SegmentDB>} segments
 *   An array of segments that make up the stream.
 * @property {!Array<number>} variantIds
 *   An array of ids of variants the stream is a part of.
 * @property {!Array<string>} roles
 *   The roles of the stream as they appear on the manifest,
 *   e.g. 'main', 'caption', or 'commentary'.
 * @property {boolean} forced
 *   Whether the stream set was forced.
 * @property {?number} channelsCount
 *   The channel count information for the audio stream.
 * @property {?number} audioSamplingRate
 *   Specifies the maximum sampling rate of the content.
 * @property {boolean} spatialAudio
 *   Whether the stream set has spatial audio.
 * @property {Map<string, string>} closedCaptions
 *   A map containing the description of closed captions, with the caption
 *   channel number (CC1 | CC2 | CC3 | CC4) as the key and the language code
 *   as the value. If the channel number is not provided by the description,
 *   we'll set a 0-based index as the key. If the language code is not
 *   provided by the description we'll set the same value as channel number.
 *   Example: {'CC1': 'eng'; 'CC3': 'swe'}, or {'1', 'eng'; '2': 'swe'}, etc.
 * @property {(string|undefined)} tilesLayout
 *   The value is a grid-item-dimension consisting of two positive decimal
 *   integers in the format: column-x-row ('4x3'). It describes the arrangement
 *   of Images in a Grid. The minimum valid LAYOUT is '1x1'.
 * @property {(shaka.extern.MssPrivateData|undefined)} mssPrivateData
 *   <i>Microsoft Smooth Streaming only.</i> <br>
 *   Private MSS data that is necessary to be able to do transmuxing.
 * @property {boolean} external
 *   Indicate if the stream was added externally.
 *   Eg: external text tracks.
 * @property {boolean} fastSwitching
 *   Indicate if the stream should be used for fast switching.
 * @property {boolean} isAudioMuxedInVideo
 *   Indicate if the audio of this stream is muxed in the video of other stream.
 */
shaka.extern.StreamDB;


/**
 * @typedef {{
 *   initSegmentKey: ?number,
 *   startTime: number,
 *   endTime: number,
 *   appendWindowStart: number,
 *   appendWindowEnd: number,
 *   timestampOffset: number,
 *   tilesLayout: ?string,
 *   pendingSegmentRefId: (string|undefined),
 *   pendingInitSegmentRefId: (string|undefined),
 *   dataKey: number,
 *   mimeType: ?string,
 *   codecs: ?string,
 *   thumbnailSprite: ?shaka.extern.ThumbnailSprite
 * }}
 *
 * @property {?number} initSegmentKey
 *   The storage key where the init segment is found; null if no init segment.
 * @property {number} startTime
 *   The start time of the segment in the presentation timeline.
 * @property {number} endTime
 *   The end time of the segment in the presentation timeline.
 * @property {number} appendWindowStart
 *   A start timestamp before which media samples will be truncated.
 * @property {number} appendWindowEnd
 *   An end timestamp beyond which media samples will be truncated.
 * @property {number} timestampOffset
 *   An offset which MediaSource will add to the segment's media timestamps
 *   during ingestion, to align to the presentation timeline.
 * @property {?string} tilesLayout
 *   The value is a grid-item-dimension consisting of two positive decimal
 *   integers in the format: column-x-row ('4x3'). It describes the
 *   arrangement of Images in a Grid. The minimum valid LAYOUT is '1x1'.
 * @property {(string|undefined)} pendingSegmentRefId
 *   Contains an id that identifies what the segment was, originally. Used to
 *   coordinate where segments are stored, during the downloading process.
 *   If this field is non-null, it's assumed that the segment is not fully
 *   downloaded.
 * @property {(string|undefined)} pendingInitSegmentRefId
 *   Contains an id that identifies what the init segment was, originally.
 *   Used to coordinate where init segments are stored, during the downloading
 *   process.
 *   If this field is non-null, it's assumed that the init segment is not fully
 *   downloaded.
 * @property {number} dataKey
 *   The key to the data in storage.
 * @property {?string} mimeType
 *   The mimeType of the segment.
 * @property {?string} codecs
 *   The codecs of the segment.
 * @property {?shaka.extern.ThumbnailSprite} thumbnailSprite
 *   The segment's thumbnail sprite.
 */
shaka.extern.SegmentDB;


/**
 * @typedef {{
 *   data: !ArrayBuffer
 * }}
 *
 * @property {!ArrayBuffer} data
 *   The data contents of the segment.
 */
shaka.extern.SegmentDataDB;


/**
 * @typedef {{
 *   sessionId: string,
 *   keySystem: string,
 *   licenseUri: string,
 *   serverCertificate: Uint8Array,
 *   audioCapabilities: !Array<MediaKeySystemMediaCapability>,
 *   videoCapabilities: !Array<MediaKeySystemMediaCapability>
 * }}
 *
 * @property {string} sessionId
 *   The EME session ID.
 * @property {string} keySystem
 *   The EME key system string the session belongs to.
 * @property {string} licenseUri
 *   The URI for the license server.
 * @property {Uint8Array} serverCertificate
 *   A key-system-specific server certificate used to encrypt license requests.
 *   Its use is optional and is meant as an optimization to avoid a round-trip
 *   to request a certificate.
 * @property {!Array<MediaKeySystemMediaCapability>} audioCapabilities
 *   The EME audio capabilities used to create the session.
 * @property {!Array<MediaKeySystemMediaCapability>} videoCapabilities
 *   The EME video capabilities used to create the session.
 */
shaka.extern.EmeSessionDB;


/**
 * An interface that defines access to collection of segments and manifests. All
 * methods are designed to be batched operations allowing the implementations to
 * optimize their operations based on how they store data.
 *
 * The storage cell is one of two exposed APIs used to control where and how
 * offline content is saved. The storage cell is responsible for converting
 * information between its internal structures and the external (library)
 * structures.
 *
 * @interface
 */
shaka.extern.StorageCell = class {
  constructor() {}

  /**
   * Free all resources used by this cell. This should not affect the stored
   * content.
   *
   * @return {!Promise}
   */
  destroy() {}

  /**
   * Check if the cell can support new keys. If a cell has a fixed key space,
   * then all add-operations will fail as no new keys can be added. All
   * remove-operations and update-operations should still work.
   *
   * @return {boolean}
   */
  hasFixedKeySpace() {}

  /**
   * Add a group of segments. Will return a promise that resolves with a list
   * of keys for each segment. If one segment fails to be added, all segments
   * should fail to be added.
   *
   * @param {!Array<shaka.extern.SegmentDataDB>} segments
   * @return {!Promise<!Array<number>>}
   */
  addSegments(segments) {}

  /**
   * Remove a group of segments using their keys to identify them. If a key
   * is not found, then that removal should be considered successful.
   *
   * @param {!Array<number>} keys
   * @param {function(number)} onRemove A callback for when a segment is removed
   *                                    from the cell. The key of the segment
   *                                    will be passed to the callback.
   * @return {!Promise}
   */
  removeSegments(keys, onRemove) {}

  /**
   * Get a group of segments using their keys to identify them. If any key is
   * not found, the promise chain will be rejected.
   *
   * @param {!Array<number>} keys
   * @return {!Promise<!Array<shaka.extern.SegmentDataDB>>}
   */
  getSegments(keys) {}

  /**
   * Add a group of manifests. Will return a promise that resolves with a list
   * of keys for each manifest. If one manifest fails to be added, all manifests
   * should fail to be added.
   *
   * @param {!Array<shaka.extern.ManifestDB>} manifests
   * @return {!Promise<!Array<number>>} keys
   */
  addManifests(manifests) {}

  /**
   * Updates the given manifest, stored at the given key.
   *
   * @param {number} key
   * @param {!shaka.extern.ManifestDB} manifest
   * @return {!Promise}
   */
  updateManifest(key, manifest) {}

  /**
   * Replace the expiration time of the manifest stored under |key| with
   * |newExpiration|. If no manifest is found under |key| then this should
   * act as a no-op.
   *
   * @param {number} key
   * @param {number} expiration
   * @return {!Promise}
   */
  updateManifestExpiration(key, expiration) {}

  /**
   * Remove a group of manifests using their keys to identify them. If a key
   * is not found, then that removal should be considered successful.
   *
   * @param {!Array<number>} keys
   * @param {function(number)} onRemove A callback for when a manifest is
   *                                    removed from the cell. The key of the
   *                                    manifest will be passed to the callback.
   * @return {!Promise}
   */
  removeManifests(keys, onRemove) {}

  /**
   * Get a group of manifests using their keys to identify them. If any key is
   * not found, the promise chain will be rejected.
   *
   * @param {!Array<number>} keys
   * @return {!Promise<!Array<shaka.extern.ManifestDB>>}
   */
  getManifests(keys) {}

  /**
   * Get all manifests stored in this cell. Since manifests are small compared
   * to the asset they describe, it is assumed that it is feasible to have them
   * all in main memory at one time.
   *
   * @return {!Promise<!Map<number, shaka.extern.ManifestDB>>}
   */
  getAllManifests() {}
};


/**
 * Similar to storage cells (shaka.extern.StorageCell), an EmeSessionStorageCell
 * stores data persistently.  This only stores the license's session info, not
 * the license itself.  The license itself is stored using EME.
 *
 * @interface
 */
shaka.extern.EmeSessionStorageCell = class {
  constructor() {}

  /**
   * Free all resources used by this cell. This won't affect the stored content.
   * @return {!Promise}
   */
  destroy() {}

  /**
   * Gets the currently stored sessions.
   * @return {!Promise<!Array<shaka.extern.EmeSessionDB>>}
   */
  getAll() {}

  /**
   * Adds the given sessions to the store.
   * @param {!Array<shaka.extern.EmeSessionDB>} sessions
   * @return {!Promise}
   */
  add(sessions) {}

  /**
   * Removes the given session IDs from the store.
   * @param {!Array<string>} sessionIds
   * @return {!Promise}
   */
  remove(sessionIds) {}
};


/**
 * Storage mechanisms are one of two exported storage APIs. Storage mechanisms
 * are groups of storage cells (shaka.extern.StorageCell). Storage mechanisms
 * are responsible for managing the life cycle of resources shared between
 * storage cells in the same block.
 *
 * For example, a storage mechanism may manage a single database connection
 * while each cell would manage different tables in the database via the same
 * connection.
 *
 * @interface
 */
shaka.extern.StorageMechanism = class {
  constructor() {}

  /**
   * Initialize the storage mechanism for first use. This should only be called
   * once. Calling |init| multiple times has an undefined behaviour.
   *
   * @return {!Promise}
   */
  init() {}

  /**
   * Free all resources used by the storage mechanism and its cells. This should
   * not affect the stored content.
   *
   * @return {!Promise}
   */
  destroy() {}

  /**
   * Get a map of all the cells managed by the storage mechanism. Editing the
   * map should have no effect on the storage mechanism. The map key is the
   * cell's address in the mechanism and should be consistent between calls to
   * |getCells|.
   *
   * @return {!Map<string, !shaka.extern.StorageCell>}
   */
  getCells() {}

  /**
   * Get the current EME session storage cell.
   * @return {!shaka.extern.EmeSessionStorageCell}
   */
  getEmeSessionCell() {}

  /**
   * Erase all content from storage and leave storage in an empty state. Erase
   * may be called with or without |init|.  This allows for storage to be wiped
   * in case of a version mismatch.
   *
   * After calling |erase|, the mechanism will be in an initialized state.
   *
   * @return {!Promise}
   */
  erase() {}
};
