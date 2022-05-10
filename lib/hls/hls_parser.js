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
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Platform');
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
     * This is the number of seconds we want to wait between finishing a
     * manifest update and starting the next one. This will be set when we parse
     * the manifest.
     *
     * @private {number}
     */
    this.updatePlaylistDelay_ = 0;

    /**
     * A time offset to apply to EXT-X-PROGRAM-DATE-TIME values to normalize
     * them so that they start at 0. This is necessary because these times will
     * be used to set presentation times for segments.
     * null means we don't have enough data yet.
     * @private {?number}
     */
    this.syncTimeOffset_ = null;

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
    this.minTargetDuration_ = Infinity;

    /** Partial segments target duration.
     * @private {number}
     */
    this.partialTargetDuration_ = 0;

    /** @private {number} */
    this.lowLatencyPresentationDelay_ = 0;

    /** @private {shaka.util.OperationManager} */
    this.operationManager_ = new shaka.util.OperationManager();

    /** @private {!Array.<!Array.<!shaka.media.SegmentReference>>} */
    this.segmentsToNotifyByStream_ = [];

    /** A map from closed captions' group id, to a map of closed captions info.
     * {group id -> {closed captions channel id -> language}}
     * @private {Map.<string, Map.<string, string>>}
     */
    this.groupIdToClosedCaptionsMap_ = new Map();

    /** True if some of the variants in  the playlist is encrypted with AES-128.
     * @private {boolean} */
    this.aesEncrypted_ = false;

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

    // Start the update timer if we want updates.
    const delay = this.updatePlaylistDelay_;
    if (delay > 0) {
      this.updatePlaylistTimer_.tickAfter(/* seconds= */ delay);
    }

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
    // Wait for the first stream info created, so that the start time is fetched
    // and can be reused.
    if (streamInfos.length) {
      await this.updateStream_(streamInfos[0]);
    }
    for (let i = 1; i < streamInfos.length; i++) {
      updates.push(this.updateStream_(streamInfos[i]));
    }

    await Promise.all(updates);
  }

  /**
   * Updates a stream.
   *
   * @param {!shaka.hls.HlsParser.StreamInfo} streamInfo
   * @return {!Promise}
   * @private
   */
  async updateStream_(streamInfo) {
    const PresentationType = shaka.hls.HlsParser.PresentationType_;
    const manifestUri = streamInfo.absoluteMediaPlaylistUri;
    const uriObj = new goog.Uri(manifestUri);
    if (this.lowLatencyMode_ && streamInfo.canSkipSegments) {
      // Enable delta updates. This will replace older segments with
      // 'EXT-X-SKIP' tag in the media playlist.
      uriObj.setQueryData(new goog.Uri.QueryData('_HLS_skip=YES'));
    }
    const response = await this.requestManifest_(uriObj.toString());

    /** @type {shaka.hls.Playlist} */
    const playlist = this.manifestTextParser_.parsePlaylist(
        response.data, response.uri);

    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    /** @type {!Array.<!shaka.hls.Tag>} */
    const variablesTags = shaka.hls.Utils.filterTagsByName(playlist.tags,
        'EXT-X-DEFINE');

    const mediaVariables = this.parseMediaVariables_(variablesTags);

    const stream = streamInfo.stream;

    const segments = this.createSegments_(
        streamInfo.verbatimMediaPlaylistUri, playlist, stream.type,
        stream.mimeType, streamInfo.mediaSequenceToStartTime, mediaVariables,
        stream.codecs);

    stream.segmentIndex.mergeAndEvict(
        segments, this.presentationTimeline_.getSegmentAvailabilityStart());
    if (segments.length) {
      const mediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
          playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);
      const playlistStartTime = streamInfo.mediaSequenceToStartTime.get(
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
      // Convert the presentation to VOD and set the duration to the last
      // segment's end time.
      this.setPresentationType_(PresentationType.VOD);
      this.presentationTimeline_.setDuration(newestSegment.endTime);
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
   * If necessary, makes sure that sync times will be normalized to 0, so that
   * a stream does not start buffering at 50 years in because sync times are
   * measured in time since 1970.
   * @private
   */
  calculateSyncTimeOffset_() {
    if (this.syncTimeOffset_ != null) {
      // The offset was already calculated.
      return;
    }

    const segments = new Set();
    let lowestSyncTime = Infinity;
    for (const streamInfo of this.uriToStreamInfosMap_.values()) {
      const segmentIndex = streamInfo.stream.segmentIndex;
      if (segmentIndex) {
        segmentIndex.forEachTopLevelReference((segment) => {
          if (segment.syncTime != null) {
            lowestSyncTime = Math.min(lowestSyncTime, segment.syncTime);
            segments.add(segment);
          }
        });
      }
    }
    if (segments.size > 0) {
      this.syncTimeOffset_ = -lowestSyncTime;
      for (const segment of segments) {
        segment.syncTime += this.syncTimeOffset_;
        for (const partial of segment.partialReferences) {
          partial.syncTime += this.syncTimeOffset_;
        }
      }
    }
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
      // Get necessary info for this stream, from the config. These are things
      // we would normally find from the master playlist (e.g. from values on
      // EXT-X-MEDIA tags).
      const fullMimeType = this.config_.hls.mediaPlaylistFullMimeType;
      const mimeType = shaka.util.MimeUtils.getBasicType(fullMimeType);
      const type = mimeType.split('/')[0];
      const codecs = shaka.util.MimeUtils.getCodecs(fullMimeType);

      // Some values we cannot figure out, and aren't important enough to ask
      // the user to provide through config values. A lot of these are only
      // relevant to ABR, which isn't necessary if there's only one variant.
      // So these unknowns should be set to false or null, largely.
      const language = '';
      const channelsCount = null;
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
      goog.asserts.assert(streamInfo != null, 'StreamInfo is null!');
      this.uriToStreamInfosMap_.set(uri, streamInfo);

      // Wrap the stream from that stream info with a variant.
      variants.push({
        id: 0,
        language: 'und',
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
      await this.createStreamInfosFromMediaTags_(mediaTags);
      this.parseClosedCaptions_(mediaTags);
      variants = await this.createVariantsForTags_(variantTags);
      textStreams = await this.parseTexts_(mediaTags);
      imageStreams = await this.parseImages_(imageTags);
    }

    // Make sure that the parser has not been destroyed.
    if (!this.playerInterface_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    // Now that we have generated all streams, we can determine the offset to
    // apply to sync times.
    this.calculateSyncTimeOffset_();

    if (this.aesEncrypted_ && variants.length == 0) {
      // We do not support AES-128 encryption with HLS yet. Variants is null
      // when the playlist is encrypted with AES-128.
      shaka.log.info('No stream is created, because we don\'t support AES-128',
          'encryption yet');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_AES_128_ENCRYPTION_NOT_SUPPORTED);
    }

    // Find the min and max timestamp of the earliest segment in all streams.
    // Find the minimum duration of all streams as well.
    let minFirstTimestamp = Infinity;
    let minDuration = Infinity;

    for (const streamInfo of this.uriToStreamInfosMap_.values()) {
      minFirstTimestamp =
          Math.min(minFirstTimestamp, streamInfo.minTimestamp);
      if (streamInfo.stream.type != 'text') {
        minDuration = Math.min(minDuration,
            streamInfo.maxTimestamp - streamInfo.minTimestamp);
      }
    }

    // This assert is our own sanity check.
    goog.asserts.assert(this.presentationTimeline_ == null,
        'Presentation timeline created early!');
    this.createPresentationTimeline_();

    // This assert satisfies the compiler that it is not null for the rest of
    // the method.
    goog.asserts.assert(this.presentationTimeline_,
        'Presentation timeline not created!');

    if (this.isLive_()) {
      // The HLS spec (RFC 8216) states in 6.3.4:
      // "the client MUST wait for at least the target duration before
      // attempting to reload the Playlist file again".
      // For LL-HLS, the server must add a new partial segment to the Playlist
      // every part target duration.
      this.updatePlaylistDelay_ = this.minTargetDuration_;

      // The spec says nothing much about seeking in live content, but Safari's
      // built-in HLS implementation does not allow it.  Therefore we will set
      // the availability window equal to the presentation delay.  The player
      // will be able to buffer ahead three segments, but the seek window will
      // be zero-sized.
      const PresentationType = shaka.hls.HlsParser.PresentationType_;

      if (this.presentationType_ == PresentationType.LIVE) {
        // This defaults to the presentation delay, which has the effect of
        // making the live stream unseekable.  This is consistent with Apple's
        // HLS implementation.
        let segmentAvailabilityDuration = this.presentationTimeline_.getDelay();

        // The app can override that with a longer duration, to allow seeking.
        if (!isNaN(this.config_.availabilityWindowOverride)) {
          segmentAvailabilityDuration = this.config_.availabilityWindowOverride;
        }

        this.presentationTimeline_.setSegmentAvailabilityDuration(
            segmentAvailabilityDuration);
      }
    } else {
      // For VOD/EVENT content, offset everything back to 0.
      // Use the minimum timestamp as the offset for all streams.
      // Use the minimum duration as the presentation duration.
      this.presentationTimeline_.setDuration(minDuration);
      // Use a negative offset to adjust towards 0.
      this.presentationTimeline_.offset(-minFirstTimestamp);

      for (const streamInfo of this.uriToStreamInfosMap_.values()) {
        // The segments were created with actual media times, rather than
        // presentation-aligned times, so offset them all now.
        streamInfo.stream.segmentIndex.offset(-minFirstTimestamp);
        // Finally, fit the segments to the playlist duration.
        streamInfo.stream.segmentIndex.fit(/* periodStart= */ 0, minDuration);
      }
    }

    // Now that the content has been fit, notify segments.
    this.segmentsToNotifyByStream_ = [];
    const streamsToNotify = [];
    for (const variant of variants) {
      for (const stream of [variant.video, variant.audio]) {
        if (stream) {
          streamsToNotify.push(stream);
        }
      }
    }
    await Promise.all(streamsToNotify.map(async (stream) => {
      await stream.createSegmentIndex();
    }));
    for (const stream of streamsToNotify) {
      this.segmentsToNotifyByStream_.push(stream.segmentIndex.references);
    }
    this.notifySegments_();

    // This asserts that the live edge is being calculated from segment times.
    // For VOD and event streams, this check should still pass.
    goog.asserts.assert(
        !this.presentationTimeline_.usingPresentationStartTime(),
        'We should not be using the presentation start time in HLS!');

    this.manifest_ = {
      presentationTimeline: this.presentationTimeline_,
      variants,
      textStreams,
      imageStreams,
      offlineSessionIds: [],
      minBufferTime: 0,
      sequenceMode: true,
    };
    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);
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
        const codecs = shaka.util.ManifestParserUtils.guessCodecs(
            ContentType.AUDIO, allCodecs);
        this.groupIdToCodecsMap_.set(audioGroupId, codecs);
      }
      if (videoGroupId) {
        const codecs = shaka.util.ManifestParserUtils.guessCodecs(
            ContentType.VIDEO, allCodecs);
        this.groupIdToCodecsMap_.set(videoGroupId, codecs);
      }
    }
  }

  /**
   * Parse Subtitles and Closed Captions from 'EXT-X-MEDIA' tags.
   * Create text streams for Subtitles, but not Closed Captions.
   *
   * @param {!Array.<!shaka.hls.Tag>} mediaTags Media tags from the playlist.
   * @return {!Promise.<!Array.<!shaka.extern.Stream>>}
   * @private
   */
  async parseTexts_(mediaTags) {
    // Create text stream for each Subtitle media tag.
    const subtitleTags =
        shaka.hls.Utils.filterTagsByType(mediaTags, 'SUBTITLES');
    const textStreamPromises = subtitleTags.map(async (tag) => {
      const disableText = this.config_.disableText;
      if (disableText) {
        return null;
      }
      try {
        const streamInfo = await this.createStreamInfoFromMediaTag_(tag);
        goog.asserts.assert(
            streamInfo, 'Should always have a streamInfo for text');
        return streamInfo.stream;
      } catch (e) {
        if (this.config_.hls.ignoreTextStreamFailures) {
          return null;
        }
        throw e;
      }
    });
    const textStreams = await Promise.all(textStreamPromises);

    // Set the codecs for text streams.
    for (const tag of subtitleTags) {
      const groupId = tag.getRequiredAttrValue('GROUP-ID');
      const codecs = this.groupIdToCodecsMap_.get(groupId);
      if (codecs) {
        const textStreamInfos = this.groupIdToStreamInfosMap_.get(groupId);
        if (textStreamInfos) {
          for (const textStreamInfo of textStreamInfos) {
            textStreamInfo.stream.codecs = codecs;
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
        goog.asserts.assert(
            streamInfo, 'Should always have a streamInfo for image');
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
  async createStreamInfosFromMediaTags_(mediaTags) {
    // Filter out subtitles and  media tags without uri.
    mediaTags = mediaTags.filter((tag) => {
      const uri = tag.getAttributeValue('URI') || '';
      const type = tag.getAttributeValue('TYPE');
      return type != 'SUBTITLES' && uri != '';
    });

    // Create stream info for each audio / video media tag.
    // Wait for the first stream info created, so that the start time is fetched
    // and can be reused.
    if (mediaTags.length) {
      await this.createStreamInfoFromMediaTag_(mediaTags[0]);
    }
    const promises = mediaTags.slice(1).map((tag) => {
      return this.createStreamInfoFromMediaTag_(tag);
    });
    await Promise.all(promises);
  }

  /**
   * @param {!Array.<!shaka.hls.Tag>} tags Variant tags from the playlist.
   * @return {!Promise.<!Array.<!shaka.extern.Variant>>}
   * @private
   */
  async createVariantsForTags_(tags) {
    // Create variants for each variant tag.
    const variantsPromises = tags.map(async (tag) => {
      const frameRate = tag.getAttributeValue('FRAME-RATE');
      const bandwidth = Number(tag.getAttributeValue('AVERAGE-BANDWIDTH')) ||
        Number(tag.getRequiredAttrValue('BANDWIDTH'));

      const resolution = tag.getAttributeValue('RESOLUTION');
      const [width, height] = resolution ? resolution.split('x') : [null, null];

      const videoRange = tag.getAttributeValue('VIDEO-RANGE');

      const streamInfos = await this.createStreamInfosForVariantTag_(tag,
          resolution, frameRate);

      if (streamInfos) {
        goog.asserts.assert(streamInfos.audio.length ||
            streamInfos.video.length, 'We should have created a stream!');

        return this.createVariants_(
            streamInfos.audio,
            streamInfos.video,
            bandwidth,
            width,
            height,
            frameRate,
            videoRange);
      }
      // We do not support AES-128 encryption with HLS yet. If the streamInfos
      // is null because of AES-128 encryption, do not create variants for that.
      return [];
    });

    const allVariants = await Promise.all(variantsPromises);
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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfos>}
   * @private
   */
  async createStreamInfosForVariantTag_(tag, resolution, frameRate) {
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
    } else if (res.video.length) {
      // There are associated video streams.  Assume this is audio.
      shaka.log.debug('Guessing audio-only.');
      type = ContentType.AUDIO;
    } else {
      shaka.log.debug('Guessing video-only.');
      type = ContentType.VIDEO;
    }

    let streamInfo;
    if (!ignoreStream) {
      streamInfo =
          await this.createStreamInfoFromVariantTag_(tag, allCodecs, type);
    }
    if (streamInfo) {
      res[streamInfo.stream.type] = [streamInfo];
    } else if (streamInfo === null) {
      // Triple-equals for undefined.
      shaka.log.debug('streamInfo is null');
      return null;
    }
    this.filterLegacyCodecs_(res);
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
   * Shaka recognizes the content types 'audio', 'video' and 'text'.
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
   * Filters out unsupported codec strings from an array of stream infos.
   * @param {shaka.hls.HlsParser.StreamInfos} streamInfos
   * @private
   */
  filterLegacyCodecs_(streamInfos) {
    for (const streamInfo of streamInfos.audio.concat(streamInfos.video)) {
      if (!streamInfo) {
        continue;
      }
      let codecs = streamInfo.stream.codecs.split(',');
      codecs = codecs.filter((codec) => {
        // mp4a.40.34 is a nonstandard codec string that is sometimes used in
        // HLS for legacy reasons.  It is not recognized by non-Apple MSE.
        // See https://bugs.chromium.org/p/chromium/issues/detail?id=489520
        // Therefore, ignore this codec string.
        return codec != 'mp4a.40.34';
      });
      streamInfo.stream.codecs = codecs.join(',');
    }
  }

  /**
   * @param {!Array.<shaka.hls.HlsParser.StreamInfo>} audioInfos
   * @param {!Array.<shaka.hls.HlsParser.StreamInfo>} videoInfos
   * @param {number} bandwidth
   * @param {?string} width
   * @param {?string} height
   * @param {?string} frameRate
   * @param {?string} videoRange
   * @return {!Array.<!shaka.extern.Variant>}
   * @private
   */
  createVariants_(
      audioInfos, videoInfos, bandwidth, width, height, frameRate, videoRange) {
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
        const videoStream = videoInfo ? videoInfo.stream : null;
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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async createStreamInfoFromMediaTag_(tag) {
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
    const streamInfo = await this.createStreamInfo_(
        verbatimMediaPlaylistUri, codecs, type, language, primary, name,
        channelsCount, /* closedCaptions= */ null, characteristics, forced,
        spatialAudio);
    if (this.groupIdToStreamInfosMap_.has(groupId)) {
      this.groupIdToStreamInfosMap_.get(groupId).push(streamInfo);
    } else {
      this.groupIdToStreamInfosMap_.set(groupId, [streamInfo]);
    }
    if (streamInfo == null) {
      return null;
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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfo>}
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

    const streamInfo = await this.createStreamInfo_(
        verbatimImagePlaylistUri, codecs, type, language, /* primary= */ false,
        name, /* channelsCount= */ null, /* closedCaptions= */ null,
        characteristics, /* forced= */ false, /* spatialAudio= */ false);
    if (streamInfo == null) {
      return null;
    }

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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async createStreamInfoFromVariantTag_(tag, allCodecs, type) {
    goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
        'Should only be called on variant tags!');
    const verbatimMediaPlaylistUri = this.variableSubstitution_(
        tag.getRequiredAttrValue('URI'), this.globalVariables_);

    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }

    const closedCaptions = this.getClosedCaptions_(tag, type);
    const codecs = shaka.util.ManifestParserUtils.guessCodecs(type, allCodecs);
    const streamInfo = await this.createStreamInfo_(verbatimMediaPlaylistUri,
        codecs, type, /* language= */ 'und', /* primary= */ false,
        /* name= */ null, /* channelcount= */ null, closedCaptions,
        /* characteristics= */ null, /* forced= */ false,
        /* spatialAudio= */ false);
    if (streamInfo == null) {
      return null;
    }
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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async createStreamInfo_(verbatimMediaPlaylistUri, codecs, type, language,
      primary, name, channelsCount, closedCaptions, characteristics, forced,
      spatialAudio) {
    // TODO: Refactor, too many parameters
    let absoluteMediaPlaylistUri = shaka.hls.Utils.constructAbsoluteUri(
        this.masterPlaylistUri_, verbatimMediaPlaylistUri);

    const response = await this.requestManifest_(absoluteMediaPlaylistUri);
    // Record the final URI after redirects.
    absoluteMediaPlaylistUri = response.uri;

    // Record the redirected, final URI of this media playlist when we parse it.
    /** @type {!shaka.hls.Playlist} */
    const playlist = this.manifestTextParser_.parsePlaylist(
        response.data, absoluteMediaPlaylistUri);

    return this.convertParsedPlaylistIntoStreamInfo_(playlist,
        verbatimMediaPlaylistUri, absoluteMediaPlaylistUri, codecs, type,
        language, primary, name, channelsCount, closedCaptions, characteristics,
        forced, spatialAudio);
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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfo>}
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
    /** @type {!Array.<shaka.extern.DrmInfo>}*/
    const drmInfos = [];
    const keyIds = new Set();

    // TODO: May still need changes to support key rotation.
    for (const drmTag of drmTags) {
      const method = drmTag.getRequiredAttrValue('METHOD');
      if (method != 'NONE') {
        encrypted = true;

        // We do not support AES-128 encryption with HLS yet. So, do not create
        // StreamInfo for the playlist encrypted with AES-128.
        // TODO: Remove the error message once we add support for AES-128.
        if (method == 'AES-128') {
          shaka.log.warning('Unsupported HLS Encryption', method);
          this.aesEncrypted_ = true;
          return null;
        }

        const keyFormat = drmTag.getRequiredAttrValue('KEYFORMAT');
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

    if (encrypted && !drmInfos.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_KEYFORMATS_NOT_SUPPORTED);
    }

    // MediaSource expects no codec strings combined with raw formats.
    if (shaka.media.MediaSourceEngine.RAW_FORMATS.includes(mimeType)) {
      codecs = '';
    }

    /** @type {!Map.<number, number>} */
    const mediaSequenceToStartTime = new Map();

    let segments;
    try {
      segments = this.createSegments_(verbatimMediaPlaylistUri,
          playlist, type, mimeType, mediaSequenceToStartTime, mediaVariables,
          codecs);
    } catch (error) {
      if (error.code == shaka.util.Error.Code.HLS_INTERNAL_SKIP_STREAM) {
        shaka.log.alwaysWarn('Skipping unsupported HLS stream',
            mimeType, verbatimMediaPlaylistUri);
        return null;
      }

      throw error;
    }

    const minTimestamp = segments[0].startTime;
    const lastEndTime = segments[segments.length - 1].endTime;
    /** @type {!shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(segments);

    const kind = (type == shaka.util.ManifestParserUtils.ContentType.TEXT) ?
        shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE : undefined;

    const roles = [];
    if (characteristics) {
      for (const characteristic of characteristics.split(',')) {
        roles.push(characteristic);
      }
    }

    const serverControlTag = shaka.hls.Utils.getFirstTagWithName(
        playlist.tags, 'EXT-X-SERVER-CONTROL');
    const canSkipSegments = serverControlTag ?
          serverControlTag.getAttribute('CAN-SKIP-UNTIL') != null : false;

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.globalId_++,
      originalId: name,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex,
      mimeType,
      codecs,
      kind,
      encrypted,
      drmInfos,
      keyIds,
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
      roles: roles,
      forced: forced,
      channelsCount,
      audioSamplingRate: null,
      spatialAudio: spatialAudio,
      closedCaptions,
      hdr: undefined,
      tilesLayout: undefined,
    };

    return {
      stream,
      verbatimMediaPlaylistUri,
      absoluteMediaPlaylistUri,
      minTimestamp,
      maxTimestamp: lastEndTime,
      mediaSequenceToStartTime,
      canSkipSegments,
    };
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
        this.minTargetDuration_ = Math.min(
            this.partialTargetDuration_, this.minTargetDuration_);
        // Get the server-recommended min distance from the live edge.
        const serverControlTag = shaka.hls.Utils.getFirstTagWithName(
            playlist.tags, 'EXT-X-SERVER-CONTROL');
        // Use 'PART-HOLD-BACK' as the presentation delay for low latency mode.
        this.lowLatencyPresentationDelay_ = serverControlTag ? Number(
            serverControlTag.getRequiredAttrValue('PART-HOLD-BACK')) : 0;
      } else {
        // For regular HLS, use the target duration of regular segments.
        this.minTargetDuration_ = Math.min(
            targetDuration, this.minTargetDuration_);
      }
      // 2. Update the longest target duration if need be to use as a
      // presentation delay later.
      this.maxTargetDuration_ = Math.max(
          targetDuration, this.maxTargetDuration_);
    }
  }

  /**
   * @private
   */
  createPresentationTimeline_() {
    if (this.isLive_()) {
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
        presentationDelay = this.maxTargetDuration_ * 3;
      }

      this.presentationTimeline_ = new shaka.media.PresentationTimeline(
      /* presentationStartTime= */ 0, /* delay= */ presentationDelay);
      this.presentationTimeline_.setStatic(false);
    } else {
      this.presentationTimeline_ = new shaka.media.PresentationTimeline(
      /* presentationStartTime= */ null, /* delay= */ 0);
      this.presentationTimeline_.setStatic(true);
    }

    this.notifySegments_();
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
   * @return {shaka.media.SegmentReference}
   * @private
   */
  createSegmentReference_(
      initSegmentReference, previousReference, hlsSegment, startTime,
      variables, absoluteMediaPlaylistUri, type) {
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
        const time = shaka.util.XmlUtils.parseDate(dateTimeTag.value);
        goog.asserts.assert(time != null,
            'EXT-X-PROGRAM-DATE-TIME format not valid');
        // Sync time offset is null on the first go-through. This indicates that
        // we have not yet seen every stream, and thus do not yet have enough
        // information to determine how to normalize the sync times.
        // For that first go-through, the sync time will be applied after the
        // references are all created. Until then, just offset by 0.
        syncTime = time + (this.syncTimeOffset_ || 0);
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
        const pDuration = Number(item.getAttributeValue('DURATION'));
        // A preload hinted partial segment doesn't have duration information,
        // so its startTime and endTime are the same.
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

        const partial = new shaka.media.SegmentReference(
            pStartTime,
            pEndTime,
            () => [pAbsoluteUri],
            pStartByte,
            pEndByte,
            initSegmentReference,
            /* timestampOffset= */ 0, // This value is ignored in sequence mode.
            /* appendWindowStart= */ 0,
            /* appendWindowEnd= */ Infinity);
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

  /** @private */
  notifySegments_() {
    // The presentation timeline may or may not be set yet.
    // If it does not yet exist, hold onto the segments until it does.
    if (!this.presentationTimeline_) {
      return;
    }
    for (const segments of this.segmentsToNotifyByStream_) {
      this.presentationTimeline_.notifySegments(segments);
    }
    this.segmentsToNotifyByStream_ = [];
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
   * @param {string} codecs
   * @return {!Array.<!shaka.media.SegmentReference>}
   * @private
   */
  createSegments_(verbatimMediaPlaylistUri, playlist, type, mimeType,
      mediaSequenceToStartTime, variables, codecs) {
    /** @type {Array.<!shaka.hls.Segment>} */
    const hlsSegments = playlist.segments;
    goog.asserts.assert(hlsSegments.length, 'Playlist should have segments!');

    /** @type {shaka.media.InitSegmentReference} */
    let initSegmentRef;

    // We may need to look at the media itself to determine a segment start
    // time.
    const mediaSequenceNumber = shaka.hls.Utils.getFirstTagWithNameAsNumber(
        playlist.tags, 'EXT-X-MEDIA-SEQUENCE', 0);
    const skipTag = shaka.hls.Utils.getFirstTagWithName(playlist.tags,
        'EXT-X-SKIP');
    const skippedSegments =
        skipTag ? Number(skipTag.getAttributeValue('SKIPPED-SEGMENTS')) : 0;
    let position = mediaSequenceNumber + skippedSegments;
    let firstStartTime = 0;

    // For live stream, use the cached value in the mediaSequenceToStartTime
    // map if available.
    if (this.isLive_() && mediaSequenceToStartTime.has(position)) {
      firstStartTime = mediaSequenceToStartTime.get(position);
    }

    const firstSegmentUri = hlsSegments[0].absoluteUri;
    shaka.log.debug('First segment', firstSegmentUri.split('/').pop(),
        'starts at', firstStartTime);

    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const references = [];

    for (let i = 0; i < hlsSegments.length; i++) {
      const item = hlsSegments[i];
      const previousReference = references[references.length - 1];
      const startTime =
          (i == 0) ? firstStartTime : previousReference.endTime;
      position = mediaSequenceNumber + skippedSegments + i;

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

      let reference = this.createSegmentReference_(
          initSegmentRef,
          previousReference,
          item,
          startTime,
          variables,
          playlist.absoluteUri,
          type);

      if (reference) {
        references.push(reference);
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
   * @param {!shaka.hls.Playlist} playlist
   * @param {!Map.<string, string>} variables
   * @return {!Promise.<string>}
   * @private
   */
  async guessMimeType_(contentType, codecs, playlist, variables) {
    const HlsParser = shaka.hls.HlsParser;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    goog.asserts.assert(playlist.segments.length,
        'Playlist should have segments!');
    const firstSegmentUri = this.variableSubstitution_(
        playlist.segments[0].absoluteUri, variables);

    const parsedUri = new goog.Uri(firstSegmentUri);
    const extension = parsedUri.getPath().split('.').pop();
    const map = HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_[contentType];

    const mimeType = map[extension];
    if (mimeType) {
      return mimeType;
    }

    if (contentType == ContentType.TEXT) {
      // The extension map didn't work.
      if (codecs == 'vtt' || codecs == 'wvtt') {
        // If codecs is 'vtt', it's WebVTT.
        return 'text/vtt';
      } else if (codecs && codecs !== '') {
        // Otherwise, assume MP4-embedded text, since text-based formats tend
        // not to have a codecs string at all.
        return 'application/mp4';
      }
    }

    if (contentType == ContentType.IMAGE) {
      if (!codecs || codecs == 'jpeg') {
        return 'image/jpeg';
      }
    }

    // If unable to guess mime type, request a segment and try getting it
    // from the response.
    const headRequest = shaka.net.NetworkingEngine.makeRequest(
        [firstSegmentUri], this.config_.retryParameters);
    headRequest.method = 'HEAD';

    const response = await this.makeNetworkRequest_(
        headRequest, requestType);

    const contentMimeType = response.headers['content-type'];

    if (!contentMimeType) {
      if (contentType == ContentType.TEXT) {
        // If there was no codecs string and no content-type, assume HLS text
        // streams are WebVTT.
        return 'text/vtt';
      }
      // If the HLS content is lacking in both MIME type metadata and
      // segment file extensions, we fall back to assuming it's MP4.
      const fallbackMimeType = map['mp4'];
      return fallbackMimeType;
    }

    // Split the MIME type in case the server sent additional parameters.
    return contentMimeType.split(';')[0];
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
   * @return {!Promise.<!shaka.extern.Response>}
   * @private
   */
  requestManifest_(absoluteUri) {
    const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const request = shaka.net.NetworkingEngine.makeRequest(
        [absoluteUri], this.config_.retryParameters);

    const format = shaka.util.CmcdManager.StreamingFormat.HLS;
    this.playerInterface_.modifyManifestRequest(request, {format: format});

    return this.makeNetworkRequest_(request, requestType);
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
        this.updatePlaylistDelay_ > 0,
        'We should only call |onUpdate_| when we are suppose to be updating.');

    // Detect a call to stop()
    if (!this.playerInterface_) {
      return;
    }

    try {
      await this.update();

      const delay = this.updatePlaylistDelay_;
      this.updatePlaylistTimer_.tickAfter(/* seconds= */ delay);
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
   * @return {!Promise.<shaka.extern.Response>}
   * @private
   */
  makeNetworkRequest_(request, type) {
    if (!this.operationManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    const op = this.playerInterface_.networkingEngine.request(type, request);
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

    /*
     * Even if we're not able to construct initData through the HLS tag, adding
     * a DRMInfo will allow DRM Engine to request a media key system access
     * with the correct keySystem and initDataType
     */
    const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
        'com.apple.fps', [
          {initDataType: 'sinf', initData: new Uint8Array(0)},
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
};


/**
 * @typedef {{
 *   stream: !shaka.extern.Stream,
 *   verbatimMediaPlaylistUri: string,
 *   absoluteMediaPlaylistUri: string,
 *   minTimestamp: number,
 *   maxTimestamp: number,
 *   mediaSequenceToStartTime: !Map.<number, number>,
 *   canSkipSegments: boolean
 * }}
 *
 * @description
 * Contains a stream and information about it.
 *
 * @property {!shaka.extern.Stream} stream
 *   The Stream itself.
 * @property {string} verbatimMediaPlaylistUri
 *   The verbatim media playlist URI, as it appeared in the master playlist.
 *   This has not been canonicalized into an absolute URI.  This gives us a
 *   consistent key for this playlist, even if redirects cause us to update
 *   from different origins each time.
 * @property {string} absoluteMediaPlaylistUri
 *   The absolute media playlist URI, resolved relative to the master playlist
 *   and updated to reflect any redirects.
 * @property {number} minTimestamp
 *   The minimum timestamp found in the stream.
 * @property {number} maxTimestamp
 *   The maximum timestamp found in the stream.
 * @property {!Map.<number, number>} mediaSequenceToStartTime
 *   A map of media sequence numbers to media start times.
 * @property {boolean} canSkipSegments
 *  True if the server supports delta playlist updates, and we can send a
 *  request for a playlist that can skip older media segments.
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

  // Raw formats:
  'aac': 'audio/aac',
  'ac3': 'audio/ac3',
  'ec3': 'audio/ec3',
  'mp3': 'audio/mpeg',
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

if (!shaka.util.Platform.isTizen3() &&
    !shaka.util.Platform.isTizen2() &&
    !shaka.util.Platform.isWebOS3()) {
  shaka.media.ManifestParser.registerParserByExtension(
      'm3u8', () => new shaka.hls.HlsParser());
  shaka.media.ManifestParser.registerParserByMime(
      'application/x-mpegurl', () => new shaka.hls.HlsParser());
  shaka.media.ManifestParser.registerParserByMime(
      'application/vnd.apple.mpegurl', () => new shaka.hls.HlsParser());
}
