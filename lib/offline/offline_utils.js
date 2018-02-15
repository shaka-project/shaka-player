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

goog.provide('shaka.offline.OfflineUtils');

goog.require('goog.asserts');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.StreamUtils');


/**
 * @param {string} originalUri
 * @param {shakaExtern.Manifest} manifest
 * @param {number} size
 * @param {!Object} metadata
 * @return {shakaExtern.StoredContent}
 */
shaka.offline.OfflineUtils.createStoredContentFromManifest = function(
    originalUri, manifest, size, metadata) {
  goog.asserts.assert(
      manifest.periods.length,
      'Cannot create stored content from manifest with no periods.');

  /** @type {!number} */
  var expiration = manifest.expiration == undefined ?
                   Infinity :
                   manifest.expiration;

  /** @type {number} */
  var duration = manifest.presentationTimeline.getDuration();

  /** @type {shakaExtern.Period} */
  var firstPeriod = manifest.periods[0];

  /** @type {!Array.<shakaExtern.Track>} */
  var tracks = shaka.util.StreamUtils.getTracks(firstPeriod);

  /** @type {shakaExtern.StoredContent} */
  var content = {
    offlineUri: null,
    originalManifestUri: originalUri,
    duration: duration,
    size: size,
    expiration: expiration,
    tracks: tracks,
    appMetadata: metadata
  };

  return content;
};


/**
 * @param {string} offlineUri
 * @param {shakaExtern.ManifestDB} manifestDB
 * @return {shakaExtern.StoredContent}
 */
shaka.offline.OfflineUtils.createStoredContentFromManifestDB = function(
    offlineUri, manifestDB) {
  goog.asserts.assert(
      manifestDB.periods.length,
      'Cannot create stored content from manifestDB with no periods.');

  /** @type {shakaExtern.PeriodDB} */
  var firstPeriodDB = manifestDB.periods[0];
  /** @type {!shaka.media.PresentationTimeline} */
  var timeline = new shaka.media.PresentationTimeline(null, 0);
  /** @type {!Array.<shakaExtern.DrmInfo>} */
  var drmInfo = [];
  /** @type {shakaExtern.Period} */
  var firstPeriod = shaka.offline.OfflineUtils.reconstructPeriod(
      firstPeriodDB, drmInfo, timeline);

  /** @type {!Object} */
  var metadata = manifestDB.appMetadata || {};

  /** @type {!Array.<shakaExtern.Track>} */
  var tracks = shaka.util.StreamUtils.getTracks(firstPeriod);

  /** @type {shakaExtern.StoredContent} */
  var content = {
    offlineUri: offlineUri,
    originalManifestUri: manifestDB.originalManifestUri,
    duration: manifestDB.duration,
    size: manifestDB.size,
    expiration: manifestDB.expiration,
    tracks: tracks,
    appMetadata: metadata
  };

  return content;
};


/**
 * Reconstructs a period object from the given database period.
 *
 * @param {shakaExtern.PeriodDB} period
 * @param {!Array.<shakaExtern.DrmInfo>} drmInfos
 * @param {shaka.media.PresentationTimeline} timeline
 * @return {shakaExtern.Period}
 */
shaka.offline.OfflineUtils.reconstructPeriod = function(
    period, drmInfos, timeline) {
  var OfflineUtils = shaka.offline.OfflineUtils;

  /** @type {!Array.<shakaExtern.StreamDB>} */
  var audioStreams = period.streams.filter(OfflineUtils.isAudio_);
  /** @type {!Array.<shakaExtern.StreamDB>} */
  var videoStreams = period.streams.filter(OfflineUtils.isVideo_);

  /** @type {!Array.<shakaExtern.Variant>} */
  var variants = OfflineUtils.recreateVariants(
      audioStreams, videoStreams, drmInfos);

  /** @type {!Array.<shakaExtern.Stream>} */
  var textStreams = period.streams
      .filter(OfflineUtils.isText_)
      .map(OfflineUtils.createStream_);

  period.streams.forEach(function(stream, i) {
    /** @type {!Array.<shaka.media.SegmentReference>} */
    var refs = stream.segments.map(function(segment, index) {
      return OfflineUtils.segmentDBToSegmentReference_(index, segment);
    });

    timeline.notifySegments(refs, i == 0);
  });

  return {
    startTime: period.startTime,
    variants: variants,
    textStreams: textStreams
  };
};


/**
 * @param {number} index
 * @param {shakaExtern.SegmentDB} segment
 * @return {shaka.media.SegmentReference}
 * @private
 */
shaka.offline.OfflineUtils.segmentDBToSegmentReference_ = function(index,
                                                                   segment) {
  /** @const */
  var OfflineUri = shaka.offline.OfflineUri;

  /** @type {number} */
  var startByte = 0;
  /** @type {?number} */
  var endByte = null;

  /** @type {number} */
  var startTime = segment.startTime;
  /** @type {number} */
  var endTime = segment.endTime;
  /** @type {string} */
  var uri = OfflineUri.segmentIdToUri(segment.dataKey);

  /**
   * @return {!Array.<string>}
   */
  var getUris = function() { return [uri]; };

  return new shaka.media.SegmentReference(
      index, startTime, endTime, getUris, startByte, endByte);
};


/**
 * Recreates Variants from audio and video StreamDB collections.
 *
 * @param {!Array.<!shakaExtern.StreamDB>} audios
 * @param {!Array.<!shakaExtern.StreamDB>} videos
 * @param {!Array.<!shakaExtern.DrmInfo>} drmInfos
 * @return {!Array.<!shakaExtern.Variant>}
 */
shaka.offline.OfflineUtils.recreateVariants = function(
    audios, videos, drmInfos) {
  var MapUtils = shaka.util.MapUtils;
  var OfflineUtils = shaka.offline.OfflineUtils;

  // Create a variant for each variant id.
  /** @type {!Object.<number, shakaExtern.Variant>} */
  var variantMap = {};

  var allStreams = [];
  allStreams.push.apply(allStreams, audios);
  allStreams.push.apply(allStreams, videos);

  allStreams.forEach(function(stream) {
    stream.variantIds.forEach(function(id) {
      if (!variantMap[id]) {
        variantMap[id] = OfflineUtils.createEmptyVariant_(id, drmInfos);
      }
    });
  });

  // Assign each audio stream to its variants.
  audios.forEach(function(audio) {
    /** @type {shakaExtern.Stream} */
    var stream = OfflineUtils.createStream_(audio);

    audio.variantIds.forEach(function(id) {
      var variant = variantMap[id];
      OfflineUtils.addAudioToVariant_(variant, stream);
    });
  });

  // Assign each video stream to its variants.
  videos.forEach(function(video) {
    /** @type {shakaExtern.Stream} */
    var stream = OfflineUtils.createStream_(video);

    video.variantIds.forEach(function(id) {
      var variant = variantMap[id];
      OfflineUtils.addVideoToVariant_(variant, stream);
    });
  });

  return MapUtils.values(variantMap);
};


/**
 * @param {shakaExtern.Variant} variant
 * @param {shakaExtern.Stream} audio
 * @private
 */
shaka.offline.OfflineUtils.addAudioToVariant_ = function(variant, audio) {
  goog.asserts.assert(
      shaka.util.StreamUtils.isAudio(audio),
      'Only audio streams can be treated as audio.');

  goog.asserts.assert(
      !variant.audio, 'A variant should only have one audio stream');

  variant.language = audio.language;
  variant.primary = variant.primary || audio.primary;
  variant.audio = audio;
};


/**
 * @param {shakaExtern.Variant} variant
 * @param {shakaExtern.Stream} video
 * @private
 */
shaka.offline.OfflineUtils.addVideoToVariant_ = function(variant, video) {
  goog.asserts.assert(
      shaka.util.StreamUtils.isVideo(video),
      'Only video streams can be treated as video.');

  goog.asserts.assert(
      !variant.video, 'A variant should only have one video stream');

  variant.primary = variant.primary || video.primary;
  variant.video = video;
};


/**
 * Create an empty Variant.
 *
 * @param {number} id
 * @param {!Array.<!shakaExtern.DrmInfo>} drmInfos
 * @return {!shakaExtern.Variant}
 * @private
 */
shaka.offline.OfflineUtils.createEmptyVariant_ = function(id, drmInfos) {
  return {
    id: id,
    language: '',
    primary: false,
    audio: null,
    video: null,
    bandwidth: 0,
    drmInfos: drmInfos,
    allowedByApplication: true,
    allowedByKeySystem: true
  };
};


/**
 * Creates a shakaExtern.Stream from a StreamDB.
 *
 * @param {shakaExtern.StreamDB} streamDB
 * @return {shakaExtern.Stream}
 * @private
 */
shaka.offline.OfflineUtils.createStream_ = function(streamDB) {
  /** @const */
  var OfflineUtils = shaka.offline.OfflineUtils;

  /** @type {!Array.<shaka.media.SegmentReference>} */
  var segments = streamDB.segments.map(function(segment, index) {
    return OfflineUtils.segmentDBToSegmentReference_(index, segment);
  });

  /** @type {!shaka.media.SegmentIndex} */
  var segmentIndex = new shaka.media.SegmentIndex(segments);

  /** @type {shakaExtern.Stream} */
  var stream = {
    id: streamDB.id,
    createSegmentIndex: Promise.resolve.bind(Promise),
    findSegmentPosition: segmentIndex.find.bind(segmentIndex),
    getSegmentReference: segmentIndex.get.bind(segmentIndex),
    initSegmentReference: null,
    presentationTimeOffset: streamDB.presentationTimeOffset,
    mimeType: streamDB.mimeType,
    codecs: streamDB.codecs,
    width: streamDB.width || undefined,
    height: streamDB.height || undefined,
    frameRate: streamDB.frameRate || undefined,
    kind: streamDB.kind,
    encrypted: streamDB.encrypted,
    keyId: streamDB.keyId,
    language: streamDB.language,
    label: streamDB.label || null,
    type: streamDB.contentType,
    primary: streamDB.primary,
    trickModeVideo: null,
    // TODO(modmaker): Store offline?
    containsEmsgBoxes: false,
    roles: [],
    channelsCount: null
  };

  if (streamDB.initSegmentKey != null) {
    stream.initSegmentReference =
        OfflineUtils.createInitSegment_(streamDB.initSegmentKey);
  }

  return stream;
};


/**
 * @param {number} initKey
 * @return {!shaka.media.InitSegmentReference}
 * @private
 */
shaka.offline.OfflineUtils.createInitSegment_ = function(initKey) {
  /** @const */
  var OfflineUri = shaka.offline.OfflineUri;

  /** @type {string} */
  var initUri = OfflineUri.segmentIdToUri(initKey);
  /**
   * @return {!Array.<string>}
   */
  var getInitUris = function() { return [initUri]; };

  /** @type {number} */
  var startBytes = 0;
  /** @type {?number} */
  var endBytes = null;

  return new shaka.media.InitSegmentReference(
      getInitUris,
      startBytes,
      endBytes);
};


/**
 * @param {shakaExtern.StreamDB} stream
 * @return {boolean}
 * @private
 */
shaka.offline.OfflineUtils.isAudio_ = function(stream) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.contentType == ContentType.AUDIO;
};


/**
 * @param {shakaExtern.StreamDB} stream
 * @return {boolean}
 * @private
 */
shaka.offline.OfflineUtils.isVideo_ = function(stream) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.contentType == ContentType.VIDEO;
};


/**
 * @param {shakaExtern.StreamDB} stream
 * @return {boolean}
 * @private
 */
shaka.offline.OfflineUtils.isText_ = function(stream) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  return stream.contentType == ContentType.TEXT;
};
