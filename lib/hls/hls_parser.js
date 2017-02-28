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
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');



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

  /** @private {!Object.<number, shakaExtern.Stream>} */
  this.mediaTagsToStreamsMap_ = {};

  /** @private {?shaka.media.PresentationTimeline} */
  this.presentationTimeline_ = null;

  /** @private {!string} */
  this.manifestUri_ = '';

  /** @private {shaka.hls.ManifestTextParser} */
  this.manifestTextParser_ = new shaka.hls.ManifestTextParser();
};


/**
 * @typedef {{
 *   createSegmentIndex: shakaExtern.CreateSegmentIndexFunction,
 *   findSegmentPosition: shakaExtern.FindSegmentPositionFunction,
 *   getSegmentReference: shakaExtern.GetSegmentReferenceFunction,
 *   initSegmentReference: shaka.media.InitSegmentReference,
 *   presentationTimeOffset: (number|undefined),
 *   mimeType: string,
 *   codecs: string,
 *   kind: (string|undefined)
 * }}
 *
 * @description
 * Contains information about a Stream.  This is passed from the createStream
 * methods.
 *
 * @property {shakaExtern.CreateSegmentIndexFunction} createSegmentIndex
 *   The createSegmentIndex function for the stream.
 * @property {shakaExtern.FindSegmentPositionFunction} findSegmentPosition
 *   The findSegmentPosition function for the stream.
 * @property {shakaExtern.GetSegmentReferenceFunction} getSegmentReference
 *   The getSegmentReference function for the stream.
 * @property {shaka.media.InitSegmentReference} initSegmentReference
 *   The init segment for the stream.
 * @property {(number|undefined)} presentationTimeOffset
 *   The presentation time offset of the stream.
 * @property {string} mimeType
 *   The mimeType for the stream.
 * @property {string} codecs
 *   The codecs for the stream.
 * @property {(string|undefined)} kind
 *   The kind for the stream if there is one. (Only for text streams).
 */
shaka.hls.HlsParser.StreamInfo;


/** @override */
shaka.hls.HlsParser.prototype.configure = function(config) {
  this.config_ = config;
};


/** @override */
shaka.hls.HlsParser.prototype.start = function(uri, playerInterface) {
  goog.asserts.assert(this.config_, 'Must call configure() before start()!');
  this.playerInterface_ = playerInterface;
  this.manifestUri_ = uri;
  return this.requestManifest_(uri).then(function(response) {
    return this.parseManifest_(response.data, uri);
  }.bind(this));
};


/** @override */
shaka.hls.HlsParser.prototype.stop = function() {
  this.playerInterface_ = null;
  this.config_ = null;
  this.mediaTagsToStreamsMap_ = {};

  return Promise.resolve();
};


/**
 * Parses the manifest.
 *
 * @param {!ArrayBuffer} data
 * @param {string} uri
 * @return {!Promise.<!shakaExtern.Manifest>}
 * @throws shaka.util.Error When there is a parsing error.
 * @private
 */
shaka.hls.HlsParser.prototype.parseManifest_ = function(data, uri) {
  var playlist = this.manifestTextParser_.parsePlaylist(data, uri);

  // We don't support directly providing a Media Playlist.
  // See error code for details.
  if (playlist.type != shaka.hls.PlaylistType.MASTER) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_MASTER_PLAYLIST_NOT_PROVIDED);
  }

  // TODO: Implement support for live content.
  this.presentationTimeline_ = new shaka.media.PresentationTimeline(null, 0);
  return this.createPeriod_(playlist).then(function(period) {
    // HLS has no notion of periods. We're treating the whole presentation as
    // one period.
    this.playerInterface_.filterPeriod(period);
    return {
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
  var tags = playlist.tags;

  // Create Variants for every 'EXT-X-STREAM-INF' tag.
  var variantTags = Utils.filterTagsByName(tags, 'EXT-X-STREAM-INF');
  var variantsPromises = variantTags.map(function(tag) {
    return this.createVariant_(tag, playlist);
  }.bind(this));

  var mediaTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-MEDIA');
  var textStreamTags = mediaTags.filter(function(tag) {
    var type = this.getRequiredAttributeValue_(tag, 'TYPE');
    return type == 'SUBTITLES';
  }.bind(this));
  // TODO: CLOSED-CAPTIONS requires the parsing of CEA-608 from the video.

  var textStreamPromises = textStreamTags.map(function(tag) {
    return this.createTextStream_(tag, playlist);
  }.bind(this));

  return Promise.all(variantsPromises).then(function(variants) {
    return Promise.all(textStreamPromises).then(function(textStreams) {
      return {
        startTime: 0,
        variants: variants,
        textStreams: textStreams
      };
    });
  });
};


/**
 * Parses an EXT-X-STREAM-INF tag into a Variant.
 *
 * @param {!shaka.hls.Tag} tag
 * @param {!shaka.hls.Playlist} playlist
 * @return {!Promise.<!shakaExtern.Variant>}
 * @private
 */
shaka.hls.HlsParser.prototype.createVariant_ = function(tag, playlist) {
  goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
                      'Should only be called on variant tags!');

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var bandwidth = Number(this.getRequiredAttributeValue_(tag, 'BANDWIDTH'));
  // TODO(ismena): Implement support for protected content.
  var drmInfos = [];

  return this.createStreamsForVariant_(tag, playlist)
      .then(function(streamsByType) {
        var audio = streamsByType[ContentType.AUDIO];
        var video = streamsByType[ContentType.VIDEO];
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
      }.bind(this));
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

  var type = this.getRequiredAttributeValue_(tag, 'TYPE');
  goog.asserts.assert(type == 'SUBTITLES',
                      'Should only be called on tags with TYPE="SUBTITLES"!');

  var timeOffset = this.getTimeOffset_(playlist);
  return this.createStreamFromMediaTag_(tag, [], timeOffset);
};


/**
 * Creates audio and video streams for the Variant.
 *
 * @param {!shaka.hls.Tag} tag
 * @param {!shaka.hls.Playlist} playlist
 * @return {!Promise.<!Object.<string, ?shakaExtern.Stream>>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamsForVariant_ =
    function(tag, playlist) {
  var Utils = shaka.hls.Utils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var streamsByType = {};
  var videoTag = null;
  var audioTag = null;

  var codecs = this.getRequiredAttributeValue_(tag, 'CODECS').split(',');
  var resolutionAttr = tag.getAttribute('RESOLUTION');
  var width;
  var height;
  var frameRate;

  var frameRateAttr = tag.getAttribute('FRAME-RATE');
  if (frameRateAttr)
    frameRate = frameRateAttr.value;

  if (resolutionAttr) {
    var resBlocks = resolutionAttr.value.split('x');
    width = resBlocks[0];
    height = resBlocks[1];
  }

  var timeOffset = this.getTimeOffset_(playlist);

  var mediaTags = Utils.filterTagsByName(playlist.tags, 'EXT-X-MEDIA');

  var audioAttr = tag.getAttribute('AUDIO');
  var videoAttr = tag.getAttribute('VIDEO');

  if (audioAttr)
    audioTag = Utils.findMediaTag(mediaTags, 'AUDIO', audioAttr.value);

  if (videoAttr)
    videoTag = Utils.findMediaTag(mediaTags, 'VIDEO', videoAttr.value);

  return this.createStreamFromMediaTag_(audioTag, codecs, timeOffset)
      .then(function(stream) {
        streamsByType[ContentType.AUDIO] = stream;
        return this.createStreamFromMediaTag_(videoTag, codecs, timeOffset);
      }.bind(this)).then(function(stream) {
        this.addVideoAttributes_(stream, width, height, frameRate);
        streamsByType[ContentType.VIDEO] = stream;
        var audio = streamsByType[ContentType.AUDIO];
        var video = streamsByType[ContentType.VIDEO];
        // TODO: find examples of audio-only variants and account
        // for them.
        if (video && audio) {
          // Both audio and video streams have already been created.
          return streamsByType;
        } else if (video && !audio) {
          // If video stream has been described by a media tag,
          // assume the underlying uri describes audio.
          return this.createStreamFromVariantTag_(tag, codecs,
                                                  ContentType.AUDIO,
                                                  timeOffset)
              .then(function(stream) {
                streamsByType[ContentType.AUDIO] = stream;
                return streamsByType;
              });
        } else {
          // In any other case (video-only variants, multiplexed
          // content audio described by a media tag) assume the
          // underlying uri describes video.
          return this.createStreamFromVariantTag_(tag, codecs,
                                                  ContentType.VIDEO,
                                                  timeOffset)
              .then(function(stream) {
                streamsByType[ContentType.VIDEO] = stream;
                this.addVideoAttributes_(
                   stream, width, height, frameRate);
                return streamsByType;
              }.bind(this));
        }
      }.bind(this));
};


/**
 * Parse EXT-X-MEDIA media tag into a Stream object.
 *
 * @param {?shaka.hls.Tag} tag
 * @param {!Array.<!string>} allCodecs
 * @param {?number} timeOffset
 * @return {!Promise.<?shakaExtern.Stream>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamFromMediaTag_ =
    function(tag, allCodecs, timeOffset) {
  if (!tag) {
    // Promise.resolve(value) seems to misbehave:
    // https://github.com/google/closure-compiler/issues/1887
    return Promise.resolve().then(function() { return null; });
  }
  goog.asserts.assert(tag.name == 'EXT-X-MEDIA',
                      'Should only be called on media tags!');

  // Check if the stream has already been created as part of another Variant
  // and return it if it has.
  if (this.mediaTagsToStreamsMap_[tag.id]) {
    return Promise.resolve().then(function() {
      return this.mediaTagsToStreamsMap_[tag.id];
    }.bind(this));
  }

  var type = this.getRequiredAttributeValue_(tag, 'TYPE').toLowerCase();
  // Shaka recognizes content types 'audio', 'video' and 'text'.
  // HLS 'subtitles' type needs to be mapped to 'text'.
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (type == 'subtitles') type = ContentType.TEXT;
  var language = 'und';
  var langAttr = tag.getAttribute('LANGUAGE');
  if (langAttr) language = langAttr.value;
  var defaultAttr = tag.getAttribute('DEFAULT');
  var autoselectAttr = tag.getAttribute('AUTOSELECT');
  // TODO: Should we take into account some of the currently ignored attributes:
  // FORCED, INSTREAM-ID, CHARACTERISTICS, CHANNELS?
  // Attribute descriptions:
  // https://tools.ietf.org/html/draft-pantos-http-live-streaming-20#section-4.3.4.1

  var uri = this.getRequiredAttributeValue_(tag, 'URI');
  return this.createStreamInfo_(uri, allCodecs, type, timeOffset)
         .then(function(streamInfo) {
        /** @type {shakaExtern.Stream} */
        // Explicitly cast the variable to shakaExtern.Stream
        // to satisfy the compiler.
        var stream =  /** @type {shakaExtern.Stream} */ ({
          id: this.globalId_++,
          createSegmentIndex: streamInfo.createSegmentIndex,
          findSegmentPosition: streamInfo.findSegmentPosition,
          getSegmentReference: streamInfo.getSegmentReference,
          initSegmentReference: streamInfo.initSegmentReference,
          presentationTimeOffset: streamInfo.presentationTimeOffset,
          mimeType: streamInfo.mimeType,
          codecs: streamInfo.codecs,
          kind: streamInfo.kind,
          // TODO: encrypted content
          encrypted: false,
          keyId: null,
          language: language,
          type: type,
          primary: !!defaultAttr || !!autoselectAttr,
          // TODO: trick mode
          trickModeVideo: null,
          containsEmsgBoxes: false,
          frameRate: undefined,
          width: undefined,
          height: undefined,
          bandwidth: undefined
        });

        this.mediaTagsToStreamsMap_[tag.id] = stream;
        return stream;
      }.bind(this));
};


/**
 * Parse EXT-X-STREAM-INF media tag into a Stream object.
 *
 * @param {!shaka.hls.Tag} tag
 * @param {!Array.<!string>} allCodecs
 * @param {!string} type
 * @param {?number} timeOffset
 * @return {!Promise.<shakaExtern.Stream>}
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamFromVariantTag_ =
    function(tag, allCodecs, type, timeOffset) {
  goog.asserts.assert(tag.name == 'EXT-X-STREAM-INF',
                      'Should only be called on media tags!');

  var uri = this.getRequiredAttributeValue_(tag, 'URI');
  return this.createStreamInfo_(uri, allCodecs, type, timeOffset)
         .then(function(streamInfo) {
        return {
          id: this.globalId_++,
          createSegmentIndex: streamInfo.createSegmentIndex,
          findSegmentPosition: streamInfo.findSegmentPosition,
          getSegmentReference: streamInfo.getSegmentReference,
          initSegmentReference: streamInfo.initSegmentReference,
          presentationTimeOffset: streamInfo.presentationTimeOffset,
          mimeType: streamInfo.mimeType,
          codecs: streamInfo.codecs,
          kind: streamInfo.kind,
          // TODO: encrypted content
          encrypted: false,
          keyId: null,
          language: 'und',
          type: type,
          primary: false,
          // TODO: trick mode
          trickModeVideo: null,
          containsEmsgBoxes: false,
          frameRate: undefined,
          width: undefined,
          height: undefined,
          bandwidth: undefined
        };
      }.bind(this));
};


/**
 * @param {!string} uri
 * @param {!Array.<!string>} allCodecs
 * @param {!string} type
 * @param {?number} timeOffset
 * @return {!Promise.<shaka.hls.HlsParser.StreamInfo>}
 * @throws shaka.util.Error
 * @private
 */
shaka.hls.HlsParser.prototype.createStreamInfo_ =
    function(uri, allCodecs, type, timeOffset) {
  var Utils = shaka.hls.Utils;
  uri = Utils.constructAbsoluteUri(this.manifestUri_, uri);

  return this.requestManifest_(uri).then(function(response) {
    var playlistData = response.data;
    var playlist = this.manifestTextParser_.parsePlaylist(playlistData, uri);
    if (playlist.type != shaka.hls.PlaylistType.MEDIA) {
      // EXT-X-MEDIA tags should point to media playlists.
      throw new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    }

    goog.asserts.assert(playlist.segments != null,
                        'Media playlist should have segments!');

    // Time offset can be specified on either Master or Media Playlist.
    // If Media Playlist provides it's own value, use that.
    // Otherwise, use value from the Master Playlist. If no offset
    // has been provided it will default to
    // shaka.hls.HlsParser.DEFAULT_TIME_OFFSET.
    var mediaPlaylistTimeOffset = this.getTimeOffset_(playlist);
    timeOffset = mediaPlaylistTimeOffset || timeOffset;

    var initSegmentReference = null;
    if (type != 'text') {
      initSegmentReference = this.createInitSegmentReference_(playlist);
    }
    var mediaSequenceTag = Utils.getFirstTagWithName(playlist.tags,
                                                     'EXT-X-MEDIA-SEQUENCE');

    var startPosition = mediaSequenceTag ? Number(mediaSequenceTag.value) : 0;
    var segments = this.createSegments_(playlist, startPosition);

    this.presentationTimeline_.notifySegments(0, segments);
    var duration =
        segments[segments.length - 1].endTime - segments[0].startTime;
    var presentationDuration = this.presentationTimeline_.getDuration();
    if (presentationDuration == Infinity || presentationDuration < duration) {
      this.presentationTimeline_.setDuration(duration);
    }

    var mimeType = this.guessMimeType_(type, segments[0].getUris()[0]);
    var codecs = this.guessCodecs_(type, allCodecs);

    var kind = undefined;

    var ManifestParserUtils = shaka.util.ManifestParserUtils;
    if (type == ManifestParserUtils.ContentType.TEXT)
      kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
    // TODO: CLOSED-CAPTIONS requires the parsing of CEA-608 from the video.

    var segmentIndex = new shaka.media.SegmentIndex(segments);

    return {
      createSegmentIndex: Promise.resolve.bind(Promise),
      findSegmentPosition: segmentIndex.find.bind(segmentIndex),
      getSegmentReference: segmentIndex.get.bind(segmentIndex),
      initSegmentReference: initSegmentReference,
      presentationTimeOffset: timeOffset || 0,
      mimeType: mimeType,
      codecs: codecs,
      kind: kind
    };
  }.bind(this));

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
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_MULTIPLE_MEDIA_INIT_SECTIONS_FOUND);
  }

  // Map tag example: #EXT-X-MAP:URI="main.mp4",BYTERANGE="720@0"
  var mapTag = mapTags[0];
  var initUri = this.getRequiredAttributeValue_(mapTag, 'URI');
  var uri = Utils.constructAbsoluteUri(playlist.uri, initUri);
  var startByte = 0;
  var endByte = null;
  var byterange = mapTag.getAttribute('BYTERANGE');
  // If BYTERANGE attribute is not specified, the segment consists
  // of the entire resourse.
  if (byterange) {
    var blocks = byterange.value.split('@');
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
        startByte = segments[index - 1].endByte;
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
 * Attempts to guess which codecs from the codecs list belong
 * to a given content type.
 *
 * @param {!string} contentType
 * @param {!Array.<!string>} codecs
 * @return {string}
 * @private
 * @throws {shaka.util.Error}
 */
// TODO(ismena): Can we give a list of codecs to Media Source without
// figuring out which codecs are associated with which stream?
shaka.hls.HlsParser.prototype.guessCodecs_ = function(contentType, codecs) {
  if (codecs.length == 1) {
    return codecs[0];
  }

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (contentType == ContentType.TEXT) {
    return '';
  }

  var HlsParser = shaka.hls.HlsParser;
  var formats = HlsParser.VIDEO_CODEC_FORMATS;
  if (contentType == ContentType.AUDIO)
    formats = HlsParser.AUDIO_CODEC_FORMATS;

  for (var i = 0; i < formats.length; i++) {
    for (var j = 0; j < codecs.length; j++) {
      if (formats[i].test(codecs[j])) {
        return codecs[j];
      }
    }
  }

  // Unable to guess codecs.
  throw new shaka.util.Error(
      shaka.util.Error.Category.MANIFEST,
      shaka.util.Error.Code.HLS_COULD_NOT_GUESS_CODECS,
      codecs);
};


/**
 * Attempts to guess stream's mime type based on content type and uri.
 *
 * @param {!string} contentType
 * @param {!string} uri
 * @return {!string}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.HlsParser.prototype.guessMimeType_ = function(contentType, uri) {
  var blocks = uri.split('.');
  var extension = blocks[blocks.length - 1];

  if (contentType == 'text') {
    // HLS only supports vtt at the moment.
    return 'text/vtt';
  }

  var HlsParser = shaka.hls.HlsParser;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var map = HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES;
  if (contentType == ContentType.VIDEO)
    map = HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES;

  var mimeType = map[extension];
  if (!mimeType) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_COULD_NOT_GUESS_MIME_TYPE,
        extension);
  }

  return mimeType;
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
    return Number(this.getRequiredAttributeValue_(startTag, 'TIME-OFFSET'));

  // The default time offset on Apple content is 10 seconds.
  // TODO: determine time offset by looking at the media itself.
  return shaka.hls.HlsParser.DEFAULT_TIME_OFFSET;
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
shaka.hls.HlsParser.prototype.getRequiredAttributeValue_ =
    function(tag, attributeName) {
  var attribute = tag.getAttribute(attributeName);
  if (!attribute) {
    throw new shaka.util.Error(
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
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_REQUIRED_TAG_MISSING, tagName);
  }

  return tag;
};


/**
 * @param {shakaExtern.Stream} stream
 * @param {!string|undefined} width
 * @param {!string|undefined} height
 * @param {!string|undefined} frameRate
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
 * A list of well-known video codecs formats.
 *
 * @const {!Array<!RegExp>}
 */
shaka.hls.HlsParser.VIDEO_CODEC_FORMATS = [
  /^(avc)/,
  /^(hvc)/,
  /^(vp[8-9])$/,
  /^(av1)$/,
  /^(mp4v)/
];


/**
 * A list of well-known audio codecs formats.
 *
 * @const {!Array<!RegExp>}
 */
shaka.hls.HlsParser.AUDIO_CODEC_FORMATS = [
  /^(vorbis)/,
  /^(opus)/,
  /^(mp4a)/,
  /^(ac-3)$/,
  /^(ec-3)$/
];


/**
 * @const {!Object<string, string>}
 */
// TODO: Extend support
shaka.hls.HlsParser.AUDIO_EXTENSIONS_TO_MIME_TYPES = {
  'mp4': 'audio/mp4',
  'm4s': 'audio/mp4',
  // mpeg2 ts aslo uses video/ for audio: http://goo.gl/tYHXiS
  'ts': 'video/mp2t'
};


/**
 * @const {!Object<string, string>}
 */
// TODO: Extend support
shaka.hls.HlsParser.VIDEO_EXTENSIONS_TO_MIME_TYPES = {
  'mp4': 'video/mp4',
  'm4s': 'video/mp4',
  'ts': 'video/mp2t'
};


/**
 * @const {number}
 */
shaka.hls.HlsParser.DEFAULT_TIME_OFFSET = 10;

shaka.media.ManifestParser.registerParserByExtension(
    'm3u8', shaka.hls.HlsParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/x-mpegurl', shaka.hls.HlsParser);
