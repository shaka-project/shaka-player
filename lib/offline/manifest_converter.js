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
   * Convert a |shaka.extern.ManifestDB| object to a |shaka.extern.Manifest|
   * object.
   *
   * @param {shaka.extern.ManifestDB} manifestDB
   * @return {shaka.extern.Manifest}
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
      periods: periods,
    };
  }

  /**
   * Create a period object from a database period.
   *
   * @param {shaka.extern.PeriodDB} period
   * @param {shaka.media.PresentationTimeline} timeline
   * @return {shaka.extern.Period}
   */
  fromPeriodDB(period, timeline) {
    /** @type {!Array.<shaka.extern.StreamDB>} */
    let audioStreams = period.streams.filter((stream) => this.isAudio_(stream));
    /** @type {!Array.<shaka.extern.StreamDB>} */
    let videoStreams = period.streams.filter((stream) => this.isVideo_(stream));

    /** @type {!Map.<number, shaka.extern.Variant>} */
    const variants = this.createVariants(audioStreams, videoStreams);

    /** @type {!Array.<shaka.extern.Stream>} */
    let textStreams = period.streams
        .filter((stream) => this.isText_(stream))
        .map((stream) => this.fromStreamDB_(stream));

    period.streams.forEach((stream, i) => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      let refs = stream.segments.map((segment, index) => {
        return this.fromSegmentDB_(index, segment);
      });

      timeline.notifySegments(refs, period.startTime);
    });

    return {
      startTime: period.startTime,
      variants: Array.from(variants.values()),
      textStreams: textStreams,
    };
  }

  /**
   * Recreates Variants from audio and video StreamDB collections.
   *
   * @param {!Array.<!shaka.extern.StreamDB>} audios
   * @param {!Array.<!shaka.extern.StreamDB>} videos
   * @return {!Map.<number, !shaka.extern.Variant>}
   */
  createVariants(audios, videos) {
    // Get all the variant ids from all audio and video streams.
    /** @type {!Set.<number>} */
    const variantIds = new Set();
    for (const stream of audios) {
      for (const id of stream.variantIds) { variantIds.add(id); }
    }
    for (const stream of videos) {
      for (const id of stream.variantIds) { variantIds.add(id); }
    }

    /** @type {!Map.<number, shaka.extern.Variant>} */
    const variantMap = new Map();
    for (const id of variantIds) {
      variantMap.set(id, this.createEmptyVariant_(id));
    }

    // Assign each audio stream to its variants.
    for (const audio of audios) {
      /** @type {shaka.extern.Stream} */
      const stream = this.fromStreamDB_(audio);

      for (const variantId of audio.variantIds) {
        const variant = variantMap.get(variantId);

        goog.asserts.assert(
            !variant.audio, 'A variant should only have one audio stream');

        variant.language = stream.language;
        variant.primary = variant.primary || stream.primary;
        variant.audio = stream;
      }
    }

    // Assign each video stream to its variants.
    for (const video of videos) {
      /** @type {shaka.extern.Stream} */
      const stream = this.fromStreamDB_(video);

      for (const variantId of video.variantIds) {
        const variant = variantMap.get(variantId);

        goog.asserts.assert(
            !variant.video, 'A variant should only have one video stream');

        variant.primary = variant.primary || stream.primary;
        variant.video = stream;
      }
    }

    return variantMap;
  }

  /**
   * @param {shaka.extern.StreamDB} streamDB
   * @return {shaka.extern.Stream}
   * @private
   */
  fromStreamDB_(streamDB) {
    /** @type {!Array.<!shaka.media.SegmentReference>} */
    let segments = streamDB.segments.map((segment, index) =>
        this.fromSegmentDB_(index, segment));

    /** @type {!shaka.media.SegmentIndex} */
    let segmentIndex = new shaka.media.SegmentIndex(segments);

    /** @type {shaka.extern.Stream} */
    let stream = {
      id: streamDB.id,
      originalId: streamDB.originalId,
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
      pixelAspectRatio: streamDB.pixelAspectRatio || undefined,
      kind: streamDB.kind,
      encrypted: streamDB.encrypted,
      keyId: streamDB.keyId,
      language: streamDB.language,
      label: streamDB.label || null,
      type: streamDB.contentType,
      primary: streamDB.primary,
      trickModeVideo: null,
      // TODO(modmaker): Store offline?
      emsgSchemeIdUris: null,
      roles: [],
      channelsCount: null,
      audioSamplingRate: null,
      closedCaptions: null,
    };

    if (streamDB.initSegmentKey != null) {
      stream.initSegmentReference =
          this.fromInitSegmentDB_(streamDB.initSegmentKey);
    }

    return stream;
  }

  /**
   * @param {number} index
   * @param {shaka.extern.SegmentDB} segmentDB
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
   * @param {shaka.extern.StreamDB} stream
   * @return {boolean}
   * @private
   */
  isAudio_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.contentType == ContentType.AUDIO;
  }

  /**
   * @param {shaka.extern.StreamDB} stream
   * @return {boolean}
   * @private
   */
  isVideo_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return stream.contentType == ContentType.VIDEO;
  }

  /**
   * @param {shaka.extern.StreamDB} stream
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
   * @return {!shaka.extern.Variant}
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
      allowedByKeySystem: true,
    };
  }
};
