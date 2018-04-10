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

goog.provide('shaka.offline.ManifestConverter');

goog.require('goog.asserts');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');


/**
 * Utility class for converting database manifest objects back to normal
 * player-ready objects. Used by the offline system to convert on-disk
 * objects back to the in-memory objects.
 */
shaka.offline.ManifestConverter = class {

  /**
   * Create a new manifest converter. Need to know the mechanism and cell that
   * the manifest is from so that all segments paths can be created.
   *
   * @param {string} mechanism
   * @param {string} cell
   */
  constructor(mechanism, cell) {
    /** @private {string} */
    this.mechanism_ = mechanism;
    /** @private {string} */
    this.cell_ = cell;
  }

  /**
   * Convert a |shakaExtern.ManifestDB| object to a |shakaExtern.Manifest|
   * object.
   *
   * @param {shakaExtern.ManifestDB} manifestDB
   * @return {shakaExtern.Manifest}
   */
  fromManifestDB(manifestDB) {
    let timeline = new shaka.media.PresentationTimeline(null, 0);
    timeline.setDuration(manifestDB.duration);

    let periods = manifestDB.periods.map((period) =>
        this.fromPeriodDB(period, timeline));

    let drmInfos = manifestDB.drmInfo ? [manifestDB.drmInfo] : [];
    if (manifestDB.drmInfo) {
      periods.forEach((period) => {
        period.variants.forEach((variant) => { variant.drmInfos = drmInfos; });
      });
    }

    return {
      presentationTimeline: timeline,
      minBufferTime: 2,
      offlineSessionIds: manifestDB.sessionIds,
      periods: periods
    };
  }

  /**
   * Create a period object from a database period.
   *
   * @param {shakaExtern.PeriodDB} period
   * @param {shaka.media.PresentationTimeline} timeline
   * @return {shakaExtern.Period}
   */
  fromPeriodDB(period, timeline) {
    /** @type {!Array.<shakaExtern.StreamDB>} */
    let audioStreams = period.streams.filter((stream) => this.isAudio_(stream));
    /** @type {!Array.<shakaExtern.StreamDB>} */
    let videoStreams = period.streams.filter((stream) => this.isVideo_(stream));

    /** @type {!Array.<shakaExtern.Variant>} */
    let variants = this.createVariants(audioStreams, videoStreams);

    /** @type {!Array.<shakaExtern.Stream>} */
    let textStreams = period.streams
        .filter((stream) => this.isText_(stream))
        .map((stream) => this.fromStreamDB_(stream));

    period.streams.forEach((stream, i) => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      let refs = stream.segments.map((segment, index) => {
        return this.fromSegmentDB_(index, segment);
      });

      timeline.notifySegments(refs, i == 0);
    });

    return {
      startTime: period.startTime,
      variants: variants,
      textStreams: textStreams
    };
  }

  /**
   * Recreates Variants from audio and video StreamDB collections.
   *
   * @param {!Array.<!shakaExtern.StreamDB>} audios
   * @param {!Array.<!shakaExtern.StreamDB>} videos
   * @return {!Array.<!shakaExtern.Variant>}
   */
  createVariants(audios, videos) {
    const MapUtils = shaka.util.MapUtils;

    // Create a variant for each variant id.
    /** @type {!Object.<number, shakaExtern.Variant>} */
    let variantMap = {};

    let allStreams = [];
    allStreams.push.apply(allStreams, audios);
    allStreams.push.apply(allStreams, videos);

    // Create a variant for each variant id across all the streams.
    allStreams.forEach((stream) => {
      stream.variantIds.forEach((id) => {
        variantMap[id] = variantMap[id] || this.createEmptyVariant_(id);
      });
    });

    // Assign each audio stream to its variants.
    audios.forEach((audio) => {
      /** @type {shakaExtern.Stream} */
      let stream = this.fromStreamDB_(audio);

      audio.variantIds.forEach((id) => {
        let variant = variantMap[id];

        goog.asserts.assert(
            !variant.audio, 'A variant should only have one audio stream');

        variant.language = stream.language;
        variant.primary = variant.primary || stream.primary;
        variant.audio = stream;
      });
    });

    // Assign each video stream to its variants.
    videos.forEach((video) => {
      /** @type {shakaExtern.Stream} */
      let stream = this.fromStreamDB_(video);

      video.variantIds.forEach((id) => {
        let variant = variantMap[id];

        goog.asserts.assert(
            !variant.video, 'A variant should only have one video stream');

        variant.primary = variant.primary || stream.primary;
        variant.video = stream;
      });
    });

    return MapUtils.values(variantMap);
  }

  /**
   * @param {shakaExtern.StreamDB} streamDB
   * @return {shakaExtern.Stream}
   * @private
   */
  fromStreamDB_(streamDB) {
    /** @type {!Array.<!shaka.media.SegmentReference>} */
    let segments = streamDB.segments.map((segment, index) =>
        this.fromSegmentDB_(index, segment));

    /** @type {!shaka.media.SegmentIndex} */
    let segmentIndex = new shaka.media.SegmentIndex(segments);

    /** @type {shakaExtern.Stream} */
    let stream = {
      id: streamDB.id,
      createSegmentIndex: () => Promise.resolve(),
      findSegmentPosition: (index) => segmentIndex.find(index),
      getSegmentReference: (index) => segmentIndex.get(index),
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
          this.fromInitSegmentDB_(streamDB.initSegmentKey);
    }

    return stream;
  }

  /**
   * @param {number} index
   * @param {shakaExtern.SegmentDB} segmentDB
   * @return {!shaka.media.SegmentReference}
   * @private
   */
  fromSegmentDB_(index, segmentDB) {
    /** @type {!shaka.offline.OfflineUri} */
    let uri = shaka.offline.OfflineUri.segment(
        this.mechanism_, this.cell_, segmentDB.dataKey);

    return new shaka.media.SegmentReference(
        index,
        segmentDB.startTime,
        segmentDB.endTime,
        () => [uri.toString()],
        0 /* startByte */,
        null /*  endByte */);
  }

  /**
   * @param {number} key
   * @return {!shaka.media.InitSegmentReference}
   * @private
   */
  fromInitSegmentDB_(key) {
    /** @type {!shaka.offline.OfflineUri} */
    let uri = shaka.offline.OfflineUri.segment(
        this.mechanism_, this.cell_, key);

    return new shaka.media.InitSegmentReference(
        () => [uri.toString()],
        0 /* startBytes*/,
        null /* endBytes */);
  }

  /**
   * @param {shakaExtern.StreamDB} stream
   * @return {boolean}
   * @private
   */
  isAudio_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.contentType == ContentType.AUDIO;
  }

  /**
   * @param {shakaExtern.StreamDB} stream
   * @return {boolean}
   * @private
   */
  isVideo_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.contentType == ContentType.VIDEO;
  }

  /**
   * @param {shakaExtern.StreamDB} stream
   * @return {boolean}
   * @private
   */
  isText_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.contentType == ContentType.TEXT;
  }

  /**
   * Creates an empty Variant.
   *
   * @param {number} id
   * @return {!shakaExtern.Variant}
   * @private
   */
  createEmptyVariant_(id) {
    return {
      id: id,
      language: '',
      primary: false,
      audio: null,
      video: null,
      bandwidth: 0,
      drmInfos: [],
      allowedByApplication: true,
      allowedByKeySystem: true
    };
  }
};
