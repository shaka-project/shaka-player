/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.hls.HlsParser');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.Deprecate');
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
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Networking');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.Timer');


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

    /**
     * A map from group id to stream infos created from the media tags.
     * @private {!Map.<string, !Array.<shaka.hls.HlsParser.StreamInfo>>}
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
     * createStreamInfoFromMediaTag_ and createStreamInfoFromVariantTag_.
     *
     * During parsing of updates, used by getStartTime_ to determine the start
     * time of the first segment from existing segment references.
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

    /** @private {?number} */
    this.playlistStartTime_ = null;
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

    const response = await this.requestManifest_(uri);

    // Record the master playlist URI after redirects.
    this.masterPlaylistUri_ = response.uri;

    goog.asserts.assert(response.data, 'Response data should be non-null!');
    await this.parseManifest_(response.data);

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
    // Reset the start time for the new media playlist.
    this.playlistStartTime_ = null;
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
    const response = await this.requestManifest_(manifestUri);

    /** @type {shaka.hls.Playlist} */
    const playlist = this.manifestTextParser_.parsePlaylist(
        response.data, response.uri);

    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    const mediaSequenceTag = shaka.hls.Utils.getFirstTagWithName(
        playlist.tags, 'EXT-X-MEDIA-SEQUENCE');

    const startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;
    const stream = streamInfo.stream;

    const segments = await this.createSegments_(
        streamInfo.verbatimMediaPlaylistUri, playlist, startPosition,
        stream.type, stream.mimeType, stream.codecs);

    stream.segmentIndex.replace(segments);

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
   * Parses the manifest.
   *
   * @param {BufferSource} data
   * @return {!Promise}
   * @private
   */
  async parseManifest_(data) {
    goog.asserts.assert(this.masterPlaylistUri_,
        'Master playlist URI must be set before calling parseManifest_!');

    const playlist = this.manifestTextParser_.parsePlaylist(
        data, this.masterPlaylistUri_);

    // We don't support directly providing a Media Playlist.
    // See the error code for details.
    if (playlist.type != shaka.hls.PlaylistType.MASTER) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_MASTER_PLAYLIST_NOT_PROVIDED);
    }

    const period = await this.createPeriod_(playlist.tags);

    // Make sure that the parser has not been destroyed.
    if (!this.playerInterface_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }

    if (this.aesEncrypted_ && period.variants.length == 0) {
      // We do not support AES-128 encryption with HLS yet. Variants is null
      // when the playlist is encrypted with AES-128.
      shaka.log.info('No stream is created, because we don\'t support AES-128',
          'encryption yet');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_AES_128_ENCRYPTION_NOT_SUPPORTED);
    }

    // HLS has no notion of periods.  We're treating the whole presentation as
    // one period.
    this.playerInterface_.filterAllPeriods([period]);

    // Find the min and max timestamp of the earliest segment in all streams.
    // Find the minimum duration of all streams as well.
    let minFirstTimestamp = Infinity;
    let maxLastTimestamp = 0;
    let minDuration = Infinity;

    for (const streamInfo of this.uriToStreamInfosMap_.values()) {
      minFirstTimestamp =
          Math.min(minFirstTimestamp, streamInfo.minTimestamp);
      maxLastTimestamp =
          Math.max(maxLastTimestamp, streamInfo.maxTimestamp);
      if (streamInfo.stream.type != 'text') {
        minDuration = Math.min(minDuration,
            streamInfo.maxTimestamp - streamInfo.minTimestamp);
      }
    }

    // This assert is our own sanity check.
    goog.asserts.assert(this.presentationTimeline_ == null,
        'Presentation timeline created early!');
    this.createPresentationTimeline_(maxLastTimestamp);

    // This assert satisfies the compiler that it is not null for the rest of
    // the method.
    goog.asserts.assert(this.presentationTimeline_,
        'Presentation timeline not created!');

    if (this.isLive_()) {
      // The HLS spec (RFC 8216) states in 6.3.4:
      // "the client MUST wait for at least the target duration before
      // attempting to reload the Playlist file again"
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
        // period-aligned times, so offset them all now.
        streamInfo.stream.segmentIndex.offset(-minFirstTimestamp);
        // Finally, fit the segments to the period duration.
        streamInfo.stream.segmentIndex.fit(minDuration);
      }
    }

    this.manifest_ = {
      presentationTimeline: this.presentationTimeline_,
      periods: [period],
      offlineSessionIds: [],
      minBufferTime: 0,
    };
  }

  /**
   * Parses the playlist tags and creates a Period object.
   *
   * @param {!Array.<!shaka.hls.Tag>} tags All tags from the playlist.
   * @return {!Promise.<!shaka.extern.Period>}
   * @private
   */
  async createPeriod_(tags) {
    const Utils = shaka.hls.Utils;
    /** @type {!Array.<!shaka.hls.Tag>} */
    const mediaTags = Utils.filterTagsByName(tags, 'EXT-X-MEDIA');
    /** @type {!Array.<!shaka.hls.Tag>} */
    const variantTags = Utils.filterTagsByName(tags, 'EXT-X-STREAM-INF');

    this.parseCodecs_(variantTags);

    // Parse audio and video media tags first, so that we can extract segment
    // start time from audio/video streams and reuse for text streams.
    await this.createStreamInfosFromMediaTags_(mediaTags);
    this.parseClosedCaptions_(mediaTags);
    const variants = await this.createVariantsForTags_(variantTags);
    const textStreams = await this.parseTexts_(mediaTags);

    return {
      startTime: 0,
      variants: variants,
      textStreams: textStreams,
    };
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
        const textCodecs = this.guessCodecsSafe_(ContentType.TEXT, allCodecs);
        goog.asserts.assert(textCodecs != null, 'Text codecs should be valid.');
        this.groupIdToCodecsMap_.set(subGroupId, textCodecs);
        shaka.util.ArrayUtils.remove(allCodecs, textCodecs);
      }
      if (audioGroupId) {
        const codecs = this.guessCodecs_(ContentType.AUDIO, allCodecs);
        this.groupIdToCodecsMap_.set(audioGroupId, codecs);
      }
      if (videoGroupId) {
        const codecs = this.guessCodecs_(ContentType.VIDEO, allCodecs);
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
      const bandwidth = Number(tag.getRequiredAttrValue('BANDWIDTH'));

      const resolution = tag.getAttributeValue('RESOLUTION');
      const [width, height] = resolution ? resolution.split('x') : [null, null];

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
            frameRate);
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
      return audio.verbatimMediaPlaylistUri == streamURI;
    });

    const videoCodecs = this.guessCodecsSafe_(ContentType.VIDEO, allCodecs);
    const hasVideoRelatedInfo = resolution || frameRate || videoCodecs;

    if (!streamInfos.length && allCodecs.length == 1 && !hasVideoRelatedInfo) {
      // There are no associated media tags, and there's only one codec, and no
      // video related information, so it should be audio.
      type = ContentType.AUDIO;
    } else if (!streamInfos.length && allCodecs.length > 1) {
      // There are multiple codecs, so assume multiplexed content.
      // Note that the default used when CODECS is missing assumes multiple
      // (and therefore multiplexed).
      // Recombine the codec strings into one so that MediaSource isn't
      // lied to later. (That would trigger an error in Chrome.)
      shaka.log.debug('Guessing multiplexed audio+video.');
      type = ContentType.VIDEO;
      allCodecs = [allCodecs.join(',')];
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
    // The video codec is H.264, with baseline profile and level 3.0.
    // http://blog.pearce.org.nz/2013/11/what-does-h264avc1-codecs-parameters.html
    // The audio codec is "low-complexity" AAC.
    const defaultCodecs = 'avc1.42E01E,mp4a.40.2';

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
      // https://github.com/google/shaka-player/issues/1817
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
   * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} audioInfos
   * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} videoInfos
   * @param {number} bandwidth
   * @param {?string} width
   * @param {?string} height
   * @param {?string} frameRate
   * @return {!Array.<!shaka.extern.Variant>}
   * @private
   */
  createVariants_(audioInfos, videoInfos, bandwidth, width, height, frameRate) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const DrmEngine = shaka.media.DrmEngine;

    for (const info of videoInfos) {
      this.addVideoAttributes_(info.stream, width, height, frameRate);
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
        const audioDrmInfos = audioInfo ? audioInfo.drmInfos : null;
        const videoDrmInfos = videoInfo ? videoInfo.drmInfos : null;
        const videoStreamUri =
        videoInfo ? videoInfo.verbatimMediaPlaylistUri : '';
        const audioStreamUri =
        audioInfo ? audioInfo.verbatimMediaPlaylistUri : '';
        const variantUriKey = videoStreamUri + ' - ' + audioStreamUri;

        let drmInfos;
        if (audioStream && videoStream) {
          if (DrmEngine.areDrmCompatible(audioDrmInfos, videoDrmInfos)) {
            drmInfos =
                DrmEngine.getCommonDrmInfos(audioDrmInfos, videoDrmInfos);
          } else {
            shaka.log.warning(
                'Incompatible DRM info in HLS variant.  Skipping.');
            continue;
          }
        } else if (audioStream) {
          drmInfos = audioDrmInfos;
        } else if (videoStream) {
          drmInfos = videoDrmInfos;
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
          bandwidth: bandwidth,
          drmInfos: drmInfos,
          allowedByApplication: true,
          allowedByKeySystem: true,
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

    const verbatimMediaPlaylistUri = tag.getRequiredAttrValue('URI');

    // Check if the stream has already been created as part of another Variant
    // and return it if it has.
    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }

    const language = this.getLanguage_(tag);
    const name = tag.getAttributeValue('NAME');
    const defaultAttr = tag.getAttribute('DEFAULT');
    const autoselectAttr = tag.getAttribute('AUTOSELECT');
    const primary = !!defaultAttr || !!autoselectAttr;
    const channelsCount = type == 'audio' ? this.getChannelsCount_(tag) : null;
    // TODO: Should we take into account some of the currently ignored
    // attributes: FORCED, INSTREAM-ID, CHARACTERISTICS? Attribute
    // descriptions: https://bit.ly/2lpjOhj
    const streamInfo = await this.createStreamInfo_(
        verbatimMediaPlaylistUri, codecs, type, language, primary, name,
        channelsCount, /* closedCaptions */ null);
    if (streamInfo == null) {
      return null;
    }

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
    const verbatimMediaPlaylistUri = tag.getRequiredAttrValue('URI');

    if (this.uriToStreamInfosMap_.has(verbatimMediaPlaylistUri)) {
      return this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
    }

    const closedCaptions = this.getClosedCaptions_(tag, type);
    const codecs = this.guessCodecs_(type, allCodecs);
    const streamInfo = await this.createStreamInfo_(verbatimMediaPlaylistUri,
        codecs, type, /* language */ 'und', /* primary */ false,
        /* name */ null, /* channelcount */ null, closedCaptions);
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
   * @return {!Promise.<?shaka.hls.HlsParser.StreamInfo>}
   * @private
   */
  async createStreamInfo_(verbatimMediaPlaylistUri, codecs, type, language,
      primary, name, channelsCount, closedCaptions) {
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

    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      // EXT-X-MEDIA tags should point to media playlists.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
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
    let keyId = null;

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

        const drmInfo = drmParser ? drmParser(drmTag) : null;
        if (drmInfo) {
          if (drmInfo.keyIds.length) {
            keyId = drmInfo.keyIds[0];
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


    goog.asserts.assert(playlist.segments != null,
        'Media playlist should have segments!');

    this.determinePresentationType_(playlist);

    /** @type {string} */
    const mimeType = await this.guessMimeType_(type, codecs, playlist);

    const mediaSequenceTag = shaka.hls.Utils.getFirstTagWithName(playlist.tags,
        'EXT-X-MEDIA-SEQUENCE');

    const startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;

    const segments = await this.createSegments_(verbatimMediaPlaylistUri,
        playlist, startPosition, type, mimeType, codecs);

    const minTimestamp = segments[0].startTime;
    const lastEndTime = segments[segments.length - 1].endTime;
    /** @type {!shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(segments);

    const kind = (type == shaka.util.ManifestParserUtils.ContentType.TEXT) ?
        shaka.util.ManifestParserUtils.TextStreamKind.SUBTITLE : undefined;

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.globalId_++,
      originalId: name,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: segmentIndex,
      mimeType: mimeType,
      codecs: codecs,
      kind: kind,
      encrypted: encrypted,
      keyId: keyId,
      language: language,
      label: name,  // For historical reasons, since before "originalId".
      type: type,
      primary: primary,
      // TODO: trick mode
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      frameRate: undefined,
      width: undefined,
      height: undefined,
      bandwidth: undefined,
      roles: [],
      channelsCount: channelsCount,
      audioSamplingRate: null,
      closedCaptions: closedCaptions,
    };

    return {
      stream: stream,
      drmInfos: drmInfos,
      verbatimMediaPlaylistUri: verbatimMediaPlaylistUri,
      absoluteMediaPlaylistUri: absoluteMediaPlaylistUri,
      minTimestamp: minTimestamp,
      maxTimestamp: lastEndTime,
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

      // According to the HLS spec, updates should not happen more often than
      // once in targetDuration.  It also requires us to only update the active
      // variant.  We might implement that later, but for now every variant
      // will be updated.  To get the update period, choose the smallest
      // targetDuration value across all playlists.

      // Update the longest target duration if need be to use as a presentation
      // delay later.
      this.maxTargetDuration_ = Math.max(
          targetDuration, this.maxTargetDuration_);
      // Update the shortest one to use as update period and segment
      // availability time (for LIVE).
      this.minTargetDuration_ = Math.min(
          targetDuration, this.minTargetDuration_);
    }
  }

  /**
   * @param {number} lastTimestamp
   * @private
   */
  createPresentationTimeline_(lastTimestamp) {
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
      // delay of 3 segments.  This will be the "live edge" of the
      // presentation.
      this.presentationTimeline_ = new shaka.media.PresentationTimeline(
      /* presentationStartTime */ 0, /* delay */ this.maxTargetDuration_ * 3);
      this.presentationTimeline_.setStatic(false);
    } else {
      this.presentationTimeline_ = new shaka.media.PresentationTimeline(
      /* presentationStartTime */ null, /* delay */ 0);
      this.presentationTimeline_.setStatic(true);
    }

    this.notifySegments_();

    // This asserts that the live edge is being calculated from segment times.
    // For VOD and event streams, this check should still pass.
    goog.asserts.assert(
        !this.presentationTimeline_.usingPresentationStartTime(),
        'We should not be using the presentation start time in HLS!');
  }


  /**
   * @param {!shaka.hls.Playlist} playlist
   * @return {shaka.media.InitSegmentReference}
   * @private
   */
  createInitSegmentReference_(playlist) {
    const mapTags =
        shaka.hls.Utils.filterTagsByName(playlist.tags, 'EXT-X-MAP');
    // TODO: Support multiple map tags?
    // For now, we don't support multiple map tags and will throw an error.
    if (!mapTags.length) {
      return null;
    } else if (mapTags.length > 1) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_MULTIPLE_MEDIA_INIT_SECTIONS_FOUND);
    }

    // Map tag example: #EXT-X-MAP:URI="main.mp4",BYTERANGE="720@0"
    const mapTag = mapTags[0];
    const verbatimInitSegmentUri = mapTag.getRequiredAttrValue('URI');
    const absoluteInitSegmentUri = shaka.hls.Utils.constructAbsoluteUri(
        playlist.absoluteUri, verbatimInitSegmentUri);

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

    return new shaka.media.InitSegmentReference(
        () => [absoluteInitSegmentUri],
        startByte,
        endByte);
  }

  /**
   * Parses one shaka.hls.Segment object into a shaka.media.SegmentReference.
   *
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {shaka.media.SegmentReference} previousReference
   * @param {!shaka.hls.Segment} hlsSegment
   * @param {number} position
   * @param {number} startTime
   * @return {!shaka.media.SegmentReference}
   * @private
   */
  createSegmentReference_(
      initSegmentReference, previousReference, hlsSegment, position,
      startTime) {
    const tags = hlsSegment.tags;
    const absoluteSegmentUri = hlsSegment.absoluteUri;

    const extinfTag = this.getRequiredTag_(tags, 'EXTINF');
    // The EXTINF tag format is '#EXTINF:<duration>,[<title>]'.
    // We're interested in the duration part.
    const extinfValues = extinfTag.value.split(',');
    const duration = Number(extinfValues[0]);
    const endTime = startTime + duration;

    let startByte = 0;
    let endByte = null;
    const byterange =
         shaka.hls.Utils.getFirstTagWithName(tags, 'EXT-X-BYTERANGE');

    // If BYTERANGE is not specified, the segment consists of the entire
    // resource.
    if (byterange) {
      const blocks = byterange.value.split('@');
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

    return new shaka.media.SegmentReference(
        position,
        startTime,
        endTime,
        () => [absoluteSegmentUri],
        startByte,
        endByte,
        initSegmentReference,
        /* presentationTimeOffset */ 0);
  }

  /** @private */
  notifySegments_() {
    // The presentation timeline may or may not be set yet.
    // If it does not yet exist, hold onto the segments until it does.
    if (!this.presentationTimeline_) {
      return;
    }
    for (const segments of this.segmentsToNotifyByStream_) {
      // HLS doesn't have separate periods.
      this.presentationTimeline_.notifySegments(segments, /* periodStart */ 0);
    }
    this.segmentsToNotifyByStream_ = [];
  }

  /**
   * Parses shaka.hls.Segment objects into shaka.media.SegmentReferences.
   *
   * @param {string} verbatimMediaPlaylistUri
   * @param {!shaka.hls.Playlist} playlist
   * @param {number} startPosition
   * @param {string} type
   * @param {string} mimeType
   * @param {string} codecs
   * @return {!Promise<!Array.<!shaka.media.SegmentReference>>}
   * @private
   */
  async createSegments_(verbatimMediaPlaylistUri, playlist, startPosition,
      type, mimeType, codecs) {
    /** @type {Array.<!shaka.hls.Segment>} */
    const hlsSegments = playlist.segments;
    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const references = [];

    const initSegmentRef = this.createInitSegmentReference_(playlist);

    goog.asserts.assert(hlsSegments.length, 'Playlist should have segments!');
    // We may need to look at the media itself to determine a segment start
    // time.
    const firstSegmentUri = hlsSegments[0].absoluteUri;
    const firstSegmentRef = this.createSegmentReference_(
        initSegmentRef,
        /* previousReference */ null,
        hlsSegments[0],
        startPosition,
        /* startTime, dummy value */ 0);

    const firstStartTime = await this.getPlaylistStartTime_(
        verbatimMediaPlaylistUri, initSegmentRef, firstSegmentRef, type,
        mimeType, codecs);
    shaka.log.debug('First segment', firstSegmentUri.split('/').pop(),
        'starts at', firstStartTime);
    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item} of enumerate(hlsSegments)) {
      const previousReference = references[references.length - 1];
      const startTime = (i == 0) ? firstStartTime : previousReference.endTime;
      const position = startPosition + i;

      const reference = this.createSegmentReference_(
          initSegmentRef,
          previousReference,
          item,
          position,
          startTime);
      references.push(reference);
    }

    this.segmentsToNotifyByStream_.push(references);
    this.notifySegments_();

    return references;
  }

  /**
   * Try to fetch a partial segment, and fall back to a full segment if we have
   * to.
   *
   * @param {!shaka.media.AnySegmentReference} reference
   * @param {boolean=} fullOnly
   * @return {!Promise.<shaka.extern.Response>}
   * @private
   */
  async fetchPartialSegment_(reference, fullOnly) {
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    // Create two requests:
    //  1. A partial request meant to fetch the smallest part of the segment
    //     required to get the time stamp.
    //  2. A full request meant as a fallback for when the server does not
    //     support partial requests.

    const partialRequest = shaka.util.Networking.createSegmentRequest(
        reference.getUris(),
        reference.startByte,
        reference.startByte + shaka.hls.HlsParser.PARTIAL_SEGMENT_SIZE_ - 1,
        this.config_.retryParameters);

    const fullRequest = shaka.util.Networking.createSegmentRequest(
        reference.getUris(),
        reference.startByte,
        reference.endByte,
        this.config_.retryParameters);

    if (fullOnly) {
      return this.makeNetworkRequest_(fullRequest, requestType);
    }

    // TODO(vaage): The need to do fall back requests is not likely to be unique
    //    to here. It would be nice if the fallback(s) could be included into
    //    the same abortable operation as the original request.
    //
    //    What would need to change with networking engine to support requests
    //    with fallback(s)?

    try {
      const response = await this.makeNetworkRequest_(
          partialRequest, requestType);

      return response;
    } catch (e) {
      // If the networking operation was aborted, we don't want to treat it as
      // a request failure. We surface the error so that the OPERATION_ABORTED
      // error will be handled correctly.
      if (e.code == shaka.util.Error.Code.OPERATION_ABORTED) {
        throw e;
      }

      // The partial request may fail for a number of reasons.
      // Some servers do not support Range requests, and others do not support
      // the OPTIONS request which must be made before any cross-origin Range
      // request.  Since this fallback is expensive, warn the app developer.
      shaka.log.alwaysWarn('Unable to fetch a partial HLS segment! ' +
                           'Falling back to a full segment request, ' +
                           'which is expensive!  Your server should ' +
                           'support Range requests and CORS preflights.',
      partialRequest.uris[0]);

      const response = await this.makeNetworkRequest_(fullRequest, requestType);

      return response;
    }
  }

  /**
   * Gets the start time of the first segment of the playlist from existing
   * value (if possible) or by downloading it and parsing it otherwise.
   *
   * @param {string} verbatimMediaPlaylistUri
   * @param {shaka.media.InitSegmentReference} initSegmentRef
   * @param {!shaka.media.SegmentReference} firstSegmentRef
   * @param {string} contentType
   * @param {string} mimeType
   * @param {string} codecs
   * @return {!Promise.<number>}
   * @throws {shaka.util.Error}
   * @private
   */
  async getPlaylistStartTime_(verbatimMediaPlaylistUri, initSegmentRef,
      firstSegmentRef, contentType, mimeType, codecs) {
    // For VOD and EVENT playlists, all variants must start at the same time, so
    // we can fetch the start time once and reuse for the others.
    // This is not guaranteed when updating a LIVE stream, we assume the first
    // segment in each live playlist is no more than one segment out of sync
    // with the other playlists, so we can fetch the start time for once.
    if (this.playlistStartTime_ == null) {
      goog.asserts.assert(
          contentType != shaka.util.ManifestParserUtils.ContentType.TEXT,
          'Should only get start time from audio or video streams');
      this.playlistStartTime_ = await this.getStartTime_(
          verbatimMediaPlaylistUri, initSegmentRef, firstSegmentRef,
          mimeType, codecs);
      shaka.log.debug('Fetched start time for', contentType);
    } else {
      shaka.log.debug('Reusing cached start time for', contentType);
    }
    return this.playlistStartTime_;
  }

  /**
   * Gets the start time of a segment from the existing manifest (if possible)
   * or by downloading it and parsing it otherwise.
   *
   * @param {string} verbatimMediaPlaylistUri
   * @param {shaka.media.InitSegmentReference} initSegmentRef
   * @param {!shaka.media.SegmentReference} segmentRef
   * @param {string} mimeType
   * @param {string} codecs
   * @return {!Promise.<number>}
   * @private
   */
  async getStartTime_(
      verbatimMediaPlaylistUri, initSegmentRef, segmentRef, mimeType, codecs) {
    // If we are updating the manifest, we can usually skip fetching the segment
    // by examining the references we already have.  This won't be possible if
    // there was some kind of lag or delay updating the manifest on the server,
    // in which extreme case we would fall back to fetching a segment.  This
    // allows us to both avoid fetching segments when possible, and recover from
    // certain server-side issues gracefully.
    if (this.manifest_) {
      const streamInfo =
          this.uriToStreamInfosMap_.get(verbatimMediaPlaylistUri);
      const segmentIndex = streamInfo.stream.segmentIndex;
      const reference = segmentIndex.get(segmentRef.position);
      if (reference) {
        // We found it!  Avoid fetching and parsing the segment.
        shaka.log.v1('Found segment start time in previous manifest');
        return reference.startTime;
      }

      shaka.log.debug(
          'Unable to find segment start time in previous manifest!');
    }

    // TODO: Introduce a new tag to extend HLS and provide the first segment's
    // start time.  This will avoid the need for these fetches in content
    // packaged with Shaka Packager.  This web-friendly extension to HLS can
    // then be proposed to Apple for inclusion in a future version of HLS.
    // See https://github.com/google/shaka-packager/issues/294

    shaka.log.v1('Fetching segment to find start time');

    if (mimeType == 'audio/mpeg') {
      // There is no standard way to embed timestamps in mp3 files, so the
      // start time is presumably 0.
      return 0;
    }

    if (mimeType == 'video/mp4' || mimeType == 'audio/mp4') {
      // We also need the init segment to get the correct timescale. But if the
      // stream is self-initializing, use the same response for both.
      const fetches = [this.fetchPartialSegment_(segmentRef)];

      if (initSegmentRef) {
        fetches.push(this.fetchPartialSegment_(initSegmentRef));
      }

      const responses = await Promise.all(fetches);

      // If the stream is self-initializing, use the main segment in-place of
      // the init segment.
      const segmentResponse = responses[0];
      const initSegmentResponse = responses[1] || responses[0];

      return this.getStartTimeFromMp4Segment_(
          segmentResponse.data, initSegmentResponse.data);
    }

    if (mimeType == 'video/mp2t') {
      const response = await this.fetchPartialSegment_(segmentRef);
      goog.asserts.assert(response.data, 'Should have a response body!');
      return this.getStartTimeFromTsSegment_(response.data);
    }

    if (mimeType == 'video/webm') {
      shaka.log.warning(
          'Hls+WebM combination is not supported at the moment. Skipping.');
      return null;
    }


    // TODO(vaage): Add support for additional formats.
    //   Formats:
    //    - WebM
    //    - AAC
    //
    //    Since we want to add more formats, how would a more general registry
    //    system work to allow additional formats to be "plugged-into" the
    //    parser.

    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_COULD_NOT_PARSE_SEGMENT_START_TIME);
  }

  /**
   * Parses an mp4 segment to get its start time.
   *
   * @param {BufferSource} mediaData
   * @param {BufferSource} initData
   * @return {number}
   * @private
   */
  getStartTimeFromMp4Segment_(mediaData, initData) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let timescale = 0;
    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'MDHD version can only be 0 or 1');

          // Skip "creation_time" and "modification_time".
          // They are 4 bytes each if the mdhd box is version 0, 8 bytes each
          // if it is version 1.
          box.reader.skip(box.version == 0 ? 8 : 16);

          timescale = box.reader.readUint32();
          box.parser.stop();
        }).parse(initData, true /* partialOkay */);

    if (!timescale) {
      shaka.log.error('Unable to find timescale in init segment!');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_COULD_NOT_PARSE_SEGMENT_START_TIME);
    }

    let startTime = 0;
    let parsedMedia = false;
    new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'TFDT version can only be 0 or 1');
          const baseTime = (box.version == 0) ?
          box.reader.readUint32() :
          box.reader.readUint64();
          startTime = baseTime / timescale;
          parsedMedia = true;
          box.parser.stop();
        }).parse(mediaData, true /* partialOkay */);

    if (!parsedMedia) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_COULD_NOT_PARSE_SEGMENT_START_TIME);
    }
    return startTime;
  }

  /**
   * Parses a TS segment to get its start time.
   *
   * @param {BufferSource} data
   * @return {number}
   * @private
   */
  getStartTimeFromTsSegment_(data) {
    const reader = new shaka.util.DataViewReader(
        data, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    const fail = () => {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_COULD_NOT_PARSE_SEGMENT_START_TIME);
    };

    let packetStart = 0;
    let syncByte = 0;

    const skipPacket = () => {
      // 188-byte packets are standard, so assume that.
      reader.seek(packetStart + 188);
      syncByte = reader.readUint8();
      if (syncByte != 0x47) {
        // We haven't found the sync byte, so try it as a 192-byte packet.
        reader.seek(packetStart + 192);
        syncByte = reader.readUint8();
      }
      if (syncByte != 0x47) {
        // We still haven't found the sync byte, so try as a 204-byte packet.
        reader.seek(packetStart + 204);
        syncByte = reader.readUint8();
      }
      if (syncByte != 0x47) {
        // We still haven't found the sync byte, so the packet was of a
        // non-standard size.
        fail();
      }
      // Put the sync byte back so we can read it in the next loop.
      reader.rewind(1);
    };

    // TODO: refactor this while loop for better readability.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Format reference: https://bit.ly/TsPacket
      packetStart = reader.getPosition();

      syncByte = reader.readUint8();
      if (syncByte != 0x47) {
        fail();
      }

      const flagsAndPacketId = reader.readUint16();
      const hasPesPacket = flagsAndPacketId & 0x4000;
      if (!hasPesPacket) {
        fail();
      }

      const flags = reader.readUint8();
      const adaptationFieldControl = (flags & 0x30) >> 4;
      if (adaptationFieldControl == 0 /* reserved */ ||
          adaptationFieldControl == 2 /* adaptation field, no payload */) {
        fail();
      }

      if (adaptationFieldControl == 3) {
        // Skip over adaptation field.
        const length = reader.readUint8();
        reader.skip(length);
      }

      // Now we come to the PES header (hopefully).
      // Format reference: https://bit.ly/TsPES
      const startCode = reader.readUint32();
      const startCodePrefix = startCode >> 8;
      if (startCodePrefix != 1) {
        // Not a PES packet yet.  Skip this TS packet and try again.
        skipPacket();
        continue;
      }

      // Skip the 16-bit PES length and the first 8 bits of the optional header.
      reader.skip(3);
      // The next 8 bits contain flags about DTS & PTS.
      const ptsDtsIndicator = reader.readUint8() >> 6;
      if (ptsDtsIndicator == 0 /* no timestamp */ ||
          ptsDtsIndicator == 1 /* forbidden */) {
        fail();
      }

      const pesHeaderLengthRemaining = reader.readUint8();
      if (pesHeaderLengthRemaining == 0) {
        fail();
      }

      if (ptsDtsIndicator == 2 /* PTS only */) {
        goog.asserts.assert(pesHeaderLengthRemaining == 5, 'Bad PES header?');
      } else if (ptsDtsIndicator == 3 /* PTS and DTS */) {
        goog.asserts.assert(pesHeaderLengthRemaining == 10, 'Bad PES header?');
      }

      const pts0 = reader.readUint8();
      const pts1 = reader.readUint16();
      const pts2 = reader.readUint16();
      // Reconstruct 33-bit PTS from the 5-byte, padded structure.
      const ptsHigh3 = (pts0 & 0x0e) >> 1;
      const ptsLow30 = ((pts1 & 0xfffe) << 14) | ((pts2 & 0xfffe) >> 1);
      // Reconstruct the PTS as a float.  Avoid bitwise operations to combine
      // because bitwise ops treat the values as 32-bit ints.
      const pts = ptsHigh3 * (1 << 30) + ptsLow30;
      return pts / shaka.hls.HlsParser.TS_TIMESCALE_;
    }
  }

  /**
   * Attempts to guess which codecs from the codecs list belong to a given
   * content type.
   * Assumes that at least one codec is correct, and throws if none are.
   *
   * @param {string} contentType
   * @param {!Array.<string>} codecs
   * @return {string}
   * @private
   */
  guessCodecs_(contentType, codecs) {
    if (codecs.length == 1) {
      return codecs[0];
    }

    const match = this.guessCodecsSafe_(contentType, codecs);
    // A failure is specifically denoted by null; an empty string represents a
    // valid match of no codec.
    if (match != null) {
      return match;
    }

    // Unable to guess codecs.
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_COULD_NOT_GUESS_CODECS,
        codecs);
  }

  /**
   * Attempts to guess which codecs from the codecs list belong to a given
   * content type. Does not assume a single codec is anything special, and does
   * not throw if it fails to match.
   *
   * @param {string} contentType
   * @param {!Array.<string>} codecs
   * @return {?string} or null if no match is found
   * @private
   */
  guessCodecsSafe_(contentType, codecs) {
    const formats =
        shaka.hls.HlsParser.CODEC_REGEXPS_BY_CONTENT_TYPE_[contentType];
    for (const format of formats) {
      for (const codec of codecs) {
        if (format.test(codec.trim())) {
          return codec.trim();
        }
      }
    }

    // Text does not require a codec string.
    if (contentType == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      return '';
    }

    return null;
  }

  /**
   * Attempts to guess stream's mime type based on content type and URI.
   *
   * @param {string} contentType
   * @param {string} codecs
   * @param {!shaka.hls.Playlist} playlist
   * @return {!Promise.<string>}
   * @private
   */
  async guessMimeType_(contentType, codecs, playlist) {
    const HlsParser = shaka.hls.HlsParser;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    goog.asserts.assert(playlist.segments.length,
        'Playlist should have segments!');
    const firstSegmentUri = playlist.segments[0].absoluteUri;

    const parsedUri = new goog.Uri(firstSegmentUri);
    const extension = parsedUri.getPath().split('.').pop();
    const map = HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_[contentType];

    const mimeType = map[extension];
    if (mimeType) {
      return mimeType;
    }

    if (contentType == ContentType.TEXT) {
      // The extension map didn't work.
      if (!codecs || codecs == 'vtt') {
        // If codecs is 'vtt', it's WebVTT.
        // If there was no codecs string, assume HLS text streams are WebVTT.
        return 'text/vtt';
      } else {
        // Otherwise, assume MP4-embedded text, since text-based formats tend
        // not to have a codecs string at all.
        return 'application/mp4';
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
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_COULD_NOT_GUESS_MIME_TYPE,
          extension);
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
   * @private
   */
  addVideoAttributes_(stream, width, height, frameRate) {
    if (stream) {
      stream.width = Number(width) || undefined;
      stream.height = Number(height) || undefined;
      stream.frameRate = Number(frameRate) || undefined;
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
   * @return {?shaka.extern.DrmInfo}
   * @private
   */
  static widevineDrmParser_(drmTag) {
    const method = drmTag.getRequiredAttrValue('METHOD');
    shaka.Deprecate.deprecateFeature(
        2, 6,
        'HLS SAMPLE-AES-CENC',
        'SAMPLE-AES-CENC will no longer be supported, see Issue #1227');
    const VALID_METHODS = ['SAMPLE-AES', 'SAMPLE-AES-CTR', 'SAMPLE-AES-CENC'];
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
      // This value should begin with '0x':
      goog.asserts.assert(keyId.startsWith('0x'), 'Incorrect KEYID format!');
      // But the output should not contain the '0x':
      drmInfo.keyIds = [keyId.substr(2).toLowerCase()];
    }
    return drmInfo;
  }
};


/**
 * @typedef {{
 *   stream: !shaka.extern.Stream,
 *   drmInfos: !Array.<shaka.extern.DrmInfo>,
 *   verbatimMediaPlaylistUri: string,
 *   absoluteMediaPlaylistUri: string,
 *   minTimestamp: number,
 *   maxTimestamp: number
 * }}
 *
 * @description
 * Contains a stream and information about it.
 *
 * @property {!shaka.extern.Stream} stream
 *   The Stream itself.
 * @property {!Array.<shaka.extern.DrmInfo>} drmInfos
 *   DrmInfos of the stream.  There may be multiple for multi-DRM content.
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
 * A list of regexps to detect well-known video codecs.
 *
 * @const {!Array.<!RegExp>}
 * @private
 */
shaka.hls.HlsParser.VIDEO_CODEC_REGEXPS_ = [
  /^avc/,
  /^hev/,
  /^hvc/,
  /^vp0?[89]/,
  /^av1$/,
];


/**
 * A list of regexps to detect well-known audio codecs.
 *
 * @const {!Array.<!RegExp>}
 * @private
 */
shaka.hls.HlsParser.AUDIO_CODEC_REGEXPS_ = [
  /^vorbis$/,
  /^opus$/,
  /^flac$/,
  /^mp4a/,
  /^[ae]c-3$/,
];


/**
 * A list of regexps to detect well-known text codecs.
 *
 * @const {!Array.<!RegExp>}
 * @private
 */
shaka.hls.HlsParser.TEXT_CODEC_REGEXPS_ = [
  /^vtt$/,
  /^wvtt/,
  /^stpp/,
];


/**
 * @const {!Object.<string, !Array.<!RegExp>>}
 * @private
 */
shaka.hls.HlsParser.CODEC_REGEXPS_BY_CONTENT_TYPE_ = {
  'audio': shaka.hls.HlsParser.AUDIO_CODEC_REGEXPS_,
  'video': shaka.hls.HlsParser.VIDEO_CODEC_REGEXPS_,
  'text': shaka.hls.HlsParser.TEXT_CODEC_REGEXPS_,
};


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'audio/mp4',
  'm4s': 'audio/mp4',
  'm4i': 'audio/mp4',
  'm4a': 'audio/mp4',
  // MPEG2-TS also uses video/ for audio: https://bit.ly/TsMse
  'ts': 'video/mp2t',
};


/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.hls.HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'video/mp4',
  'm4s': 'video/mp4',
  'm4i': 'video/mp4',
  'm4v': 'video/mp4',
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
  'vtt': 'text/vtt',
  'ttml': 'application/ttml+xml',
};


/**
 * @const {!Object.<string, !Object.<string, string>>}
 * @private
 */
shaka.hls.HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_ = {
  'audio': shaka.hls.HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES_,
  'video': shaka.hls.HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES_,
  'text': shaka.hls.HlsParser.TEXT_EXTENSIONS_TO_MIME_TYPES_,
};


/**
 * @typedef {function(!shaka.hls.Tag):?shaka.extern.DrmInfo}
 * @private
 */
shaka.hls.HlsParser.DrmParser_;


/**
 * @const {!Object.<string, shaka.hls.HlsParser.DrmParser_>}
 * @private
 */
shaka.hls.HlsParser.KEYFORMATS_TO_DRM_PARSERS_ = {
  /* TODO: https://github.com/google/shaka-player/issues/382
  'com.apple.streamingkeydelivery':
      shaka.hls.HlsParser.fairplayDrmParser_,
  */
  'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed':
      shaka.hls.HlsParser.widevineDrmParser_,
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


/**
 * @const {number}
 * @private
 */
shaka.hls.HlsParser.TS_TIMESCALE_ = 90000;


/**
 * The amount of data from the start of a segment we will try to fetch when we
 * need to know the segment start time.  This allows us to avoid fetching the
 * entire segment in many cases.
 *
 * @const {number}
 * @private
 */
shaka.hls.HlsParser.PARTIAL_SEGMENT_SIZE_ = 2048;


shaka.media.ManifestParser.registerParserByExtension(
    'm3u8', shaka.hls.HlsParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/x-mpegurl', shaka.hls.HlsParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/vnd.apple.mpegurl', shaka.hls.HlsParser);
