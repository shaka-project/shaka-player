/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.hls.HlsParser');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.hls.ManifestTextParser');
goog.require('shaka.hls.Playlist');
goog.require('shaka.hls.PlaylistType');
goog.require('shaka.hls.Tag');
goog.require('shaka.hls.Utils');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.CmcdManager');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.Timer');
goog.require('shaka.util.TsParser');
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
     * createStreamInfoFromMediaTag_, createStreamInfoFromImageTag_ and
     * createStreamInfoFromVariantTag_.
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

    const response = await this.requestManifest_(uri);

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
    const manifestUri = streamInfo.absoluteMediaPlaylistUri;
    const uriObj = new goog.Uri(manifestUri);
    if (this.lowLatencyMode_ && streamInfo.canSkipSegments) {
      // Enable delta updates. This will replace older segments with
      // 'EXT-X-SKIP' tag in the media playlist.
      uriObj.setQueryData(new goog.Uri.QueryData('_HLS_skip=YES'));
    }
    const response = await this.requestManifest_(uriObj.toString());
    if (!streamInfo.stream.segmentIndex) {
      // The stream was closed since the update was first requested.
      return;
    }

    /** @type {shaka.hls.Playlist} */
    const playlist = this.manifestTextParser_.parsePlaylist(
        response.data, response.uri);

    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    this.determineLastTargetDuration_(playlist);

    /** @type {!Array.<!shaka.hls.Tag>} */
    const variablesTags = shaka.hls.Utils.filterTagsByName(playlist.tags,
        'EXT-X-DEFINE');

    const mediaVariables = this.parseMediaVariables_(variablesTags);

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

    const segments = this.createSegments_(
        streamInfo.verbatimMediaPlaylistUri, playlist, stream.type,
        stream.mimeType, mediaSequenceToStartTime, mediaVariables);

    stream.segmentIndex.mergeAndEvict(
        segments, this.presentationTimeline_.getSegmentAvailabilityStart());
    if (segments.length) {
      const mediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
          playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);
      const playlistStartTime = mediaSequenceToStartTime.get(
          mediaSequenceNumber);
      stream.segmentIndex.evict(playlistStartTime);
    }
    const newestSegment = segments[segments.length - 1];
    goog.asserts.assert(newestSegment, 'Should have segments!');

    // Once the last segment has been added to the playlist,
    // #EXT-X-ENDLIST tag will be appended.
    // If that happened, treat the rest of the EVENT presentation as VOD.
    const endListTag =
        shaka.hls.Utils.getFirstTagWithName(playlist.tags, 'EXT-X-ENDLIST');

    if (endListTag) {
      // Flag this for later.  We don't convert the whole presentation into VOD
      // until we've seen the ENDLIST tag for all active playlists.
      streamInfo.hasEndList = true;
      streamInfo.maxTimestamp = newestSegment.endTime;
    }
  }


  /**
   * @override
   * @exportInterface
   */
  onExpirationUpdated(sessionId, expiration) {
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
              streamInfo.verbatimMediaPlaylistUri,
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
        streamInfo.verbatimMediaPlaylistUri);
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

    const playlist = this.manifestTextParser_.parsePlaylist(
        data, this.masterPlaylistUri_);

    /** @type {!Array.<!shaka.hls.Tag>} */
    const variablesTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-DEFINE');

    this.parseMasterVariables_(variablesTags);

    /** @type {!Array.<!shaka.extern.Variant>} */
    let variants = [];
    /** @type {!Array.<!shaka.extern.Stream>} */
    let textStreams = [];
    /** @type {!Array.<!shaka.extern.Stream>} */
    let imageStreams = [];

    // Parsing a media playlist results in a single-variant stream.
    if (playlist.type == shaka.hls.PlaylistType.MEDIA) {
      // Get necessary info for this stream. These are things we would normally
      // find from the master playlist (e.g. from values on EXT-X-MEDIA tags).
      const basicInfo = await this.getMediaPlaylistBasicInfo_(playlist);
      const type = basicInfo.type;
      const mimeType = basicInfo.mimeType;
      const codecs = basicInfo.codecs;
      const language = basicInfo.language || 'und';
      const height = basicInfo.height;
      const width = basicInfo.width;
      const channelsCount = basicInfo.channelCount;
      const sampleRate = basicInfo.sampleRate;

      // Some values we cannot figure out, and aren't important enough to ask
      // the user to provide through config values. A lot of these are only
      // relevant to ABR, which isn't necessary if there's only one variant.
      // So these unknowns should be set to false or null, largely.
      const spatialAudio = false;
      const characteristics = null;
      const closedCaptions = new Map();
      const forced = false; // Only relevant for text.
      const primary = true; // This is the only stream!
      const name = 'Media Playlist';

      // Make the stream info, with those values.
      const streamInfo = await this.convertParsedPlaylistIntoStreamInfo_(
          playlist, uri, uri, codecs, type, language, primary, name,
          channelsCount, closedCaptions, characteristics, forced, spatialAudio,
          mimeType);
      this.uriToStreamInfosMap_.set(uri, streamInfo);

      if (type == 'video') {
        this.addVideoAttributes_(streamInfo.stream, width, height,
            /* frameRate= */ null, /* videoRange= */ null);
      } else if (type == 'audio') {
        streamInfo.stream.audioSamplingRate = sampleRate;
      }

      // Wrap the stream from that stream info with a variant.
      variants.push({
        id: 0,
        language: language,
        disabledUntilTime: 0,
        primary: true,
        audio: type == 'audio' ? streamInfo.stream : null,
        video: type == 'video' ? streamInfo.stream : null,
        bandwidth: 0,
        allowedByApplication: true,
        allowedByKeySystem: true,
        decodingInfos: [],
      });
    } else {
      /** @type {!Array.<!shaka.hls.Tag>} */
      const mediaTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-MEDIA');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const variantTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-STREAM-INF');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const imageTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-IMAGE-STREAM-INF');
      /** @type {!Array.<!shaka.hls.Tag>} */
      const sessionKeyTags = Utils.filterTagsByName(
          playlist.tags, 'EXT-X-SESSION-KEY');

      this.parseCodecs_(variantTags);

      /** @type {!Array.<!shaka.hls.Tag>} */
      const sesionDataTags =
          Utils.filterTagsByName(playlist.tags, 'EXT-X-SESSION-DATA');
      for (const tag of sesionDataTags) {
        const id = tag.getAttributeValue('DATA-ID');
        const uri = tag.getAttributeValue('URI');
        const language = tag.getAttributeValue('LANGUAGE');
        const value = tag.getAttributeValue('VALUE');
        const data = (new Map()).set('id', id);
        if (uri) {
          data.set('uri', shaka.hls.Utils.constructAbsoluteUri(
              this.masterPlaylistUri_, uri));
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

      // Parse audio and video media tags first, so that we can extract segment
      // start time from audio/video streams and reuse for text streams.
      this.createStreamInfosFromMediaTags_(mediaTags);
      this.parseClosedCaptions_(mediaTags);
      variants = this.createVariantsForTags_(variantTags, sessionKeyTags);
      textStreams = this.parseTexts_(mediaTags);
      imageStreams = await this.parseImages_(imageTags);
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
        this.changePresentationTimelineToLive_();
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
      type: shaka.media.ManifestParser.HLS,
    };
    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);
  }

  /**
   * @param {shaka.hls.Playlist} playlist
   * @return {!Promise.<shaka.hls.HlsParser.BasicInfo>}
   * @private
   */
  async getMediaPlaylistBasicInfo_(playlist) {
    const HlsParser = shaka.hls.HlsParser;
    const defaultFullMimeType = this.config_.hls.mediaPlaylistFullMimeType;
    const defaultMimeType =
        shaka.util.MimeUtils.getBasicType(defaultFullMimeType);
    const defaultType = defaultMimeType.split('/')[0];
    const defaultCodecs = shaka.util.MimeUtils.getCodecs(defaultFullMimeType);
    const defaultBasicInfo = {
      type: defaultType,
      mimeType: defaultMimeType,
      codecs: defaultCodecs,
      language: null,
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
    };
    if (!playlist.segments.length) {
      return defaultBasicInfo;
    }
    const firstSegment = playlist.segments[0];
    const parsedUri = new goog.Uri(firstSegment.absoluteUri);
    const extension = parsedUri.getPath().split('.').pop();
    const rawMimeType = HlsParser.RAW_FORMATS_TO_MIME_TYPES_[extension];
    if (rawMimeType) {
      return {
        type: 'audio',
        mimeType: rawMimeType,
        codecs: '',
        language: null,
        height: null,
        width: null,
        channelCount: null,
        sampleRate: null,
      };
    }

    let segmentUris = [firstSegment.absoluteUri];
    const initSegmentRef = this.getInitSegmentReference_(
        playlist.absoluteUri, firstSegment.tags, new Map());
    if (initSegmentRef) {
      segmentUris = initSegmentRef.getUris();
    }

    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const segmentRequest = shaka.net.NetworkingEngine.makeRequest(
        segmentUris, this.config_.retryParameters);
    const response = await this.makeNetworkRequest_(
        segmentRequest, requestType);

    let contentMimeType = response.headers['content-type'];
    if (contentMimeType) {
      // Split the MIME type in case the server sent additional parameters.
      contentMimeType = contentMimeType.split(';')[0].toLowerCase();
    }

    if (extension == 'ts' || contentMimeType == 'video/mp2t') {
      const basicInfo = this.getBasicInfoFromTs_(response);
      if (basicInfo) {
        return basicInfo;
      }
    } else if (extension == 'mp4' ||
        contentMimeType == 'video/mp4' || contentMimeType == 'audio/mp4') {
      const basicInfo = this.getBasicInfoFromMp4_(response);
      if (basicInfo) {
        return basicInfo;
      }
    }
    return defaultBasicInfo;
  }

  /**
   * @param {shaka.extern.Response} response
   * @return {?shaka.hls.HlsParser.BasicInfo}
   * @private
   */
  getBasicInfoFromTs_(response) {
    const uint8ArrayData = shaka.util.BufferUtils.toUint8(response.data);
    const tsParser = new shaka.util.TsParser().parse(uint8ArrayData);
    const tsCodecs = tsParser.getCodecs();
    const codecs = [];
    let hasAudio = false;
    let hasVideo = false;
    switch (tsCodecs.audio) {
      case 'aac':
        codecs.push('mp4a.40.2');
        hasAudio = true;
        break;
      case 'mp3':
        codecs.push('mp4a.40.34');
        hasAudio = true;
        break;
      case 'ac3':
        codecs.push('ac-3');
        hasAudio = true;
        break;
    }
    switch (tsCodecs.video) {
      case 'avc':
        codecs.push('avc1.42E01E');
        hasVideo = true;
        break;
      case 'hvc':
        codecs.push('hvc1.1.6.L93.90');
        hasVideo = true;
        break;
    }
    if (!codecs.length) {
      return null;
    }
    const onlyAudio = hasAudio && !hasVideo;
    return {
      type: onlyAudio ? 'audio' : 'video',
      mimeType: 'video/mp2t',
      codecs: codecs.join(', '),
      language: null,
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
    };
  }

  /**
   * @param {shaka.extern.Response} response
   * @return {?shaka.hls.HlsParser.BasicInfo}
   * @private
   */
  getBasicInfoFromMp4_(response) {
    const Mp4Parser = shaka.util.Mp4Parser;

    const codecs = [];

    let hasAudio = false;
    let hasVideo = false;

    const addCodec = (codec) => {
      const codecLC = codec.toLowerCase();
      switch (codecLC) {
        case 'avc1':
        case 'avc3':
          codecs.push(codecLC + '.42E01E');
          hasVideo = true;
          break;
        case 'hev1':
        case 'hvc1':
          codecs.push(codecLC + '.1.6.L93.90');
          hasVideo = true;
          break;
        case 'dvh1':
        case 'dvhe':
          codecs.push(codecLC + '.05.04');
          hasVideo = true;
          break;
        case 'vp09':
          codecs.push(codecLC + '.00.10.08');
          hasVideo = true;
          break;
        case 'av01':
          codecs.push(codecLC + '.0.01M.08');
          hasVideo = true;
          break;
        case 'mp4a':
          // We assume AAC, but this can be wrong since mp4a supports
          // others codecs
          codecs.push('mp4a.40.2');
          hasAudio = true;
          break;
        case 'ac-3':
        case 'ec-3':
        case 'opus':
        case 'flac':
          codecs.push(codecLC);
          hasAudio = true;
          break;
      }
    };

    const codecBoxParser = (box) => addCodec(box.name);

    /** @type {?string} */
    let language = null;
    /** @type {?string} */
    let height = null;
    /** @type {?string} */
    let width = null;
    /** @type {?number} */
    let channelCount = null;
    /** @type {?number} */
    let sampleRate = null;

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TKHD is a full box and should have a valid version.');
          const parsedTKHDBox = shaka.util.Mp4BoxParsers.parseTKHD(
              box.reader, box.version);
          height = String(parsedTKHDBox.height);
          width = String(parsedTKHDBox.width);
        })
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'MDHD is a full box and should have a valid version.');
          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          language = parsedMDHDBox.language;
        })
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)

        // AUDIO
        // These are the various boxes that signal a codec.
        .box('mp4a', (box) => {
          const parsedMP4ABox = shaka.util.Mp4BoxParsers.parseMP4A(box.reader);
          channelCount = parsedMP4ABox.channelCount;
          sampleRate = parsedMP4ABox.sampleRate;
          codecBoxParser(box);
        })
        .box('ac-3', codecBoxParser)
        .box('ec-3', codecBoxParser)
        .box('opus', codecBoxParser)
        .box('Opus', codecBoxParser)
        .box('fLaC', codecBoxParser)

        // VIDEO
        // These are the various boxes that signal a codec.
        .box('avc1', codecBoxParser)
        .box('avc3', codecBoxParser)
        .box('hev1', codecBoxParser)
        .box('hvc1', codecBoxParser)
        .box('dvh1', codecBoxParser)
        .box('dvhe', codecBoxParser)
        .box('vp09', codecBoxParser)
        .box('av01', codecBoxParser)

        // This signals an encrypted sample, which we can go inside of to
        // find the codec used.
        // Note: If encrypted, you can only have audio or video, not both.
        .box('enca', Mp4Parser.visualSampleEntry)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('sinf', Mp4Parser.children)
        .box('frma', (box) => {
          const {codec} = shaka.util.Mp4BoxParsers.parseFRMA(box.reader);
          addCodec(codec);
        })

        .parse(response.data, /* partialOkay= */ true);
    if (!codecs.length) {
      return null;
    }
    const onlyAudio = hasAudio && !hasVideo;
    return {
      type: onlyAudio ? 'audio' : 'video',
      mimeType: onlyAudio ? 'audio/mp4' : 'video/mp4',
      codecs: this.filterDuplicateCodecs_(codecs).join(', '),
      language: language,
      height: height,
      width: width,
      channelCount: channelCount,
      sampleRate: sampleRate,
    };
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
        let segmentAvailabilityDuration = this.getMinDuration_();

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
    for (const variableTag of tags) {
      const name = variableTag.getAttributeValue('NAME');
      const value = variableTag.getAttributeValue('VALUE');
      if (name && value) {
        if (!this.globalVariables_.has(name)) {
          this.globalVariables_.set(name, value);
        }
      }
    }
  }

  /**
   * Get the variables of each variant tag, and store in a map.
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @return {!Map.<string, string>}
   * @private
   */
  parseMediaVariables_(tags) {
    const mediaVariables = new Map();
    for (const variableTag of tags) {
      const name = variableTag.getAttributeValue('NAME');
      const value = variableTag.getAttributeValue('VALUE');
      const mediaImport = variableTag.getAttributeValue('IMPORT');
      if (name && value) {
        mediaVariables.set(name, value);
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
        return this.createStreamInfoFromMediaTag_(tag).stream;
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
   * @return {!Promise.<!Array.<!shaka.extern.Stream>>}
   * @private
   */
  async parseImages_(imageTags) {
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
    });
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

    // Create stream info for each audio / video media tag.
    for (const tag of mediaTags) {
      this.createStreamInfoFromMediaTag_(tag);
    }
  }

  /**
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @param {!Array.<!shaka.hls.Tag>} sessionKeyTags EXT-X-SESSION-KEY tags
   * from the playlist.
   * @return {!Array.<!shaka.extern.Variant>}
   * @private
   */
  createVariantsForTags_(tags, sessionKeyTags) {
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

    // Create variants for each variant tag.
    const allVariants = tags.map((tag) => {
      const frameRate = tag.getAttributeValue('FRAME-RATE');
      const bandwidth = Number(tag.getAttributeValue('AVERAGE-BANDWIDTH')) ||
        Number(tag.getRequiredAttrValue('BANDWIDTH'));

      const resolution = tag.getAttributeValue('RESOLUTION');
      const [width, height] = resolution ? resolution.split('x') : [null, null];

      const videoRange = tag.getAttributeValue('VIDEO-RANGE');

      const streamInfos = this.createStreamInfosForVariantTag_(tag,
          resolution, frameRate);

      goog.asserts.assert(streamInfos.audio.length ||
          streamInfos.video.length, 'We should have created a stream!');

      return this.createVariants_(
          streamInfos.audio,
          streamInfos.video,
          bandwidth,
          width,
          height,
          frameRate,
          videoRange,
          drmInfos,
          keyIds);
    });
    let variants = allVariants.reduce(shaka.util.Functional.collapseArrays, []);
    // Filter out null variants.
    variants = variants.filter((variant) => variant != null);
    return variants;
  }

  /**
   * Create audio and video streamInfos from an 'EXT-X-STREAM-INF' tag and its
   * related media tags.
   *
   * @param {!shaka.hls.Tag} tag
   * @param {?string} resolution
   * @param {?string} frameRate
   * @return {!shaka.hls.HlsParser.StreamInfos}
   * @private
   */
  createStreamInfosForVariantTag_(tag, resolution, frameRate) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    /** @type {!Array.<string>} */
    let allCodecs = this.getCodecsForVariantTag_(tag);
    const audioGroupId = tag.getAttributeValue('AUDIO');
    const videoGroupId = tag.getAttributeValue('VIDEO');
    goog.asserts.assert(audioGroupId == null || videoGroupId == null,
        'Unexpected: both video and audio described by media tags!');

    const groupId = audioGroupId || videoGroupId;
    const streamInfos =
        (groupId && this.groupIdToStreamInfosMap_.has(groupId)) ?
        this.groupIdToStreamInfosMap_.get(groupId) : [];

    /** @type {shaka.hls.HlsParser.StreamInfos} */
    const res = {
      audio: audioGroupId ? streamInfos : [],
      video: videoGroupId ? streamInfos : [],
    };

    // Make an educated guess about the stream type.
    shaka.log.debug('Guessing stream type for', tag.toString());
    let type;
    let ignoreStream = false;

    // The Microsoft HLS manifest generators will make audio-only variants
    // that link to their URI both directly and through an audio tag.
    // In that case, ignore the local URI and use the version in the
    // AUDIO tag, so you inherit its language.
    // As an example, see the manifest linked in issue #860.
    const streamURI = tag.getRequiredAttrValue('URI');
    const hasSameUri = res.audio.find((audio) => {
      return audio && audio.verbatimMediaPlaylistUri == streamURI;
    });

    const videoCodecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, allCodecs);
    const audioCodecs = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, allCodecs);

    if (audioCodecs && !videoCodecs) {
      // There are no associated media tags, and there's only audio codec,
      // and no video codec, so it should be audio.
      type = ContentType.AUDIO;
      shaka.log.debug('Guessing audio-only.');
    } else if (!streamInfos.length && audioCodecs && videoCodecs) {
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
          this.createStreamInfoFromVariantTag_(tag, allCodecs, type);
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
    // These are the default codecs to assume if none are specified.
    const defaultCodecsArray = [];
    if (!this.config_.disableVideo) {
      defaultCodecsArray.push(this.config_.hls.defaultVideoCodec);
    }
    if (!this.config_.disableAudio) {
      defaultCodecsArray.push(this.config_.hls.defaultAudioCodec);
    }
    const defaultCodecs = defaultCodecsArray.join(',');

    const codecsString = tag.getAttributeValue('CODECS', defaultCodecs);
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
   * Get the language value.
   *
   * @param {!shaka.hls.Tag} tag
   * @return {string}
   * @private
   */
  getLanguage_(tag) {
    const LanguageUtils = shaka.util.LanguageUtils;
    const languageValue = tag.getAttributeValue('LANGUAGE') || 'und';
    return LanguageUtils.normalize(languageValue);
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
   * @param {!Array.<shaka.extern.DrmInfo>} drmInfos
   * @param {!Set.<string>} keyIds
   * @return {!Array.<!shaka.extern.Variant>}
   * @private
   */
  createVariants_(
      audioInfos, videoInfos, bandwidth, width, height, frameRate, videoRange,
      drmInfos, keyIds) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const DrmEngine = shaka.media.DrmEngine;

    for (const info of videoInfos) {
      this.addVideoAttributes_(
          info.stream, width, height, frameRate, videoRange);
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
            videoInfo ? videoInfo.verbatimMediaPlaylistUri : '';
        const audioStreamUri =
            audioInfo ? audioInfo.verbatimMediaPlaylistUri : '';
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
      const language = this.getLanguage_(tag);

      // The GROUP-ID value is a quoted-string that specifies the group to which
      // the Rendition belongs.
      const groupId = tag.getRequiredAttrValue('GROUP-ID');

      // The value of INSTREAM-ID is a quoted-string that specifies a Rendition
      // within the segments in the Media Playlist. This attribute is REQUIRED
      // if the TYPE attribute is CLOSED-CAPTIONS.
      const instreamId = tag.getRequiredAttrValue('INSTREAM-ID');
      if (!this.groupIdToClosedCaptionsMap_.get(groupId)) {
        this.groupIdToClosedCaptionsMap_.set(groupId, new Map());
      }
      this.groupIdToClosedCaptionsMap_.get(groupId).set(instreamId, language);
    }
  }

  /**
   * Parse EXT-X-MEDIA media tag into a Stream object.
   *
   * @param {shaka.hls.Tag} tag
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfoFromMediaTag_(tag) {
    goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
        'Should only be called on media tags!');
    const groupId = tag.getRequiredAttrValue('GROUP-ID');
    let codecs = '';
    /** @type {string} */
    const type = this.getType_(tag);
    // Text does not require a codec.
    if (type != shaka.util.ManifestParserUtils.ContentType.TEXT && groupId &&
        this.groupIdToCodecsMap_.has(groupId)) {
      codecs = this.groupIdToCodecsMap_.get(groupId);
    }

    const verbatimMediaPlaylistUri = this.variableSubstitution_(
        tag.getRequiredAttrValue('URI'), this.globalVariables_);

    // Check if the stream has already been created as part of another Variant
    // and return it if it has.
    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }

    const language = this.getLanguage_(tag);
    const name = tag.getAttributeValue('NAME');

    // NOTE: According to the HLS spec, "DEFAULT=YES" requires "AUTOSELECT=YES".
    // However, we don't bother to validate "AUTOSELECT", since we don't
    // actually use it in our streaming model, and we treat everything as
    // "AUTOSELECT=YES".  A value of "AUTOSELECT=NO" would imply that it may
    // only be selected explicitly by the user, and we don't have a way to
    // represent that in our model.
    const defaultAttrValue = tag.getAttributeValue('DEFAULT');
    const primary = defaultAttrValue == 'YES';

    const channelsCount = type == 'audio' ? this.getChannelsCount_(tag) : null;
    const spatialAudio = type == 'audio' ? this.isSpatialAudio_(tag) : false;
    const characteristics = tag.getAttributeValue('CHARACTERISTICS');

    const forcedAttrValue = tag.getAttributeValue('FORCED');
    const forced = forcedAttrValue == 'YES';
    // TODO: Should we take into account some of the currently ignored
    // attributes: INSTREAM-ID, Attribute descriptions: https://bit.ly/2lpjOhj
    const streamInfo = this.createStreamInfo_(
        verbatimMediaPlaylistUri, codecs, type, language, primary, name,
        channelsCount, /* closedCaptions= */ null, characteristics, forced,
        spatialAudio);
    if (this.groupIdToStreamInfosMap_.has(groupId)) {
      this.groupIdToStreamInfosMap_.get(groupId).push(streamInfo);
    } else {
      this.groupIdToStreamInfosMap_.set(groupId, [streamInfo]);
    }

    // TODO: This check is necessary because of the possibility of multiple
    // calls to createStreamInfoFromMediaTag_ before either has resolved.
    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }
    this.uriToStreamInfosMap_.set(verbatimMediaPlaylistUri, streamInfo);
    return streamInfo;
  }

  /**
   * Parse EXT-X-MEDIA media tag into a Stream object.
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

    const verbatimImagePlaylistUri = this.variableSubstitution_(
        tag.getRequiredAttrValue('URI'), this.globalVariables_);
    const codecs = tag.getAttributeValue('CODECS', 'jpeg') || '';

    // Check if the stream has already been created as part of another Variant
    // and return it if it has.
    if (this.uriToStreamInfosMap_.has(verbatimImagePlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimImagePlaylistUri);
    }

    const language = this.getLanguage_(tag);
    const name = tag.getAttributeValue('NAME');

    const characteristics = tag.getAttributeValue('CHARACTERISTICS');

    const streamInfo = this.createStreamInfo_(
        verbatimImagePlaylistUri, codecs, type, language, /* primary= */ false,
        name, /* channelsCount= */ null, /* closedCaptions= */ null,
        characteristics, /* forced= */ false, /* spatialAudio= */ false);

    // TODO: This check is necessary because of the possibility of multiple
    // calls to createStreamInfoFromImageTag_ before either has resolved.
    if (this.uriToStreamInfosMap_.has(verbatimImagePlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimImagePlaylistUri);
    }

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
   * Parse an EXT-X-STREAM-INF media tag into a Stream object.
   *
   * @param {!shaka.hls.Tag} tag
   * @param {!Array.<string>} allCodecs
   * @param {string} type
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfoFromVariantTag_(tag, allCodecs, type) {
    goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
        'Should only be called on variant tags!');
    const verbatimMediaPlaylistUri = this.variableSubstitution_(
        tag.getRequiredAttrValue('URI'), this.globalVariables_);

    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }

    const closedCaptions = this.getClosedCaptions_(tag, type);
    const codecs = shaka.util.ManifestParserUtils.guessCodecs(type, allCodecs);
    const streamInfo = this.createStreamInfo_(verbatimMediaPlaylistUri,
        codecs, type, /* language= */ 'und', /* primary= */ false,
        /* name= */ null, /* channelcount= */ null, closedCaptions,
        /* characteristics= */ null, /* forced= */ false,
        /* spatialAudio= */ false);
    // TODO: This check is necessary because of the possibility of multiple
    // calls to createStreamInfoFromVariantTag_ before either has resolved.
    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }

    this.uriToStreamInfosMap_.set(verbatimMediaPlaylistUri, streamInfo);
    return streamInfo;
  }


  /**
   * @param {string} verbatimMediaPlaylistUri
   * @param {string} codecs
   * @param {string} type
   * @param {string} language
   * @param {boolean} primary
   * @param {?string} name
   * @param {?number} channelsCount
   * @param {Map.<string, string>} closedCaptions
   * @param {?string} characteristics
   * @param {boolean} forced
   * @param {boolean} spatialAudio
   * @return {!shaka.hls.HlsParser.StreamInfo}
   * @private
   */
  createStreamInfo_(verbatimMediaPlaylistUri, codecs, type, language,
      primary, name, channelsCount, closedCaptions, characteristics, forced,
      spatialAudio) {
    // TODO: Refactor, too many parameters
    const initialMediaPlaylistUri = shaka.hls.Utils.constructAbsoluteUri(
        this.masterPlaylistUri_, verbatimMediaPlaylistUri);

    // This stream is lazy-loaded inside the createSegmentIndex function.
    // So we start out with a stream object that does not contain the actual
    // segment index, then download when createSegmentIndex is called.
    const stream = this.makeStreamObject_(codecs, type, language, primary, name,
        channelsCount, closedCaptions, characteristics, forced, spatialAudio);
    if (shaka.media.MediaSourceEngine.RAW_FORMATS.includes(stream.mimeType)) {
      stream.codecs = '';
    }
    const streamInfo = {
      stream,
      type,
      verbatimMediaPlaylistUri,
      // These values are filled out or updated after lazy-loading:
      absoluteMediaPlaylistUri: initialMediaPlaylistUri,
      maxTimestamp: 0,
      mediaSequenceToStartTime: new Map(),
      canSkipSegments: false,
      hasEndList: false,
      firstSequenceNumber: -1,
      loadedOnce: false,
    };

    /** @param {!AbortSignal} abortSignal */
    const downloadSegmentIndex = async (abortSignal) => {
      // Download the actual manifest.
      const response = await this.requestManifest_(
          streamInfo.absoluteMediaPlaylistUri, /* isPlaylist= */ true);
      if (abortSignal.aborted) {
        return;
      }

      // Record the final URI after redirects.
      const absoluteMediaPlaylistUri = response.uri;

      // Record the redirected, final URI of this media playlist when we parse
      // it.
      /** @type {!shaka.hls.Playlist} */
      const playlist = this.manifestTextParser_.parsePlaylist(
          response.data, absoluteMediaPlaylistUri);

      const wasLive = this.isLive_();
      const realStreamInfo = await this.convertParsedPlaylistIntoStreamInfo_(
          playlist, verbatimMediaPlaylistUri, absoluteMediaPlaylistUri, codecs,
          type, language, primary, name, channelsCount, closedCaptions,
          characteristics, forced, spatialAudio);
      if (abortSignal.aborted) {
        return;
      }

      const realStream = realStreamInfo.stream;

      if (this.isLive_() && !wasLive) {
        // Now that we know that the presentation is live, convert the timeline
        // to live.
        this.changePresentationTimelineToLive_();
      }

      // Copy values from the real stream info to our initial one.
      streamInfo.absoluteMediaPlaylistUri = absoluteMediaPlaylistUri;
      streamInfo.maxTimestamp = realStreamInfo.maxTimestamp;
      streamInfo.canSkipSegments = realStreamInfo.canSkipSegments;
      streamInfo.hasEndList = realStreamInfo.hasEndList;
      streamInfo.mediaSequenceToStartTime =
          realStreamInfo.mediaSequenceToStartTime;
      streamInfo.loadedOnce = true;
      stream.segmentIndex = realStream.segmentIndex;
      stream.encrypted = realStream.encrypted;
      stream.drmInfos = realStream.drmInfos;
      stream.keyIds = realStream.keyIds;
      stream.mimeType = realStream.mimeType;
      if (shaka.media.MediaSourceEngine.RAW_FORMATS.includes(stream.mimeType)) {
        stream.codecs = '';
      }

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
            if (shaka.media.MediaSourceEngine.RAW_FORMATS
                .includes(otherStreamInfo.stream.mimeType)) {
              otherStreamInfo.stream.codecs = '';
            }
          }
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
    // MediaSource expects no codec strings combined with raw formats.
    for (const streamInfo of streamInfos) {
      const stream = streamInfo.stream;
      if (shaka.media.MediaSourceEngine.RAW_FORMATS.includes(stream.mimeType)) {
        stream.codecs = '';
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
   * @param {string} verbatimMediaPlaylistUri
   * @param {string} absoluteMediaPlaylistUri
   * @param {string} codecs
   * @param {string} type
   * @param {string} language
   * @param {boolean} primary
   * @param {?string} name
   * @param {?number} channelsCount
   * @param {Map.<string, string>} closedCaptions
   * @param {?string} characteristics
   * @param {boolean} forced
   * @param {boolean} spatialAudio
   * @param {(string|undefined)} mimeType
   * @return {!Promise.<!shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async convertParsedPlaylistIntoStreamInfo_(playlist, verbatimMediaPlaylistUri,
      absoluteMediaPlaylistUri, codecs, type, language, primary, name,
      channelsCount, closedCaptions, characteristics, forced, spatialAudio,
      mimeType = undefined) {
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

    const mediaVariables = this.parseMediaVariables_(variablesTags);

    goog.asserts.assert(playlist.segments != null,
        'Media playlist should have segments!');

    this.determinePresentationType_(playlist);

    if (!mimeType) {
      mimeType = await this.guessMimeType_(type, codecs, playlist,
          mediaVariables);
    }

    const {drmInfos, keyIds, encrypted, aesEncrypted} =
                        this.parseDrmInfo_(playlist, mimeType);

    if (encrypted && !drmInfos.length && !aesEncrypted) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_KEYFORMATS_NOT_SUPPORTED);
    }

    const mediaSequenceToStartTime = this.isLive_() ?
        this.mediaSequenceToStartTimeByType_.get(type) : new Map();
    const prevLowLatencyMode = this.lowLatencyMode_;
    const segments = this.createSegments_(verbatimMediaPlaylistUri, playlist,
        type, mimeType, mediaSequenceToStartTime, mediaVariables);

    // This happens when autoLowLatencyMode is true, so we need set the
    // correct lowLatencyPresentationDelay_
    if (prevLowLatencyMode != this.lowLatencyMode_) {
      this.determinePresentationType_(playlist);
    }

    const lastEndTime = segments[segments.length - 1].endTime;
    /** @type {!shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(segments);

    const serverControlTag = shaka.hls.Utils.getFirstTagWithName(
        playlist.tags, 'EXT-X-SERVER-CONTROL');
    const canSkipSegments = serverControlTag ?
          serverControlTag.getAttribute('CAN-SKIP-UNTIL') != null : false;

    const stream = this.makeStreamObject_(codecs, type, language, primary, name,
        channelsCount, closedCaptions, characteristics, forced, spatialAudio);
    stream.segmentIndex = segmentIndex;
    stream.encrypted = encrypted;
    stream.drmInfos = drmInfos;
    stream.keyIds = keyIds;
    stream.mimeType = mimeType;

    return {
      stream,
      type,
      verbatimMediaPlaylistUri,
      absoluteMediaPlaylistUri,
      maxTimestamp: lastEndTime,
      canSkipSegments,
      hasEndList: false,
      firstSequenceNumber: -1,
      mediaSequenceToStartTime,
      loadedOnce: false,
    };
  }


  /**
   * Creates a stream object with the given parameters.
   * The parameters that are passed into here are only the things that can be
   * known without downloading the media playlist; other values must be set
   * manually on the object after creation.
   * @param {string} codecs
   * @param {string} type
   * @param {string} language
   * @param {boolean} primary
   * @param {?string} name
   * @param {?number} channelsCount
   * @param {Map.<string, string>} closedCaptions
   * @param {?string} characteristics
   * @param {boolean} forced
   * @param {boolean} spatialAudio
   * @return {!shaka.extern.Stream}
   * @private
   */
  makeStreamObject_(codecs, type, language, primary, name, channelsCount,
      closedCaptions, characteristics, forced, spatialAudio) {
    // Fill out a "best-guess" mimeType, for now. It will be replaced once the
    // stream is lazy-loaded.
    const mimeType = this.guessMimeTypeBeforeLoading_(type, codecs) ||
        this.guessMimeTypeFallback_(type);

    return {
      id: this.globalId_++,
      originalId: name,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: null,
      mimeType,
      codecs,
      kind: (type == shaka.util.ManifestParserUtils.ContentType.TEXT) ?
          shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE : undefined,
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language,
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
      roles: characteristics ? characteristics.split(',') : [],
      forced,
      channelsCount,
      audioSamplingRate: null,
      spatialAudio,
      closedCaptions,
      hdr: undefined,
      tilesLayout: undefined,
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
   * @return {!shaka.extern.HlsAes128Key}
   * @private
   */
  parseAES128DrmTag_(drmTag, playlist) {
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
            shaka.util.Error.Code.HLS_AES_128_INVALID_IV_LENGTH);
      }
    }

    const keyUri = shaka.hls.Utils.constructAbsoluteUri(
        playlist.absoluteUri, drmTag.getRequiredAttrValue('URI'));

    const requestType = shaka.net.NetworkingEngine.RequestType.KEY;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [keyUri], this.config_.retryParameters);

    const keyInfo = {method: 'AES-128', iv, firstMediaSequenceNumber};

    // Don't download the key object until the segment is parsed, to avoid a
    // startup delay for long manifests with lots of keys.
    keyInfo.fetchKey = async () => {
      const keyResponse = await this.makeNetworkRequest_(request, requestType);

      // keyResponse.status is undefined when URI is "data:text/plain;base64,"
      if (!keyResponse.data || keyResponse.data.byteLength != 16) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.HLS_AES_128_INVALID_KEY_LENGTH);
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

      this.determineLastTargetDuration_(playlist);
    }
  }


  /**
   * @param {!shaka.hls.Playlist} playlist
   * @private
   */
  determineLastTargetDuration_(playlist) {
    const targetDurationTag = this.getRequiredTag_(playlist.tags,
        'EXT-X-TARGETDURATION');
    const targetDuration = Number(targetDurationTag.value);
    const partialTargetDurationTag =
      shaka.hls.Utils.getFirstTagWithName(playlist.tags, 'EXT-X-PART-INF');
    // According to the HLS spec, updates should not happen more often than
    // once in targetDuration.  It also requires us to only update the active
    // variant.  We might implement that later, but for now every variant
    // will be updated.  To get the update period, choose the smallest
    // targetDuration value across all playlists.
    // 1. Update the shortest one to use as update period and segment
    // availability time (for LIVE).
    if (this.lowLatencyMode_ && partialTargetDurationTag) {
      // For low latency streaming, use the partial segment target duration.
      this.partialTargetDuration_ = Number(
          partialTargetDurationTag.getRequiredAttrValue('PART-TARGET'));
      this.lastTargetDuration_ = Math.min(
          this.partialTargetDuration_, this.lastTargetDuration_);
      // Get the server-recommended min distance from the live edge.
      const serverControlTag = shaka.hls.Utils.getFirstTagWithName(
          playlist.tags, 'EXT-X-SERVER-CONTROL');
      // Use 'PART-HOLD-BACK' as the presentation delay for low latency mode.
      this.lowLatencyPresentationDelay_ = serverControlTag ? Number(
          serverControlTag.getRequiredAttrValue('PART-HOLD-BACK')) : 0;
    } else {
      let lastTargetDuration = Infinity;
      const segments = playlist.segments;
      if (segments.length) {
        const lastSegment = segments[segments.length - 1];
        const extinfTag =
            shaka.hls.Utils.getFirstTagWithName(lastSegment.tags, 'EXTINF');
        if (extinfTag) {
          // The EXTINF tag format is '#EXTINF:<duration>,[<title>]'.
          // We're interested in the duration part.
          const extinfValues = extinfTag.value.split(',');
          lastTargetDuration = Number(extinfValues[0]);
        }
      }
      this.lastTargetDuration_ = Math.min(
          lastTargetDuration, this.lastTargetDuration_);
    }
    // 2. Update the longest target duration if need be to use as a
    // presentation delay later.
    this.maxTargetDuration_ = Math.max(
        targetDuration, this.maxTargetDuration_);
  }


  /**
   * @private
   */
  changePresentationTimelineToLive_() {
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
    } else {
      const numberOfSegments = this.config_.hls.liveSegmentsDelay;
      presentationDelay = this.maxTargetDuration_ * numberOfSegments;
    }

    this.presentationTimeline_.setPresentationStartTime(0);
    this.presentationTimeline_.setDelay(presentationDelay);
    this.presentationTimeline_.setStatic(false);
  }

  /**
   * Get the InitSegmentReference for a segment if it has a EXT-X-MAP tag.
   * @param {string} playlistUri The absolute uri of the media playlist.
   * @param {!Array.<!shaka.hls.Tag>} tags Segment tags
   * @param {!Map.<string, string>} variables
   * @return {shaka.media.InitSegmentReference}
   * @private
   */
  getInitSegmentReference_(playlistUri, tags, variables) {
    /** @type {?shaka.hls.Tag} */
    const mapTag = shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-MAP');

    if (!mapTag) {
      return null;
    }
    // Map tag example: #EXT-X-MAP:URI="main.mp4",BYTERANGE="720@0"
    const verbatimInitSegmentUri = mapTag.getRequiredAttrValue('URI');
    const absoluteInitSegmentUri = this.variableSubstitution_(
        shaka.hls.Utils.constructAbsoluteUri(
            playlistUri, verbatimInitSegmentUri),
        variables);

    const mapTagKey = [
      absoluteInitSegmentUri,
      mapTag.getAttributeValue('BYTERANGE', ''),
    ].join('-');
    if (!this.mapTagToInitSegmentRefMap_.has(mapTagKey)) {
      const initSegmentRef = this.createInitSegmentReference_(
          absoluteInitSegmentUri, mapTag);
      this.mapTagToInitSegmentRefMap_.set(mapTagKey, initSegmentRef);
    }
    return this.mapTagToInitSegmentRefMap_.get(mapTagKey);
  }

  /**
   * Create an InitSegmentReference object for the EXT-X-MAP tag in the media
   * playlist.
   * @param {string} absoluteInitSegmentUri
   * @param {!shaka.hls.Tag} mapTag EXT-X-MAP
   * @return {!shaka.media.InitSegmentReference}
   * @private
   */
  createInitSegmentReference_(absoluteInitSegmentUri, mapTag) {
    let startByte = 0;
    let endByte = null;
    const byterange = mapTag.getAttributeValue('BYTERANGE');
    // If a BYTERANGE attribute is not specified, the segment consists
    // of the entire resource.
    if (byterange) {
      const blocks = byterange.split('@');
      const byteLength = Number(blocks[0]);
      startByte = Number(blocks[1]);
      endByte = startByte + byteLength - 1;
    }

    const initSegmentRef = new shaka.media.InitSegmentReference(
        () => [absoluteInitSegmentUri],
        startByte,
        endByte);
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
   * @param {string} absoluteMediaPlaylistUri
   * @param {string} type
   * @param {shaka.extern.HlsAes128Key=} hlsAes128Key
   * @return {shaka.media.SegmentReference}
   * @private
   */
  createSegmentReference_(
      initSegmentReference, previousReference, hlsSegment, startTime,
      variables, absoluteMediaPlaylistUri, type, hlsAes128Key) {
    const tags = hlsSegment.tags;
    const absoluteSegmentUri = this.variableSubstitution_(
        hlsSegment.absoluteUri, variables);
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
    const partialSegmentRefs = [];
    if (this.lowLatencyMode_) {
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
        } else {
          const pByterange = item.getAttributeValue('BYTERANGE');
          [pStartByte, pEndByte] =
            this.parseByteRange_(pPreviousReference, pByterange);
        }
        const pUri = item.getAttributeValue('URI');
        if (!pUri) {
          continue;
        }
        const pAbsoluteUri = shaka.hls.Utils.constructAbsoluteUri(
            absoluteMediaPlaylistUri, pUri);

        let partialStatus = shaka.media.SegmentReference.Status.AVAILABLE;
        if (item.getAttributeValue('GAP') == 'YES') {
          partialStatus = shaka.media.SegmentReference.Status.MISSING;
        }

        const partial = new shaka.media.SegmentReference(
            pStartTime,
            pEndTime,
            () => [pAbsoluteUri],
            pStartByte,
            pEndByte,
            initSegmentReference,
            /* timestampOffset= */ 0, // This value is ignored in sequence mode.
            /* appendWindowStart= */ 0,
            /* appendWindowEnd= */ Infinity,
            /* partialReferences= */ [],
            /* tilesLayout= */ '',
            /* tileDuration= */ null,
            /* syncTime= */ null,
            partialStatus,
            hlsAes128Key);
        partialSegmentRefs.push(partial);
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
      endTime = startTime + duration;
    } else {
      endTime = partialSegmentRefs[partialSegmentRefs.length - 1].endTime;
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
    if (type == shaka.util.ManifestParserUtils.ContentType.IMAGE) {
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

    return new shaka.media.SegmentReference(
        startTime,
        endTime,
        () => absoluteSegmentUri.length ? [absoluteSegmentUri] : [],
        startByte,
        endByte,
        initSegmentReference,
        /* timestampOffset= */ 0, // This value is ignored in sequence mode.
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity,
        partialSegmentRefs,
        tilesLayout,
        tileDuration,
        syncTime,
        status,
        hlsAes128Key,
    );
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
   * Parses shaka.hls.Segment objects into shaka.media.SegmentReferences.
   *
   * @param {string} verbatimMediaPlaylistUri
   * @param {!shaka.hls.Playlist} playlist
   * @param {string} type
   * @param {string} mimeType
   * @param {!Map.<number, number>} mediaSequenceToStartTime
   * @param {!Map.<string, string>} variables
   * @return {!Array.<!shaka.media.SegmentReference>}
   * @private
   */
  createSegments_(verbatimMediaPlaylistUri, playlist, type, mimeType,
      mediaSequenceToStartTime, variables) {
    /** @type {Array.<!shaka.hls.Segment>} */
    const hlsSegments = playlist.segments;
    goog.asserts.assert(hlsSegments.length, 'Playlist should have segments!');

    /** @type {shaka.media.InitSegmentReference} */
    let initSegmentRef;

    /** @type {shaka.extern.HlsAes128Key|undefined} */
    let hlsAes128Key = undefined;

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
            hlsAes128Key = this.parseAES128DrmTag_(drmTag, playlist);
          } else {
            hlsAes128Key = undefined;
          }
        }
      }

      mediaSequenceToStartTime.set(position, startTime);

      initSegmentRef = this.getInitSegmentReference_(playlist.absoluteUri,
          item.tags, variables);

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
          playlist.absoluteUri,
          type,
          hlsAes128Key);
      previousReference = reference;

      if (reference) {
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

    return references;
  }

  /**
   * Replaces the variables of a given URI.
   *
   * @param {string} uri
   * @param {!Map.<string, string>} variables
   * @return {string}
   * @private
   */
  variableSubstitution_(uri, variables) {
    let newUri = String(uri).replace(/%7B/g, '{').replace(/%7D/g, '}');

    const uriVariables = newUri.match(/{\$\w*}/g);
    if (uriVariables) {
      for (const variable of uriVariables) {
        // Note: All variables have the structure {$...}
        const variableName = variable.slice(2, variable.length - 1);
        const replaceValue = variables.get(variableName);
        if (replaceValue) {
          newUri = newUri.replace(variable, replaceValue);
        } else {
          shaka.log.error('A variable has been found that is not declared',
              variableName);
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.HLS_VARIABLE_NOT_FOUND,
              variableName);
        }
      }
    }
    return newUri;
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
   * @return {!Promise.<string>}
   * @private
   */
  async guessMimeType_(contentType, codecs, playlist, variables) {
    const HlsParser = shaka.hls.HlsParser;
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    // If you wait long enough, requesting the first segment can fail
    // because it has fallen off the left edge of DVR, so to be safer,
    // let's request the middle segment.
    goog.asserts.assert(playlist.segments.length,
        'Playlist should have segments!');
    const middleSegmentIdx = Math.trunc((playlist.segments.length - 1) / 2);
    const middleSegmentUri = this.variableSubstitution_(
        playlist.segments[middleSegmentIdx].absoluteUri, variables);

    const parsedUri = new goog.Uri(middleSegmentUri);
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
        [middleSegmentUri], this.config_.retryParameters);
    headRequest.method = 'HEAD';

    const response = await this.makeNetworkRequest_(
        headRequest, requestType);

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
   * @private
   */
  addVideoAttributes_(stream, width, height, frameRate, videoRange) {
    if (stream) {
      stream.width = Number(width) || undefined;
      stream.height = Number(height) || undefined;
      stream.frameRate = Number(frameRate) || undefined;
      stream.hdr = videoRange || undefined;
    }
  }

  /**
   * Makes a network request for the manifest and returns a Promise
   * with the resulting data.
   *
   * @param {string} absoluteUri
   * @param {boolean=} isPlaylist
   * @return {!Promise.<!shaka.extern.Response>}
   * @private
   */
  requestManifest_(absoluteUri, isPlaylist) {
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const request = shaka.net.NetworkingEngine.makeRequest(
        [absoluteUri], this.config_.retryParameters);

    const format = shaka.util.CmcdManager.StreamingFormat.HLS;
    this.playerInterface_.modifyManifestRequest(request, {format: format});

    const advType = isPlaylist ?
        shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_PLAYLIST :
        shaka.net.NetworkingEngine.AdvancedRequestType.MASTER_PLAYLIST;
    return this.makeNetworkRequest_(request, requestType, advType);
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
      await this.update();

      // This may have converted to VOD, in which case we stop updating.
      if (this.isLive_()) {
        const delay = this.getUpdatePlaylistDelay_();
        this.updatePlaylistTimer_.tickAfter(/* seconds= */ delay);
      }
    } catch (error) {
      // Detect a call to stop() during this.update()
      if (!this.playerInterface_) {
        return;
      }

      goog.asserts.assert(error instanceof shaka.util.Error,
          'Should only receive a Shaka error');

      // We will retry updating, so override the severity of the error.
      error.severity = shaka.util.Error.Severity.RECOVERABLE;
      this.playerInterface_.onError(error);

      // Try again very soon.
      this.updatePlaylistTimer_.tickAfter(/* seconds= */ 0.1);
    }
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
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @return {!Promise.<shaka.extern.Response>}
   * @private
   */
  makeNetworkRequest_(request, type, advType) {
    if (!this.operationManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    const op = this.playerInterface_.networkingEngine.request(
        type, request, advType);
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
 *   verbatimMediaPlaylistUri: string,
 *   absoluteMediaPlaylistUri: string,
 *   maxTimestamp: number,
 *   mediaSequenceToStartTime: !Map.<number, number>,
 *   canSkipSegments: boolean,
 *   hasEndList: boolean,
 *   firstSequenceNumber: number,
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
 * @property {string} verbatimMediaPlaylistUri
 *   The verbatim media playlist URI, as it appeared in the master playlist.
 *   This has not been canonicalized into an absolute URI.  This gives us a
 *   consistent key for this playlist, even if redirects cause us to update
 *   from different origins each time.
 * @property {string} absoluteMediaPlaylistUri
 *   The absolute media playlist URI, resolved relative to the master playlist
 *   and updated to reflect any redirects.
 * @property {number} maxTimestamp
 *   The maximum timestamp found in the stream.
 * @property {!Map.<number, number>} mediaSequenceToStartTime
 *   A map of media sequence numbers to media start times.
 *   Only used for VOD content.
 * @property {boolean} canSkipSegments
 *   True if the server supports delta playlist updates, and we can send a
 *   request for a playlist that can skip older media segments.
 * @property {boolean} hasEndList
 *   True if the stream has an EXT-X-ENDLIST tag.
 * @property {number} firstSequenceNumber
 *   The sequence number of the first reference. Only calculated if needed.
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
 * @typedef {{
 *   type: string,
 *   mimeType: string,
 *   codecs: string,
 *   language: ?string,
 *   height: ?string,
 *   width: ?string,
 *   channelCount: ?number,
 *   sampleRate: ?number
 * }}
 *
 * @property {string} type
 * @property {string} mimeType
 * @property {string} codecs
 * @property {?string} language
 * @property {?string} height
 * @property {?string} width
 * @property {?number} channelCount
 * @property {?number} sampleRate
 */
shaka.hls.HlsParser.BasicInfo;


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

shaka.media.ManifestParser.registerParserByExtension(
    'm3u8', () => new shaka.hls.HlsParser());
shaka.media.ManifestParser.registerParserByMime(
    'application/x-mpegurl', () => new shaka.hls.HlsParser());
shaka.media.ManifestParser.registerParserByMime(
    'application/vnd.apple.mpegurl', () => new shaka.hls.HlsParser());
