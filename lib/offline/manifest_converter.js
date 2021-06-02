/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
    const timeline = new shaka.media.PresentationTimeline(null, 0);
    timeline.setDuration(manifestDB.duration);

    /** @type {!Array.<shaka.extern.StreamDB>} */
    const audioStreams =
        manifestDB.streams.filter((streamDB) => this.isAudio_(streamDB));

    /** @type {!Array.<shaka.extern.StreamDB>} */
    const videoStreams =
        manifestDB.streams.filter((streamDB) => this.isVideo_(streamDB));

    /** @type {!Map.<number, shaka.extern.Variant>} */
    const variants = this.createVariants(audioStreams, videoStreams, timeline);

    /** @type {!Array.<shaka.extern.Stream>} */
    const textStreams =
        manifestDB.streams.filter((streamDB) => this.isText_(streamDB))
            .map((streamDB) => this.fromStreamDB_(streamDB, timeline));

    /** @type {!Array.<shaka.extern.Stream>} */
    const imageStreams =
        manifestDB.streams.filter((streamDB) => this.isImage_(streamDB))
            .map((streamDB) => this.fromStreamDB_(streamDB, timeline));

    const drmInfos = manifestDB.drmInfo ? [manifestDB.drmInfo] : [];
    if (manifestDB.drmInfo) {
      for (const variant of variants.values()) {
        if (variant.audio && variant.audio.encrypted) {
          variant.audio.drmInfos = drmInfos;
        }
        if (variant.video && variant.video.encrypted) {
          variant.video.drmInfos = drmInfos;
        }
      }
    }

    return {
      presentationTimeline: timeline,
      minBufferTime: 2,
      offlineSessionIds: manifestDB.sessionIds,
      variants: Array.from(variants.values()),
      textStreams: textStreams,
      imageStreams: imageStreams,
    };
  }

  /**
   * Recreates Variants from audio and video StreamDB collections.
   *
   * @param {!Array.<!shaka.extern.StreamDB>} audios
   * @param {!Array.<!shaka.extern.StreamDB>} videos
   * @param {shaka.media.PresentationTimeline} timeline
   * @return {!Map.<number, !shaka.extern.Variant>}
   */
  createVariants(audios, videos, timeline) {
    // Get all the variant ids from all audio and video streams.
    /** @type {!Set.<number>} */
    const variantIds = new Set();
    for (const streamDB of audios) {
      for (const id of streamDB.variantIds) {
        variantIds.add(id);
      }
    }
    for (const streamDB of videos) {
      for (const id of streamDB.variantIds) {
        variantIds.add(id);
      }
    }

    /** @type {!Map.<number, shaka.extern.Variant>} */
    const variantMap = new Map();
    for (const id of variantIds) {
      variantMap.set(id, this.createEmptyVariant_(id));
    }

    // Assign each audio stream to its variants.
    for (const audio of audios) {
      /** @type {shaka.extern.Stream} */
      const stream = this.fromStreamDB_(audio, timeline);

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
      const stream = this.fromStreamDB_(video, timeline);

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
   * @param {shaka.media.PresentationTimeline} timeline
   * @return {shaka.extern.Stream}
   * @private
   */
  fromStreamDB_(streamDB, timeline) {
    /** @type {!Array.<!shaka.media.SegmentReference>} */
    const segments = streamDB.segments.map(
        (segment, index) => this.fromSegmentDB_(index, segment));

    timeline.notifySegments(segments);

    /** @type {!shaka.media.SegmentIndex} */
    const segmentIndex = new shaka.media.SegmentIndex(segments);

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: streamDB.id,
      originalId: streamDB.originalId,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex,
      mimeType: streamDB.mimeType,
      codecs: streamDB.codecs,
      width: streamDB.width || undefined,
      height: streamDB.height || undefined,
      frameRate: streamDB.frameRate,
      pixelAspectRatio: streamDB.pixelAspectRatio,
      hdr: streamDB.hdr,
      kind: streamDB.kind,
      encrypted: streamDB.encrypted,
      drmInfos: [],
      keyIds: streamDB.keyIds,
      language: streamDB.language,
      label: streamDB.label,
      type: streamDB.type,
      primary: streamDB.primary,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: streamDB.roles,
      forced: streamDB.forced,
      channelsCount: streamDB.channelsCount,
      audioSamplingRate: streamDB.audioSamplingRate,
      spatialAudio: streamDB.spatialAudio,
      closedCaptions: streamDB.closedCaptions,
      tilesLayout: streamDB.tilesLayout,
    };

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
    const uri = shaka.offline.OfflineUri.segment(
        this.mechanism_, this.cell_, segmentDB.dataKey);

    const initSegmentReference = segmentDB.initSegmentKey != null ?
        this.fromInitSegmentDB_(segmentDB.initSegmentKey) : null;

    return new shaka.media.SegmentReference(
        segmentDB.startTime,
        segmentDB.endTime,
        () => [uri.toString()],
        /* startByte= */ 0,
        /* endByte= */ null,
        initSegmentReference,
        segmentDB.timestampOffset,
        segmentDB.appendWindowStart,
        segmentDB.appendWindowEnd,
        /* partialReferences= */ [],
        segmentDB.tilesLayout || '');
  }

  /**
   * @param {number} key
   * @return {!shaka.media.InitSegmentReference}
   * @private
   */
  fromInitSegmentDB_(key) {
    /** @type {!shaka.offline.OfflineUri} */
    const uri = shaka.offline.OfflineUri.segment(
        this.mechanism_, this.cell_, key);

    return new shaka.media.InitSegmentReference(
        () => [uri.toString()],
        /* startBytes= */ 0,
        /* endBytes= */ null );
  }

  /**
   * @param {shaka.extern.StreamDB} streamDB
   * @return {boolean}
   * @private
   */
  isAudio_(streamDB) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return streamDB.type == ContentType.AUDIO;
  }

  /**
   * @param {shaka.extern.StreamDB} streamDB
   * @return {boolean}
   * @private
   */
  isVideo_(streamDB) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return streamDB.type == ContentType.VIDEO;
  }

  /**
   * @param {shaka.extern.StreamDB} streamDB
   * @return {boolean}
   * @private
   */
  isText_(streamDB) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return streamDB.type == ContentType.TEXT;
  }

  /**
   * @param {shaka.extern.StreamDB} streamDB
   * @return {boolean}
   * @private
   */
  isImage_(streamDB) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return streamDB.type == ContentType.IMAGE;
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
      allowedByApplication: true,
      allowedByKeySystem: true,
      decodingInfos: [],
    };
  }
};
