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
goog.require('shaka.offline.OfflineScheme');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.StreamUtils');


/**
 * Converts the given database manifest to a storedContent structure.
 *
 * @param {shakaExtern.ManifestDB} manifest
 * @return {shakaExtern.StoredContent}
 */
shaka.offline.OfflineUtils.createStoredContent = function(manifest) {
  goog.asserts.assert(manifest.key >= 0, 'Manifest keys must be positive');
  goog.asserts.assert(manifest.periods.length > 0,
                      'Must be at least one Period.');

  // Reconstruct the first period to get the variants
  var timeline = new shaka.media.PresentationTimeline(null, 0);
  var period = shaka.offline.OfflineUtils.reconstructPeriod(
      manifest.periods[0], [], timeline);

  /** @type {!Array.<shakaExtern.Track>} */
  var tracks = shaka.util.StreamUtils.getTracks(period);

  return {
    offlineUri: shaka.offline.OfflineScheme.manifestIdToUri(manifest.key),
    originalManifestUri: manifest.originalManifestUri,
    duration: manifest.duration,
    size: manifest.size,
    expiration: manifest.expiration == undefined ? Infinity :
                                                   manifest.expiration,
    tracks: tracks,
    appMetadata: manifest.appMetadata
  };
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

  period.streams.forEach(function(streamDb) {
    var refs = OfflineUtils.getSegmentReferences_(streamDb);
    timeline.notifySegments(period.startTime, refs);
  });

  return {
    startTime: period.startTime,
    variants: variants,
    textStreams: textStreams
  };
};


/**
 * @param {!shakaExtern.StreamDB} streamDb
 * @return {!Array.<!shaka.media.SegmentReference>}
 * @private
 */
shaka.offline.OfflineUtils.getSegmentReferences_ = function(streamDb) {
  return streamDb.segments.map(function(segment, i) {
    var getUris = function() { return [segment.uri]; };
    return new shaka.media.SegmentReference(
        i, segment.startTime, segment.endTime, getUris, 0, null);
  });
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

  // There are three cases:
  //  1. All streams' variant ids are null
  //  2. All streams' variant ids are non-null
  //  3. Some streams' variant ids are null and other are non-null
  // Case 3 is invalid and should never happen in production.

  /** @type {!Array.<!shakaExtern.StreamDB>} */
  var allStreams = [];
  allStreams.push.apply(allStreams, audios);
  allStreams.push.apply(allStreams, videos);

  var allVariantIdsNull =
      allStreams.every(function(stream) { return stream.variantIds == null; });

  var allVariantIdsNonNull =
      allStreams.every(function(stream) { return stream.variantIds != null; });

  // Case 3
  goog.asserts.assert(
      allVariantIdsNull || allVariantIdsNonNull,
      'All variant ids should be null or non-null.');

  // Convert Case 1 to Case 2
  // TODO (vaage) : Move the conversion of case 1 to case 2 to a storage upgrade
  //                section of code.
  if (allVariantIdsNull) {
    // Since all the variant ids are null, we need to first make them into
    // valid arrays.
    allStreams.forEach(function(stream) {
      stream.variantIds = [];
    });

    /** @type {number} */
    var currentVariantId = 0;

    // It is not possible in the pre-variant world of shaka to have audio-only
    // and video-only content mixed in with audio-video content. So we can
    // assume that there is only audio-only or video-only if one group is empty.
    if (audios.length == 0 || videos.length == 0) {
      // Create all audio only and all video only variants.
      allStreams.forEach(function(stream) {
        stream.variantIds.push(currentVariantId);
        currentVariantId++;
      });
    } else {
      // Create all audio and video variants.
      audios.forEach(function(audio) {
        videos.forEach(function(video) {
          audio.variantIds.push(currentVariantId);
          video.variantIds.push(currentVariantId);

          currentVariantId++;
        });
      });
    }
  }

  // Create a variant for each variant id.
  /** @type {!Object.<number, shakaExtern.Variant>} */
  var variantMap = {};
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
 * @param {shakaExtern.StreamDB} streamDb
 * @return {shakaExtern.Stream}
 * @private
 */
shaka.offline.OfflineUtils.createStream_ = function(streamDb) {
  var refs =
      shaka.offline.OfflineUtils.getSegmentReferences_(streamDb);

  var segmentIndex = new shaka.media.SegmentIndex(refs);

  var initRef = streamDb.initSegmentUri ?
      new shaka.media.InitSegmentReference(
          function() { return [streamDb.initSegmentUri]; }, 0, null) :
      null;
  return {
    id: streamDb.id,
    createSegmentIndex: Promise.resolve.bind(Promise),
    findSegmentPosition: segmentIndex.find.bind(segmentIndex),
    getSegmentReference: segmentIndex.get.bind(segmentIndex),
    initSegmentReference: initRef,
    presentationTimeOffset: streamDb.presentationTimeOffset,
    mimeType: streamDb.mimeType,
    codecs: streamDb.codecs,
    width: streamDb.width || undefined,
    height: streamDb.height || undefined,
    frameRate: streamDb.frameRate || undefined,
    kind: streamDb.kind,
    encrypted: streamDb.encrypted,
    keyId: streamDb.keyId,
    language: streamDb.language,
    label: streamDb.label || null,
    type: streamDb.contentType,
    primary: streamDb.primary,
    trickModeVideo: null,
    // TODO(modmaker): Store offline?
    containsEmsgBoxes: false,
    roles: [],
    channelsCount: null
  };
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
