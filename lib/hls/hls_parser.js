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
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Parser');



/**
 * Creates a new HLS parser.
 *
 * @struct
 * @constructor
 * @implements {shakaExtern.ManifestParser}
 * @export
 */
shaka.hls.HlsParser = function() {
  /** @private {?shakaExtern.ManifestParser.PlayerInterface} */
  this.playerInterface_ = null;

  /** @private {?shakaExtern.ManifestConfiguration} */
  this.config_ = null;

  /** @private {number} */
  this.globalId_ = 1;

  /**
   * TODO: this is now only used for text codec detection, try to remove
   * @private {!Object.<number, shaka.hls.HlsParser.StreamInfo>}
   */
  this.mediaTagsToStreamInfosMap_ = {};

  /**
   * The key is a string of the form "<VIDEO URI> - <AUDIO URI>".
   * TODO: should use original, resolved URIs, before redirects
   * @private {!Object.<string, shakaExtern.Variant>}
   */
  this.urisToVariantsMap_ = {};

  /** @private {!Object.<number, !shaka.media.SegmentIndex>} */
  this.streamsToIndexMap_ = {};

  /**
   * A map from media playlists' uris to stream infos
   * representing the playlists.
   * TODO: should use original, resolved URIs, before redirects
   * @private {!Object.<string, shaka.hls.HlsParser.StreamInfo>}
   */
  this.uriToStreamInfosMap_ = {};

  /** @private {?shaka.media.PresentationTimeline} */
  this.presentationTimeline_ = null;

  /**
   * TODO: should be resolved, post-redirect URI, so that media playlist URIs
   * respect master playlist redirects
   * @private {string}
   */
  this.manifestUri_ = '';

  /** @private {shaka.hls.ManifestTextParser} */
  this.manifestTextParser_ = new shaka.hls.ManifestTextParser();

  /**
   * The update period in seconds; or null for no updates.
   * @private {?number}
   */
  this.updatePeriod_ = null;

  /** @private {?number} */
  this.updateTimer_ = null;

  /** @private {shaka.hls.HlsParser.PresentationType_} */
  this.presentationType_ = shaka.hls.HlsParser.PresentationType_.VOD;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /** @private {number} */
  this.maxTargetDuration_ = 0;

  /** @private {number} */
  this.minTargetDuration_ = Infinity;
};


/**
 * @typedef {{
 *   stream: !shakaExtern.Stream,
 *   segmentIndex: !shaka.media.SegmentIndex,
 *   drmInfos: !Array.<shakaExtern.DrmInfo>,
 *   relativeUri: string,
 *   minTimestamp: number,
 *   maxTimestamp: number,
 *   duration: number
 * }}
 *
 * @description
 * Contains a stream and information about it.
 *
 * @property {!shakaExtern.Stream} stream
 *   The Stream itself.
 * @property {!shaka.media.SegmentIndex} segmentIndex
 *   SegmentIndex of the stream.
 * @property {!Array.<shakaExtern.DrmInfo>} drmInfos
 *   DrmInfos of the stream.  There may be multiple for multi-DRM content.
 * @property {string} relativeUri
 *   The uri associated with the stream, relative to the manifest.
 * @property {number} minTimestamp
 *   The minimum timestamp found in the stream.
 * @property {number} maxTimestamp
 *   The maximum timestamp found in the stream.
 * @property {number} duration
 *   The duration of the playlist.  Used for VOD only.
 */
shaka.hls.HlsParser.StreamInfo;


/**
 * @override
 * @exportInterface
 */
shaka.hls.HlsParser.prototype.configure = function(config) {
  this.config_ = config;
};


/**
 * @override
 * @exportInterface
 */
shaka.hls.HlsParser.prototype.start = function(uri, playerInterface) {
  goog.asserts.assert(this.config_, 'Must call configure() before start()!');
  this.playerInterface_ = playerInterface;
  this.manifestUri_ = uri;
  return this.requestManifest_(uri).then(function(response) {
    return this.parseManifest_(response.data, uri).then(function() {
      this.setUpdateTimer_(this.updatePeriod_);
      return this.manifest_;
    }.bind(this));
  }.bind(this));
};


/**
 * @override
 * @exportInterface
 */
shaka.hls.HlsParser.prototype.stop = function() {
  this.playerInterface_ = null;
  this.config_ = null;
  this.mediaTagsToStreamInfosMap_ = {};
  this.urisToVariantsMap_ = {};
  this.manifest_ = null;

  return Promise.resolve();
};


/**
 * @override
 * @exportInterface
 */
shaka.hls.HlsParser.prototype.update = function() {
  if (!this.isLive_())
    return;

  var promises = [];
  for (var uri in this.uriToStreamInfosMap_) {
    var streamInfo = this.uriToStreamInfosMap_[uri];

    promises.push(this.updateStream_(streamInfo, uri));
  }

  return Promise.all(promises);
};


/**
 * Updates a stream.
 *
 * @param {!shaka.hls.HlsParser.StreamInfo} streamInfo
 * @param {string} uri
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.updateStream_ = function(streamInfo, uri) {
  this.requestManifest_(uri).then(function(response) {
    var Utils = shaka.hls.Utils;
    var PresentationType = shaka.hls.HlsParser.PresentationType_;
    var playlist = this.manifestTextParser_.parsePlaylist(response.data, uri);
    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    var mediaSequenceTag = Utils.getFirstTagWithName(playlist.tags,
                                                     'EXT-X-MEDIA-SEQUENCE');

    var startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;
    var stream = streamInfo.stream;
    this.createSegments_(playlist, startPosition,
                         stream.mimeType, stream.codecs)
        .then(function(segments) {
          streamInfo.segmentIndex.replace(segments);

          var newestSegment = segments[segments.length - 1];
          goog.asserts.assert(newestSegment, 'Should have segments!');

          // Once the last segment has been added to the playlist,
          // #EXT-X-ENDLIST tag will be appended.
          // If that happened, treat the rest of the EVENT presentation
          // as VOD.
          var endListTag = Utils.getFirstTagWithName(playlist.tags,
                                                     'EXT-X-ENDLIST');
          if (endListTag) {
            // Convert the presentation to VOD and set the duration to the last
            // segment's end time.
            this.setPresentationType_(PresentationType.VOD);
            this.presentationTimeline_.setDuration(newestSegment.endTime);
          }
        }.bind(this));
  }.bind(this));
};


/**
 * @override
 * @exportInterface
 */
shaka.hls.HlsParser.prototype.onExpirationUpdated = function(
    sessionId, expiration) {
  // No-op
};


/**
 * Parses the manifest.
 *
 * @param {!ArrayBuffer} data
 * @param {string} uri
 * @throws shaka.util.Error When there is a parsing error.
 * @return {!Promise}
 * @private
 */
shaka.hls.HlsParser.prototype.parseManifest_ = function(data, uri) {
  var playlist = this.manifestTextParser_.parsePlaylist(data, uri);

  // We don't support directly providing a Media Playlist.
  // See error code for details.
  if (playlist.type != shaka.hls.PlaylistType.MASTER) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_MASTER_PLAYLIST_NOT_PROVIDED);
  }

  return this.createPeriod_(playlist).then(function(period) {
    // HLS has no notion of periods. We're treating the whole presentation as
    // one period.
    this.playerInterface_.filterAllPeriods([period]);

    // Find the min and max timestamp of the earliest segment in all streams.
    // Find the minimum duration of all streams as well.
    var minFirstTimestamp = Infinity;
    var maxFirstTimestamp = 0;
    var maxLastTimestamp = 0;
    var minDuration = Infinity;

    for (var uri in this.uriToStreamInfosMap_) {
      var streamInfo = this.uriToStreamInfosMap_[uri];
      minFirstTimestamp =
          Math.min(minFirstTimestamp, streamInfo.minTimestamp);
      maxFirstTimestamp =
          Math.max(maxFirstTimestamp, streamInfo.minTimestamp);
      maxLastTimestamp =
          Math.max(maxLastTimestamp, streamInfo.maxTimestamp);
      if (streamInfo.stream.type != 'text')
        minDuration = Math.min(minDuration, streamInfo.duration);
    }

    goog.asserts.assert(this.presentationTimeline_ == null,
                        'Presentation timeline created early!');
    this.createPresentationTimeline_(maxLastTimestamp);

    if (this.isLive_()) {
      // The HLS spec (RFC 8216) states in 6.3.3:
      //
      // "The client SHALL choose which Media Segment to play first ... the
      // client SHOULD NOT choose a segment that starts less than three target
      // durations from the end of the Playlist file.  Doing so can trigger
      // playback stalls."
      //
      // We accomplish this in our DASH-y model by setting a presentation delay
      // of 3 segments.  This will be the "live edge" of the presentation.
      var threeSegmentDurations = this.maxTargetDuration_ * 3;
      this.presentationTimeline_.setDelay(threeSegmentDurations);

      // The HLS spec (RFC 8216) states in 6.3.4:
      // "the client MUST wait for at least the target duration before
      // attempting to reload the Playlist file again"
      this.updatePeriod_ = this.minTargetDuration_;

      // The spec says nothing much about seeking, but Safari's built-in HLS
      // implementation does not allow it.  Therefore we will set the
      // availability window equal to the presentation delay.  The player will
      // be able to buffer ahead three segments, but the seek window will be
      // zero-sized.
      var PresentationType = shaka.hls.HlsParser.PresentationType_;
      if (this.presentationType_ == PresentationType.LIVE) {
        this.presentationTimeline_.setSegmentAvailabilityDuration(
            threeSegmentDurations);
      }

      var rolloverSeconds =
          shaka.hls.HlsParser.TS_ROLLOVER_ / shaka.hls.HlsParser.TS_TIMESCALE_;
      var offset = 0;
      while (maxFirstTimestamp >= rolloverSeconds) {
        offset += rolloverSeconds;
        maxFirstTimestamp -= rolloverSeconds;
      }
      if (offset) {
        shaka.log.debug('Offsetting live streams by', offset,
                        'to compensate for rollover');

        for (var uri in this.uriToStreamInfosMap_) {
          var streamInfo = this.uriToStreamInfosMap_[uri];
          if (streamInfo.minTimestamp < rolloverSeconds) {
            shaka.log.v1('Offset applied to', streamInfo.stream.type);
            // This is the offset that StreamingEngine must apply to align the
            // actual segment times with the period.
            streamInfo.stream.presentationTimeOffset = -offset;
            // The segments were created with actual media times, rather than
            // period-aligned times, so offset them all to period time.
            streamInfo.segmentIndex.offset(offset);
          } else {
            shaka.log.v1('Offset NOT applied to', streamInfo.stream.type);
          }
        }
      }
    } else {
      // For VOD/EVENT content, offset everything back to 0.
      // Use the minimum timestamp as the offset for all streams.
      // Use the minimum duration as the presentation duration.
      this.presentationTimeline_.setDuration(minDuration);

      for (var uri in this.uriToStreamInfosMap_) {
        var streamInfo = this.uriToStreamInfosMap_[uri];
        // This is the offset that StreamingEngine must apply to align the
        // actual segment times with the period.
        streamInfo.stream.presentationTimeOffset = minFirstTimestamp;
        // The segments were created with actual media times, rather than
        // period-aligned times, so offset them all now.
        streamInfo.segmentIndex.offset(-minFirstTimestamp);
        // Finally, fit the segments to the period duration.
        streamInfo.segmentIndex.fit(minDuration);
      }
    }

    this.manifest_ = {
      presentationTimeline: this.presentationTimeline_,
      periods: [period],
      offlineSessionIds: [],
      minBufferTime: 0
    };
  }.bind(this));
};


/**
 * Parses a playlist into a Period object.
 *
 * @param {!shaka.hls.Playlist} playlist
 * @return {!Promise.<!shakaExtern.Period>}
 * @private
 */
shaka.hls.HlsParser.prototype.createPeriod_ = function(playlist) {
  var Utils = shaka.hls.Utils;
  var Functional = shaka.util.Functional;
  var tags = playlist.tags;

  var mediaTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-MEDIA');
  var textStreamTags = mediaTags.filter(function(tag) {
    var type = shaka.hls.HlsParser.getRequiredAttributeValue_(tag, 'TYPE');
    return type == 'SUBTITLES';
  }.bind(this));

  // TODO: CLOSED-CAPTIONS requires the parsing of CEA-608 from the video.
  var textStreamPromises = textStreamTags.map(function(tag) {
    return this.createTextStream_(tag, playlist);
  }.bind(this));

  return Promise.all(textStreamPromises).then(function(textStreams) {
    // Create Variants for every 'EXT-X-STREAM-INF' tag.  Do this after text
    // streams have been created, so that we can push text codecs found on the
    // variant tag back into the created text streams.
    var variantTags = Utils.filterTagsByName(tags, 'EXT-X-STREAM-INF');
    var variantsPromises = variantTags.map(function(tag) {
      return this.createVariantsForTag_(tag, playlist);
    }.bind(this));

    return Promise.all(variantsPromises).then(function(allVariants) {
      var variants = allVariants.reduce(Functional.collapseArrays, []);
      return {
        startTime: 0,
        variants: variants,
        textStreams: textStreams
      };
    }.bind(this));
  }.bind(this));
};


/**
 * @param {!shaka.hls.Tag} tag
 * @param {!shaka.hls.Playlist} playlist
 * @return {!Promise.<!Array.<!shakaExtern.Variant>>}
 * @private
 */
shaka.hls.HlsParser.prototype.createVariantsForTag_ = function(tag, playlist) {
  goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
                      'Should only be called on variant tags!');
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var HlsParser = shaka.hls.HlsParser;
  var Utils = shaka.hls.Utils;

  // These are the default codecs to assume if none are specified.
  //
  // The video codec is H.264, with baseline profile and level 3.0.
  // http://blog.pearce.org.nz/2013/11/what-does-h264avc1-codecs-parameters.html
  //
  // The audio codec is "low-complexity" AAC.
  var defaultCodecs = 'avc1.42E01E,mp4a.40.2';

  /** @type {!Array.<string>} */
  var codecs = tag.getAttributeValue('CODECS', defaultCodecs).split(',');
  var resolutionAttr = tag.getAttribute('RESOLUTION');
  var width = null;
  var height = null;
  var frameRate = tag.getAttributeValue('FRAME-RATE');
  var bandwidth =
      Number(HlsParser.getRequiredAttributeValue_(tag, 'BANDWIDTH'));

  if (resolutionAttr) {
    var resBlocks = resolutionAttr.value.split('x');
    width = resBlocks[0];
    height = resBlocks[1];
  }

  // After filtering, this is a list of the media tags we will process to
  // combine with the variant tag (EXT-X-STREAM-INF) we are working on.
  var mediaTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-MEDIA');

  var audioGroupId = tag.getAttributeValue('AUDIO');
  var videoGroupId = tag.getAttributeValue('VIDEO');
  goog.asserts.assert(audioGroupId == null || videoGroupId == null,
      'Unexpected: both video and audio described by media tags!');

  // Find any associated audio or video groups and create streams for them.
  if (audioGroupId) {
    mediaTags = Utils.findMediaTags(mediaTags, 'AUDIO', audioGroupId);
  } else if (videoGroupId) {
    mediaTags = Utils.findMediaTags(mediaTags, 'VIDEO', videoGroupId);
  }

  // There may be a codec string for the text stream.  We should identify it,
  // add it to the appropriate stream, then strip it out of the variant to
  // avoid confusing our multiplex detection below.
  var textCodecs = this.guessCodecsSafe_(ContentType.TEXT, codecs);
  if (textCodecs) {
    // We found a text codec in the list, so look for an associated text stream.
    var subGroupId = tag.getAttributeValue('SUBTITLES');
    if (subGroupId) {
      var textTags = Utils.findMediaTags(mediaTags, 'SUBTITLES', subGroupId);
      goog.asserts.assert(textTags.length == 1,
                          'Exactly one text tag expected!');
      if (textTags.length) {
        // We found a text codec and text stream, so make sure the codec is
        // attached to the stream.
        var textStreamInfo = this.mediaTagsToStreamInfosMap_[textTags[0].id];
        textStreamInfo.stream.codecs = textCodecs;
      }
    }

    // Remove this entry from the list of codecs that belong to audio/video.
    codecs.splice(codecs.indexOf(textCodecs), 1);
  }

  var promises = mediaTags.map(function(tag) {
    return this.createStreamInfoFromMediaTag_(tag, codecs);
  }.bind(this));

  var audioStreamInfos = [];
  var videoStreamInfos = [];

  return Promise.all(promises).then(function(data) {
    if (audioGroupId) {
      audioStreamInfos = data;
    } else if (videoGroupId) {
      videoStreamInfos = data;
    }

    // Make an educated guess about the stream type.
    shaka.log.debug('Guessing stream type for', tag.toString());
    var type;
    var ignoreStream = false;
    if (!audioStreamInfos.length && !videoStreamInfos.length) {
      // There are no associated streams.  This is either an audio-only stream,
      // a video-only stream, or a multiplexed stream.

      if (codecs.length == 1) {
        // There is only one codec, so it shouldn't be multiplexed.

        var videoCodecs = this.guessCodecsSafe_(ContentType.VIDEO, codecs);
        if (resolutionAttr || frameRate || videoCodecs) {
          // Assume video-only.
          shaka.log.debug('Guessing video-only.');
          type = ContentType.VIDEO;
        } else {
          // Assume audio-only.
          shaka.log.debug('Guessing audio-only.');
          type = ContentType.AUDIO;
        }
      } else {
        // There are multiple codecs, so assume multiplexed content.
        // Note that the default used when CODECS is missing assumes multiple
        // (and therefore multiplexed).
        // Recombine the codec strings into one so that MediaSource isn't
        // lied to later.  (That would trigger an error in Chrome.)
        shaka.log.debug('Guessing multiplexed audio+video.');
        type = ContentType.VIDEO;
        codecs = [codecs.join(',')];
      }
    } else if (audioStreamInfos.length) {
      var streamURI = HlsParser.getRequiredAttributeValue_(tag, 'URI');
      var firstAudioStreamURI = audioStreamInfos[0].relativeUri;
      if (streamURI == firstAudioStreamURI) {
        // The Microsoft HLS manifest generators will make audio-only variants
        // that link to their URI both directly and through an audio tag.
        // In that case, ignore the local URI and use the version in the
        // AUDIO tag, so you inherit its language.
        // As an example, see the manifest linked in issue #860.
        shaka.log.debug('Guessing audio-only.');
        type = ContentType.AUDIO;
        ignoreStream = true;
      } else {
        // There are associated audio streams.  Assume this is video.
        shaka.log.debug('Guessing video.');
        type = ContentType.VIDEO;
      }
    } else {
      // There are associated video streams.  Assume this is audio.
      goog.asserts.assert(videoStreamInfos.length,
          'No video streams!  This should have been handled already!');
      shaka.log.debug('Guessing audio.');
      type = ContentType.AUDIO;
    }

    goog.asserts.assert(type, 'Type should have been set by now!');
    if (ignoreStream)
      return Promise.resolve();
    return this.createStreamInfoFromVariantTag_(tag, codecs, type);
  }.bind(this)).then(function(streamInfo) {
    if (streamInfo) {
      if (streamInfo.stream.type == ContentType.AUDIO) {
        audioStreamInfos = [streamInfo];
      } else {
        videoStreamInfos = [streamInfo];
      }
    }
    goog.asserts.assert(videoStreamInfos || audioStreamInfos,
        'We should have created a stream!');

    if (videoStreamInfos)
      this.filterLegacyCodecs_(videoStreamInfos);
    if (audioStreamInfos)
      this.filterLegacyCodecs_(audioStreamInfos);

    return this.createVariants_(
        audioStreamInfos,
        videoStreamInfos,
        bandwidth,
        width,
        height,
        frameRate);
  }.bind(this));
};


/**
 * Filters out unsupported codec strings from an array of stream infos.
 * @param {!Array.<shaka.hls.HlsParser.StreamInfo>} streamInfos
 * @private
 */
shaka.hls.HlsParser.prototype.filterLegacyCodecs_ = function(streamInfos) {
  streamInfos.forEach(function(streamInfo) {
    var codecs = streamInfo.stream.codecs.split(',');
    codecs = codecs.filter(function(codec) {
      // mp4a.40.34 is a nonstandard codec string that is sometimes used in HLS
      // for legacy reasons. It is not recognized by non-Apple MSE.
      // See https://bugs.chromium.org/p/chromium/issues/detail?id=489520
      // Therefore, ignore this codec string.
      return codec != 'mp4a.40.34';
    });
    streamInfo.stream.codecs = codecs.join(',');
  });
};


/**
 * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} audioInfos
 * @param {!Array.<!shaka.hls.HlsParser.StreamInfo>} videoInfos
 * @param {number} bandwidth
 * @param {?string} width
 * @param {?string} height
 * @param {?string} frameRate
 * @return {!Array.<!shakaExtern.Variant>}
 * @private
 */
shaka.hls.HlsParser.prototype.createVariants_ =
    function(audioInfos, videoInfos, bandwidth, width, height, frameRate) {
  var DrmEngine = shaka.media.DrmEngine;

  videoInfos.forEach(function(info) {
    this.addVideoAttributes_(info.stream, width, height, frameRate);
  }.bind(this));

  // In case of audio-only or video-only content, we create an array of
  // one item containing a null. This way, the double-loop works for all
  // kinds of content.
  // NOTE: we currently don't have support for audio-only content.
  if (!audioInfos.length)
    audioInfos = [null];
  if (!videoInfos.length)
    videoInfos = [null];

  var variants = [];
  for (var i = 0; i < audioInfos.length; i++) {
    for (var j = 0; j < videoInfos.length; j++) {
      var audioStream = audioInfos[i] ? audioInfos[i].stream : null;
      var videoStream = videoInfos[j] ? videoInfos[j].stream : null;
      var audioDrmInfos = audioInfos[i] ? audioInfos[i].drmInfos : null;
      var videoDrmInfos = videoInfos[j] ? videoInfos[j].drmInfos : null;

      var drmInfos;
      if (audioStream && videoStream) {
        if (DrmEngine.areDrmCompatible(audioDrmInfos, videoDrmInfos)) {
          drmInfos = DrmEngine.getCommonDrmInfos(audioDrmInfos, videoDrmInfos);
        } else {
          shaka.log.warning('Incompatible DRM info in HLS variant.  Skipping.');
          continue;
        }
      } else if (audioStream) {
        drmInfos = audioDrmInfos;
      } else if (videoStream) {
        drmInfos = videoDrmInfos;
      }

      var videoStreamUri = videoInfos[i] ? videoInfos[i].relativeUri : '';
      var audioStreamUri = audioInfos[i] ? audioInfos[i].relativeUri : '';
      var variantMapKey = videoStreamUri + ' - ' + audioStreamUri;
      if (this.urisToVariantsMap_[variantMapKey]) {
        // This happens when two variants only differ in their text streams.
        shaka.log.debug('Skipping variant which only differs in text streams.');
        continue;
      }

      var variant = this.createVariant_(
          audioStream, videoStream, bandwidth, drmInfos);
      variants.push(variant);
      this.urisToVariantsMap_[variantMapKey] = variant;
    }
  }
  return variants;
};


/**
 * @param {shakaExtern.Stream} audio
 * @param {shakaExtern.Stream} video
 * @param {number} bandwidth
 * @param {!Array.<shakaExtern.DrmInfo>} drmInfos
 * @return {!shakaExtern.Variant}
 * @private
 */
shaka.hls.HlsParser.prototype.createVariant_ =
    function(audio, video, bandwidth, drmInfos) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Since both audio and video are of the same type, this assertion will catch
  // certain mistakes at runtime that the compiler would miss.
  goog.asserts.assert(!audio || audio.type == ContentType.AUDIO,
                      'Audio parameter mismatch!');
  goog.asserts.assert(!video || video.type == ContentType.VIDEO,
                      'Video parameter mismatch!');

  return {
    id: this.globalId_++,
    language: audio ? audio.language : 'und',
    primary: (!!audio && audio.primary) || (!!video && video.primary),
    audio: audio,
    video: video,
    bandwidth: bandwidth,
    drmInfos: drmInfos,
    allowedByApplication: true,
    allowedByKeySystem: true
  };
};


/**
 * Parses an EXT-X-MEDIA tag with TYPE="SUBTITLES" into a text stream.
 *
 * @param {!shaka.hls.Tag} tag
 * @param {!shaka.hls.Playlist} playlist
 * @return {!Promise.<?shakaExtern.Stream>}
 * @private
 */
shaka.hls.HlsParser.prototype.createTextStream_ = function(tag, playlist) {
  goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
                      'Should only be called on media tags!');

  var type = shaka.hls.HlsParser.getRequiredAttributeValue_(tag, 'TYPE');
  goog.asserts.assert(type == 'SUBTITLES',
                      'Should only be called on tags with TYPE="SUBTITLES"!');

  return this.createStreamInfoFromMediaTag_(tag, [])
    .then(function(streamInfo) {
        return streamInfo.stream;
      });
};


/**
 * Parse EXT-X-MEDIA media tag into a Stream object.
 *
 * @param {shaka.hls.Tag} tag
 * @param {!Array.<!string>} allCodecs
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfoFromMediaTag_ =
    function(tag, allCodecs) {
  goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
                      'Should only be called on media tags!');

  var HlsParser = shaka.hls.HlsParser;
  var uri = HlsParser.getRequiredAttributeValue_(tag, 'URI');
  uri = shaka.hls.Utils.constructAbsoluteUri(this.manifestUri_, uri);

  // Check if the stream has already been created as part of another Variant
  // and return it if it has.
  if (this.uriToStreamInfosMap_[uri]) {
    return Promise.resolve(this.uriToStreamInfosMap_[uri]);
  }

  var type = HlsParser.getRequiredAttributeValue_(tag, 'TYPE').toLowerCase();
  // Shaka recognizes content types 'audio', 'video' and 'text'.
  // HLS 'subtitles' type needs to be mapped to 'text'.
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (type == 'subtitles') type = ContentType.TEXT;

  var LanguageUtils = shaka.util.LanguageUtils;
  var language = LanguageUtils.normalize(/** @type {string} */(
      tag.getAttributeValue('LANGUAGE', 'und')));
  var label = tag.getAttributeValue('NAME');

  var defaultAttr = tag.getAttribute('DEFAULT');
  var autoselectAttr = tag.getAttribute('AUTOSELECT');
  // TODO: Should we take into account some of the currently ignored attributes:
  // FORCED, INSTREAM-ID, CHARACTERISTICS, CHANNELS?
  // Attribute descriptions:
  // https://tools.ietf.org/html/draft-pantos-http-live-streaming-20#section-4.3.4.1
  var channelsAttribute = tag.getAttributeValue('CHANNELS');
  var channelsCount = type == 'audio' ?
      this.getChannelsCount_(channelsAttribute) : null;
  var primary = !!defaultAttr || !!autoselectAttr;
  return this.createStreamInfo_(uri, allCodecs, type,
      language, primary, label, channelsCount).then(function(streamInfo) {

    // TODO: This check is necessary because of the possibility of multiple
    // calls to createStreamInfoFromMediaTag_ before either has resolved.
    if (this.uriToStreamInfosMap_[uri])
      return this.uriToStreamInfosMap_[uri];

    this.mediaTagsToStreamInfosMap_[tag.id] = streamInfo;
    this.uriToStreamInfosMap_[uri] = streamInfo;
    return streamInfo;
  }.bind(this));
};


/**
 * Get the channels count information for HLS audio track.
 * The channels value is a string that specifies an ordered, "/" separated list
 * of parameters. If the type is audio, the first parameter will be a decimal
 * integer, as the number of independent, simultaneous audio channels.
 * No other channels parameters are currently defined.
 *
 * @param {?string} channels
 *
 * @return {?number} channelcount
 * @private
 */
shaka.hls.HlsParser.prototype.getChannelsCount_ = function(channels) {
  if (!channels) return null;
  var channelscountstring = channels.split('/')[0];
  var count = parseInt(channelscountstring, 10);
  return count;
};


/**
 * Parse EXT-X-STREAM-INF media tag into a Stream object.
 *
 * @param {!shaka.hls.Tag} tag
 * @param {!Array.<!string>} allCodecs
 * @param {!string} type
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfoFromVariantTag_ =
    function(tag, allCodecs, type) {
  goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
                      'Should only be called on media tags!');

  var uri = shaka.hls.HlsParser.getRequiredAttributeValue_(tag, 'URI');
  uri = shaka.hls.Utils.constructAbsoluteUri(this.manifestUri_, uri);

  if (this.uriToStreamInfosMap_[uri]) {
    return Promise.resolve(this.uriToStreamInfosMap_[uri]);
  }

  return this.createStreamInfo_(uri, allCodecs, type,
                                /* language */ 'und', /* primary */ false,
                                /* label */ null, /* channelcount */ null).then(
      function(streamInfo) {
        // TODO: This check is necessary because of the possibility of multiple
        // calls to createStreamInfoFromVariantTag_ before either has resolved.
        if (this.uriToStreamInfosMap_[uri])
          return this.uriToStreamInfosMap_[uri];

        this.uriToStreamInfosMap_[uri] = streamInfo;
        return streamInfo;
      }.bind(this));
};


/**
 * @param {!string} uri
 * @param {!Array.<!string>} allCodecs
 * @param {!string} type
 * @param {!string} language
 * @param {boolean} primary
 * @param {?string} label
 * @param {?number} channelsCount
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfo_ = function(uri, allCodecs,
    type, language, primary, label, channelsCount) {
  const Utils = shaka.hls.Utils;
  const HlsParser = shaka.hls.HlsParser;

  var relativeUri = uri;
  uri = Utils.constructAbsoluteUri(this.manifestUri_, uri);

  /** @type {!shaka.hls.Playlist} */
  var playlist;
  /** @type {string} */
  var codecs = '';
  /** @type {string} */
  var mimeType;

  return this.requestManifest_(uri).then(function(response) {
    playlist = this.manifestTextParser_.parsePlaylist(response.data, uri);
    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      // EXT-X-MEDIA tags should point to media playlists.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    goog.asserts.assert(playlist.segments != null,
                        'Media playlist should have segments!');

    this.determinePresentationType_(playlist);

    codecs = this.guessCodecs_(type, allCodecs);
    return this.guessMimeType_(type, codecs, playlist);
  }.bind(this)).then(function(mimeTypeArg) {
    mimeType = mimeTypeArg;

    var mediaSequenceTag = Utils.getFirstTagWithName(playlist.tags,
                                                     'EXT-X-MEDIA-SEQUENCE');

    var startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;

    return this.createSegments_(playlist, startPosition, mimeType, codecs);
  }.bind(this)).then(function(segments) {
    var minTimestamp = segments[0].startTime;
    var lastEndTime = segments[segments.length - 1].endTime;
    var duration = lastEndTime - minTimestamp;
    var segmentIndex = new shaka.media.SegmentIndex(segments);

    const initSegmentReference = this.createInitSegmentReference_(playlist);

    var kind = undefined;
    var ManifestParserUtils = shaka.util.ManifestParserUtils;
    if (type == ManifestParserUtils.ContentType.TEXT)
      kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
    // TODO: CLOSED-CAPTIONS requires the parsing of CEA-608
    // from the video.

    var drmTags = [];
    playlist.segments.forEach(function(segment) {
      var segmentKeyTags = Utils.filterTagsByName(segment.tags,
                                                  'EXT-X-KEY');
      drmTags.push.apply(drmTags, segmentKeyTags);
    });

    var encrypted = false;
    var drmInfos = [];
    var keyId = null;

    // TODO: may still need changes to support key rotation
    drmTags.forEach(function(drmTag) {
      var method = HlsParser.getRequiredAttributeValue_(drmTag, 'METHOD');
      if (method != 'NONE') {
        encrypted = true;

        var keyFormat =
            HlsParser.getRequiredAttributeValue_(drmTag, 'KEYFORMAT');
        var drmParser =
            shaka.hls.HlsParser.KEYFORMATS_TO_DRM_PARSERS_[keyFormat];

        var drmInfo = drmParser ? drmParser(drmTag) : null;
        if (drmInfo) {
          if (drmInfo.keyIds.length) {
            keyId = drmInfo.keyIds[0];
          }
          drmInfos.push(drmInfo);
        } else {
          shaka.log.warning('Unsupported HLS KEYFORMAT', keyFormat);
        }
      }
    });

    if (encrypted && !drmInfos.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_KEYFORMATS_NOT_SUPPORTED);
    }

    var stream = {
      id: this.globalId_++,
      createSegmentIndex: Promise.resolve.bind(Promise),
      findSegmentPosition: segmentIndex.find.bind(segmentIndex),
      getSegmentReference: segmentIndex.get.bind(segmentIndex),
      initSegmentReference: initSegmentReference,
      presentationTimeOffset: 0,
      mimeType: mimeType,
      codecs: codecs,
      kind: kind,
      encrypted: encrypted,
      keyId: keyId,
      language: language,
      label: label || null,
      type: type,
      primary: primary,
      // TODO: trick mode
      trickModeVideo: null,
      containsEmsgBoxes: false,
      frameRate: undefined,
      width: undefined,
      height: undefined,
      bandwidth: undefined,
      roles: [],
      channelsCount: channelsCount
    };

    this.streamsToIndexMap_[stream.id] = segmentIndex;

    return {
      stream: stream,
      segmentIndex: segmentIndex,
      drmInfos: drmInfos,
      relativeUri: relativeUri,
      minTimestamp: minTimestamp,
      maxTimestamp: lastEndTime,
      duration: duration
    };
  }.bind(this));
};


/**
 * @param {!shaka.hls.Playlist} playlist
 * @private
 */
shaka.hls.HlsParser.prototype.determinePresentationType_ = function(playlist) {
  var Utils = shaka.hls.Utils;
  var PresentationType = shaka.hls.HlsParser.PresentationType_;
  var presentationTypeTag = Utils.getFirstTagWithName(playlist.tags,
                                                      'EXT-X-PLAYLIST-TYPE');
  var endListTag = Utils.getFirstTagWithName(playlist.tags, 'EXT-X-ENDLIST');

  var isVod = (presentationTypeTag && presentationTypeTag.value == 'VOD') ||
      endListTag;
  var isEvent = presentationTypeTag && presentationTypeTag.value == 'EVENT' &&
      !isVod;
  var isLive = !isVod && !isEvent;

  if (isVod) {
    this.setPresentationType_(PresentationType.VOD);
  } else {
    // presentation type LIVE or an ongoing EVENT
    if (isLive) {
      this.setPresentationType_(PresentationType.LIVE);
    } else {
      this.setPresentationType_(PresentationType.EVENT);
    }

    var targetDurationTag = this.getRequiredTag_(playlist.tags,
                                                 'EXT-X-TARGETDURATION');
    var targetDuration = Number(targetDurationTag.value);

    // According to HLS spec, updates should not happen more often than
    // once in targetDuration. It also requires to only update the active
    // variant. We might implement that later, but for now every variant
    // will be updated. To get the update period, choose the smallest
    // targetDuration value across all playlists.

    // Update longest target duration if need be to use as a presentation
    // delay later.
    this.maxTargetDuration_ = Math.max(targetDuration, this.maxTargetDuration_);
    // Update the shortest one to use as update period and segment availability
    // time (for LIVE).
    this.minTargetDuration_ = Math.min(targetDuration, this.minTargetDuration_);
  }
};


/**
 * @param {number} lastTimestamp
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.createPresentationTimeline_ =
    function(lastTimestamp) {
  var presentationStartTime = null;
  var delay = 0;

  if (this.isLive_()) {
    presentationStartTime = (Date.now() / 1000) - lastTimestamp;

    // We should have a delay of at least 3 target durations.
    delay = this.maxTargetDuration_ * 3;
  }

  this.presentationTimeline_ = new shaka.media.PresentationTimeline(
      presentationStartTime, delay);
  this.presentationTimeline_.setStatic(!this.isLive_());
  this.presentationTimeline_.notifyMaxSegmentDuration(this.maxTargetDuration_);
};


/**
 * @param {!shaka.hls.Playlist} playlist
 * @return {shaka.media.InitSegmentReference}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.prototype.createInitSegmentReference_ = function(playlist) {
  var Utils = shaka.hls.Utils;
  var mapTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-MAP');
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
  var mapTag = mapTags[0];
  var initUri = shaka.hls.HlsParser.getRequiredAttributeValue_(mapTag, 'URI');
  var uri = Utils.constructAbsoluteUri(playlist.uri, initUri);
  var startByte = 0;
  var endByte = null;
  var byterange = mapTag.getAttributeValue('BYTERANGE');
  // If BYTERANGE attribute is not specified, the segment consists
  // of the entire resourse.
  if (byterange) {
    var blocks = byterange.split('@');
    var byteLength = Number(blocks[0]);
    startByte = Number(blocks[1]);
    endByte = startByte + byteLength - 1;
  }

  return new shaka.media.InitSegmentReference(function() { return [uri]; },
                                              startByte,
                                              endByte);
};


/**
 * Parses one shaka.hls.Segment object into a shaka.media.SegmentReference.
 *
 * @param {!shaka.hls.Playlist} playlist
 * @param {shaka.media.SegmentReference} previousReference
 * @param {!shaka.hls.Segment} hlsSegment
 * @param {number} position
 * @param {number} startTime
 * @return {!shaka.media.SegmentReference}
 * @private
 */
shaka.hls.HlsParser.prototype.createSegmentReference_ =
    function(playlist, previousReference, hlsSegment, position, startTime) {
  var Utils = shaka.hls.Utils;
  var tags = hlsSegment.tags;
  var uri = Utils.constructAbsoluteUri(playlist.uri, hlsSegment.uri);

  var extinfTag = this.getRequiredTag_(tags, 'EXTINF');
  // EXTINF tag format is '#EXTINF:<duration>,[<title>]'.
  // We're interested in the duration part.
  var extinfValues = extinfTag.value.split(',');
  var duration = Number(extinfValues[0]);
  var endTime = startTime + duration;

  var startByte = 0;
  var endByte = null;
  var byterange = Utils.getFirstTagWithName(tags, 'EXT-X-BYTERANGE');

  // If BYTERANGE is not specified, the segment consists of the
  // entire resourse.
  if (byterange) {
    var blocks = byterange.value.split('@');
    var byteLength = Number(blocks[0]);
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
      function() { return [uri]; },
      startByte,
      endByte);
};


/**
 * Parses shaka.hls.Segment objects into shaka.media.SegmentReferences.
 *
 * @param {!shaka.hls.Playlist} playlist
 * @param {number} startPosition
 * @param {string} mimeType
 * @param {string} codecs
 * @return {!Promise<!Array.<!shaka.media.SegmentReference>>}
 * @private
 */
shaka.hls.HlsParser.prototype.createSegments_ =
    function(playlist, startPosition, mimeType, codecs) {
  var Utils = shaka.hls.Utils;
  var hlsSegments = playlist.segments;
  var references = [];

  goog.asserts.assert(hlsSegments.length, 'Playlist should have segments!');
  // We may need to look at the media itself to determine a segment start time.
  var firstSegmentUri = Utils.constructAbsoluteUri(playlist.uri,
                                                   hlsSegments[0].uri);
  var firstSegmentRef =
      this.createSegmentReference_(
          playlist,
          null /* previousReference */,
          hlsSegments[0],
          startPosition,
          0 /* startTime, irrelevant */);

  var initSegmentRef = this.createInitSegmentReference_(playlist);

  return this.getStartTime_(
      playlist.uri, initSegmentRef, firstSegmentRef, mimeType, codecs)
      .then(function(firstStartTime) {
        shaka.log.debug('First segment', firstSegmentUri.split('/').pop(),
                        'starts at', firstStartTime);
        for (var i = 0; i < hlsSegments.length; ++i) {
          var hlsSegment = hlsSegments[i];
          var previousReference = references[references.length - 1];
          var startTime = (i == 0) ? firstStartTime : previousReference.endTime;
          var position = startPosition + i;

          var reference = this.createSegmentReference_(
              playlist,
              previousReference,
              hlsSegment,
              position,
              startTime);
          references.push(reference);
        }

        return references;
      }.bind(this));
};


/**
 * Try to fetch a partial segment, and fall back to a full segment if we have
 * to.
 *
 * @param {!shaka.media.AnySegmentReference} segmentRef
 * @return {!Promise.<shakaExtern.Response>}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.hls.HlsParser.prototype.fetchPartialSegment_ = function(segmentRef) {
  var networkingEngine = this.playerInterface_.networkingEngine;
  var requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  var request = shaka.net.NetworkingEngine.makeRequest(
      segmentRef.getUris(), this.config_.retryParameters);

  // Try to avoid fetching the entire segment, which can be quite large.
  var partialSegmentHeaders = {};
  var startByte = segmentRef.startByte;
  var partialEndByte =
      startByte + shaka.hls.HlsParser.PARTIAL_SEGMENT_SIZE_ - 1;
  partialSegmentHeaders['Range'] = 'bytes=' + startByte + '-' + partialEndByte;

  // Prepare a fallback to the entire segment.
  var fullSegmentHeaders = {};
  if ((startByte != 0) || (segmentRef.endByte != null)) {
    var range = 'bytes=' + startByte + '-';
    if (segmentRef.endByte != null) range += segmentRef.endByte;

    fullSegmentHeaders['Range'] = range;
  }

  // Try a partial request first.
  request.headers = partialSegmentHeaders;
  return networkingEngine.request(requestType, request).catch(function(error) {
    // The partial request may fail for a number of reasons.
    // Some servers do not support Range requests, and others do not support the
    // OPTIONS request which must be made before any cross-origin Range request.
    // Since this fallback is expensive, warn the app developer.
    shaka.log.alwaysWarn('Unable to fetch a partial HLS segment! ' +
                         'Falling back to a full segment request, ' +
                         'which is expensive!  Your server should support ' +
                         'Range requests and CORS preflights.',
                         request.uris[0]);
    request.headers = fullSegmentHeaders;
    return networkingEngine.request(requestType, request);
  });
};


/**
 * Gets start time of a segment from the existing manifest (if possible) or by
 * downloading it and parsing it otherwise.
 *
 * @param {string} playlistUri
 * @param {shaka.media.InitSegmentReference} initSegmentRef
 * @param {!shaka.media.SegmentReference} segmentRef
 * @param {string} mimeType
 * @param {string} codecs
 * @return {!Promise.<number>}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.hls.HlsParser.prototype.getStartTime_ =
    function(playlistUri, initSegmentRef, segmentRef, mimeType, codecs) {
  // If we are updating the manifest, we can usually skip fetching the segment
  // by examining the references we already have.  This won't be possible if
  // there was some kind of lag or delay updating the manifest on the server,
  // in which extreme case we would fall back to fetching a segment.  This
  // allows us to both avoid fetching segments when possible, and recover from
  // certain server-side issues gracefully.
  if (this.manifest_) {
    var streamInfo = this.uriToStreamInfosMap_[playlistUri];
    var segmentIndex = streamInfo.segmentIndex;
    var reference = segmentIndex.get(segmentRef.position);
    if (reference) {
      // We found it!  Avoid fetching and parsing the segment.
      shaka.log.v1('Found segment start time in previous manifest');
      return Promise.resolve(reference.startTime);
    }

    shaka.log.debug('Unable to find segment start time in previous manifest!');
  }

  // TODO: Introduce a new tag to extend HLS and provide the first segment's
  // start time.  This will avoid the need for these fetches in content packaged
  // with Shaka Packager.  This web-friendly extension to HLS can then be
  // proposed to Apple for inclusion in a future version of HLS.
  // See https://github.com/google/shaka-packager/issues/294

  shaka.log.v1('Fetching segment to find start time');
  var fetches = [this.fetchPartialSegment_(segmentRef)];

  if (mimeType == 'video/mp4' || mimeType == 'audio/mp4') {
    // We also need the init segment to get the correct timescale.
    if (initSegmentRef) {
      fetches.push(this.fetchPartialSegment_(initSegmentRef));
    } else {
      // If the stream is self-initializing, use the same response for both.
      fetches.push(fetches[0]);
    }
  }

  return Promise.all(fetches).then(function(responses) {
    if (mimeType == 'video/mp4' || mimeType == 'audio/mp4') {
      return this.getStartTimeFromMp4Segment_(
          responses[0].data, responses[1].data);
    } else if (mimeType == 'audio/mpeg') {
      // There is no standard way to embed a timestamp in an mp3 file, so the
      // start time is presumably 0.
      return 0;
    } else if (mimeType == 'video/mp2t') {
      return this.getStartTimeFromTsSegment_(responses[0].data);
    } else if (mimeType == 'application/mp4' ||
               mimeType.indexOf('text/') == 0) {
      return this.getStartTimeFromTextSegment_(
          mimeType, codecs, responses[0].data);
    } else {
      // TODO: Parse WebM?
      // TODO: Parse raw AAC?
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_COULD_NOT_PARSE_SEGMENT_START_TIME);
    }
  }.bind(this));
};


/**
 * Parses an mp4 segment to get its start time.
 *
 * @param {!ArrayBuffer} mediaData
 * @param {!ArrayBuffer} initData
 * @return {number}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.hls.HlsParser.prototype.getStartTimeFromMp4Segment_ =
    function(mediaData, initData) {
  var Mp4Parser = shaka.util.Mp4Parser;

  var timescale = 0;
  new Mp4Parser()
      .box('moov', Mp4Parser.children)
      .box('trak', Mp4Parser.children)
      .box('mdia', Mp4Parser.children)
      .fullBox('mdhd', function(box) {
        goog.asserts.assert(
            box.version == 0 || box.version == 1,
            'MDHD version can only be 0 or 1');

        // Skip "creation_time" and "modification_time" (4 or 8 bytes each)
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

  var startTime = 0;
  var parsedMedia = false;
  new Mp4Parser()
      .box('moof', Mp4Parser.children)
      .box('traf', Mp4Parser.children)
      .fullBox('tfdt', function(box) {
        goog.asserts.assert(
            box.version == 0 || box.version == 1,
            'TFDT version can only be 0 or 1');
        var baseTime = (box.version == 0) ?
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
};


/**
 * Parses a TS segment to get its start time.
 *
 * @param {!ArrayBuffer} data
 * @return {number}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.hls.HlsParser.prototype.getStartTimeFromTsSegment_ = function(data) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data), shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var fail = function() {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_COULD_NOT_PARSE_SEGMENT_START_TIME);
  };

  var packetStart = 0;
  var syncByte = 0;

  var skipPacket = function() {
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
      fail();
    }
    // Put the sync byte back so we can read it in the next loop.
    reader.rewind(1);
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Format reference: https://goo.gl/wk6wwu
    packetStart = reader.getPosition();

    syncByte = reader.readUint8();
    if (syncByte != 0x47) fail();

    var flagsAndPacketId = reader.readUint16();
    var hasPesPacket = flagsAndPacketId & 0x4000;
    if (!hasPesPacket) fail();

    var flags = reader.readUint8();
    var adaptationFieldControl = (flags & 0x30) >> 4;
    if (adaptationFieldControl == 0 /* reserved */ ||
        adaptationFieldControl == 2 /* adaptation field, no payload */) {
      fail();
    }

    if (adaptationFieldControl == 3) {
      // Skip over adaptation field.
      var length = reader.readUint8();
      reader.skip(length);
    }

    // Now we come to the PES header (hopefully).
    // Format reference: https://goo.gl/1166Mr
    var startCode = reader.readUint32();
    var startCodePrefix = startCode >> 8;
    if (startCodePrefix != 1) {
      // Not a PES packet yet.  Skip this TS packet and try again.
      skipPacket();
      continue;
    }

    // Skip the 16-bit PES length and the first 8 bits of the optional header.
    reader.skip(3);
    // The next 8 bits contain flags about DTS & PTS.
    var ptsDtsIndicator = reader.readUint8() >> 6;
    if (ptsDtsIndicator == 0 /* no timestamp */ ||
        ptsDtsIndicator == 1 /* forbidden */) {
      fail();
    }

    var pesHeaderLengthRemaining = reader.readUint8();
    if (pesHeaderLengthRemaining == 0) {
      fail();
    }

    if (ptsDtsIndicator == 2 /* PTS only */) {
      goog.asserts.assert(pesHeaderLengthRemaining == 5, 'Bad PES header?');
    } else if (ptsDtsIndicator == 3 /* PTS and DTS */) {
      goog.asserts.assert(pesHeaderLengthRemaining == 10, 'Bad PES header?');
    }

    var pts0 = reader.readUint8();
    var pts1 = reader.readUint16();
    var pts2 = reader.readUint16();
    // Reconstruct 33-bit PTS from the 5-byte, padded structure.
    var ptsHigh3 = (pts0 & 0x0e) >> 1;
    var ptsLow30 = ((pts1 & 0xfffe) << 14) | ((pts2 & 0xfffe) >> 1);
    // Reconstruct the PTS as a float.  Avoid bitwise operations to combine
    // because bitwise ops treat the values as 32-bit ints.
    var pts = ptsHigh3 * (1 << 30) + ptsLow30;
    return pts / shaka.hls.HlsParser.TS_TIMESCALE_;
  }
};


/**
 * Parses a text segment to get its start time.
 *
 * @param {string} mimeType
 * @param {string} codecs
 * @param {!ArrayBuffer} data
 * @return {number}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.hls.HlsParser.prototype.getStartTimeFromTextSegment_ =
    function(mimeType, codecs, data) {
  var fullMimeType = shaka.util.MimeUtils.getFullType(mimeType, codecs);
  if (!shaka.text.TextEngine.isTypeSupported(fullMimeType)) {
    // We won't be able to parse this, but it will be filtered out anyway.
    // So we don't have to care about the start time.
    return 0;
  }

  var textEngine = new shaka.text.TextEngine(/* displayer */ null);
  textEngine.initParser(fullMimeType);
  return textEngine.getStartTime(data);
};


/**
 * Attempts to guess which codecs from the codecs list belong to a given content
 * type.  Does not assume a single codec is anything special, and does not throw
 * if it fails to match.
 *
 * @param {!string} contentType
 * @param {!Array.<!string>} codecs
 * @return {?string} or null if no match is found
 * @private
 */
shaka.hls.HlsParser.prototype.guessCodecsSafe_ = function(contentType, codecs) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var HlsParser = shaka.hls.HlsParser;
  var formats = HlsParser.CODEC_REGEXPS_BY_CONTENT_TYPE_[contentType];

  for (var i = 0; i < formats.length; i++) {
    for (var j = 0; j < codecs.length; j++) {
      if (formats[i].test(codecs[j].trim())) {
        return codecs[j].trim();
      }
    }
  }

  // Text does not require a codec string.
  if (contentType == ContentType.TEXT) {
    return '';
  }

  return null;
};


/**
 * Attempts to guess which codecs from the codecs list belong to a given content
 * type.  Assumes a single codec is correct, and throws if not found.
 *
 * @param {!string} contentType
 * @param {!Array.<!string>} codecs
 * @return {string}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.prototype.guessCodecs_ = function(contentType, codecs) {
  if (codecs.length == 1) {
    return codecs[0];
  }

  var match = this.guessCodecsSafe_(contentType, codecs);
  if (match != null) {
    return match;
  }

  // Unable to guess codecs.
  throw new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.MANIFEST,
      shaka.util.Error.Code.HLS_COULD_NOT_GUESS_CODECS,
      codecs);
};


/**
 * Attempts to guess stream's mime type based on content type and uri.
 *
 * @param {!string} contentType
 * @param {!string} codecs
 * @param {!shaka.hls.Playlist} playlist
 * @return {!Promise.<!string>}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.prototype.guessMimeType_ =
    function(contentType, codecs, playlist) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var HlsParser = shaka.hls.HlsParser;
  var Utils = shaka.hls.Utils;

  goog.asserts.assert(playlist.segments.length,
                      'Playlist should have segments!');
  var firstSegmentUri = Utils.constructAbsoluteUri(playlist.uri,
                                                   playlist.segments[0].uri);

  var parsedUri = new goog.Uri(firstSegmentUri);
  var extension = parsedUri.getPath().split('.').pop();
  var map = HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_[contentType];

  var mimeType = map[extension];
  if (mimeType)
    return Promise.resolve(mimeType);

  if (contentType == ContentType.TEXT) {
    // The extension map didn't work.
    if (!codecs || codecs == 'vtt') {
      // If codecs is 'vtt', it's WebVTT.
      // If there was no codecs string, assume HLS text streams are WebVTT.
      return Promise.resolve('text/vtt');
    } else {
      // Otherwise, assume MP4-embedded text, since text-based formats tend not
      // to have a codecs string at all.
      return Promise.resolve('application/mp4');
    }
  }

  // If unable to guess mime type, request a segment and try getting it
  // from the response.
  var headRequest = shaka.net.NetworkingEngine.makeRequest(
      [firstSegmentUri], this.config_.retryParameters);
  headRequest.method = 'HEAD';
  var requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  var networkingEngine = this.playerInterface_.networkingEngine;
  return networkingEngine.request(requestType, headRequest)
      .then(function(response) {
        var mimeType = response.headers['content-type'];
        if (!mimeType) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.HLS_COULD_NOT_GUESS_MIME_TYPE,
              extension);
        }

        // Split the MIME type in case the server sent additional parameters.
        return mimeType.split(';')[0];
      });
};


/**
 * Find the attribute and returns its value.
 * Throws an error if attribute was not found.
 *
 * @param {shaka.hls.Tag} tag
 * @param {!string} attributeName
 * @return {!string}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.getRequiredAttributeValue_ =
    function(tag, attributeName) {
  var attribute = tag.getAttribute(attributeName);
  if (!attribute) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_REQUIRED_ATTRIBUTE_MISSING,
        attributeName);
  }

  return attribute.value;
};


/**
 * Returns a tag with a given name.
 * Throws an error if tag was not found.
 *
 * @param {!Array.<shaka.hls.Tag>} tags
 * @param {!string} tagName
 * @return {!shaka.hls.Tag}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.prototype.getRequiredTag_ = function(tags, tagName) {
  var Utils = shaka.hls.Utils;
  var tag = Utils.getFirstTagWithName(tags, tagName);
  if (!tag) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_REQUIRED_TAG_MISSING, tagName);
  }

  return tag;
};


/**
 * @param {shakaExtern.Stream} stream
 * @param {?string} width
 * @param {?string} height
 * @param {?string} frameRate
 * @private
 */
shaka.hls.HlsParser.prototype.addVideoAttributes_ =
    function(stream, width, height, frameRate) {
  if (stream) {
    stream.width = Number(width) || undefined;
    stream.height = Number(height) || undefined;
    stream.frameRate = Number(frameRate) || undefined;
  }
};


/**
 * Makes a network request for the manifest and returns a Promise
 * with the resulting data.
 *
 * @param {!string} uri
 * @return {!Promise.<!shakaExtern.Response>}
 * @private
 */
shaka.hls.HlsParser.prototype.requestManifest_ = function(uri) {
  var requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  var request = shaka.net.NetworkingEngine.makeRequest(
      [uri], this.config_.retryParameters);
  var networkingEngine = this.playerInterface_.networkingEngine;
  var isCanceled = (function() {
    return !this.playerInterface_;
  }).bind(this);
  return networkingEngine.request(requestType, request, isCanceled);
};


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
  /^av1$/
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
  /^[ae]c-3$/
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
  /^stpp/
];


/**
 * @const {!Object.<string, !Array.<!RegExp>>}
 * @private
 */
shaka.hls.HlsParser.CODEC_REGEXPS_BY_CONTENT_TYPE_ = {
  'audio': shaka.hls.HlsParser.AUDIO_CODEC_REGEXPS_,
  'video': shaka.hls.HlsParser.VIDEO_CODEC_REGEXPS_,
  'text': shaka.hls.HlsParser.TEXT_CODEC_REGEXPS_
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
  // mpeg2 ts aslo uses video/ for audio: http://goo.gl/tYHXiS
  'ts': 'video/mp2t'
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
  'ts': 'video/mp2t'
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
  'ttml': 'application/ttml+xml'
};


/**
 * @const {!Object.<string, !Object.<string, string>>}
 * @private
 */
shaka.hls.HlsParser.EXTENSION_MAP_BY_CONTENT_TYPE_ = {
  'audio': shaka.hls.HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES_,
  'video': shaka.hls.HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES_,
  'text': shaka.hls.HlsParser.TEXT_EXTENSIONS_TO_MIME_TYPES_
};


/**
 * @typedef {function(!shaka.hls.Tag):?shakaExtern.DrmInfo}
 * @private
 */
shaka.hls.HlsParser.DrmParser_;


/**
 * @param {!shaka.hls.Tag} drmTag
 * @return {?shakaExtern.DrmInfo}
 * @private
 */
shaka.hls.HlsParser.widevineDrmParser_ = function(drmTag) {
  var HlsParser = shaka.hls.HlsParser;
  var method = HlsParser.getRequiredAttributeValue_(drmTag, 'METHOD');
  // TODO: https://github.com/google/shaka-player/issues/1227
  // Keep 'SAMPLE-AES-CENC' for backward compatibility. Deprecate it in a
  // future release.
  if (method != 'SAMPLE-AES-CENC' && method != 'SAMPLE-AES-CTR') {
    shaka.log.error(
        'Widevine in HLS is only supported with SAMPLE-AES-CTR and ' +
        'SAMPLE-AES-CENC (deprecated), not', method);
    return null;
  }

  var uri = HlsParser.getRequiredAttributeValue_(drmTag, 'URI');
  var parsedData = shaka.net.DataUriPlugin.parse(uri);

  // The data encoded in the URI is a PSSH box to be used as init data.
  var pssh = new Uint8Array(parsedData.data);
  var drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
      'com.widevine.alpha', [
        {initDataType: 'cenc', initData: pssh}
      ]);

  var keyId = drmTag.getAttributeValue('KEYID');
  if (keyId) {
    // This value begins with '0x':
    goog.asserts.assert(keyId.substr(0, 2) == '0x',
                        'Incorrect KEYID format!');
    // But the output does not contain the '0x':
    drmInfo.keyIds = [keyId.substr(2).toLowerCase()];
  }
  return drmInfo;
};


/**
 * Called when the update timer ticks.
 *
 * @private
 */
shaka.hls.HlsParser.prototype.onUpdate_ = function() {
  goog.asserts.assert(this.updateTimer_, 'Should only be called by timer');
  goog.asserts.assert(this.updatePeriod_ != null,
                      'There should be an update period');

  shaka.log.info('Updating manifest...');

  // Detect a call to stop()
  if (!this.playerInterface_)
    return;

  this.updateTimer_ = null;
  this.update().then(function() {
    this.setUpdateTimer_(this.updatePeriod_);
  }.bind(this)).catch(function(error) {
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Should only receive a Shaka error');

    // Try updating again, but ensure we haven't been destroyed.
    if (this.playerInterface_) {
      // We will retry updating, so override the severity of the error.
      error.severity = shaka.util.Error.Severity.RECOVERABLE;
      this.playerInterface_.onError(error);

      this.setUpdateTimer_(0);
    }
  }.bind(this));
};


/**
 * Sets the update timer.
 *
 * @param {?number} time in seconds
 * @private
 */
shaka.hls.HlsParser.prototype.setUpdateTimer_ = function(time) {
  if (this.updatePeriod_ == null || time == null)
    return;
  goog.asserts.assert(this.updateTimer_ == null,
                      'Timer should not be already set');

  var callback = this.onUpdate_.bind(this);
  this.updateTimer_ = window.setTimeout(callback, time * 1000);
};


/**
 * @return {boolean}
 * @private
 */
shaka.hls.HlsParser.prototype.isLive_ = function() {
  var PresentationType = shaka.hls.HlsParser.PresentationType_;
  return this.presentationType_ != PresentationType.VOD;
};


/**
 * @param {shaka.hls.HlsParser.PresentationType_} type
 * @private
 */
shaka.hls.HlsParser.prototype.setPresentationType_ = function(type) {
  this.presentationType_ = type;

  if (this.presentationTimeline_)
    this.presentationTimeline_.setStatic(!this.isLive_());

  if (!this.isLive_()) {
    if (this.updateTimer_ != null) {
      window.clearTimeout(this.updateTimer_);
      this.updateTimer_ = null;
      this.updatePeriod_ = null;
    }
  }
};


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
      shaka.hls.HlsParser.widevineDrmParser_
};


/**
 * @enum {string}
 * @private
 */
shaka.hls.HlsParser.PresentationType_ = {
  VOD: 'VOD',
  EVENT: 'EVENT',
  LIVE: 'LIVE'
};


/**
 * @const {number}
 * @private
 */
shaka.hls.HlsParser.TS_TIMESCALE_ = 90000;


/**
 * At this value, timestamps roll over in TS content.
 * @const {number}
 * @private
 */
shaka.hls.HlsParser.TS_ROLLOVER_ = 0x200000000;


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
