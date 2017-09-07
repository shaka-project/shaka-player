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
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.ManifestParserUtils');



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

  /** @private {!Object.<number, shaka.hls.HlsParser.StreamInfo>} */
  this.mediaTagsToStreamInfosMap_ = {};

  /**
   * The key is a string of the form "<VIDEO URI> - <AUDIO URI>".
   * @private {!Object.<string, shakaExtern.Variant>}
   */
  this.urisToVariantsMap_ = {};

  /** @private {!Object.<number, !shaka.media.SegmentIndex>} */
  this.streamsToIndexMap_ = {};

  /**
   * A map from media playlists' uris to stream infos
   * representing the playlists.
   * @private {!Object.<string, shaka.hls.HlsParser.StreamInfo>}
   */
  this.uriToStreamInfosMap_ = {};

  /** @private {?shaka.media.PresentationTimeline} */
  this.presentationTimeline_ = null;

  /** @private {string} */
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

  /** @private {boolean} */
  this.isLive_ = false;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /** @private {number} */
  this.maxTargetDuration_ = 0;
};


/**
 * @typedef {{
 *   stream: !shakaExtern.Stream,
 *   segmentIndex: !shaka.media.SegmentIndex,
 *   drmInfos: !Array.<shakaExtern.DrmInfo>,
 *   relativeUri: !string,
 *   lastSegmentSeen: !shaka.media.SegmentReference
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
 * @property {!string} relativeUri
 *   The uri associated with the stream, relative to the manifest.
 * @property {!shaka.media.SegmentReference} lastSegmentSeen
 *   Last segment of the stream seen so far.
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
  if (!this.isLive_)
    return;

  var promises = [];
  var uris = Object.keys(this.uriToStreamInfosMap_);
  for (var i = 0; i < uris.length; i++) {
    var uri = uris[i];
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
    var playlistData = response.data;
    var playlist = this.manifestTextParser_.parsePlaylist(playlistData,
                                                          response.uri);
    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    var mediaSequenceTag = Utils.getFirstTagWithName(playlist.tags,
                                                     'EXT-X-MEDIA-SEQUENCE');

    var startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;

    var segments = this.createSegments_(playlist, startPosition);
    segments = this.adjustSegments_(segments, streamInfo.lastSegmentSeen);
    streamInfo.segmentIndex.merge(segments);
    if (segments.length)
      streamInfo.lastSegmentSeen = segments[segments.length - 1];

    // Once the last segment has been added to the playlist, #EXT-X-ENDLIST tag
    // will be appended. If that happened, treat the rest of the presentation
    // as VOD.
    var endlistTag = Utils.getFirstTagWithName(playlist.tags, 'EXT-X-ENDLIST');
    if (endlistTag) {
      goog.asserts.assert(streamInfo.lastSegmentSeen != null,
                          'Should not be null!');
      var endTime = streamInfo.lastSegmentSeen.endTime;
      this.setLive_(false);
      this.presentationTimeline_.setDuration(endTime);
    }
  }.bind(this));
};


/**
 * The manifest doesn't specify segments' start and end times.
 * We assume the first segment starts at 0 and base the following
 * segments on this assumption (each segment's starts when previous ends).
 * This method adjusts new segments' (added on update) timeline with
 * respect to previously appended segments.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} segments
 * @param {!shaka.media.SegmentReference} lastSegmentSeen
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.hls.HlsParser.prototype.adjustSegments_ =
    function(segments, lastSegmentSeen) {
  var adjusted = [];

  var offset = lastSegmentSeen.endTime;
  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    if (segment.position > lastSegmentSeen.position) {
      var duration = segment.endTime - segment.startTime;
      var startTime = offset;
      var endTime = offset + duration;
      offset += duration;

      var adjustedSegment =
          new shaka.media.SegmentReference(segment.position,
                                           startTime,
                                           endTime,
                                           segment.getUris,
                                           segment.startByte,
                                           segment.endByte);
      adjusted.push(adjustedSegment);
    }
  }

  return adjusted;
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

    // Update presentationDelay with the largest target duration
    // across all variants.
    if (this.isLive_)
      this.presentationTimeline_.setDelay(this.maxTargetDuration_ * 3);

    goog.asserts.assert(this.presentationTimeline_ != null,
                        'presentationTimeline should already be created!');

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
      if (!this.isLive_)
        this.fitSegments_(variants);
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

  var timeOffset = this.getTimeOffset_(playlist);

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
    return this.createStreamInfoFromMediaTag_(tag, codecs, timeOffset);
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
    if (!audioStreamInfos.length && !videoStreamInfos.length) {
      // There are no associated streams.  This is either an audio-only stream,
      // a video-only stream, or a multiplexed stream.
      var ignoreStream = false;

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
    return this.createStreamInfoFromVariantTag_(tag, codecs, type, timeOffset);
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

  var timeOffset = this.getTimeOffset_(playlist);
  return this.createStreamInfoFromMediaTag_(tag, [], timeOffset)
    .then(function(streamInfo) {
        return streamInfo.stream;
      });
};


/**
 * Parse EXT-X-MEDIA media tag into a Stream object.
 *
 * @param {shaka.hls.Tag} tag
 * @param {!Array.<!string>} allCodecs
 * @param {?number} timeOffset
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfoFromMediaTag_ =
    function(tag, allCodecs, timeOffset) {
  goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
                      'Should only be called on media tags!');

  // Check if the stream has already been created as part of another Variant
  // and return it if it has.
  if (this.mediaTagsToStreamInfosMap_[tag.id]) {
    return Promise.resolve().then(function() {
      return this.mediaTagsToStreamInfosMap_[tag.id];
    }.bind(this));
  }

  var HlsParser = shaka.hls.HlsParser;
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
  var uri = HlsParser.getRequiredAttributeValue_(tag, 'URI');
  uri = shaka.hls.Utils.constructAbsoluteUri(this.manifestUri_, uri);
  var primary = !!defaultAttr || !!autoselectAttr;
  return this.createStreamInfo_(uri, allCodecs, type, timeOffset,
      language, primary, label, channelsCount).then(function(streamInfo) {
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
 * @param {?number} timeOffset
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfoFromVariantTag_ =
    function(tag, allCodecs, type, timeOffset) {
  goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
                      'Should only be called on media tags!');

  var uri = shaka.hls.HlsParser.getRequiredAttributeValue_(tag, 'URI');
  uri = shaka.hls.Utils.constructAbsoluteUri(this.manifestUri_, uri);
  return this.createStreamInfo_(uri, allCodecs, type, timeOffset,
                                /* language */ 'und', /* primary */ false,
                                /* label */ null, /* channelcount */ null).then(
      function(streamInfo) {
        this.uriToStreamInfosMap_[uri] = streamInfo;
        return streamInfo;
      }.bind(this));
};


/**
 * @param {!string} uri
 * @param {!Array.<!string>} allCodecs
 * @param {!string} type
 * @param {?number} timeOffset
 * @param {!string} language
 * @param {boolean} primary
 * @param {?string} label
 * @param {?number} channelsCount
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfo_ = function(uri, allCodecs,
    type, timeOffset, language, primary, label, channelsCount) {
  var Utils = shaka.hls.Utils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var HlsParser = shaka.hls.HlsParser;
  var relativeUri = uri;
  uri = Utils.constructAbsoluteUri(this.manifestUri_, uri);

  return this.requestManifest_(uri).then(function(response) {
    var playlistData = response.data;
    var playlist = this.manifestTextParser_.parsePlaylist(playlistData,
                                                          response.uri);
    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      // EXT-X-MEDIA tags should point to media playlists.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    goog.asserts.assert(playlist.segments != null,
                        'Media playlist should have segments!');

    var mediaSequenceTag = Utils.getFirstTagWithName(playlist.tags,
                                                     'EXT-X-MEDIA-SEQUENCE');

    var startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;
    var segments = this.createSegments_(playlist, startPosition);

    var segmentIndex = new shaka.media.SegmentIndex(segments);

    this.setPresentationType_(playlist);

    if (!this.presentationTimeline_) {
      // The presentation started last available segment's end time ago.
      // All variants should be in sync in terms of timeline, so just grab
      // this from an arbitrary stream.
      this.createPresentationTimeline_(segments[segments.length - 1].endTime);
    }


    // Time offset can be specified on either Master or Media Playlist.
    // If Media Playlist provides it's own value, use that.
    // Otherwise, use value from the Master Playlist. If no offset
    // has been provided it will default to
    // this.config_.hls.defaultTimeOffset.
    var mediaPlaylistTimeOffset = this.getTimeOffset_(playlist);
    timeOffset = mediaPlaylistTimeOffset || timeOffset;

    var initSegmentReference = null;
    if (type != ContentType.TEXT) {
      initSegmentReference = this.createInitSegmentReference_(playlist);
    }

    this.presentationTimeline_.notifySegments(0, segments);

    if (!this.isLive_) {
      var duration =
          segments[segments.length - 1].endTime - segments[0].startTime;
      var presentationDuration = this.presentationTimeline_.getDuration();
      if (presentationDuration == Infinity || presentationDuration < duration) {
        this.presentationTimeline_.setDuration(duration);
      }
    }

    var codecs = this.guessCodecs_(type, allCodecs);

    var kind = undefined;

    var ManifestParserUtils = shaka.util.ManifestParserUtils;
    if (type == ManifestParserUtils.ContentType.TEXT)
      kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
    // TODO: CLOSED-CAPTIONS requires the parsing of CEA-608 from the video.

    var drmTags = [];
    playlist.segments.forEach(function(segment) {
      var segmentKeyTags = Utils.filterTagsByName(segment.tags, 'EXT-X-KEY');
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

    return this.guessMimeType_(type, codecs, segments[0].getUris()[0])
        .then(function(mimeType) {
          var stream = {
            id: this.globalId_++,
            createSegmentIndex: Promise.resolve.bind(Promise),
            findSegmentPosition: segmentIndex.find.bind(segmentIndex),
            getSegmentReference: segmentIndex.get.bind(segmentIndex),
            initSegmentReference: initSegmentReference,
            presentationTimeOffset: timeOffset || 0,
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
            lastSegmentSeen: segments[segments.length - 1]
          };
        }.bind(this));
  }.bind(this));
};


/**
 * @param {!shaka.hls.Playlist} playlist
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.setPresentationType_ = function(playlist) {
  var Utils = shaka.hls.Utils;
  var presentationTypeTag = Utils.getFirstTagWithName(playlist.tags,
                                                      'EXT-X-PLAYLIST-TYPE');
  var endlistTag = Utils.getFirstTagWithName(playlist.tags, 'EXT-X-ENDLIST');
  var isVod = endlistTag || (presentationTypeTag &&
                             presentationTypeTag.value == 'VOD');
  if (isVod) {
    this.setLive_(false);
  } else if (!presentationTypeTag) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_LIVE_CONTENT_NOT_SUPPORTED);
  } else {
    // presentation type EVENT
    var targetDurationTag = this.getRequiredTag_(playlist.tags,
                                                 'EXT-X-TARGETDURATION');
    var targetDuration = Number(targetDurationTag.value);
    // According to HLS spec, updates should not happen more often than
    // once in targetDuration. It also requires to only update the active
    // variant. We might implement that later, but for now every variant
    // will be updated. To get the update period, choose the smallest
    // targetDuration value across all playlists.
    if (!this.updatePeriod_) {
      this.setLive_(true);
      this.updatePeriod_ = targetDuration;
    } else if (this.updatePeriod_ > targetDuration) {
      this.updatePeriod_ = targetDuration;
    }

    // Update longest target duration if need be to use as a presentation
    // delay later.
    this.maxTargetDuration_ = Math.max(targetDuration, this.maxTargetDuration_);
  }
};


/**
 * @param {number} endTime
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.createPresentationTimeline_ = function(endTime) {
  var presentationStartTime = null;
  var delay = 0;

  if (this.isLive_) {
    presentationStartTime = (Date.now() / 1000) - endTime;

    // We should have a delay of at least 3 target durations.
    delay = this.maxTargetDuration_ * 3;
  }

  this.presentationTimeline_ = new shaka.media.PresentationTimeline(
      presentationStartTime, delay);
  this.presentationTimeline_.setStatic(!this.isLive_);
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
 * Parses shaka.hls.Segment objects into shaka.media.SegmentReferences.
 *
 * @param {!shaka.hls.Playlist} playlist
 * @param {number} startPosition
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.hls.HlsParser.prototype.createSegments_ =
    function(playlist, startPosition) {
  var hlsSegments = playlist.segments;
  var segments = [];

  hlsSegments.forEach(function(segment) {
    var Utils = shaka.hls.Utils;
    var tags = segment.tags;
    var uri = Utils.constructAbsoluteUri(playlist.uri, segment.uri);

    // Start and end times
    var extinfTag = this.getRequiredTag_(tags, 'EXTINF');
    // EXTINF tag format is '#EXTINF:<duration>,[<title>]'.
    // We're interested in the duration part.
    var extinfValues = extinfTag.value.split(',');
    var duration = Number(extinfValues[0]);
    var startTime;
    var index = hlsSegments.indexOf(segment);
    if (index == 0) {
      startTime = 0;
    } else {
      startTime = segments[index - 1].endTime;
    }
    var endTime = startTime + duration;

    // StartByte and EndByte
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
        startByte = segments[index - 1].endByte + 1;
      }
      endByte = startByte + byteLength - 1;

      // Last segment has endByte of null to indicate that it extends
      // to the end of the resource.
      if (index == hlsSegments.length - 1)
        endByte = null;
    }
    segments.push(new shaka.media.SegmentReference(startPosition + index,
                                                   startTime,
                                                   endTime,
                                                   function() { return [uri]; },
                                                   startByte,
                                                   endByte));
  }.bind(this));

  return segments;
};


/**
 * Adjusts segment references of every stream of every variant to the
 * timeline of the presentation.
 * @param {!Array.<!shakaExtern.Variant>} variants
 * @private
 */
shaka.hls.HlsParser.prototype.fitSegments_ = function(variants) {
  variants.forEach(function(variant) {
    var duration = this.presentationTimeline_.getDuration();
    var video = variant.video;
    var audio = variant.audio;
    if (video && this.streamsToIndexMap_[video.id]) {
      this.streamsToIndexMap_[video.id].fit(duration);
    }
    if (audio && this.streamsToIndexMap_[audio.id]) {
      this.streamsToIndexMap_[audio.id].fit(duration);
    }
  }.bind(this));
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
 * @param {!string} uri
 * @return {!Promise.<!string>}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.prototype.guessMimeType_ =
    function(contentType, codecs, uri) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var HlsParser = shaka.hls.HlsParser;

  var blocks = uri.split('.');
  var extension = blocks[blocks.length - 1];
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
      [uri], this.config_.retryParameters);
  headRequest.method = 'HEAD';
  var requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  return this.playerInterface_.networkingEngine.request(
      requestType, headRequest)
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
 * Get presentation time offset of the playlist if it has been specified.
 * Return null otherwise.
 *
 * @param {!shaka.hls.Playlist} playlist
 * @return {?number}
 * @private
 */
shaka.hls.HlsParser.prototype.getTimeOffset_ = function(playlist) {
  var Utils = shaka.hls.Utils;
  var startTag = Utils.getFirstTagWithName(playlist.tags, 'EXT-X-START');
  // TODO: Should we respect the PRECISE flag?
  // https://tools.ietf.org/html/draft-pantos-http-live-streaming-20#section-4.3.5.2
  if (startTag)
    return Number(shaka.hls.HlsParser.getRequiredAttributeValue_(
        startTag, 'TIME-OFFSET'));

  return this.config_.hls.defaultTimeOffset;
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
  return this.playerInterface_.networkingEngine.request(requestType, request);
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
  if (method != 'SAMPLE-AES-CENC') {
    shaka.log.error(
        'Widevine in HLS is only supported with SAMPLE-AES-CENC, not', method);
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
 * @param {boolean} live
 * @private
 */
shaka.hls.HlsParser.prototype.setLive_ = function(live) {
  this.isLive_ = live;

  if (this.presentationTimeline_)
    this.presentationTimeline_.setStatic(!live);

  if (!live) {
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


shaka.media.ManifestParser.registerParserByExtension(
    'm3u8', shaka.hls.HlsParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/x-mpegurl', shaka.hls.HlsParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/vnd.apple.mpegurl', shaka.hls.HlsParser);
