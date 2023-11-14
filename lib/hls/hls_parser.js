/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.hls.HlsParser');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.abr.Ewma');
goog.require('shaka.hls.ManifestTextParser');
goog.require('shaka.hls.Playlist');
goog.require('shaka.hls.PlaylistType');
goog.require('shaka.hls.Tag');
goog.require('shaka.hls.Utils');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.Pssh');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Platform');
goog.require('shaka.util.Uint8ArrayUtils');
goog.require('shaka.util.XmlUtils');
goog.requireType('shaka.hls.Segment');


/**
 * HLS parser.
 *
 * @implements {shaka.extern.ManifestParser}
 * @export
 */
shaka.hls.HlsParser = class {
  /**
   * Creates an Hls Parser object.
   */
  constructor() {
    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {number} */
    this.globalId_ = 1;

    /** @private {!Map.<string, string>} */
    this.globalVariables_ = new Map();

    /**
     * A map from group id to stream infos created from the media tags.
     * @private {!Map.<string, !Array.<?shaka.hls.HlsParser.StreamInfo>>}
     */
    this.groupIdToStreamInfosMap_ = new Map();

    /**
     * For media playlist lazy-loading to work in livestreams, we have to assume
     * that each stream of a type (video, audio, etc) has the same mappings of
     * sequence number to start time.
     * This map stores those relationships.
     * Only used during livestreams; we do not assume that VOD content is
     * aligned in that way.
     * @private {!Map.<string, !Map.<number, number>>}
     */
    this.mediaSequenceToStartTimeByType_ = new Map();

    // Set initial maps.
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    this.mediaSequenceToStartTimeByType_.set(ContentType.VIDEO, new Map());
    this.mediaSequenceToStartTimeByType_.set(ContentType.AUDIO, new Map());
    this.mediaSequenceToStartTimeByType_.set(ContentType.TEXT, new Map());
    this.mediaSequenceToStartTimeByType_.set(ContentType.IMAGE, new Map());

    /**
     * The values are strings of the form "<VIDEO URI> - <AUDIO URI>",
     * where the URIs are the verbatim media playlist URIs as they appeared in
     * the master playlist.
     *
     * Used to avoid duplicates that vary only in their text stream.
     *
     * @private {!Set.<string>}
     */
    this.variantUriSet_ = new Set();

    /**
     * A map from (verbatim) media playlist URI to stream infos representing the
     * playlists.
     *
     * On update, used to iterate through and update from media playlists.
     *
     * On initial parse, used to iterate through and determine minimum
     * timestamps, offsets, and to handle TS rollover.
     *
     * During parsing, used to avoid duplicates in the async methods
     * createStreamInfoFromMediaTags_, createStreamInfoFromImageTag_ and
     * createStreamInfoFromVariantTags_.
     *
     * @private {!Map.<string, shaka.hls.HlsParser.StreamInfo>}
     */
    this.uriToStreamInfosMap_ = new Map();

    /** @private {?shaka.media.PresentationTimeline} */
    this.presentationTimeline_ = null;

    /**
     * The master playlist URI, after redirects.
     *
     * @private {string}
     */
    this.masterPlaylistUri_ = '';

    /** @private {shaka.hls.ManifestTextParser} */
    this.manifestTextParser_ = new shaka.hls.ManifestTextParser();

    /**
     * The minimum sequence number for generated segments, when ignoring
     * EXT-X-PROGRAM-DATE-TIME.
     *
     * @private {number}
     */
    this.minSequenceNumber_ = -1;

    /**
     * The lowest time value for any of the streams, as defined by the
     * EXT-X-PROGRAM-DATE-TIME value. Measured in seconds since January 1, 1970.
     *
     * @private {number}
     */
    this.lowestSyncTime_ = Infinity;

    /**
     * Whether the streams have previously been "finalized"; that is to say,
     * whether we have loaded enough streams to know information about the asset
     * such as timing information, live status, etc.
     *
     * @private {boolean}
     */
    this.streamsFinalized_ = false;

    /**
     * Whether the manifest informs about the codec to use.
     *
     * @private
     */
    this.codecInfoInManifest_ = false;

    /**
     * This timer is used to trigger the start of a manifest update. A manifest
     * update is async. Once the update is finished, the timer will be restarted
     * to trigger the next update. The timer will only be started if the content
     * is live content.
     *
     * @private {shaka.util.Timer}
     */
    this.updatePlaylistTimer_ = new shaka.util.Timer(() => {
      this.onUpdate_();
    });

    /** @private {shaka.hls.HlsParser.PresentationType_} */
    this.presentationType_ = shaka.hls.HlsParser.PresentationType_.VOD;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {number} */
    this.maxTargetDuration_ = 0;

    /** @private {number} */
    this.lastTargetDuration_ = Infinity;

    /** Partial segments target duration.
     * @private {number}
     */
    this.partialTargetDuration_ = 0;

    /** @private {number} */
    this.presentationDelay_ = 0;

    /** @private {number} */
    this.lowLatencyPresentationDelay_ = 0;

    /** @private {shaka.util.OperationManager} */
    this.operationManager_ = new shaka.util.OperationManager();

    /** A map from closed captions' group id, to a map of closed captions info.
     * {group id -> {closed captions channel id -> language}}
     * @private {Map.<string, Map.<string, string>>}
     */
    this.groupIdToClosedCaptionsMap_ = new Map();

    /** @private {Map.<string, string>} */
    this.groupIdToCodecsMap_ = new Map();

    /** A cache mapping EXT-X-MAP tag info to the InitSegmentReference created
     * from the tag.
     * The key is a string combining the EXT-X-MAP tag's absolute uri, and
     * its BYTERANGE if available.
     * {!Map.<string, !shaka.media.InitSegmentReference>} */
    this.mapTagToInitSegmentRefMap_ = new Map();

    /** @private {boolean} */
    this.lowLatencyMode_ = false;

    /** @private {boolean} */
    this.lowLatencyByterangeOptimization_ = false;

    /**
     * An ewma that tracks how long updates take.
     * This is to mitigate issues caused by slow parsing on embedded devices.
     * @private {!shaka.abr.Ewma}
     */
    this.averageUpdateDuration_ = new shaka.abr.Ewma(5);
  }


  /**
   * @override
   * @exportInterface
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @override
   * @exportInterface
   */
  async start(uri, playerInterface) {
    goog.asserts.assert(this.config_, 'Must call configure() before start()!');
    this.playerInterface_ = playerInterface;
    this.lowLatencyMode_ = playerInterface.isLowLatencyMode();

    const response = await this.requestManifest_([uri]);

    // Record the master playlist URI after redirects.
    this.masterPlaylistUri_ = response.uri;

    goog.asserts.assert(response.data, 'Response data should be non-null!');
    await this.parseManifest_(response.data, uri);

    goog.asserts.assert(this.manifest_, 'Manifest should be non-null');
    return this.manifest_;
  }

  /**
   * @override
   * @exportInterface
   */
  stop() {
    // Make sure we don't update the manifest again. Even if the timer is not
    // running, this is safe to call.
    if (this.updatePlaylistTimer_) {
      this.updatePlaylistTimer_.stop();
      this.updatePlaylistTimer_ = null;
    }

    /** @type {!Array.<!Promise>} */
    const pending = [];

    if (this.operationManager_) {
      pending.push(this.operationManager_.destroy());
      this.operationManager_ = null;
    }

    this.playerInterface_ = null;
    this.config_ = null;
    this.variantUriSet_.clear();
    this.manifest_ = null;
    this.uriToStreamInfosMap_.clear();
    this.groupIdToStreamInfosMap_.clear();
    this.groupIdToCodecsMap_.clear();
    this.globalVariables_.clear();

    return Promise.all(pending);
  }

  /**
   * @override
   * @exportInterface
   */
  async update() {
    if (!this.isLive_()) {
      return;
    }

    /** @type {!Array.<!Promise>} */
    const updates = [];
    const streamInfos = Array.from(this.uriToStreamInfosMap_.values());

    // This is necessary to calculate correctly the update time.
    this.lastTargetDuration_ = Infinity;

    // Only update active streams.
    const activeStreamInfos = streamInfos.filter((s) => s.stream.segmentIndex);
    for (const streamInfo of activeStreamInfos) {
      updates.push(this.updateStream_(streamInfo));
    }
    await Promise.all(updates);

    // Now that streams have been updated, notify the presentation timeline.
    this.notifySegmentsForStreams_(activeStreamInfos.map((s) => s.stream));

    // If any hasEndList is false, the stream is still live.
    const stillLive = activeStreamInfos.some((s) => s.hasEndList == false);
    if (activeStreamInfos.length && !stillLive) {
      // Convert the presentation to VOD and set the duration.
      const PresentationType = shaka.hls.HlsParser.PresentationType_;
      this.setPresentationType_(PresentationType.VOD);

      // The duration is the minimum of the end times of all active streams.
      // Non-active streams are not guaranteed to have useful maxTimestamp
      // values, due to the lazy-loading system, so they are ignored.
      const maxTimestamps = activeStreamInfos.map((s) => s.maxTimestamp);
      // The duration is the minimum of the end times of all streams.
      this.presentationTimeline_.setDuration(Math.min(...maxTimestamps));
      this.playerInterface_.updateDuration();
    }
    if (stillLive) {
      this.determineDuration_();
    }
  }

  /**
   * @param {!shaka.hls.HlsParser.StreamInfo} streamInfo
   * @return {!Map.<number, number>}
   * @private
   */
  getMediaSequenceToStartTimeFor_(streamInfo) {
    if (this.isLive_()) {
      return this.mediaSequenceToStartTimeByType_.get(streamInfo.type);
    } else {
      return streamInfo.mediaSequenceToStartTime;
    }
  }

  /**
   * Updates a stream.
   *
   * @param {!shaka.hls.HlsParser.StreamInfo} streamInfo
   * @return {!Promise}
   * @private
   */
  async updateStream_(streamInfo) {
    const manifestUris = [];
    for (const uri of streamInfo.getUris()) {
      const uriObj = new goog.Uri(uri);
      const queryData = uriObj.getQueryData();
      if (streamInfo.canBlockReload) {
        if (streamInfo.nextMediaSequence >= 0) {
          // Indicates that the server must hold the request until a Playlist
          // contains a Media Segment with Media Sequence
          queryData.add('_HLS_msn', String(streamInfo.nextMediaSequence));
        }
        if (streamInfo.nextPart >= 0) {
          // Indicates, in combination with _HLS_msn, that the server must hold
          // the request until a Playlist contains Partial Segment N of Media
          // Sequence Number M or later.
          queryData.add('_HLS_part', String(streamInfo.nextPart));
        }
      }
      if (streamInfo.canSkipSegments) {
        // Enable delta updates. This will replace older segments with
        // 'EXT-X-SKIP' tag in the media playlist.
        queryData.add('_HLS_skip', 'YES');
      }
      if (queryData.getCount()) {
        uriObj.setQueryData(queryData);
      }
      manifestUris.push(uriObj.toString());
    }
    const response =
        await this.requestManifest_(manifestUris, /* isPlaylist= */ true);
    if (!streamInfo.stream.segmentIndex) {
      // The stream was closed since the update was first requested.
      return;
    }

    /** @type {shaka.hls.Playlist} */
    const playlist = this.manifestTextParser_.parsePlaylist(response.data);

    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    // Record the final URI after redirects.
    const responseUri = response.uri;
    if (responseUri != response.originalUri &&
        !streamInfo.getUris().includes(responseUri)) {
      streamInfo.redirectUris.push(responseUri);
    }

    /** @type {!Array.<!shaka.hls.Tag>} */
    const variablesTags = shaka.hls.Utils.filterTagsByName(playlist.tags,
        'EXT-X-DEFINE');

    const mediaVariables = this.parseMediaVariables_(
        variablesTags, responseUri);

    const stream = streamInfo.stream;

    const mediaSequenceToStartTime =
        this.getMediaSequenceToStartTimeFor_(streamInfo);
    const {keyIds, drmInfos} = this.parseDrmInfo_(playlist, stream.mimeType);

    const keysAreEqual =
      (a, b) => a.size === b.size && [...a].every((value) => b.has(value));

    if (!keysAreEqual(stream.keyIds, keyIds)) {
      stream.keyIds = keyIds;
      stream.drmInfos = drmInfos;
      this.playerInterface_.newDrmInfo(stream);
    }

    const {segments, bandwidth} = this.createSegments_(
        playlist, stream, mediaSequenceToStartTime, mediaVariables,
        streamInfo.getUris);

    stream.bandwidth = bandwidth;

    stream.segmentIndex.mergeAndEvict(
        segments, this.presentationTimeline_.getSegmentAvailabilityStart());
    if (segments.length) {
      const mediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
          playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);
      const skipTag = shaka.hls.Utils.getFirstTagWithName(
          playlist.tags, 'EXT-X-SKIP');
      const skippedSegments =
          skipTag ? Number(skipTag.getAttributeValue('SKIPPED-SEGMENTS')) : 0;
      const {nextMediaSequence, nextPart} =
          this.getNextMediaSequenceAndPart_(mediaSequenceNumber, segments);
      streamInfo.nextMediaSequence = nextMediaSequence + skippedSegments;
      streamInfo.nextPart = nextPart;
      const playlistStartTime = mediaSequenceToStartTime.get(
          mediaSequenceNumber);
      stream.segmentIndex.evict(playlistStartTime);
    }
    const oldSegment = segments[0];
    goog.asserts.assert(oldSegment, 'Should have segments!');

    streamInfo.minTimestamp = oldSegment.startTime;

    const newestSegment = segments[segments.length - 1];
    goog.asserts.assert(newestSegment, 'Should have segments!');

    streamInfo.maxTimestamp = newestSegment.endTime;

    // Once the last segment has been added to the playlist,
    // #EXT-X-ENDLIST tag will be appended.
    // If that happened, treat the rest of the EVENT presentation as VOD.
    const endListTag =
        shaka.hls.Utils.getFirstTagWithName(playlist.tags, 'EXT-X-ENDLIST');

    if (endListTag) {
      // Flag this for later.  We don't convert the whole presentation into VOD
      // until we've seen the ENDLIST tag for all active playlists.
      streamInfo.hasEndList = true;
    }

    this.determineLastTargetDuration_(playlist);
  }


  /**
   * @override
   * @exportInterface
   */
  onExpirationUpdated(sessionId, expiration) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  onInitialVariantChosen(variant) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  banLocation(uri) {
    // No-op
  }

  /**
   * Align the streams by sequence number by dropping early segments.  Then
   * offset the streams to begin at presentation time 0.
   * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} streamInfos
   * @private
   */
  syncStreamsWithSequenceNumber_(streamInfos) {
    // We assume that, when this is first called, we have enough info to
    // determine how to use the program date times (e.g. we have both a video
    // and an audio, and all other videos and audios match those).
    // Thus, we only need to calculate this once.
    const updateMinSequenceNumber = this.minSequenceNumber_ == -1;
    // Sync using media sequence number.  Find the highest starting sequence
    // number among all streams.  Later, we will drop any references to
    // earlier segments in other streams, then offset everything back to 0.
    for (const streamInfo of streamInfos) {
      const segmentIndex = streamInfo.stream.segmentIndex;
      goog.asserts.assert(segmentIndex,
          'Only loaded streams should be synced');
      const mediaSequenceToStartTime =
          this.getMediaSequenceToStartTimeFor_(streamInfo);
      const segment0 = segmentIndex.earliestReference();
      if (segment0) {
        // This looks inefficient, but iteration order is insertion order.
        // So the very first entry should be the one we want.
        // We assert that this holds true so that we are alerted by debug
        // builds and tests if it changes.  We still do a loop, though, so
        // that the code functions correctly in production no matter what.
        if (goog.DEBUG) {
          const firstSequenceStartTime =
              mediaSequenceToStartTime.values().next().value;
          goog.asserts.assert(
              firstSequenceStartTime == segment0.startTime,
              'Sequence number map is not ordered as expected!');
        }
        for (const [sequence, start] of mediaSequenceToStartTime) {
          if (start == segment0.startTime) {
            if (updateMinSequenceNumber) {
              this.minSequenceNumber_ = Math.max(
                  this.minSequenceNumber_, sequence);
            }
            // Even if we already have decided on a value for
            // |this.minSequenceNumber_|, we still need to determine the first
            // sequence number for the stream, to offset it in the code below.
            streamInfo.firstSequenceNumber = sequence;
            break;
          }
        }
      }
    }

    if (this.minSequenceNumber_ < 0) {
      // Nothing to sync.
      return;
    }

    shaka.log.debug('Syncing HLS streams against base sequence number:',
        this.minSequenceNumber_);

    for (const streamInfo of streamInfos) {
      const segmentIndex = streamInfo.stream.segmentIndex;
      if (segmentIndex) {
        // Drop any earlier references.
        const numSegmentsToDrop =
            this.minSequenceNumber_ - streamInfo.firstSequenceNumber;
        segmentIndex.dropFirstReferences(numSegmentsToDrop);

        // Now adjust timestamps back to begin at 0.
        const segmentN = segmentIndex.earliestReference();
        if (segmentN) {
          const streamOffset = -segmentN.startTime;
          // Modify all SegmentReferences equally.
          streamInfo.stream.segmentIndex.offset(streamOffset);
          // Update other parts of streamInfo the same way.
          this.offsetStreamInfo_(streamInfo, streamOffset);
        }
      }
    }
  }

  /**
   * Synchronize streams by the EXT-X-PROGRAM-DATE-TIME tags attached to their
   * segments.  Also normalizes segment times so that the earliest segment in
   * any stream is at time 0.
   * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} streamInfos
   * @private
   */
  syncStreamsWithProgramDateTime_(streamInfos) {
    // We assume that, when this is first called, we have enough info to
    // determine how to use the program date times (e.g. we have both a video
    // and an audio, and all other videos and audios match those).
    // Thus, we only need to calculate this once.
    if (this.lowestSyncTime_ == Infinity) {
      for (const streamInfo of streamInfos) {
        const segmentIndex = streamInfo.stream.segmentIndex;
        goog.asserts.assert(segmentIndex,
            'Only loaded streams should be synced');
        const segment0 = segmentIndex.earliestReference();
        if (segment0 != null && segment0.syncTime != null) {
          this.lowestSyncTime_ =
              Math.min(this.lowestSyncTime_, segment0.syncTime);
        }
      }
    }

    const lowestSyncTime = this.lowestSyncTime_;
    if (lowestSyncTime == Infinity) {
      // Nothing to sync.
      return;
    }

    shaka.log.debug('Syncing HLS streams against base time:', lowestSyncTime);

    for (const streamInfo of this.uriToStreamInfosMap_.values()) {
      const segmentIndex = streamInfo.stream.segmentIndex;
      if (segmentIndex != null) {
        // A segment's startTime should be based on its syncTime vs the lowest
        // syncTime across all streams.  The earliest segment sync time from
        // any stream will become presentation time 0.  If two streams start
        // e.g. 6 seconds apart in syncTime, then their first segments will
        // also start 6 seconds apart in presentation time.

        const segment0 = segmentIndex.earliestReference();
        if (segment0.syncTime == null) {
          shaka.log.alwaysError('Missing EXT-X-PROGRAM-DATE-TIME for stream',
              streamInfo.getUris(),
              'Expect AV sync issues!');
        } else {
          // Stream metadata are offset by a fixed amount based on the
          // first segment.
          const segment0TargetTime = segment0.syncTime - lowestSyncTime;
          const streamOffset = segment0TargetTime - segment0.startTime;
          this.offsetStreamInfo_(streamInfo, streamOffset);

          // This is computed across all segments separately to manage
          // accumulated drift in durations.
          for (const segment of segmentIndex) {
            segment.syncAgainst(lowestSyncTime);
          }
        }
      }
    }
  }

  /**
   * @param {!shaka.hls.HlsParser.StreamInfo} streamInfo
   * @param {number} offset
   * @private
   */
  offsetStreamInfo_(streamInfo, offset) {
    // Adjust our accounting of the minimum timestamp.
    streamInfo.minTimestamp += offset;

    // Adjust our accounting of the maximum timestamp.
    streamInfo.maxTimestamp += offset;
    goog.asserts.assert(streamInfo.maxTimestamp >= 0,
        'Negative maxTimestamp after adjustment!');

    // Update our map from sequence number to start time.
    const mediaSequenceToStartTime =
        this.getMediaSequenceToStartTimeFor_(streamInfo);
    for (const [key, value] of mediaSequenceToStartTime) {
      mediaSequenceToStartTime.set(key, value + offset);
    }

    shaka.log.debug('Offset', offset, 'applied to',
        streamInfo.getUris());
  }

  /**
   * Parses the manifest.
   *
   * @param {BufferSource} data
   * @param {string} uri
   * @return {!Promise}
   * @private
   */
  async parseManifest_(data, uri) {
    const Utils = shaka.hls.Utils;

    goog.asserts.assert(this.masterPlaylistUri_,
        'Master playlist URI must be set before calling parseManifest_!');

    const playlist = this.manifestTextParser_.parsePlaylist(data);

    /** @type {!Array.<!shaka.hls.Tag>} */
    const variablesTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-DEFINE');

    /** @type {!Array.<!shaka.extern.Variant>} */
    let variants = [];
    /** @type {!Array.<!shaka.extern.Stream>} */
    let textStreams = [];
    /** @type {!Array.<!shaka.extern.Stream>} */
    let imageStreams = [];

    // Parsing a media playlist results in a single-variant stream.
    if (playlist.type == shaka.hls.PlaylistType.MEDIA) {
      const getUris = () => {
        return [uri];
      };

      // Get necessary info for this stream. These are things we would normally
      // find from the master playlist (e.g. from values on EXT-X-MEDIA tags).
      const basicInfo =
          await this.getMediaPlaylistBasicInfo_(playlist, getUris);
      const type = basicInfo.type;
      const mimeType = basicInfo.mimeType;
      const codecs = basicInfo.codecs;
      const languageValue = basicInfo.language;
      const height = basicInfo.height;
      const width = basicInfo.width;
      const channelsCount = basicInfo.channelCount;
      const sampleRate = basicInfo.sampleRate;
      const closedCaptions = basicInfo.closedCaptions;

      // Some values we cannot figure out, and aren't important enough to ask
      // the user to provide through config values. A lot of these are only
      // relevant to ABR, which isn't necessary if there's only one variant.
      // So these unknowns should be set to false or null, largely.
      const spatialAudio = false;
      const characteristics = null;
      const forced = false; // Only relevant for text.
      const primary = true; // This is the only stream!
      const name = 'Media Playlist';

      // Make the stream info, with those values.
      const streamInfo = await this.convertParsedPlaylistIntoStreamInfo_(
          playlist, getUris, uri, codecs, type, languageValue, primary, name,
          channelsCount, closedCaptions, characteristics, forced, sampleRate,
          spatialAudio, mimeType);
      this.uriToStreamInfosMap_.set(uri, streamInfo);

      if (type == 'video') {
        this.addVideoAttributes_(streamInfo.stream, width, height,
            /* frameRate= */ null, /* videoRange= */ null,
            /* videoLayout= */ null);
      }

      // Wrap the stream from that stream info with a variant.
      variants.push({
        id: 0,
        language: this.getLanguage_(languageValue),
        disabledUntilTime: 0,
        primary: true,
        audio: type == 'audio' ? streamInfo.stream : null,
        video: type == 'video' ? streamInfo.stream : null,
        bandwidth: streamInfo.stream.bandwidth || 0,
        allowedByApplication: true,
        allowedByKeySystem: true,
        decodingInfos: [],
      });
    } else {
      this.parseMasterVariables_(variablesTags);

      /** @type {!Array.<!shaka.hls.Tag>} */
      const mediaTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-MEDIA');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const variantTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-STREAM-INF');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const imageTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-IMAGE-STREAM-INF');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const iFrameTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-I-FRAME-STREAM-INF');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const sessionKeyTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-SESSION-KEY');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const sessionDataTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-SESSION-DATA');

      this.processSessionData_(sessionDataTags);

      this.parseCodecs_(variantTags);

      this.parseClosedCaptions_(mediaTags);
      variants =
          this.createVariantsForTags_(variantTags, sessionKeyTags, mediaTags);
      textStreams = this.parseTexts_(mediaTags);
      imageStreams = await this.parseImages_(imageTags, iFrameTags);
    }

    // Make sure that the parser has not been destroyed.
    if (!this.playerInterface_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    // This assert is our own sanity check.
    goog.asserts.assert(this.presentationTimeline_ == null,
        'Presentation timeline created early!');
    // We don't know if the presentation is VOD or live until we parse at least
    // one media playlist, so make a VOD-style presentation timeline for now
    // and change the type later if we discover this is live.
    // Since the player will load the first variant chosen early in the process,
    // there isn't a window during playback where the live-ness is unknown.
    this.presentationTimeline_ = new shaka.media.PresentationTimeline(
        /* presentationStartTime= */ null, /* delay= */ 0);
    this.presentationTimeline_.setStatic(true);

    // Single-variant streams aren't lazy-loaded, so for them we already have
    // enough info here to determine the presentation type and duration.
    if (playlist.type == shaka.hls.PlaylistType.MEDIA) {
      if (this.isLive_()) {
        this.changePresentationTimelineToLive_(playlist);
        const delay = this.getUpdatePlaylistDelay_();
        this.updatePlaylistTimer_.tickAfter(/* seconds= */ delay);
      }
      const streamInfos = Array.from(this.uriToStreamInfosMap_.values());
      this.finalizeStreams_(streamInfos);
      this.determineDuration_();
    }

    this.manifest_ = {
      presentationTimeline: this.presentationTimeline_,
      variants,
      textStreams,
      imageStreams,
      offlineSessionIds: [],
      minBufferTime: 0,
      sequenceMode: this.config_.hls.sequenceMode,
      ignoreManifestTimestampsInSegmentsMode:
        this.config_.hls.ignoreManifestTimestampsInSegmentsMode,
      type: shaka.media.ManifestParser.HLS,
      serviceDescription: null,
    };

    // If there is no 'CODECS' attribute in the manifest and codec guessing is
    // disabled, we need to create the segment indexes now so that missing info
    // can be parsed from the media data and added to the stream objects.
    if (!this.codecInfoInManifest_ && this.config_.hls.disableCodecGuessing) {
      const createIndexes = [];
      for (const variant of this.manifest_.variants) {
        if (variant.audio && variant.audio.codecs === '') {
          createIndexes.push(variant.audio.createSegmentIndex());
        }
        if (variant.video && variant.video.codecs === '') {
          createIndexes.push(variant.video.createSegmentIndex());
        }
      }

      await Promise.all(createIndexes);
    }

    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);
  }

  /**
   * @param {shaka.hls.Playlist} playlist
   * @param {function():!Array.<string>} getUris
   * @return {!Promise.<shaka.media.SegmentUtils.BasicInfo>}
   * @private
   */
  async getMediaPlaylistBasicInfo_(playlist, getUris) {
    const HlsParser = shaka.hls.HlsParser;
    const defaultBasicInfo = shaka.media.SegmentUtils.getBasicInfoFromMimeType(
        this.config_.hls.mediaPlaylistFullMimeType);
    if (!playlist.segments.length) {
      return defaultBasicInfo;
    }
    const middleSegmentIdx = Math.trunc((playlist.segments.length - 1) / 2);
    const middleSegment = playlist.segments[middleSegmentIdx];
    const middleSegmentUris = shaka.hls.Utils.constructSegmentUris(
        getUris(),
        playlist.segments[0].verbatimSegmentUri);
    const middleSegmentUri = middleSegmentUris[0];
    const parsedUri = new goog.Uri(middleSegmentUri);
    const extension = parsedUri.getPath().split('.').pop();
    const rawMimeType = HlsParser.RAW_FORMATS_TO_MIME_TYPES_[extension];
    if (rawMimeType) {
      return shaka.media.SegmentUtils.getBasicInfoFromMimeType(
          rawMimeType);
    }

    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    let initData = null;
    const initSegmentRef = this.getInitSegmentReference_(
        playlist, middleSegment.tags, getUris);
    if (initSegmentRef) {
      const initSegmentRequest = shaka.net.NetworkingEngine.makeRequest(
          initSegmentRef.getUris(), this.config_.retryParameters);
      const initType =
          shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT;
      const initResponse = await this.makeNetworkRequest_(
          initSegmentRequest, requestType, {type: initType});
      initData = initResponse.data;
    }

    const segmentRequest = shaka.net.NetworkingEngine.makeRequest(
        middleSegmentUris, this.config_.retryParameters);
    const type = shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;
    const response = await this.makeNetworkRequest_(
        segmentRequest, requestType, {type});

    let contentMimeType = response.headers['content-type'];
    if (contentMimeType) {
      // Split the MIME type in case the server sent additional parameters.
      contentMimeType = contentMimeType.split(';')[0].toLowerCase();
    }

    if (extension == 'ts' || contentMimeType == 'video/mp2t') {
      const basicInfo =
          shaka.media.SegmentUtils.getBasicInfoFromTs(response.data);
      if (basicInfo) {
        return basicInfo;
      }
    } else if (extension == 'mp4' || extension == 'cmfv' ||
        contentMimeType == 'video/mp4' || contentMimeType == 'audio/mp4' ||
        contentMimeType == 'video/iso.segment') {
      const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMp4(
          initData, response.data);
      if (basicInfo) {
        return basicInfo;
      }
    }
    return defaultBasicInfo;
  }

  /** @private */
  determineDuration_() {
    goog.asserts.assert(this.presentationTimeline_,
        'Presentation timeline not created!');

    if (this.isLive_()) {
      // The spec says nothing much about seeking in live content, but Safari's
      // built-in HLS implementation does not allow it.  Therefore we will set
      // the availability window equal to the presentation delay.  The player
      // will be able to buffer ahead three segments, but the seek window will
      // be zero-sized.
      const PresentationType = shaka.hls.HlsParser.PresentationType_;

      if (this.presentationType_ == PresentationType.LIVE) {
        let segmentAvailabilityDuration = this.getLiveDuration_();

        // This defaults to the presentation delay, which has the effect of
        // making the live stream unseekable.  This is consistent with Apple's
        // HLS implementation.
        if (this.config_.hls.useSafariBehaviorForLive) {
          segmentAvailabilityDuration = this.presentationTimeline_.getDelay();
        }

        // The app can override that with a longer duration, to allow seeking.
        if (!isNaN(this.config_.availabilityWindowOverride)) {
          segmentAvailabilityDuration = this.config_.availabilityWindowOverride;
        }

        this.presentationTimeline_.setSegmentAvailabilityDuration(
            segmentAvailabilityDuration);
      }
    } else {
      // Use the minimum duration as the presentation duration.
      this.presentationTimeline_.setDuration(this.getMinDuration_());
    }

    // This is the first point where we have a meaningful presentation start
    // time, and we need to tell PresentationTimeline that so that it can
    // maintain consistency from here on.
    this.presentationTimeline_.lockStartTime();

    // This asserts that the live edge is being calculated from segment times.
    // For VOD and event streams, this check should still pass.
    goog.asserts.assert(
        !this.presentationTimeline_.usingPresentationStartTime(),
        'We should not be using the presentation start time in HLS!');
  }

  /**
   * Get the variables of each variant tag, and store in a map.
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @private
   */
  parseMasterVariables_(tags) {
    const queryParams = new goog.Uri(this.masterPlaylistUri_).getQueryData();
    for (const variableTag of tags) {
      const name = variableTag.getAttributeValue('NAME');
      const value = variableTag.getAttributeValue('VALUE');
      const queryParam = variableTag.getAttributeValue('QUERYPARAM');
      if (name && value) {
        if (!this.globalVariables_.has(name)) {
          this.globalVariables_.set(name, value);
        }
      }
      if (queryParam) {
        const queryParamValue = queryParams.get(queryParam)[0];
        if (queryParamValue && !this.globalVariables_.has(queryParamValue)) {
          this.globalVariables_.set(queryParam, queryParamValue);
        }
      }
    }
  }

  /**
   * Get the variables of each variant tag, and store in a map.
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @param {string} uri Media playlist URI.
   * @return {!Map.<string, string>}
   * @private
   */
  parseMediaVariables_(tags, uri) {
    const queryParams = new goog.Uri(uri).getQueryData();
    const mediaVariables = new Map();
    for (const variableTag of tags) {
      const name = variableTag.getAttributeValue('NAME');
      const value = variableTag.getAttributeValue('VALUE');
      const queryParam = variableTag.getAttributeValue('QUERYPARAM');
      const mediaImport = variableTag.getAttributeValue('IMPORT');
      if (name && value) {
        if (!mediaVariables.has(name)) {
          mediaVariables.set(name, value);
        }
      }
      if (queryParam) {
        const queryParamValue = queryParams.get(queryParam)[0];
        if (queryParamValue && !mediaVariables.has(queryParamValue)) {
          mediaVariables.set(queryParam, queryParamValue);
        }
      }
      if (mediaImport) {
        const globalValue = this.globalVariables_.get(mediaImport);
        if (globalValue) {
          mediaVariables.set(mediaImport, globalValue);
        }
      }
    }
    return mediaVariables;
  }

  /**
   * Get the codecs of each variant tag, and store in a map from
   * audio/video/subtitle group id to the codecs arraylist.
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @private
   */
  parseCodecs_(tags) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    for (const variantTag of tags) {
      const audioGroupId = variantTag.getAttributeValue('AUDIO');
      const videoGroupId = variantTag.getAttributeValue('VIDEO');
      const subGroupId = variantTag.getAttributeValue('SUBTITLES');
      const allCodecs = this.getCodecsForVariantTag_(variantTag);

      if (subGroupId) {
        const textCodecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
            ContentType.TEXT, allCodecs);
        goog.asserts.assert(textCodecs != null, 'Text codecs should be valid.');
        this.groupIdToCodecsMap_.set(subGroupId, textCodecs);
        shaka.util.ArrayUtils.remove(allCodecs, textCodecs);
      }
      if (audioGroupId) {
        let codecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
            ContentType.AUDIO, allCodecs);
        if (!codecs) {
          codecs = this.config_.hls.defaultAudioCodec;
        }
        this.groupIdToCodecsMap_.set(audioGroupId, codecs);
      }
      if (videoGroupId) {
        let codecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
            ContentType.VIDEO, allCodecs);
        if (!codecs) {
          codecs = this.config_.hls.defaultVideoCodec;
        }
        this.groupIdToCodecsMap_.set(videoGroupId, codecs);
      }
    }
  }

  /**
   * Process EXT-X-SESSION-DATA tags.
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @private
   */
  processSessionData_(tags) {
    for (const tag of tags) {
      const id = tag.getAttributeValue('DATA-ID');
      const uri = tag.getAttributeValue('URI');
      const language = tag.getAttributeValue('LANGUAGE');
      const value = tag.getAttributeValue('VALUE');
      const data = (new Map()).set('id', id);
      if (uri) {
        data.set('uri', shaka.hls.Utils.constructSegmentUris(
            [this.masterPlaylistUri_], uri, this.globalVariables_)[0]);
      }
      if (language) {
        data.set('language', language);
      }
      if (value) {
        data.set('value', value);
      }
      const event = new shaka.util.FakeEvent('sessiondata', data);
      if (this.playerInterface_) {
        this.playerInterface_.onEvent(event);
      }
    }
  }

  /**
   * Parse Subtitles and Closed Captions from 'EXT-X-MEDIA' tags.
   * Create text streams for Subtitles, but not Closed Captions.
   *
   * @param {!Array.<!shaka.hls.Tag>} mediaTags Media tags from the playlist.
   * @return {!Array.<!shaka.extern.Stream>}
   * @private
   */
  parseTexts_(mediaTags) {
    // Create text stream for each Subtitle media tag.
    const subtitleTags =
        shaka.hls.Utils.filterTagsByType(mediaTags, 'SUBTITLES');
    const textStreams = subtitleTags.map((tag) => {
      const disableText = this.config_.disableText;
      if (disableText) {
        return null;
      }
      try {
        return this.createStreamInfoFromMediaTags_([tag]).stream;
      } catch (e) {
        if (this.config_.hls.ignoreTextStreamFailures) {
          return null;
        }
        throw e;
      }
    });

    const type = shaka.util.ManifestParserUtils.ContentType.TEXT;

    // Set the codecs for text streams.
    for (const tag of subtitleTags) {
      const groupId = tag.getRequiredAttrValue('GROUP-ID');
      const codecs = this.groupIdToCodecsMap_.get(groupId);
      if (codecs) {
        const textStreamInfos = this.groupIdToStreamInfosMap_.get(groupId);
        if (textStreamInfos) {
          for (const textStreamInfo of textStreamInfos) {
            textStreamInfo.stream.codecs = codecs;
            textStreamInfo.stream.mimeType =
                this.guessMimeTypeBeforeLoading_(type, codecs) ||
                this.guessMimeTypeFallback_(type);
          }
        }
      }
    }

    // Do not create text streams for Closed captions.
    return textStreams.filter((s) => s);
  }

  /**
   * @param {!Array.<!shaka.hls.Tag>} imageTags from the playlist.
   * @param {!Array.<!shaka.hls.Tag>} iFrameTags from the playlist.
   * @return {!Promise.<!Array.<!shaka.extern.Stream>>}
   * @private
   */
  async parseImages_(imageTags, iFrameTags) {
    // Create image stream for each image tag.
    const imageStreamPromises = imageTags.map(async (tag) => {
      const disableThumbnails = this.config_.disableThumbnails;
      if (disableThumbnails) {
        return null;
      }
      try {
        const streamInfo = await this.createStreamInfoFromImageTag_(tag);
        return streamInfo.stream;
      } catch (e) {
        if (this.config_.hls.ignoreImageStreamFailures) {
          return null;
        }
        throw e;
      }
    }).concat(iFrameTags.map((tag) => {
      const disableThumbnails = this.config_.disableThumbnails;
      if (disableThumbnails) {
        return null;
      }
      try {
        const streamInfo = this.createStreamInfoFromIframeTag_(tag);
        if (streamInfo.stream.codecs !== 'mjpg') {
          return null;
        }
        return streamInfo.stream;
      } catch (e) {
        if (this.config_.hls.ignoreImageStreamFailures) {
          return null;
        }
        throw e;
      }
    }));
    const imageStreams = await Promise.all(imageStreamPromises);
    return imageStreams.filter((s) => s);
  }

  /**
   * @param {!Array.<!shaka.hls.Tag>} mediaTags Media tags from the playlist.
   * @private
   */
  createStreamInfosFromMediaTags_(mediaTags) {
    // Filter out subtitles and  media tags without uri.
    mediaTags = mediaTags.filter((tag) => {
      const uri = tag.getAttributeValue('URI') || '';
      const type = tag.getAttributeValue('TYPE');
      return type != 'SUBTITLES' && uri != '';
    });

    const groupedTags = {};
    for (const tag of mediaTags) {
      const key = tag.getTagKey();
      if (!groupedTags[key]) {
        groupedTags[key] = [tag];
      } else {
        groupedTags[key].push(tag);
      }
    }

    for (const key in groupedTags) {
      // Create stream info for each audio / video media grouped tag.
      this.createStreamInfoFromMediaTags_(groupedTags[key]);
    }
  }

  /**
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @param {!Array.<!shaka.hls.Tag>} sessionKeyTags EXT-X-SESSION-KEY tags
   * from the playlist.
   * @param {!Array.<!shaka.hls.Tag>} mediaTags EXT-X-MEDIA tags from the
   * playlist.
   * @return {!Array.<!shaka.extern.Variant>}
   * @private
   */
  createVariantsForTags_(tags, sessionKeyTags, mediaTags) {
    // EXT-X-SESSION-KEY processing
    const drmInfos = [];
    const keyIds = new Set();
    if (sessionKeyTags.length > 0) {
      for (const drmTag of sessionKeyTags) {
        const method = drmTag.getRequiredAttrValue('METHOD');
        if (method != 'NONE' && method != 'AES-128') {
          // According to the HLS spec, KEYFORMAT is optional and implicitly
          // defaults to "identity".
          // https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis-11#section-4.4.4.4
          const keyFormat =
              drmTag.getAttributeValue('KEYFORMAT') || 'identity';
          const drmParser =
              shaka.hls.HlsParser.KEYFORMATS_TO_DRM_PARSERS_[keyFormat];

          const drmInfo = drmParser ?
              drmParser(drmTag, /* mimeType= */ '') : null;
          if (drmInfo) {
            if (drmInfo.keyIds) {
              for (const keyId of drmInfo.keyIds) {
                keyIds.add(keyId);
              }
            }
            drmInfos.push(drmInfo);
          } else {
            shaka.log.warning('Unsupported HLS KEYFORMAT', keyFormat);
          }
        }
      }
    }

    const groupedTags = {};
    for (const tag of tags) {
      const key = tag.getTagKey();
      if (!groupedTags[key]) {
        groupedTags[key] = [tag];
      } else {
        groupedTags[key].push(tag);
      }
    }

    const allVariants = [];
    // Create variants for each group of variant tag.
    for (const key in groupedTags) {
      const tags = groupedTags[key];
      const firstTag = tags[0];

      const frameRate = firstTag.getAttributeValue('FRAME-RATE');
      const bandwidth =
          Number(firstTag.getAttributeValue('AVERAGE-BANDWIDTH')) ||
          Number(firstTag.getRequiredAttrValue('BANDWIDTH'));

      const resolution = firstTag.getAttributeValue('RESOLUTION');
      const [width, height] = resolution ? resolution.split('x') : [null, null];

      const videoRange = firstTag.getAttributeValue('VIDEO-RANGE');

      let videoLayout = firstTag.getAttributeValue('REQ-VIDEO-LAYOUT');
      if (videoLayout && videoLayout.includes(',')) {
        // If multiple video layout strings are present, pick the first valid
        // one.
        const layoutStrings = videoLayout.split(',').filter((layoutString) => {
          return layoutString == 'CH-STEREO' || layoutString == 'CH-MONO';
        });
        videoLayout = layoutStrings[0];
      }
      // According to the HLS spec:
      // By default a video variant is monoscopic, so an attribute
      // consisting entirely of REQ-VIDEO-LAYOUT="CH-MONO" is unnecessary
      // and SHOULD NOT be present.
      videoLayout = videoLayout || 'CH-MONO';

      const streamInfos = this.createStreamInfosForVariantTags_(tags,
          mediaTags, resolution, frameRate);

      goog.asserts.assert(streamInfos.audio.length ||
          streamInfos.video.length, 'We should have created a stream!');

      allVariants.push(...this.createVariants_(
          streamInfos.audio,
          streamInfos.video,
          bandwidth,
          width,
          height,
          frameRate,
          videoRange,
          videoLayout,
          drmInfos,
          keyIds));
    }
    return allVariants.filter((variant) => variant != null);
  }

  /**
   * Create audio and video streamInfos from an 'EXT-X-STREAM-INF' tag and its
   * related media tags.
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @param {!Array.<!shaka.hls.Tag>} mediaTags
   * @param {?string} resolution
   * @param {?string} frameRate
   * @return {!shaka.hls.HlsParser.StreamInfos}
   * @private
   */
  createStreamInfosForVariantTags_(tags, mediaTags, resolution, frameRate) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /** @type {shaka.hls.HlsParser.StreamInfos} */
    const res = {
      audio: [],
      video: [],
    };
    const globalGroupIds = [];
    let isAudioGroup = false;
    let isVideoGroup = false;
    for (const tag of tags) {
      const audioGroupId = tag.getAttributeValue('AUDIO');
      const videoGroupId = tag.getAttributeValue('VIDEO');
      goog.asserts.assert(audioGroupId == null || videoGroupId == null,
          'Unexpected: both video and audio described by media tags!');

      const groupId = audioGroupId || videoGroupId;
      if (!groupId) {
        continue;
      }
      if (!globalGroupIds.includes(groupId)) {
        globalGroupIds.push(groupId);
      }
      if (audioGroupId) {
        isAudioGroup = true;
      } else if (videoGroupId) {
        isVideoGroup = true;
      }
      // Make an educated guess about the stream type.
      shaka.log.debug('Guessing stream type for', tag.toString());
    }
    if (globalGroupIds.length && mediaTags.length) {
      const mediaTagsForVariant = mediaTags.filter((tag) => {
        return globalGroupIds.includes(tag.getRequiredAttrValue('GROUP-ID'));
      });
      this.createStreamInfosFromMediaTags_(mediaTagsForVariant);
    }
    const globalGroupId = globalGroupIds.sort().join(',');
    const streamInfos =
        (globalGroupId && this.groupIdToStreamInfosMap_.has(globalGroupId)) ?
        this.groupIdToStreamInfosMap_.get(globalGroupId) : [];
    if (isAudioGroup) {
      res.audio.push(...streamInfos);
    } else if (isVideoGroup) {
      res.video.push(...streamInfos);
    }

    let type;
    let ignoreStream = false;

    // The Microsoft HLS manifest generators will make audio-only variants
    // that link to their URI both directly and through an audio tag.
    // In that case, ignore the local URI and use the version in the
    // AUDIO tag, so you inherit its language.
    // As an example, see the manifest linked in issue #860.
    const allStreamUris = tags.map((tag) => tag.getRequiredAttrValue('URI'));
    const hasSameUri = res.audio.find((audio) => {
      return audio && audio.getUris().find((uri) => {
        return allStreamUris.includes(uri);
      });
    });

    /** @type {!Array.<string>} */
    let allCodecs = this.getCodecsForVariantTag_(tags[0]);
    const videoCodecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, allCodecs);
    const audioCodecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, allCodecs);

    if (audioCodecs && !videoCodecs) {
      // There are no associated media tags, and there's only audio codec,
      // and no video codec, so it should be audio.
      type = ContentType.AUDIO;
      shaka.log.debug('Guessing audio-only.');
      ignoreStream = res.audio.length > 0;
    } else if (!res.audio.length && !res.video.length &&
        audioCodecs && videoCodecs) {
      // There are both audio and video codecs, so assume multiplexed content.
      // Note that the default used when CODECS is missing assumes multiple
      // (and therefore multiplexed).
      // Recombine the codec strings into one so that MediaSource isn't
      // lied to later. (That would trigger an error in Chrome.)
      shaka.log.debug('Guessing multiplexed audio+video.');
      type = ContentType.VIDEO;
      allCodecs = [[videoCodecs, audioCodecs].join(',')];
    } else if (res.audio.length && hasSameUri) {
      shaka.log.debug('Guessing audio-only.');
      type = ContentType.AUDIO;
      ignoreStream = true;
    } else if (res.video.length && !res.audio.length) {
      // There are associated video streams.  Assume this is audio.
      shaka.log.debug('Guessing audio-only.');
      type = ContentType.AUDIO;
    } else {
      shaka.log.debug('Guessing video-only.');
      type = ContentType.VIDEO;
    }

    if (!ignoreStream) {
      const streamInfo =
          this.createStreamInfoFromVariantTags_(tags, allCodecs, type);
      if (globalGroupId) {
        streamInfo.stream.groupId = globalGroupId;
      }
      res[streamInfo.stream.type] = [streamInfo];
    }
    return res;
  }


  /**
   * Get the codecs from the 'EXT-X-STREAM-INF' tag.
   *
   * @param {!shaka.hls.Tag} tag
   * @return {!Array.<string>} codecs
   * @private
   */
  getCodecsForVariantTag_(tag) {
    let codecsString = tag.getAttributeValue('CODECS') || '';

    this.codecInfoInManifest_ = codecsString.length > 0;

    if (!this.codecInfoInManifest_ && !this.config_.hls.disableCodecGuessing) {
      // These are the default codecs to assume if none are specified.
      const defaultCodecsArray = [];

      if (!this.config_.disableVideo) {
        defaultCodecsArray.push(this.config_.hls.defaultVideoCodec);
      }
      if (!this.config_.disableAudio) {
        defaultCodecsArray.push(this.config_.hls.defaultAudioCodec);
      }

      codecsString = defaultCodecsArray.join(',');
    }

    // Strip out internal whitespace while splitting on commas:
    /** @type {!Array.<string>} */
    const codecs = codecsString.split(/\s*,\s*/);

    return this.filterDuplicateCodecs_(codecs);
  }


  /**
   * @param {!Array.<string>} codecs
   * @return {!Array.<string>} codecs
   * @private
   */
  filterDuplicateCodecs_(codecs) {
    // Filter out duplicate codecs.
    const seen = new Set();
    const ret = [];
    for (const codec of codecs) {
      // HLS says the CODECS field needs to include all codecs that appear in
      // the content. This means that if the content changes profiles, it should
      // include both. Since all known browsers support changing profiles
      // without any other work, just ignore them.  See also:
      // https://github.com/shaka-project/shaka-player/issues/1817
      const shortCodec = shaka.util.MimeUtils.getCodecBase(codec);
      if (!seen.has(shortCodec)) {
        ret.push(codec);
        seen.add(shortCodec);
      } else {
        shaka.log.debug('Ignoring duplicate codec');
      }
    }
    return ret;
  }

  /**
   * Get the channel count information for an HLS audio track.
   * CHANNELS specifies an ordered, "/" separated list of parameters.
   * If the type is audio, the first parameter will be a decimal integer
   * specifying the number of independent, simultaneous audio channels.
   * No other channels parameters are currently defined.
   *
   * @param {!shaka.hls.Tag} tag
   * @return {?number}
   * @private
   */
  getChannelsCount_(tag) {
    const channels = tag.getAttributeValue('CHANNELS');
    if (!channels) {
      return null;
    }
    const channelcountstring = channels.split('/')[0];
    const count = parseInt(channelcountstring, 10);
    return count;
  }

  /**
   * Get the sample rate information for an HLS audio track.
   *
   * @param {!shaka.hls.Tag} tag
   * @return {?number}
   * @private
   */
  getSampleRate_(tag) {
    const sampleRate = tag.getAttributeValue('SAMPLE-RATE');
    if (!sampleRate) {
      return null;
    }
    return parseInt(sampleRate, 10);
  }

  /**
   * Get the spatial audio information for an HLS audio track.
   * In HLS the channels field indicates the number of audio channels that the
   * stream has (eg: 2). In the case of Dolby Atmos, the complexity is
   * expressed with the number of channels followed by the word JOC
   * (eg: 16/JOC), so 16 would be the number of channels (eg: 7.3.6 layout),
   * and JOC indicates that the stream has spatial audio.
   * @see https://developer.apple.com/documentation/http_live_streaming/hls_authoring_specification_for_apple_devices/hls_authoring_specification_for_apple_devices_appendixes
   *
   * @param {!shaka.hls.Tag} tag
   * @return {boolean}
   * @private
   */
  isSpatialAudio_(tag) {
    const channels = tag.getAttributeValue('CHANNELS');
    if (!channels) {
      return false;
    }
    return channels.includes('/JOC');
  }

  /**
   * Get the closed captions map information for the EXT-X-STREAM-INF tag, to
   * create the stream info.
   * @param {!shaka.hls.Tag} tag
   * @param {string} type
   * @return {Map.<string, string>} closedCaptions
   * @private
   */
  getClosedCaptions_(tag, type) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    // The attribute of closed captions is optional, and the value may be
    // 'NONE'.
    const closedCaptionsAttr = tag.getAttributeValue('CLOSED-CAPTIONS');

    // EXT-X-STREAM-INF tags may have CLOSED-CAPTIONS attributes.
    // The value can be either a quoted-string or an enumerated-string with
    // the value NONE. If the value is a quoted-string, it MUST match the
    // value of the GROUP-ID attribute of an EXT-X-MEDIA tag elsewhere in the
    // Playlist whose TYPE attribute is CLOSED-CAPTIONS.
    if (type == ContentType.VIDEO && closedCaptionsAttr &&
    closedCaptionsAttr != 'NONE') {
      return this.groupIdToClosedCaptionsMap_.get(closedCaptionsAttr);
    }
    return null;
  }

  /**
   * Get the normalized language value.
   *
   * @param {?string} languageValue
   * @return {string}
   * @private
   */
  getLanguage_(languageValue) {
    const LanguageUtils = shaka.util.LanguageUtils;
    return LanguageUtils.normalize(languageValue || 'und');
  }

  /**
   * Get the type value.
   * Shaka recognizes the content types 'audio', 'video', 'text', and 'image'.
   * The HLS 'subtitles' type needs to be mapped to 'text'.
   * @param {!shaka.hls.Tag} tag
   * @return {string}
   * @private
   */
  getType_(tag) {
    let type = tag.getRequiredAttrValue('TYPE').toLowerCase();
    if (type == 'subtitles') {
      type = shaka.util.ManifestParserUtils.ContentType.TEXT;
    }
    return type;
  }

  /**
   * @param {!Array.<shaka.hls.HlsParser.StreamInfo>} audioInfos
   * @param {!Array.<shaka.hls.HlsParser.StreamInfo>} videoInfos
   * @param {number} bandwidth
   * @param {?string} width
   * @param {?string} height
   * @param {?string} frameRate
   * @param {?string} videoRange
   * @param {?string} videoLayout
   * @param {!Array.<shaka.extern.DrmInfo>} drmInfos
   * @param {!Set.<string>} keyIds
   * @return {!Array.<!shaka.extern.Variant>}
   * @private
   */
  createVariants_(
      audioInfos, videoInfos, bandwidth, width, height, frameRate, videoRange,
      videoLayout, drmInfos, keyIds) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const DrmEngine = shaka.media.DrmEngine;

    for (const info of videoInfos) {
      this.addVideoAttributes_(
          info.stream, width, height, frameRate, videoRange, videoLayout);
    }

    // In case of audio-only or video-only content or the audio/video is
    // disabled by the config, we create an array of one item containing
    // a null. This way, the double-loop works for all kinds of content.
    // NOTE: we currently don't have support for audio-only content.
    const disableAudio = this.config_.disableAudio;
    if (!audioInfos.length || disableAudio) {
      audioInfos = [null];
    }
    const disableVideo = this.config_.disableVideo;
    if (!videoInfos.length || disableVideo) {
      videoInfos = [null];
    }

    const variants = [];
    for (const audioInfo of audioInfos) {
      for (const videoInfo of videoInfos) {
        const audioStream = audioInfo ? audioInfo.stream : null;
        if (audioStream) {
          audioStream.drmInfos = drmInfos;
          audioStream.keyIds = keyIds;
        }
        const videoStream = videoInfo ? videoInfo.stream : null;
        if (videoStream) {
          videoStream.drmInfos = drmInfos;
          videoStream.keyIds = keyIds;
        }
        const audioDrmInfos = audioInfo ? audioInfo.stream.drmInfos : null;
        const videoDrmInfos = videoInfo ? videoInfo.stream.drmInfos : null;
        const videoStreamUri =
            videoInfo ? videoInfo.getUris().sort().join(',') : '';
        const audioStreamUri =
            audioInfo ? audioInfo.getUris().sort().join(',') : '';
        const variantUriKey = videoStreamUri + ' - ' + audioStreamUri;

        if (audioStream && videoStream) {
          if (!DrmEngine.areDrmCompatible(audioDrmInfos, videoDrmInfos)) {
            shaka.log.warning(
                'Incompatible DRM info in HLS variant.  Skipping.');
            continue;
          }
        }

        if (this.variantUriSet_.has(variantUriKey)) {
          // This happens when two variants only differ in their text streams.
          shaka.log.debug(
              'Skipping variant which only differs in text streams.');
          continue;
        }

        // Since both audio and video are of the same type, this assertion will
        // catch certain mistakes at runtime that the compiler would miss.
        goog.asserts.assert(!audioStream ||
            audioStream.type == ContentType.AUDIO, 'Audio parameter mismatch!');
        goog.asserts.assert(!videoStream ||
            videoStream.type == ContentType.VIDEO, 'Video parameter mismatch!');

        const variant = {
          id: this.globalId_++,
          language: audioStream ? audioStream.language : 'und',
          disabledUntilTime: 0,
          primary: (!!audioStream && audioStream.primary) ||
              (!!videoStream && videoStream.primary),
          audio: audioStream,
          video: videoStream,
          bandwidth,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
        };

        variants.push(variant);
        this.variantUriSet_.add(variantUriKey);
      }
    }
    return variants;
  }

  /**
   * Parses an array of EXT-X-MEDIA tags, then stores the values of all tags
   * with TYPE="CLOSED-CAPTIONS" into a map of group id to closed captions.
   *
   * @param {!Array.<!shaka.hls.Tag>} mediaTags
   * @private
   */
  parseClosedCaptions_(mediaTags) {
    const closedCaptionsTags =
        shaka.hls.Utils.filterTagsByType(mediaTags, 'CLOSED-CAPTIONS');
    for (const tag of closedCaptionsTags) {
      goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
          'Should only be called on media tags!');
      const languageValue = tag.getAttributeValue('LANGUAGE');
      let language = this.getLanguage_(languageValue);
      if (!languageValue) {
        const nameValue = tag.getAttributeValue('NAME');
        if (nameValue) {
          language = nameValue;
        }
      }

      // The GROUP-ID value is a quoted-string that specifies the group to which
      // the Rendition belongs.
      const groupId = tag.getRequiredAttrValue('GROUP-ID');

      // The value of INSTREAM-ID is a quoted-string that specifies a Rendition
      // within the segments in the Media Playlist. This attribute is REQUIRED
      // if the TYPE attribute is CLOSED-CAPTIONS.
      // We need replace SERVICE string by our internal svc string.
      const instreamId = tag.getRequiredAttrValue('INSTREAM-ID')
          .replace('SERVICE', 'svc');
      if (!this.groupIdToClosedCaptionsMap_.get(groupId)) {
        this.groupIdToClosedCaptionsMap_.set(groupId, new Map());
      }
      this.groupIdToClosedCaptionsMap_.get(groupId).set(instreamId, language);
    }
  }

  /**
   * Parse EXT-X-MEDIA media tag into a Stream object.
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfoFromMediaTags_(tags) {
    const verbatimMediaPlaylistUris = [];
    const globalGroupIds = [];
    for (const tag of tags) {
      goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
          'Should only be called on media tags!');
      verbatimMediaPlaylistUris.push(tag.getRequiredAttrValue('URI'));
      globalGroupIds.push(tag.getRequiredAttrValue('GROUP-ID'));
    }

    const globalGroupId = globalGroupIds.sort().join(',');
    const firstTag = tags[0];
    let codecs = '';
    /** @type {string} */
    const type = this.getType_(firstTag);
    if (type == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      codecs = firstTag.getAttributeValue('CODECS') || '';
    } else {
      for (const groupId of globalGroupIds) {
        if (this.groupIdToCodecsMap_.has(groupId)) {
          codecs = this.groupIdToCodecsMap_.get(groupId);
          break;
        }
      }
    }

    // Check if the stream has already been created as part of another Variant
    // and return it if it has.
    const key = verbatimMediaPlaylistUris.sort().join(',');
    if (this.uriToStreamInfosMap_.has(key)) {
      return this.uriToStreamInfosMap_.get(key);
    }

    const language = firstTag.getAttributeValue('LANGUAGE');
    const name = firstTag.getAttributeValue('NAME');

    // NOTE: According to the HLS spec, "DEFAULT=YES" requires "AUTOSELECT=YES".
    // However, we don't bother to validate "AUTOSELECT", since we don't
    // actually use it in our streaming model, and we treat everything as
    // "AUTOSELECT=YES".  A value of "AUTOSELECT=NO" would imply that it may
    // only be selected explicitly by the user, and we don't have a way to
    // represent that in our model.
    const defaultAttrValue = firstTag.getAttributeValue('DEFAULT');
    const primary = defaultAttrValue == 'YES';

    const channelsCount =
        type == 'audio' ? this.getChannelsCount_(firstTag) : null;
    const spatialAudio =
        type == 'audio' ? this.isSpatialAudio_(firstTag) : false;
    const characteristics = firstTag.getAttributeValue('CHARACTERISTICS');

    const forcedAttrValue = firstTag.getAttributeValue('FORCED');
    const forced = forcedAttrValue == 'YES';
    const sampleRate = type == 'audio' ? this.getSampleRate_(firstTag) : null;
    // TODO: Should we take into account some of the currently ignored
    // attributes: INSTREAM-ID, Attribute descriptions: https://bit.ly/2lpjOhj
    const streamInfo = this.createStreamInfo_(
        verbatimMediaPlaylistUris, codecs, type, language, primary, name,
        channelsCount, /* closedCaptions= */ null, characteristics, forced,
        sampleRate, spatialAudio);
    if (streamInfo.stream) {
      streamInfo.stream.groupId = globalGroupId;
    }
    if (this.groupIdToStreamInfosMap_.has(globalGroupId)) {
      this.groupIdToStreamInfosMap_.get(globalGroupId).push(streamInfo);
    } else {
      this.groupIdToStreamInfosMap_.set(globalGroupId, [streamInfo]);
    }

    this.uriToStreamInfosMap_.set(key, streamInfo);
    return streamInfo;
  }

  /**
   * Parse EXT-X-IMAGE-STREAM-INF media tag into a Stream object.
   *
   * @param {shaka.hls.Tag} tag
   * @return {!Promise.<!shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async createStreamInfoFromImageTag_(tag) {
    goog.asserts.assert(tag.name == 'EXT-X-IMAGE-STREAM-INF',
        'Should only be called on image tags!');
    /** @type {string} */
    const type = shaka.util.ManifestParserUtils.ContentType.IMAGE;

    const verbatimImagePlaylistUri = tag.getRequiredAttrValue('URI');
    const codecs = tag.getAttributeValue('CODECS', 'jpeg') || '';

    // Check if the stream has already been created as part of another Variant
    // and return it if it has.
    if (this.uriToStreamInfosMap_.has(verbatimImagePlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimImagePlaylistUri);
    }

    const language = tag.getAttributeValue('LANGUAGE');
    const name = tag.getAttributeValue('NAME');

    const characteristics = tag.getAttributeValue('CHARACTERISTICS');

    const streamInfo = this.createStreamInfo_(
        [verbatimImagePlaylistUri], codecs, type, language,
        /* primary= */ false, name, /* channelsCount= */ null,
        /* closedCaptions= */ null, characteristics, /* forced= */ false,
        /* sampleRate= */ null, /* spatialAudio= */ false);

    // Parse misc attributes.
    const resolution = tag.getAttributeValue('RESOLUTION');
    if (resolution) {
      // The RESOLUTION tag represents the resolution of a single thumbnail, not
      // of the entire sheet at once (like we expect in the output).
      // So multiply by the layout size.

      // Since we need to have generated the segment index for this, we can't
      // lazy-load in this situation.
      await streamInfo.stream.createSegmentIndex();

      const reference = streamInfo.stream.segmentIndex.get(0);
      const layout = reference.getTilesLayout();
      if (layout) {
        streamInfo.stream.width =
            Number(resolution.split('x')[0]) * Number(layout.split('x')[0]);
        streamInfo.stream.height =
            Number(resolution.split('x')[1]) * Number(layout.split('x')[1]);
        // TODO: What happens if there are multiple grids, with different
        // layout sizes, inside this image stream?
      }
    }
    const bandwidth = tag.getAttributeValue('BANDWIDTH');
    if (bandwidth) {
      streamInfo.stream.bandwidth = Number(bandwidth);
    }

    this.uriToStreamInfosMap_.set(verbatimImagePlaylistUri, streamInfo);
    return streamInfo;
  }

  /**
   * Parse EXT-X-I-FRAME-STREAM-INF media tag into a Stream object.
   *
   * @param {shaka.hls.Tag} tag
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfoFromIframeTag_(tag) {
    goog.asserts.assert(tag.name == 'EXT-X-I-FRAME-STREAM-INF',
        'Should only be called on iframe tags!');
    /** @type {string} */
    const type = shaka.util.ManifestParserUtils.ContentType.IMAGE;

    const verbatimIFramePlaylistUri = tag.getRequiredAttrValue('URI');
    const codecs = tag.getAttributeValue('CODECS') || '';

    // Check if the stream has already been created as part of another Variant
    // and return it if it has.
    if (this.uriToStreamInfosMap_.has(verbatimIFramePlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimIFramePlaylistUri);
    }

    const language = tag.getAttributeValue('LANGUAGE');
    const name = tag.getAttributeValue('NAME');

    const characteristics = tag.getAttributeValue('CHARACTERISTICS');

    const streamInfo = this.createStreamInfo_(
        [verbatimIFramePlaylistUri], codecs, type, language,
        /* primary= */ false, name, /* channelsCount= */ null,
        /* closedCaptions= */ null, characteristics, /* forced= */ false,
        /* sampleRate= */ null, /* spatialAudio= */ false);

    // Parse misc attributes.
    const resolution = tag.getAttributeValue('RESOLUTION');
    const [width, height] = resolution ? resolution.split('x') : [null, null];
    streamInfo.stream.width = Number(width) || undefined;
    streamInfo.stream.height = Number(height) || undefined;
    const bandwidth = tag.getAttributeValue('BANDWIDTH');
    if (bandwidth) {
      streamInfo.stream.bandwidth = Number(bandwidth);
    }

    this.uriToStreamInfosMap_.set(verbatimIFramePlaylistUri, streamInfo);
    return streamInfo;
  }

  /**
   * Parse an EXT-X-STREAM-INF media tag into a Stream object.
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @param {!Array.<string>} allCodecs
   * @param {string} type
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfoFromVariantTags_(tags, allCodecs, type) {
    const verbatimMediaPlaylistUris = [];
    for (const tag of tags) {
      goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
          'Should only be called on variant tags!');
      verbatimMediaPlaylistUris.push(tag.getRequiredAttrValue('URI'));
    }

    const key = verbatimMediaPlaylistUris.sort().join(',');
    if (this.uriToStreamInfosMap_.has(key)) {
      return this.uriToStreamInfosMap_.get(key);
    }

    const closedCaptions = this.getClosedCaptions_(tags[0], type);
    const codecs = shaka.util.ManifestParserUtils.guessCodecs(type, allCodecs);
    const streamInfo = this.createStreamInfo_(verbatimMediaPlaylistUris,
        codecs, type, /* language= */ null, /* primary= */ false,
        /* name= */ null, /* channelcount= */ null, closedCaptions,
        /* characteristics= */ null, /* forced= */ false,
        /* sampleRate= */ null, /* spatialAudio= */ false);

    this.uriToStreamInfosMap_.set(key, streamInfo);
    return streamInfo;
  }


  /**
   * @param {!Array.<string>} verbatimMediaPlaylistUris
   * @param {string} codecs
   * @param {string} type
   * @param {?string} languageValue
   * @param {boolean} primary
   * @param {?string} name
   * @param {?number} channelsCount
   * @param {Map.<string, string>} closedCaptions
   * @param {?string} characteristics
   * @param {boolean} forced
   * @param {?number} sampleRate
   * @param {boolean} spatialAudio
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfo_(verbatimMediaPlaylistUris, codecs, type, languageValue,
      primary, name, channelsCount, closedCaptions, characteristics, forced,
      sampleRate, spatialAudio) {
    // TODO: Refactor, too many parameters
    const redirectUris = [];
    const getUris = () => {
      return redirectUris.concat(shaka.hls.Utils.constructUris(
          [this.masterPlaylistUri_], verbatimMediaPlaylistUris,
          this.globalVariables_));
    };

    // This stream is lazy-loaded inside the createSegmentIndex function.
    // So we start out with a stream object that does not contain the actual
    // segment index, then download when createSegmentIndex is called.
    const stream = this.makeStreamObject_(codecs, type, languageValue, primary,
        name, channelsCount, closedCaptions, characteristics, forced,
        sampleRate, spatialAudio);
    const streamInfo = {
      stream,
      type,
      redirectUris,
      getUris,
      // These values are filled out or updated after lazy-loading:
      minTimestamp: 0,
      maxTimestamp: 0,
      mediaSequenceToStartTime: new Map(),
      canSkipSegments: false,
      canBlockReload: false,
      hasEndList: false,
      firstSequenceNumber: -1,
      nextMediaSequence: -1,
      nextPart: -1,
      loadedOnce: false,
    };

    /** @param {!AbortSignal} abortSignal */
    const downloadSegmentIndex = async (abortSignal) => {
      const uris = streamInfo.getUris();
      // Download the actual manifest.
      const response = await this.requestManifest_(
          streamInfo.getUris(), /* isPlaylist= */ true);
      if (abortSignal.aborted) {
        return;
      }

      // Record the final URI after redirects.
      const responseUri = response.uri;
      if (responseUri != response.originalUri && !uris.includes(responseUri)) {
        redirectUris.push(responseUri);
      }

      // Record the redirected, final URI of this media playlist when we parse
      // it.
      /** @type {!shaka.hls.Playlist} */
      const playlist = this.manifestTextParser_.parsePlaylist(response.data);

      let mimeType = undefined;

      // If no codec info was provided in the manifest and codec guessing is
      // disabled we try to get necessary info from the media data.
      if (!this.codecInfoInManifest_ && this.config_.hls.disableCodecGuessing) {
        const basicInfo =
            await this.getMediaPlaylistBasicInfo_(playlist, getUris);

        goog.asserts.assert(
            type === basicInfo.type, 'Media types should match!');

        mimeType = basicInfo.mimeType;
        codecs = basicInfo.codecs;
      }

      const wasLive = this.isLive_();
      const realStreamInfo = await this.convertParsedPlaylistIntoStreamInfo_(
          playlist, getUris, responseUri, codecs,
          type, languageValue, primary, name, channelsCount, closedCaptions,
          characteristics, forced, sampleRate, spatialAudio, mimeType);
      if (abortSignal.aborted) {
        return;
      }

      const realStream = realStreamInfo.stream;

      if (this.isLive_() && !wasLive) {
        // Now that we know that the presentation is live, convert the timeline
        // to live.
        this.changePresentationTimelineToLive_(playlist);
      }

      // Copy values from the real stream info to our initial one.
      streamInfo.minTimestamp = realStreamInfo.minTimestamp;
      streamInfo.maxTimestamp = realStreamInfo.maxTimestamp;
      streamInfo.canSkipSegments = realStreamInfo.canSkipSegments;
      streamInfo.canBlockReload = realStreamInfo.canBlockReload;
      streamInfo.hasEndList = realStreamInfo.hasEndList;
      streamInfo.mediaSequenceToStartTime =
          realStreamInfo.mediaSequenceToStartTime;
      streamInfo.nextMediaSequence = realStreamInfo.nextMediaSequence;
      streamInfo.nextPart = realStreamInfo.nextPart;
      streamInfo.loadedOnce = true;
      stream.segmentIndex = realStream.segmentIndex;
      stream.encrypted = realStream.encrypted;
      stream.drmInfos = realStream.drmInfos;
      stream.keyIds = realStream.keyIds;
      stream.mimeType = realStream.mimeType;
      stream.bandwidth = realStream.bandwidth;
      stream.codecs = realStream.codecs || stream.codecs;

      // Since we lazy-loaded this content, the player may need to create new
      // sessions for the DRM info in this stream.
      if (stream.drmInfos.length) {
        this.playerInterface_.newDrmInfo(stream);
      }

      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      if (type == ContentType.VIDEO || type == ContentType.AUDIO) {
        for (const otherStreamInfo of this.uriToStreamInfosMap_.values()) {
          if (!otherStreamInfo.loadedOnce && otherStreamInfo.type == type) {
            // To aid manifest filtering, assume before loading that all video
            // renditions have the same MIME type.  (And likewise for audio.)
            otherStreamInfo.stream.mimeType = realStream.mimeType;
          }
        }
      }

      if (type == ContentType.TEXT) {
        const firstSegment = realStream.segmentIndex.get(0);
        if (firstSegment && firstSegment.initSegmentReference) {
          stream.mimeType = 'application/mp4';
        }
      }

      // Add finishing touches to the stream that can only be done once we have
      // more full context on the media as a whole.
      if (this.hasEnoughInfoToFinalizeStreams_()) {
        if (!this.streamsFinalized_) {
          // Mark this manifest as having been finalized, so we don't go through
          // this whole process of finishing touches a second time.
          this.streamsFinalized_ = true;
          // Finalize all of the currently-loaded streams.
          const streamInfos = Array.from(this.uriToStreamInfosMap_.values());
          const activeStreamInfos =
              streamInfos.filter((s) => s.stream.segmentIndex);
          this.finalizeStreams_(activeStreamInfos);
          // With the addition of this new stream, we now have enough info to
          // figure out how long the streams should be. So process all streams
          // we have downloaded up until this point.
          this.determineDuration_();
          // Finally, start the update timer, if this asset has been determined
          // to be a livestream.
          const delay = this.getUpdatePlaylistDelay_();
          if (delay > 0) {
            this.updatePlaylistTimer_.tickAfter(/* seconds= */ delay);
          }
        } else {
          // We don't need to go through the full process; just finalize this
          // single stream.
          this.finalizeStreams_([streamInfo]);
        }
      }
    };

    /** @type {Promise} */
    let creationPromise = null;
    /** @type {!AbortController} */
    let abortController = new AbortController();
    const safeCreateSegmentIndex = () => {
      // An operation is already in progress.  The second and subsequent
      // callers receive the same Promise as the first caller, and only one
      // download operation will occur.
      if (creationPromise) {
        return creationPromise;
      }

      // Create a new AbortController to be able to cancel this specific
      // download.
      abortController = new AbortController();

      // Create a Promise tied to the outcome of downloadSegmentIndex().  If
      // downloadSegmentIndex is rejected, creationPromise will also be
      // rejected.
      creationPromise = new Promise((resolve) => {
        resolve(downloadSegmentIndex(abortController.signal));
      });
      return creationPromise;
    };

    stream.createSegmentIndex = safeCreateSegmentIndex;

    stream.closeSegmentIndex = () => {
      // If we're mid-creation, cancel it.
      if (creationPromise && !stream.segmentIndex) {
        abortController.abort();
      }
      // If we have a segment index, release it.
      if (stream.segmentIndex) {
        stream.segmentIndex.release();
        stream.segmentIndex = null;
      }
      // Clear the creation Promise so that a new operation can begin.
      creationPromise = null;
    };

    return streamInfo;
  }

  /**
   * @return {number}
   * @private
   */
  getMinDuration_() {
    let minDuration = Infinity;
    for (const streamInfo of this.uriToStreamInfosMap_.values()) {
      if (streamInfo.stream.segmentIndex && streamInfo.stream.type != 'text') {
        // Since everything is already offset to 0 (either by sync or by being
        // VOD), only maxTimestamp is necessary to compute the duration.
        minDuration = Math.min(minDuration, streamInfo.maxTimestamp);
      }
    }
    return minDuration;
  }

  /**
   * @return {number}
   * @private
   */
  getLiveDuration_() {
    let maxTimestamp = Infinity;
    let minTimestamp = Infinity;
    for (const streamInfo of this.uriToStreamInfosMap_.values()) {
      if (streamInfo.stream.segmentIndex && streamInfo.stream.type != 'text') {
        maxTimestamp = Math.min(maxTimestamp, streamInfo.maxTimestamp);
        minTimestamp = Math.min(minTimestamp, streamInfo.minTimestamp);
      }
    }
    return maxTimestamp - minTimestamp;
  }

  /**
   * @param {!Array.<!shaka.extern.Stream>} streams
   * @private
   */
  notifySegmentsForStreams_(streams) {
    const references = [];
    for (const stream of streams) {
      if (!stream.segmentIndex) {
        // The stream was closed since the list of streams was built.
        continue;
      }
      stream.segmentIndex.forEachTopLevelReference((reference) => {
        references.push(reference);
      });
    }
    this.presentationTimeline_.notifySegments(references);
  }

  /**
   * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} streamInfos
   * @private
   */
  finalizeStreams_(streamInfos) {
    if (!this.isLive_()) {
      const minDuration = this.getMinDuration_();
      for (const streamInfo of streamInfos) {
        streamInfo.stream.segmentIndex.fit(/* periodStart= */ 0, minDuration);
      }
    }
    this.notifySegmentsForStreams_(streamInfos.map((s) => s.stream));
    if (this.config_.hls.ignoreManifestProgramDateTime) {
      this.syncStreamsWithSequenceNumber_(streamInfos);
    } else {
      this.syncStreamsWithProgramDateTime_(streamInfos);
    }
  }

  /**
   * There are some values on streams that can only be set once we know about
   * both the video and audio content, if present.
   * This checks if there is at least one video downloaded (if the media has
   * video), and that there is at least one audio downloaded (if the media has
   * audio).
   * @return {boolean}
   * @private
   */
  hasEnoughInfoToFinalizeStreams_() {
    if (!this.manifest_) {
      return false;
    }
    const videos = [];
    const audios = [];
    for (const variant of this.manifest_.variants) {
      if (variant.video) {
        videos.push(variant.video);
      }
      if (variant.audio) {
        audios.push(variant.audio);
      }
    }
    if (videos.length > 0 && !videos.some((stream) => stream.segmentIndex)) {
      return false;
    }
    if (audios.length > 0 && !audios.some((stream) => stream.segmentIndex)) {
      return false;
    }
    return true;
  }

  /**
   * @param {!shaka.hls.Playlist} playlist
   * @param {function():!Array.<string>} getUris
   * @param {string} responseUri
   * @param {string} codecs
   * @param {string} type
   * @param {?string} languageValue
   * @param {boolean} primary
   * @param {?string} name
   * @param {?number} channelsCount
   * @param {Map.<string, string>} closedCaptions
   * @param {?string} characteristics
   * @param {boolean} forced
   * @param {?number} sampleRate
   * @param {boolean} spatialAudio
   * @param {(string|undefined)} mimeType
   * @return {!Promise.<!shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async convertParsedPlaylistIntoStreamInfo_(playlist,
      getUris, responseUri, codecs, type, languageValue, primary, name,
      channelsCount, closedCaptions, characteristics, forced, sampleRate,
      spatialAudio, mimeType = undefined) {
    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      // EXT-X-MEDIA and EXT-X-IMAGE-STREAM-INF tags should point to media
      // playlists.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    /** @type {!Array.<!shaka.hls.Tag>} */
    const variablesTags = shaka.hls.Utils.filterTagsByName(playlist.tags,
        'EXT-X-DEFINE');

    const mediaVariables =
        this.parseMediaVariables_(variablesTags, responseUri);

    goog.asserts.assert(playlist.segments != null,
        'Media playlist should have segments!');

    this.determinePresentationType_(playlist);

    if (this.isLive_()) {
      this.determineLastTargetDuration_(playlist);
    }

    if (!mimeType) {
      mimeType = await this.guessMimeType_(type, codecs, playlist,
          mediaVariables, getUris);
    }

    const {drmInfos, keyIds, encrypted, aesEncrypted} =
                        this.parseDrmInfo_(playlist, mimeType);

    if (encrypted && !drmInfos.length && !aesEncrypted) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_KEYFORMATS_NOT_SUPPORTED);
    }

    const stream = this.makeStreamObject_(codecs, type, languageValue, primary,
        name, channelsCount, closedCaptions, characteristics, forced,
        sampleRate, spatialAudio);
    stream.encrypted = encrypted;
    stream.drmInfos = drmInfos;
    stream.keyIds = keyIds;
    stream.mimeType = mimeType;

    const mediaSequenceToStartTime = this.isLive_() ?
        this.mediaSequenceToStartTimeByType_.get(type) : new Map();

    const {segments, bandwidth} = this.createSegments_(
        playlist, stream, mediaSequenceToStartTime, mediaVariables, getUris);
    stream.bandwidth = bandwidth;

    // This new calculation is necessary for Low Latency streams.
    if (this.isLive_()) {
      this.determineLastTargetDuration_(playlist);
    }

    const firstStartTime = segments[0].startTime;
    const lastSegment = segments[segments.length - 1];
    const lastEndTime = lastSegment.endTime;
    /** @type {!shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(segments);
    stream.segmentIndex = segmentIndex;

    const serverControlTag = shaka.hls.Utils.getFirstTagWithName(
        playlist.tags, 'EXT-X-SERVER-CONTROL');
    const canSkipSegments = serverControlTag ?
          serverControlTag.getAttribute('CAN-SKIP-UNTIL') != null : false;
    const canBlockReload = serverControlTag ?
          serverControlTag.getAttribute('CAN-BLOCK-RELOAD') != null : false;

    const mediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
        playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);

    const {nextMediaSequence, nextPart} =
        this.getNextMediaSequenceAndPart_(mediaSequenceNumber, segments);

    return {
      stream,
      type,
      redirectUris: [],
      getUris,
      minTimestamp: firstStartTime,
      maxTimestamp: lastEndTime,
      canSkipSegments,
      canBlockReload,
      hasEndList: false,
      firstSequenceNumber: -1,
      nextMediaSequence,
      nextPart,
      mediaSequenceToStartTime,
      loadedOnce: false,
    };
  }

  /**
   * Get the next msn and part
   *
   * @param {number} mediaSequenceNumber
   * @param {!Array.<!shaka.media.SegmentReference>} segments
   * @return {{nextMediaSequence: number, nextPart:number}}}
   * @private
   */
  getNextMediaSequenceAndPart_(mediaSequenceNumber, segments) {
    const currentMediaSequence = mediaSequenceNumber + segments.length - 1;
    let nextMediaSequence = currentMediaSequence;
    let nextPart = -1;
    if (!segments.length) {
      nextMediaSequence++;
      return {
        nextMediaSequence,
        nextPart,
      };
    }
    const lastSegment = segments[segments.length - 1];
    const partialReferences = lastSegment.partialReferences;
    if (!lastSegment.partialReferences.length) {
      nextMediaSequence++;
      if (lastSegment.hasByterangeOptimization()) {
        nextPart = 0;
      }
      return {
        nextMediaSequence,
        nextPart,
      };
    }
    nextPart = partialReferences.length - 1;
    const lastPartialReference =
        partialReferences[partialReferences.length - 1];
    if (!lastPartialReference.isPreload()) {
      nextMediaSequence++;
      nextPart = 0;
    }
    return {
      nextMediaSequence,
      nextPart,
    };
  }


  /**
   * Creates a stream object with the given parameters.
   * The parameters that are passed into here are only the things that can be
   * known without downloading the media playlist; other values must be set
   * manually on the object after creation.
   * @param {string} codecs
   * @param {string} type
   * @param {?string} languageValue
   * @param {boolean} primary
   * @param {?string} name
   * @param {?number} channelsCount
   * @param {Map.<string, string>} closedCaptions
   * @param {?string} characteristics
   * @param {boolean} forced
   * @param {?number} sampleRate
   * @param {boolean} spatialAudio
   * @return {!shaka.extern.Stream}
   * @private
   */
  makeStreamObject_(codecs, type, languageValue, primary, name, channelsCount,
      closedCaptions, characteristics, forced, sampleRate, spatialAudio) {
    // Fill out a "best-guess" mimeType, for now. It will be replaced once the
    // stream is lazy-loaded.
    const mimeType = this.guessMimeTypeBeforeLoading_(type, codecs) ||
        this.guessMimeTypeFallback_(type);
    const roles = [];
    if (characteristics) {
      for (const characteristic of characteristics.split(',')) {
        roles.push(characteristic);
      }
    }

    let kind = undefined;
    let accessibilityPurpose = null;
    if (type == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      if (roles.includes('public.accessibility.transcribes-spoken-dialog') &&
          roles.includes('public.accessibility.describes-music-and-sound')) {
        kind = shaka.util.ManifestParserUtils.TextStreamKind.CLOSED_CAPTION;
      } else {
        kind = shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE;
      }
    } else {
      if (roles.includes('public.accessibility.describes-video')) {
        accessibilityPurpose =
              shaka.media.ManifestParser.AccessibilityPurpose.VISUALLY_IMPAIRED;
      }
    }

    // If there are no roles, and we have defaulted to the subtitle "kind" for
    // this track, add the implied subtitle role.
    if (!roles.length &&
        kind === shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE) {
      roles.push(shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE);
    }

    return {
      id: this.globalId_++,
      originalId: name,
      groupId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: null,
      mimeType,
      codecs,
      kind: (type == shaka.util.ManifestParserUtils.ContentType.TEXT) ?
          shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE : undefined,
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: this.getLanguage_(languageValue),
      originalLanguage: languageValue,
      label: name,  // For historical reasons, since before "originalId".
      type,
      primary,
      // TODO: trick mode
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      frameRate: undefined,
      pixelAspectRatio: undefined,
      width: undefined,
      height: undefined,
      bandwidth: undefined,
      roles,
      forced,
      channelsCount,
      audioSamplingRate: sampleRate,
      spatialAudio,
      closedCaptions,
      hdr: undefined,
      videoLayout: undefined,
      tilesLayout: undefined,
      accessibilityPurpose: accessibilityPurpose,
      external: false,
      fastSwitching: false,
    };
  }

  /**
   * @param {!shaka.hls.Playlist} playlist
   * @param {string} mimeType
   * @return {{
   *   drmInfos: !Array.<shaka.extern.DrmInfo>,
   *   keyIds: !Set.<string>,
   *   encrypted: boolean,
   *   aesEncrypted: boolean
   * }}
   * @private
   */
  parseDrmInfo_(playlist, mimeType) {
    /** @type {!Array.<!shaka.hls.Tag>} */
    const drmTags = [];
    if (playlist.segments) {
      for (const segment of playlist.segments) {
        const segmentKeyTags = shaka.hls.Utils.filterTagsByName(segment.tags,
            'EXT-X-KEY');
        drmTags.push(...segmentKeyTags);
      }
    }

    let encrypted = false;
    let aesEncrypted = false;

    /** @type {!Array.<shaka.extern.DrmInfo>}*/
    const drmInfos = [];
    const keyIds = new Set();

    for (const drmTag of drmTags) {
      const method = drmTag.getRequiredAttrValue('METHOD');
      if (method != 'NONE') {
        encrypted = true;

        if (method == 'AES-128') {
          // These keys are handled separately.
          aesEncrypted = true;
        } else {
          // According to the HLS spec, KEYFORMAT is optional and implicitly
          // defaults to "identity".
          // https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis-11#section-4.4.4.4
          const keyFormat =
              drmTag.getAttributeValue('KEYFORMAT') || 'identity';
          const drmParser =
              shaka.hls.HlsParser.KEYFORMATS_TO_DRM_PARSERS_[keyFormat];

          const drmInfo = drmParser ? drmParser(drmTag, mimeType) : null;
          if (drmInfo) {
            if (drmInfo.keyIds) {
              for (const keyId of drmInfo.keyIds) {
                keyIds.add(keyId);
              }
            }
            drmInfos.push(drmInfo);
          } else {
            shaka.log.warning('Unsupported HLS KEYFORMAT', keyFormat);
          }
        }
      }
    }

    return {drmInfos, keyIds, encrypted, aesEncrypted};
  }

  /**
   * @param {!shaka.hls.Tag} drmTag
   * @param {!shaka.hls.Playlist} playlist
   * @param {function():!Array.<string>} getUris
   * @param {?Map.<string, string>=} variables
   * @return {!shaka.extern.aes128Key}
   * @private
   */
  parseAES128DrmTag_(drmTag, playlist, getUris, variables) {
    // Check if the Web Crypto API is available.
    if (!window.crypto || !window.crypto.subtle) {
      shaka.log.alwaysWarn('Web Crypto API is not available to decrypt ' +
          'AES-128. (Web Crypto only exists in secure origins like https)');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.NO_WEB_CRYPTO_API);
    }

    // HLS RFC 8216 Section 5.2:
    // An EXT-X-KEY tag with a KEYFORMAT of "identity" that does not have an IV
    // attribute indicates that the Media Sequence Number is to be used as the
    // IV when decrypting a Media Segment, by putting its big-endian binary
    // representation into a 16-octet (128-bit) buffer and padding (on the left)
    // with zeros.
    let firstMediaSequenceNumber = 0;
    let iv;
    const ivHex = drmTag.getAttributeValue('IV', '');
    if (!ivHex) {
      // Media Sequence Number will be used as IV.
      firstMediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
          playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);
    } else {
      // Exclude 0x at the start of string.
      iv = shaka.util.Uint8ArrayUtils.fromHex(ivHex.substr(2));
      if (iv.byteLength != 16) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.AES_128_INVALID_IV_LENGTH);
      }
    }

    const keyInfo = {method: 'AES-128', iv, firstMediaSequenceNumber};

    // Don't download the key object until the segment is parsed, to avoid a
    // startup delay for long manifests with lots of keys.
    keyInfo.fetchKey = async () => {
      const keyUri = shaka.hls.Utils.constructSegmentUris(
          getUris(), drmTag.getRequiredAttrValue('URI'), variables);

      const requestType = shaka.net.NetworkingEngine.RequestType.KEY;
      const request = shaka.net.NetworkingEngine.makeRequest(
          [keyUri], this.config_.retryParameters);
      const keyResponse = await this.makeNetworkRequest_(request, requestType);

      // keyResponse.status is undefined when URI is "data:text/plain;base64,"
      if (!keyResponse.data || keyResponse.data.byteLength != 16) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.AES_128_INVALID_KEY_LENGTH);
      }

      const algorithm = {
        name: 'AES-CBC',
      };
      keyInfo.cryptoKey = await window.crypto.subtle.importKey(
          'raw', keyResponse.data, algorithm, true, ['decrypt']);
      keyInfo.fetchKey = undefined; // No longer needed.
    };

    return keyInfo;
  }


  /**
   * @param {!shaka.hls.Playlist} playlist
   * @private
   */
  determinePresentationType_(playlist) {
    const PresentationType = shaka.hls.HlsParser.PresentationType_;
    const presentationTypeTag =
        shaka.hls.Utils.getFirstTagWithName(playlist.tags,
            'EXT-X-PLAYLIST-TYPE');
    const endListTag =
        shaka.hls.Utils.getFirstTagWithName(playlist.tags, 'EXT-X-ENDLIST');

    const isVod = (presentationTypeTag && presentationTypeTag.value == 'VOD') ||
        endListTag;
    const isEvent = presentationTypeTag &&
        presentationTypeTag.value == 'EVENT' && !isVod;
    const isLive = !isVod && !isEvent;

    if (isVod) {
      this.setPresentationType_(PresentationType.VOD);
    } else {
      // If it's not VOD, it must be presentation type LIVE or an ongoing EVENT.
      if (isLive) {
        this.setPresentationType_(PresentationType.LIVE);
      } else {
        this.setPresentationType_(PresentationType.EVENT);
      }
    }
  }


  /**
   * @param {!shaka.hls.Playlist} playlist
   * @private
   */
  determineLastTargetDuration_(playlist) {
    let lastTargetDuration = Infinity;
    const segments = playlist.segments;
    if (segments.length) {
      let segmentIndex = segments.length - 1;
      while (segmentIndex >= 0) {
        const segment = segments[segmentIndex];
        const extinfTag =
            shaka.hls.Utils.getFirstTagWithName(segment.tags, 'EXTINF');
        if (extinfTag) {
          // The EXTINF tag format is '#EXTINF:<duration>,[<title>]'.
          // We're interested in the duration part.
          const extinfValues = extinfTag.value.split(',');
          lastTargetDuration = Number(extinfValues[0]);
          break;
        }
        segmentIndex--;
      }
    }

    const targetDurationTag = this.getRequiredTag_(playlist.tags,
        'EXT-X-TARGETDURATION');
    const targetDuration = Number(targetDurationTag.value);
    const partialTargetDurationTag =
      shaka.hls.Utils.getFirstTagWithName(playlist.tags, 'EXT-X-PART-INF');
    if (partialTargetDurationTag) {
      this.partialTargetDuration_ = Number(
          partialTargetDurationTag.getRequiredAttrValue('PART-TARGET'));
    }
    // Get the server-recommended min distance from the live edge.
    const serverControlTag = shaka.hls.Utils.getFirstTagWithName(
        playlist.tags, 'EXT-X-SERVER-CONTROL');
    // According to the HLS spec, updates should not happen more often than
    // once in targetDuration.  It also requires us to only update the active
    // variant.  We might implement that later, but for now every variant
    // will be updated.  To get the update period, choose the smallest
    // targetDuration value across all playlists.
    // 1. Update the shortest one to use as update period and segment
    // availability time (for LIVE).
    if (this.lowLatencyMode_ && this.partialTargetDuration_) {
      // For low latency streaming, use the partial segment target duration.
      if (this.lowLatencyByterangeOptimization_) {
        // We always have at least 1 partial segment part, and most servers
        // allow you to make a request with _HLS_msn=X&_HLS_part=0 with a
        // distance of 4 partial segments.  With this we ensure that we
        // obtain the minimum latency in this type of case.
        if (this.partialTargetDuration_ * 5 <= lastTargetDuration) {
          this.lastTargetDuration_ = Math.min(
              this.partialTargetDuration_, this.lastTargetDuration_);
        } else {
          this.lastTargetDuration_ = Math.min(
              lastTargetDuration, this.lastTargetDuration_);
        }
      } else {
        this.lastTargetDuration_ = Math.min(
            this.partialTargetDuration_, this.lastTargetDuration_);
      }
      // Use 'PART-HOLD-BACK' as the presentation delay for low latency mode.
      this.lowLatencyPresentationDelay_ = serverControlTag ? Number(
          serverControlTag.getRequiredAttrValue('PART-HOLD-BACK')) : 0;
    } else {
      this.lastTargetDuration_ = Math.min(
          lastTargetDuration, this.lastTargetDuration_);
      // Use 'HOLD-BACK' as the presentation delay for default if defined.
      const holdBack = serverControlTag ?
          serverControlTag.getAttribute('HOLD-BACK') : null;
      this.presentationDelay_ = holdBack ? Number(holdBack.value) : 0;
    }
    // 2. Update the longest target duration if need be to use as a
    // presentation delay later.
    this.maxTargetDuration_ = Math.max(
        targetDuration, this.maxTargetDuration_);
  }


  /**
   * @param {!shaka.hls.Playlist} playlist
   * @private
   */
  changePresentationTimelineToLive_(playlist) {
    // The live edge will be calculated from segments, so we don't need to
    // set a presentation start time.  We will assert later that this is
    // working as expected.

    // The HLS spec (RFC 8216) states in 6.3.3:
    //
    // "The client SHALL choose which Media Segment to play first ... the
    // client SHOULD NOT choose a segment that starts less than three target
    // durations from the end of the Playlist file.  Doing so can trigger
    // playback stalls."
    //
    // We accomplish this in our DASH-y model by setting a presentation
    // delay of configured value, or 3 segments duration if not configured.
    // This will be the "live edge" of the presentation.
    let presentationDelay;
    if (this.config_.defaultPresentationDelay) {
      presentationDelay = this.config_.defaultPresentationDelay;
    } else if (this.lowLatencyPresentationDelay_) {
      presentationDelay = this.lowLatencyPresentationDelay_;
    } else if (this.presentationDelay_) {
      presentationDelay = this.presentationDelay_;
    } else {
      const playlistSegments = playlist.segments.length;
      let delaySegments = this.config_.hls.liveSegmentsDelay;
      if (delaySegments > (playlistSegments - 2)) {
        delaySegments = Math.max(1, playlistSegments - 2);
      }
      presentationDelay = this.maxTargetDuration_ * delaySegments;
    }

    this.presentationTimeline_.setPresentationStartTime(0);
    this.presentationTimeline_.setDelay(presentationDelay);
    this.presentationTimeline_.setStatic(false);
  }

  /**
   * Get the InitSegmentReference for a segment if it has a EXT-X-MAP tag.
   * @param {!shaka.hls.Playlist} playlist
   * @param {!Array.<!shaka.hls.Tag>} tags Segment tags
   * @param {function():!Array.<string>} getUris
   * @param {?Map.<string, string>=} variables
   * @return {shaka.media.InitSegmentReference}
   * @private
   */
  getInitSegmentReference_(playlist, tags, getUris, variables) {
    /** @type {?shaka.hls.Tag} */
    const mapTag = shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-MAP');

    if (!mapTag) {
      return null;
    }
    // Map tag example: #EXT-X-MAP:URI="main.mp4",BYTERANGE="720@0"
    const verbatimInitSegmentUri = mapTag.getRequiredAttrValue('URI');
    const absoluteInitSegmentUris = shaka.hls.Utils.constructSegmentUris(
        getUris(), verbatimInitSegmentUri, variables);

    const mapTagKey = [
      absoluteInitSegmentUris.toString(),
      mapTag.getAttributeValue('BYTERANGE', ''),
    ].join('-');
    if (!this.mapTagToInitSegmentRefMap_.has(mapTagKey)) {
      /** @type {shaka.extern.aes128Key|undefined} */
      let aes128Key = undefined;
      let byteRangeTag = null;
      for (const tag of tags) {
        if (tag.name == 'EXT-X-KEY') {
          if (tag.getRequiredAttrValue('METHOD') == 'AES-128' &&
              tag.id < mapTag.id) {
            aes128Key =
                this.parseAES128DrmTag_(tag, playlist, getUris, variables);
          }
        } else if (tag.name == 'EXT-X-BYTERANGE' && tag.id < mapTag.id) {
          byteRangeTag = tag;
        }
      }
      const initSegmentRef = this.createInitSegmentReference_(
          absoluteInitSegmentUris, mapTag, byteRangeTag, aes128Key);
      this.mapTagToInitSegmentRefMap_.set(mapTagKey, initSegmentRef);
    }
    return this.mapTagToInitSegmentRefMap_.get(mapTagKey);
  }

  /**
   * Create an InitSegmentReference object for the EXT-X-MAP tag in the media
   * playlist.
   * @param {!Array.<string>} absoluteInitSegmentUris
   * @param {!shaka.hls.Tag} mapTag EXT-X-MAP
   * @param {shaka.hls.Tag=} byteRangeTag EXT-X-BYTERANGE
   * @param {shaka.extern.aes128Key=} aes128Key
   * @return {!shaka.media.InitSegmentReference}
   * @private
   */
  createInitSegmentReference_(absoluteInitSegmentUris, mapTag, byteRangeTag,
      aes128Key) {
    let startByte = 0;
    let endByte = null;
    let byterange = mapTag.getAttributeValue('BYTERANGE');
    if (!byterange && byteRangeTag) {
      byterange = byteRangeTag.value;
    }
    // If a BYTERANGE attribute is not specified, the segment consists
    // of the entire resource.
    if (byterange) {
      const blocks = byterange.split('@');
      const byteLength = Number(blocks[0]);
      startByte = Number(blocks[1]);
      endByte = startByte + byteLength - 1;

      if (aes128Key) {
        // MAP segment encrypted with method 'AES-128', when served with
        // HTTP Range, has the unencrypted size specified in the range.
        // See: https://tools.ietf.org/html/draft-pantos-hls-rfc8216bis-08#section-6.3.6
        const length = (endByte + 1) - startByte;
        if (length % 16) {
          endByte += (16 - (length % 16));
        }
      }
    }

    const initSegmentRef = new shaka.media.InitSegmentReference(
        () => absoluteInitSegmentUris,
        startByte,
        endByte,
        /* mediaQuality= */ null,
        /* timescale= */ null,
        /* segmentData= */ null,
        aes128Key);
    return initSegmentRef;
  }

  /**
   * Parses one shaka.hls.Segment object into a shaka.media.SegmentReference.
   *
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {shaka.media.SegmentReference} previousReference
   * @param {!shaka.hls.Segment} hlsSegment
   * @param {number} startTime
   * @param {!Map.<string, string>} variables
   * @param {!shaka.hls.Playlist} playlist
   * @param {shaka.extern.Stream} stream
   * @param {function():!Array.<string>} getUris
   * @param {shaka.extern.aes128Key=} aes128Key
   * @return {shaka.media.SegmentReference}
   * @private
   */
  createSegmentReference_(
      initSegmentReference, previousReference, hlsSegment, startTime,
      variables, playlist, stream, getUris, aes128Key) {
    const tags = hlsSegment.tags;
    const extinfTag =
        shaka.hls.Utils.getFirstTagWithName(tags, 'EXTINF');

    let endTime = 0;
    let startByte = 0;
    let endByte = null;

    if (hlsSegment.partialSegments.length && !this.lowLatencyMode_) {
      shaka.log.alwaysWarn('Low-latency HLS live stream detected, but ' +
                'low-latency streaming mode is not enabled in Shaka ' +
                'Player. Set streaming.lowLatencyMode configuration to ' +
                'true, and see https://bit.ly/3clctcj for details.');
    }

    let syncTime = null;
    if (!this.config_.hls.ignoreManifestProgramDateTime) {
      const dateTimeTag =
          shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-PROGRAM-DATE-TIME');
      if (dateTimeTag && dateTimeTag.value) {
        syncTime = shaka.util.XmlUtils.parseDate(dateTimeTag.value);
        goog.asserts.assert(syncTime != null,
            'EXT-X-PROGRAM-DATE-TIME format not valid');
      }
    }

    let status = shaka.media.SegmentReference.Status.AVAILABLE;
    if (shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-GAP')) {
      status = shaka.media.SegmentReference.Status.MISSING;
    }

    if (!extinfTag) {
      if (hlsSegment.partialSegments.length == 0) {
        // EXTINF tag must be available if the segment has no partial segments.
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.HLS_REQUIRED_TAG_MISSING, 'EXTINF');
      } else if (!this.lowLatencyMode_) {
        // Without EXTINF and without low-latency mode, partial segments get
        // ignored.
        return null;
      }
    }

    // Create SegmentReferences for the partial segments.
    let partialSegmentRefs = [];

    // Optimization for LL-HLS with byterange
    // More info in https://tinyurl.com/hls-open-byte-range
    let segmentWithByteRangeOptimization = false;
    let getUrisOptimization = null;
    let somePartialSegmentWithGap = false;
    let isPreloadSegment = false;

    if (this.lowLatencyMode_ && hlsSegment.partialSegments.length) {
      const byterangeOptimizationSupport = (stream.mimeType == 'video/mp4' ||
          stream.mimeType == 'audio/mp4') && window.ReadableStream &&
          this.config_.hls.allowLowLatencyByteRangeOptimization;

      let partialSyncTime = syncTime;
      for (let i = 0; i < hlsSegment.partialSegments.length; i++) {
        const item = hlsSegment.partialSegments[i];
        const pPreviousReference = i == 0 ?
          previousReference : partialSegmentRefs[partialSegmentRefs.length - 1];
        const pStartTime = (i == 0) ? startTime : pPreviousReference.endTime;

        // If DURATION is missing from this partial segment, use the target
        // partial duration from the top of the playlist, which is a required
        // attribute for content with partial segments.
        const pDuration = Number(item.getAttributeValue('DURATION')) ||
            this.partialTargetDuration_;

        // If for some reason we have neither an explicit duration, nor a target
        // partial duration, we should SKIP this partial segment to avoid
        // duplicating content in the presentation timeline.
        if (!pDuration) {
          continue;
        }

        const pEndTime = pStartTime + pDuration;

        let pStartByte = 0;
        let pEndByte = null;
        if (item.name == 'EXT-X-PRELOAD-HINT') {
          // A preload hinted partial segment may have byterange start info.
          const pByterangeStart = item.getAttributeValue('BYTERANGE-START');
          pStartByte = pByterangeStart ? Number(pByterangeStart) : 0;
          // A preload hinted partial segment may have byterange length info.
          const pByterangeLength = item.getAttributeValue('BYTERANGE-LENGTH');
          if (pByterangeLength) {
            pEndByte = pStartByte + Number(pByterangeLength) - 1;
          } else if (pStartByte) {
            // If we have a non-zero start byte, but no end byte, follow the
            // recommendation of https://tinyurl.com/hls-open-byte-range and
            // set the end byte explicitly to a large integer.
            pEndByte = Number.MAX_SAFE_INTEGER;
          }
        } else {
          const pByterange = item.getAttributeValue('BYTERANGE');
          [pStartByte, pEndByte] =
            this.parseByteRange_(pPreviousReference, pByterange);
        }
        const pUri = item.getAttributeValue('URI');
        if (!pUri) {
          continue;
        }

        let partialStatus = shaka.media.SegmentReference.Status.AVAILABLE;
        if (item.getAttributeValue('GAP') == 'YES') {
          partialStatus = shaka.media.SegmentReference.Status.MISSING;
          somePartialSegmentWithGap = true;
        }

        let uris = null;
        const getPartialUris = () => {
          if (uris == null) {
            goog.asserts.assert(pUri, 'Partial uri should be defined!');
            uris = shaka.hls.Utils.constructSegmentUris(
                getUris(), pUri, variables);
          }
          return uris;
        };

        if (byterangeOptimizationSupport &&
            pStartByte >= 0 && pEndByte != null) {
          getUrisOptimization = getPartialUris;
          segmentWithByteRangeOptimization = true;
        }

        const partial = new shaka.media.SegmentReference(
            pStartTime,
            pEndTime,
            getPartialUris,
            pStartByte,
            pEndByte,
            initSegmentReference,
            /* timestampOffset= */ 0,
            /* appendWindowStart= */ 0,
            /* appendWindowEnd= */ Infinity,
            /* partialReferences= */ [],
            /* tilesLayout= */ '',
            /* tileDuration= */ null,
            partialSyncTime,
            partialStatus,
            aes128Key);
        if (item.name == 'EXT-X-PRELOAD-HINT') {
          partial.markAsPreload();
          isPreloadSegment = true;
        }
        // The spec doesn't say that we can assume INDEPENDENT=YES for the
        // first partial segment. It does call the flag "optional", though, and
        // that cases where there are no such flags on any partial segments, it
        // is sensible to assume the first one is independent.
        if (item.getAttributeValue('INDEPENDENT') != 'YES' && i > 0) {
          partial.markAsNonIndependent();
        }
        partialSegmentRefs.push(partial);

        if (partialSyncTime) {
          partialSyncTime += pDuration;
        }
      } // for-loop of hlsSegment.partialSegments
    }

    // If the segment has EXTINF tag, set the segment's end time, start byte
    // and end byte based on the duration and byterange information.
    // Otherwise, calculate the end time, start / end byte based on its partial
    // segments.
    // Note that the sum of partial segments durations may be slightly different
    // from the parent segment's duration. In this case, use the duration from
    // the parent segment tag.
    if (extinfTag) {
      // The EXTINF tag format is '#EXTINF:<duration>,[<title>]'.
      // We're interested in the duration part.
      const extinfValues = extinfTag.value.split(',');
      const duration = Number(extinfValues[0]);
      // Skip segments without duration
      if (duration == 0) {
        return null;
      }
      endTime = startTime + duration;
    } else if (partialSegmentRefs.length) {
      endTime = partialSegmentRefs[partialSegmentRefs.length - 1].endTime;
    } else {
      // Skip segments without duration and without partialsegments
      return null;
    }

    if (segmentWithByteRangeOptimization) {
      // We cannot optimize segments with gaps, or with a start byte that is
      // not 0.
      if (somePartialSegmentWithGap || partialSegmentRefs[0].startByte != 0) {
        segmentWithByteRangeOptimization = false;
        getUrisOptimization = null;
      } else {
        partialSegmentRefs = [];
      }
    }

    // If the segment has EXT-X-BYTERANGE tag, set the start byte and end byte
    // base on the byterange information. If segment has no EXT-X-BYTERANGE tag
    // and has partial segments, set the start byte and end byte base on the
    // partial segments.
    const byterangeTag =
         shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-BYTERANGE');
    if (byterangeTag) {
      [startByte, endByte] =
          this.parseByteRange_(previousReference, byterangeTag.value);
    } else if (partialSegmentRefs.length) {
      startByte = partialSegmentRefs[0].startByte;
      endByte = partialSegmentRefs[partialSegmentRefs.length - 1].endByte;
    }

    let tilesLayout = '';
    let tileDuration = null;
    if (stream.type == shaka.util.ManifestParserUtils.ContentType.IMAGE) {
      // By default in HLS the tilesLayout is 1x1
      tilesLayout = '1x1';
      const tilesTag =
          shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-TILES');
      if (tilesTag) {
        tilesLayout = tilesTag.getRequiredAttrValue('LAYOUT');
        const duration = tilesTag.getAttributeValue('DURATION');
        if (duration) {
          tileDuration = Number(duration);
        }
      }
    }

    let uris = null;
    const getSegmentUris = () => {
      if (getUrisOptimization) {
        return getUrisOptimization();
      }
      if (uris == null) {
        uris = shaka.hls.Utils.constructSegmentUris(getUris(),
            hlsSegment.verbatimSegmentUri, variables);
      }
      return uris || [];
    };

    const allPartialSegments = partialSegmentRefs.length > 0 &&
        !!hlsSegment.verbatimSegmentUri;

    const reference = new shaka.media.SegmentReference(
        startTime,
        endTime,
        getSegmentUris,
        startByte,
        endByte,
        initSegmentReference,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity,
        partialSegmentRefs,
        tilesLayout,
        tileDuration,
        syncTime,
        status,
        aes128Key,
        allPartialSegments,
    );

    if (segmentWithByteRangeOptimization) {
      this.lowLatencyByterangeOptimization_ = true;
      reference.markAsByterangeOptimization();

      if (isPreloadSegment) {
        reference.markAsPreload();
      }
    }

    return reference;
  }


  /**
   * Parse the startByte and endByte.
   * @param {shaka.media.SegmentReference} previousReference
   * @param {?string} byterange
   * @return {!Array.<number>} An array with the start byte and end byte.
   * @private
   */
  parseByteRange_(previousReference, byterange) {
    let startByte = 0;
    let endByte = null;
    // If BYTERANGE is not specified, the segment consists of the entire
    // resource.
    if (byterange) {
      const blocks = byterange.split('@');
      const byteLength = Number(blocks[0]);
      if (blocks[1]) {
        startByte = Number(blocks[1]);
      } else {
        goog.asserts.assert(previousReference,
            'Cannot refer back to previous HLS segment!');
        startByte = previousReference.endByte + 1;
      }
      endByte = startByte + byteLength - 1;
    }
    return [startByte, endByte];
  }

  /**
   * Parses shaka.hls.Segment objects into shaka.media.SegmentReferences and
   * get the bandwidth necessary for this segments If it's defined in the
   * playlist.
   *
   * @param {!shaka.hls.Playlist} playlist
   * @param {shaka.extern.Stream} stream
   * @param {!Map.<number, number>} mediaSequenceToStartTime
   * @param {!Map.<string, string>} variables
   * @param {function():!Array.<string>} getUris
   * @return {{segments: !Array.<!shaka.media.SegmentReference>,
   *          bandwidth: (number|undefined)}}
   * @private
   */
  createSegments_(playlist, stream, mediaSequenceToStartTime, variables,
      getUris) {
    /** @type {Array.<!shaka.hls.Segment>} */
    const hlsSegments = playlist.segments;
    goog.asserts.assert(hlsSegments.length, 'Playlist should have segments!');

    /** @type {shaka.media.InitSegmentReference} */
    let initSegmentRef;

    /** @type {shaka.extern.aes128Key|undefined} */
    let aes128Key = undefined;

    let discontinuitySequence = shaka.hls.Utils.getFirstTagWithNameAsNumber(
        playlist.tags, 'EXT-X-DISCONTINUITY-SEQUENCE', 0);
    const mediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
        playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);
    const skipTag = shaka.hls.Utils.getFirstTagWithName(
        playlist.tags, 'EXT-X-SKIP');
    const skippedSegments =
        skipTag ? Number(skipTag.getAttributeValue('SKIPPED-SEGMENTS')) : 0;
    let position = mediaSequenceNumber + skippedSegments;
    let firstStartTime = 0;

    // For live stream, use the cached value in the mediaSequenceToStartTime
    // map if available.
    if (this.isLive_() && mediaSequenceToStartTime.has(position)) {
      firstStartTime = mediaSequenceToStartTime.get(position);
    }

    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const references = [];

    let previousReference = null;

    /** @type {!Array.<{bitrate: number, duration: number}>} */
    const bitrates = [];

    for (let i = 0; i < hlsSegments.length; i++) {
      const item = hlsSegments[i];
      const startTime =
          (i == 0) ? firstStartTime : previousReference.endTime;
      position = mediaSequenceNumber + skippedSegments + i;

      const discontinuityTag = shaka.hls.Utils.getFirstTagWithName(
          item.tags, 'EXT-X-DISCONTINUITY');
      if (discontinuityTag) {
        discontinuitySequence++;
      }

      // Apply new AES-128 tags as you see them, keeping a running total.
      for (const drmTag of item.tags) {
        if (drmTag.name == 'EXT-X-KEY') {
          if (drmTag.getRequiredAttrValue('METHOD') == 'AES-128') {
            aes128Key =
                this.parseAES128DrmTag_(drmTag, playlist, getUris, variables);
          } else {
            aes128Key = undefined;
          }
        }
      }

      mediaSequenceToStartTime.set(position, startTime);

      initSegmentRef = this.getInitSegmentReference_(playlist,
          item.tags, getUris, variables);

      // If the stream is low latency and the user has not configured the
      // lowLatencyMode, but if it has been configured to activate the
      // lowLatencyMode if a stream of this type is detected, we automatically
      // activate the lowLatencyMode.
      if (!this.lowLatencyMode_) {
        const autoLowLatencyMode = this.playerInterface_.isAutoLowLatencyMode();
        if (autoLowLatencyMode) {
          this.playerInterface_.enableLowLatencyMode();
          this.lowLatencyMode_ = this.playerInterface_.isLowLatencyMode();
        }
      }

      const reference = this.createSegmentReference_(
          initSegmentRef,
          previousReference,
          item,
          startTime,
          variables,
          playlist,
          stream,
          getUris,
          aes128Key);

      if (reference) {
        const bitrate = shaka.hls.Utils.getFirstTagWithNameAsNumber(
            item.tags, 'EXT-X-BITRATE');
        if (bitrate) {
          bitrates.push({
            bitrate,
            duration: reference.endTime - reference.startTime,
          });
        } else if (bitrates.length) {
          // It applies to every segment between it and the next EXT-X-BITRATE,
          // so we use the latest bitrate value
          const prevBitrate = bitrates.pop();
          prevBitrate.duration += reference.endTime - reference.startTime;
          bitrates.push(prevBitrate);
        }

        previousReference = reference;
        reference.discontinuitySequence = discontinuitySequence;

        if (this.config_.hls.ignoreManifestProgramDateTime &&
            this.minSequenceNumber_ != null &&
            position < this.minSequenceNumber_) {
          // This segment is ignored as part of our fallback synchronization
          // method.
        } else {
          references.push(reference);
        }
      }
    }

    let bandwidth = undefined;
    if (bitrates.length) {
      const duration = bitrates.reduce((sum, value) => {
        return sum + value.duration;
      }, 0);
      bandwidth = Math.round(bitrates.reduce((sum, value) => {
        return sum + value.bitrate * value.duration;
      }, 0) / duration * 1000);
    }

    // If some segments have sync times, but not all, extrapolate the sync
    // times of the ones with none.
    const someSyncTime = references.some((ref) => ref.syncTime != null);
    if (someSyncTime) {
      for (let i = 0; i < references.length; i++) {
        const reference = references[i];
        if (reference.syncTime != null) {
          // No need to extrapolate.
          continue;
        }
        // Find the nearest segment with syncTime, in either direction.
        // This looks forward and backward simultaneously, keeping track of what
        // to offset the syncTime it finds by as it goes.
        let forwardAdd = 0;
        let forwardI = i;
        /**
         * Look forwards one reference at a time, summing all durations as we
         * go, until we find a reference with a syncTime to use as a basis.
         * This DOES count the original reference, but DOESN'T count the first
         * reference with a syncTime (as we approach it from behind).
         * @return {?number}
         */
        const lookForward = () => {
          const other = references[forwardI];
          if (other) {
            if (other.syncTime != null) {
              return other.syncTime + forwardAdd;
            }
            forwardAdd -= other.endTime - other.startTime;
            forwardI += 1;
          }
          return null;
        };
        let backwardAdd = 0;
        let backwardI = i;
        /**
         * Look backwards one reference at a time, summing all durations as we
         * go, until we find a reference with a syncTime to use as a basis.
         * This DOESN'T count the original reference, but DOES count the first
         * reference with a syncTime (as we approach it from ahead).
         * @return {?number}
         */
        const lookBackward = () => {
          const other = references[backwardI];
          if (other) {
            if (other != reference) {
              backwardAdd += other.endTime - other.startTime;
            }
            if (other.syncTime != null) {
              return other.syncTime + backwardAdd;
            }
            backwardI -= 1;
          }
          return null;
        };
        while (reference.syncTime == null) {
          reference.syncTime = lookBackward();
          if (reference.syncTime == null) {
            reference.syncTime = lookForward();
          }
        }
      }
    }

    // Split the sync times properly among partial segments.
    if (someSyncTime) {
      for (const reference of references) {
        let syncTime = reference.syncTime;
        for (const partial of reference.partialReferences) {
          partial.syncTime = syncTime;
          syncTime += partial.endTime - partial.startTime;
        }
      }
    }

    // lowestSyncTime is a value from a previous playlist update.  Use it to
    // set reference start times.  If this is the first playlist parse, we will
    // skip this step, and wait until we have sync time across stream types.
    const lowestSyncTime = this.lowestSyncTime_;
    if (someSyncTime && lowestSyncTime != Infinity) {
      for (const reference of references) {
        reference.syncAgainst(lowestSyncTime);
      }
    }

    return {
      segments: references,
      bandwidth,
    };
  }

  /**
   * Attempts to guess stream's mime type based on content type and URI.
   *
   * @param {string} contentType
   * @param {string} codecs
   * @return {?string}
   * @private
   */
  guessMimeTypeBeforeLoading_(contentType, codecs) {
    if (contentType == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      if (codecs == 'vtt' || codecs == 'wvtt') {
        // If codecs is 'vtt', it's WebVTT.
        return 'text/vtt';
      } else if (codecs && codecs !== '') {
        // Otherwise, assume MP4-embedded text, since text-based formats tend
        // not to have a codecs string at all.
        return 'application/mp4';
      }
    }

    if (contentType == shaka.util.ManifestParserUtils.ContentType.IMAGE) {
      if (!codecs || codecs == 'jpeg') {
        return 'image/jpeg';
      }
    }

    if (contentType == shaka.util.ManifestParserUtils.ContentType.AUDIO) {
      // See: https://bugs.chromium.org/p/chromium/issues/detail?id=489520
      if (codecs == 'mp4a.40.34') {
        return 'audio/mpeg';
      }
    }

    if (codecs == 'mjpg') {
      return 'application/mp4';
    }

    // Not enough information to guess from the content type and codecs.
    return null;
  }

  /**
   * Get a fallback mime type for the content. Used if all the better methods
   * for determining the mime type have failed.
   *
   * @param {string} contentType
   * @return {string}
   * @private
   */
  guessMimeTypeFallback_(contentType) {
    if (contentType == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      // If there was no codecs string and no content-type, assume HLS text
      // streams are WebVTT.
      return 'text/vtt';
    }
    // If the HLS content is lacking in both MIME type metadata and
    // segment file extensions, we fall back to assuming it's MP4.
    const map = shaka.hls.HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_[contentType];
    return map['mp4'];
  }

  /**
   * Attempts to guess stream's mime type based on content type, URI, and
   * contents of the playlist.
   *
   * @param {string} contentType
   * @param {string} codecs
   * @param {!shaka.hls.Playlist} playlist
   * @param {!Map.<string, string>} variables
   * @param {function():!Array.<string>} getUris
   * @return {!Promise.<string>}
   * @private
   */
  async guessMimeType_(contentType, codecs, playlist, variables, getUris) {
    const HlsParser = shaka.hls.HlsParser;
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    // If you wait long enough, requesting the first segment can fail
    // because it has fallen off the left edge of DVR, so to be safer,
    // let's request the middle segment.
    goog.asserts.assert(playlist.segments.length,
        'Playlist should have segments!');
    const middleSegmentIdx = Math.trunc((playlist.segments.length - 1) / 2);

    const middleSegmentUris = shaka.hls.Utils.constructSegmentUris(
        getUris(),
        playlist.segments[middleSegmentIdx].verbatimSegmentUri,
        variables);

    const parsedUri = new goog.Uri(middleSegmentUris[0]);
    const extension = parsedUri.getPath().split('.').pop();
    const map = HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_[contentType];

    let mimeType = map[extension];
    if (mimeType) {
      return mimeType;
    }

    mimeType = HlsParser.RAW_FORMATS_TO_MIME_TYPES_[extension];
    if (mimeType) {
      return mimeType;
    }

    // The extension map didn't work, so guess based on codecs.
    mimeType = this.guessMimeTypeBeforeLoading_(contentType, codecs);
    if (mimeType) {
      return mimeType;
    }

    // If unable to guess mime type, request a segment and try getting it
    // from the response.
    const headRequest = shaka.net.NetworkingEngine.makeRequest(
        middleSegmentUris, this.config_.retryParameters);
    headRequest.method = 'HEAD';
    const type = shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;
    const response = await this.makeNetworkRequest_(
        headRequest, requestType, {type});

    const contentMimeType = response.headers['content-type'];
    if (contentMimeType) {
      // Split the MIME type in case the server sent additional parameters.
      return contentMimeType.split(';')[0];
    }

    return this.guessMimeTypeFallback_(contentType);
  }

  /**
   * Returns a tag with a given name.
   * Throws an error if tag was not found.
   *
   * @param {!Array.<shaka.hls.Tag>} tags
   * @param {string} tagName
   * @return {!shaka.hls.Tag}
   * @private
   */
  getRequiredTag_(tags, tagName) {
    const tag = shaka.hls.Utils.getFirstTagWithName(tags, tagName);
    if (!tag) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_REQUIRED_TAG_MISSING, tagName);
    }

    return tag;
  }

  /**
   * @param {shaka.extern.Stream} stream
   * @param {?string} width
   * @param {?string} height
   * @param {?string} frameRate
   * @param {?string} videoRange
   * @param {?string} videoLayout
   * @private
   */
  addVideoAttributes_(stream, width, height, frameRate, videoRange,
      videoLayout) {
    if (stream) {
      stream.width = Number(width) || undefined;
      stream.height = Number(height) || undefined;
      stream.frameRate = Number(frameRate) || undefined;
      stream.hdr = videoRange || undefined;
      stream.videoLayout = videoLayout || undefined;
    }
  }

  /**
   * Makes a network request for the manifest and returns a Promise
   * with the resulting data.
   *
   * @param {!Array.<string>} uris
   * @param {boolean=} isPlaylist
   * @return {!Promise.<!shaka.extern.Response>}
   * @private
   */
  requestManifest_(uris, isPlaylist) {
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const request = shaka.net.NetworkingEngine.makeRequest(
        uris, this.config_.retryParameters);

    const type = isPlaylist ?
        shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_PLAYLIST :
        shaka.net.NetworkingEngine.AdvancedRequestType.MASTER_PLAYLIST;
    return this.makeNetworkRequest_(request, requestType, {type});
  }

  /**
   * Called when the update timer ticks. Because parsing a manifest is async,
   * this method is async. To work with this, this method will schedule the next
   * update when it finished instead of using a repeating-start.
   *
   * @return {!Promise}
   * @private
   */
  async onUpdate_() {
    shaka.log.info('Updating manifest...');

    goog.asserts.assert(
        this.getUpdatePlaylistDelay_() > 0,
        'We should only call |onUpdate_| when we are suppose to be updating.');

    // Detect a call to stop()
    if (!this.playerInterface_) {
      return;
    }

    try {
      const startTime = Date.now();
      await this.update();

      // Keep track of how long the longest manifest update took.
      const endTime = Date.now();

      // This may have converted to VOD, in which case we stop updating.
      if (this.isLive_()) {
        const updateDuration = (endTime - startTime) / 1000.0;
        this.averageUpdateDuration_.sample(1, updateDuration);
        const delay = this.getUpdatePlaylistDelay_();
        const finalDelay = Math.max(0,
            delay - this.averageUpdateDuration_.getEstimate());
        this.updatePlaylistTimer_.tickAfter(/* seconds= */ finalDelay);
      }
    } catch (error) {
      // Detect a call to stop() during this.update()
      if (!this.playerInterface_) {
        return;
      }

      goog.asserts.assert(error instanceof shaka.util.Error,
          'Should only receive a Shaka error');

      if (this.config_.raiseFatalErrorOnManifestUpdateRequestFailure) {
        this.playerInterface_.onError(error);
        return;
      }

      // We will retry updating, so override the severity of the error.
      error.severity = shaka.util.Error.Severity.RECOVERABLE;
      this.playerInterface_.onError(error);

      // Try again very soon.
      this.updatePlaylistTimer_.tickAfter(/* seconds= */ 0.1);
    }

    // Detect a call to stop()
    if (!this.playerInterface_) {
      return;
    }

    this.playerInterface_.onManifestUpdated();
  }


  /**
   * @return {boolean}
   * @private
   */
  isLive_() {
    const PresentationType = shaka.hls.HlsParser.PresentationType_;
    return this.presentationType_ != PresentationType.VOD;
  }


  /**
   * @return {number}
   * @private
   */
  getUpdatePlaylistDelay_() {
    // The HLS spec (RFC 8216) states in 6.3.4:
    // "the client MUST wait for at least the target duration before
    // attempting to reload the Playlist file again".
    // For LL-HLS, the server must add a new partial segment to the Playlist
    // every part target duration.
    return this.lastTargetDuration_;
  }


  /**
   * @param {shaka.hls.HlsParser.PresentationType_} type
   * @private
   */
  setPresentationType_(type) {
    this.presentationType_ = type;

    if (this.presentationTimeline_) {
      this.presentationTimeline_.setStatic(!this.isLive_());
    }

    // If this manifest is not for live content, then we have no reason to
    // update it.
    if (!this.isLive_()) {
      this.updatePlaylistTimer_.stop();
    }
  }


  /**
   * Create a networking request. This will manage the request using the
   * parser's operation manager. If the parser has already been stopped, the
   * request will not be made.
   *
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.RequestContext=} context
   * @return {!Promise.<shaka.extern.Response>}
   * @private
   */
  makeNetworkRequest_(request, type, context) {
    if (!this.operationManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    const op = this.playerInterface_.networkingEngine.request(
        type, request, context);
    this.operationManager_.manage(op);

    return op.promise;
  }

  /**
   * @param {!shaka.hls.Tag} drmTag
   * @param {string} mimeType
   * @return {?shaka.extern.DrmInfo}
   * @private
   */
  static fairplayDrmParser_(drmTag, mimeType) {
    if (mimeType == 'video/mp2t') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_MSE_ENCRYPTED_MP2T_NOT_SUPPORTED);
    }

    if (shaka.util.Platform.isMediaKeysPolyfilled()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code
              .HLS_MSE_ENCRYPTED_LEGACY_APPLE_MEDIA_KEYS_NOT_SUPPORTED);
    }

    /*
     * Even if we're not able to construct initData through the HLS tag, adding
     * a DRMInfo will allow DRM Engine to request a media key system access
     * with the correct keySystem and initDataType
     */
    const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
        'com.apple.fps', [
          {initDataType: 'sinf', initData: new Uint8Array(0), keyId: null},
        ]);

    return drmInfo;
  }

  /**
   * @param {!shaka.hls.Tag} drmTag
   * @return {?shaka.extern.DrmInfo}
   * @private
   */
  static widevineDrmParser_(drmTag) {
    const method = drmTag.getRequiredAttrValue('METHOD');
    const VALID_METHODS = ['SAMPLE-AES', 'SAMPLE-AES-CTR'];
    if (!VALID_METHODS.includes(method)) {
      shaka.log.error('Widevine in HLS is only supported with [',
          VALID_METHODS.join(', '), '], not', method);
      return null;
    }

    const uri = drmTag.getRequiredAttrValue('URI');
    const parsedData = shaka.net.DataUriPlugin.parseRaw(uri);

    // The data encoded in the URI is a PSSH box to be used as init data.
    const pssh = shaka.util.BufferUtils.toUint8(parsedData.data);
    const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
        'com.widevine.alpha', [
          {initDataType: 'cenc', initData: pssh},
        ]);

    const keyId = drmTag.getAttributeValue('KEYID');
    if (keyId) {
      const keyIdLowerCase = keyId.toLowerCase();
      // This value should begin with '0x':
      goog.asserts.assert(
          keyIdLowerCase.startsWith('0x'), 'Incorrect KEYID format!');
      // But the output should not contain the '0x':
      drmInfo.keyIds = new Set([keyIdLowerCase.substr(2)]);
    }
    return drmInfo;
  }

  /**
   * See: https://docs.microsoft.com/en-us/playready/packaging/mp4-based-formats-supported-by-playready-clients?tabs=case4
   *
   * @param {!shaka.hls.Tag} drmTag
   * @return {?shaka.extern.DrmInfo}
   * @private
   */
  static playreadyDrmParser_(drmTag) {
    const method = drmTag.getRequiredAttrValue('METHOD');
    const VALID_METHODS = ['SAMPLE-AES', 'SAMPLE-AES-CTR'];
    if (!VALID_METHODS.includes(method)) {
      shaka.log.error('PlayReady in HLS is only supported with [',
          VALID_METHODS.join(', '), '], not', method);
      return null;
    }

    const uri = drmTag.getRequiredAttrValue('URI');
    const parsedData = shaka.net.DataUriPlugin.parseRaw(uri);

    // The data encoded in the URI is a PlayReady Pro Object, so we need
    // convert it to pssh.
    const data = shaka.util.BufferUtils.toUint8(parsedData.data);
    const systemId = new Uint8Array([
      0x9a, 0x04, 0xf0, 0x79, 0x98, 0x40, 0x42, 0x86,
      0xab, 0x92, 0xe6, 0x5b, 0xe0, 0x88, 0x5f, 0x95,
    ]);
    const keyIds = new Set();
    const psshVersion = 0;
    const pssh =
        shaka.util.Pssh.createPssh(data, systemId, keyIds, psshVersion);
    const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
        'com.microsoft.playready', [
          {initDataType: 'cenc', initData: pssh},
        ]);

    return drmInfo;
  }

  /**
   * See: https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis-11#section-5.1
   *
   * @param {!shaka.hls.Tag} drmTag
   * @return {?shaka.extern.DrmInfo}
   * @private
   */
  static identityDrmParser_(drmTag) {
    const method = drmTag.getRequiredAttrValue('METHOD');
    const VALID_METHODS = ['SAMPLE-AES', 'SAMPLE-AES-CTR'];
    if (!VALID_METHODS.includes(method)) {
      shaka.log.error('Identity (ClearKey) in HLS is only supported with [',
          VALID_METHODS.join(', '), '], not', method);
      return null;
    }

    // NOTE: The ClearKey CDM requires a key-id to key mapping.  HLS doesn't
    // provide a key ID anywhere.  So although we could use the 'URI' attribute
    // to fetch the actual 16-byte key, without a key ID, we can't provide this
    // automatically to the ClearKey CDM.  Instead, the application will have
    // to use player.configure('drm.clearKeys', { ... }) to provide the key IDs
    // and keys or player.configure('drm.servers.org\.w3\.clearkey', ...) to
    // provide a ClearKey license server URI.
    return shaka.util.ManifestParserUtils.createDrmInfo(
        'org.w3.clearkey', /* initDatas= */ null);
  }
};


/**
 * @typedef {{
 *   stream: !shaka.extern.Stream,
 *   type: string,
 *   redirectUris: !Array.<string>,
 *   getUris: function():!Array.<string>,
 *   minTimestamp: number,
 *   maxTimestamp: number,
 *   mediaSequenceToStartTime: !Map.<number, number>,
 *   canSkipSegments: boolean,
 *   canBlockReload: boolean,
 *   hasEndList: boolean,
 *   firstSequenceNumber: number,
 *   nextMediaSequence: number,
 *   nextPart: number,
 *   loadedOnce: boolean
 * }}
 *
 * @description
 * Contains a stream and information about it.
 *
 * @property {!shaka.extern.Stream} stream
 *   The Stream itself.
 * @property {string} type
 *   The type value. Could be 'video', 'audio', 'text', or 'image'.
 * @property {!Array.<string>} redirectUris
 *   The redirect URIs.
 * @property {function():!Array.<string>} getUris
 *   The verbatim media playlist URIs, as it appeared in the master playlist.
 * @property {number} minTimestamp
 *   The minimum timestamp found in the stream.
 * @property {number} maxTimestamp
 *   The maximum timestamp found in the stream.
 * @property {!Map.<number, number>} mediaSequenceToStartTime
 *   A map of media sequence numbers to media start times.
 *   Only used for VOD content.
 * @property {boolean} canSkipSegments
 *   True if the server supports delta playlist updates, and we can send a
 *   request for a playlist that can skip older media segments.
 * @property {boolean} canBlockReload
 *   True if the server supports blocking playlist reload, and we can send a
 *   request for a playlist that can block reload until some segments are
 *   present.
 * @property {boolean} hasEndList
 *   True if the stream has an EXT-X-ENDLIST tag.
 * @property {number} firstSequenceNumber
 *   The sequence number of the first reference. Only calculated if needed.
 * @property {number} nextMediaSequence
 *   The next media sequence.
 * @property {number} nextPart
 *   The next part.
 * @property {boolean} loadedOnce
 *   True if the stream has been loaded at least once.
 */
shaka.hls.HlsParser.StreamInfo;


/**
 * @typedef {{
 *   audio: !Array.<shaka.hls.HlsParser.StreamInfo>,
 *   video: !Array.<shaka.hls.HlsParser.StreamInfo>
 * }}
 *
 * @description Audio and video stream infos.
 * @property {!Array.<shaka.hls.HlsParser.StreamInfo>} audio
 * @property {!Array.<shaka.hls.HlsParser.StreamInfo>} video
 */
shaka.hls.HlsParser.StreamInfos;


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.RAW_FORMATS_TO_MIME_TYPES_ = {
  'aac': 'audio/aac',
  'ac3': 'audio/ac3',
  'ec3': 'audio/ec3',
  'mp3': 'audio/mpeg',
};


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'audio/mp4',
  'mp4a': 'audio/mp4',
  'm4s': 'audio/mp4',
  'm4i': 'audio/mp4',
  'm4a': 'audio/mp4',
  'm4f': 'audio/mp4',
  'cmfa': 'audio/mp4',
  // MPEG2-TS also uses video/ for audio: https://bit.ly/TsMse
  'ts': 'video/mp2t',
  'tsa': 'video/mp2t',
};


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'video/mp4',
  'mp4v': 'video/mp4',
  'm4s': 'video/mp4',
  'm4i': 'video/mp4',
  'm4v': 'video/mp4',
  'm4f': 'video/mp4',
  'cmfv': 'video/mp4',
  'ts': 'video/mp2t',
  'tsv': 'video/mp2t',
};


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.TEXT_EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'application/mp4',
  'm4s': 'application/mp4',
  'm4i': 'application/mp4',
  'm4f': 'application/mp4',
  'cmft': 'application/mp4',
  'vtt': 'text/vtt',
  'webvtt': 'text/vtt',
  'ttml': 'application/ttml+xml',
};


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.IMAGE_EXTENSIONS_TO_MIME_TYPES_ = {
  'jpg': 'image/jpeg',
  'png': 'image/png',
  'svg': 'image/svg+xml',
  'webp': 'image/webp',
  'avif': 'image/avif',
};


/**
 * @const {!Object.<string, !Object.<string, string>>}
 * @private
 */
shaka.hls.HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_ = {
  'audio': shaka.hls.HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES_,
  'video': shaka.hls.HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES_,
  'text': shaka.hls.HlsParser.TEXT_EXTENSIONS_TO_MIME_TYPES_,
  'image': shaka.hls.HlsParser.IMAGE_EXTENSIONS_TO_MIME_TYPES_,
};


/**
 * @typedef {function(!shaka.hls.Tag, string):?shaka.extern.DrmInfo}
 * @private
 */
shaka.hls.HlsParser.DrmParser_;


/**
 * @const {!Object.<string, shaka.hls.HlsParser.DrmParser_>}
 * @private
 */
shaka.hls.HlsParser.KEYFORMATS_TO_DRM_PARSERS_ = {
  'com.apple.streamingkeydelivery':
      shaka.hls.HlsParser.fairplayDrmParser_,
  'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed':
      shaka.hls.HlsParser.widevineDrmParser_,
  'com.microsoft.playready':
      shaka.hls.HlsParser.playreadyDrmParser_,
  'identity':
      shaka.hls.HlsParser.identityDrmParser_,
};


/**
 * @enum {string}
 * @private
 */
shaka.hls.HlsParser.PresentationType_ = {
  VOD: 'VOD',
  EVENT: 'EVENT',
  LIVE: 'LIVE',
};

shaka.media.ManifestParser.registerParserByMime(
    'application/x-mpegurl', () => new shaka.hls.HlsParser());
shaka.media.ManifestParser.registerParserByMime(
    'application/vnd.apple.mpegurl', () => new shaka.hls.HlsParser());
