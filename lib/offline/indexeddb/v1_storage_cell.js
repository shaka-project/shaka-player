/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.indexeddb.V1StorageCell');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.offline.indexeddb.BaseStorageCell');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.PeriodCombiner');
goog.require('shaka.util.PublicPromise');


/**
 * The V1StorageCell is for all stores that follow the shaka.externs V1 offline
 * types, introduced in Shaka Player v2.0 and deprecated in v2.3.
 *
 * @implements {shaka.extern.StorageCell}
 */
shaka.offline.indexeddb.V1StorageCell = class
  extends shaka.offline.indexeddb.BaseStorageCell {
  /** @override */
  async updateManifestExpiration(key, newExpiration) {
    const op = this.connection_.startReadWriteOperation(this.manifestStore_);

    /** @type {IDBObjectStore} */
    const store = op.store();

    /** @type {!shaka.util.PublicPromise} */
    const p = new shaka.util.PublicPromise();

    store.get(key).onsuccess = (event) => {
      // Make sure a defined value was found. Indexeddb treats "no value found"
      // as a success with an undefined result.
      const manifest = /** @type {shaka.extern.ManifestDBV1} */(
        event.target.result);

      // Indexeddb does not fail when you get a value that is not in the
      // database. It will return an undefined value. However, we expect
      // the value to never be null, so something is wrong if we get a
      // falsey value.
      if (manifest) {
        // Since this store's scheme uses in-line keys, we don't specify the key
        // with |put|.  This difference is why we must override the base class.
        goog.asserts.assert(
            manifest.key == key,
            'With in-line keys, the keys should match');

        manifest.expiration = newExpiration;
        store.put(manifest);

        p.resolve();
      } else {
        p.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.KEY_NOT_FOUND,
            'Could not find values for ' + key));
      }
    };

    await Promise.all([op.promise(), p]);
  }

  /**
   * @override
   * @param {shaka.extern.ManifestDBV1} old
   * @return {!Promise.<shaka.extern.ManifestDB>}
   */
  async convertManifest(old) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    const streamsPerPeriod = [];

    for (let i = 0; i < old.periods.length; ++i) {
      // The last period ends at the end of the presentation.
      const periodEnd = i == old.periods.length - 1 ?
          old.duration : old.periods[i + 1].startTime;
      const duration = periodEnd - old.periods[i].startTime;
      const streams = V1StorageCell.convertPeriod_(old.periods[i], duration);

      streamsPerPeriod.push(streams);
    }

    const streams = await shaka.util.PeriodCombiner.combineDbStreams(
        streamsPerPeriod);

    return {
      creationTime: 0,
      originalManifestUri: old.originalManifestUri,
      duration: old.duration,
      size: old.size,
      expiration: old.expiration == null ? Infinity : old.expiration,
      streams,
      sessionIds: old.sessionIds,
      drmInfo: old.drmInfo,
      appMetadata: old.appMetadata,
      sequenceMode: false,
    };
  }

  /**
   * @param {shaka.extern.PeriodDBV1} old
   * @param {number} periodDuration
   * @return {!Array.<shaka.extern.StreamDB>}
   * @private
   */
  static convertPeriod_(old, periodDuration) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    // In the case that this is really old (like really old, like dinosaurs
    // roaming the Earth old) there may be no variants, so we need to add those.
    V1StorageCell.fillMissingVariants_(old);

    for (const stream of old.streams) {
      const message = 'After filling in missing variants, ' +
                      'each stream should have variant ids';
      goog.asserts.assert(stream.variantIds, message);
    }

    return old.streams.map((stream) => V1StorageCell.convertStream_(
        stream, old.startTime, periodDuration));
  }

  /**
   * @param {shaka.extern.StreamDBV1} old
   * @param {number} periodStart
   * @param {number} periodDuration
   * @return {shaka.extern.StreamDB}
   * @private
   */
  static convertStream_(old, periodStart, periodDuration) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    const initSegmentKey = old.initSegmentUri ?
        V1StorageCell.getKeyFromSegmentUri_(old.initSegmentUri) : null;

    // timestampOffset in the new format is the inverse of
    // presentationTimeOffset in the old format.  Also, PTO did not include the
    // period start, while TO does.
    const timestampOffset = periodStart + old.presentationTimeOffset;

    const appendWindowStart = periodStart;
    const appendWindowEnd = periodStart + periodDuration;

    return {
      id: old.id,
      originalId: null,
      groupId: null,
      primary: old.primary,
      type: old.contentType,
      mimeType: old.mimeType,
      codecs: old.codecs,
      frameRate: old.frameRate,
      pixelAspectRatio: undefined,
      hdr: undefined,
      videoLayout: undefined,
      kind: old.kind,
      language: old.language,
      originalLanguage: old.language || null,
      label: old.label,
      width: old.width,
      height: old.height,
      initSegmentKey: initSegmentKey,
      encrypted: old.encrypted,
      keyIds: new Set([old.keyId]),
      segments: old.segments.map((segment) => V1StorageCell.convertSegment_(
          segment, initSegmentKey, appendWindowStart, appendWindowEnd,
          timestampOffset)),
      variantIds: old.variantIds,
      roles: [],
      forced: false,
      audioSamplingRate: null,
      channelsCount: null,
      spatialAudio: false,
      closedCaptions: null,
      tilesLayout: undefined,
      external: false,
      fastSwitching: false,
    };
  }

  /**
   * @param {shaka.extern.SegmentDBV1} old
   * @param {?number} initSegmentKey
   * @param {number} appendWindowStart
   * @param {number} appendWindowEnd
   * @param {number} timestampOffset
   * @return {shaka.extern.SegmentDB}
   * @private
   */
  static convertSegment_(
      old, initSegmentKey, appendWindowStart, appendWindowEnd,
      timestampOffset) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    // Since we don't want to use the uri anymore, we need to parse the key
    // from it.
    const dataKey = V1StorageCell.getKeyFromSegmentUri_(old.uri);

    return {
      startTime: appendWindowStart + old.startTime,
      endTime: appendWindowStart + old.endTime,
      dataKey,
      initSegmentKey,
      appendWindowStart,
      appendWindowEnd,
      timestampOffset,
      tilesLayout: '',
    };
  }

  /**
   * @override
   * @param {shaka.extern.SegmentDataDBV1} old
   * @return {shaka.extern.SegmentDataDB}
   */
  convertSegmentData(old) {
    return {data: old.data};
  }

  /**
   * @param {string} uri
   * @return {number}
   * @private
   */
  static getKeyFromSegmentUri_(uri) {
    let parts = null;

    // Try parsing the uri as the original Shaka Player 2.0 uri.
    parts = /^offline:[0-9]+\/[0-9]+\/([0-9]+)$/.exec(uri);
    if (parts) {
      return Number(parts[1]);
    }

    // Just before Shaka Player 2.3 the uri format was changed to remove some
    // of the un-used information from the uri and make the segment uri and
    // manifest uri follow a similar format. However the old storage system
    // was still in place, so it is possible for Storage V1 Cells to have
    // Storage V2 uris.
    parts = /^offline:segment\/([0-9]+)$/.exec(uri);
    if (parts) {
      return Number(parts[1]);
    }

    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        'Could not parse uri ' + uri);
  }

  /**
   * Take a period and check if the streams need to have variants generated.
   * Before Shaka Player moved to its variants model, there were no variants.
   * This will fill missing variants into the given object.
   *
   * @param {shaka.extern.PeriodDBV1} period
   * @private
   */
  static fillMissingVariants_(period) {
    const AUDIO = shaka.util.ManifestParserUtils.ContentType.AUDIO;
    const VIDEO = shaka.util.ManifestParserUtils.ContentType.VIDEO;

    // There are three cases:
    //  1. All streams' variant ids are null
    //  2. All streams' variant ids are non-null
    //  3. Some streams' variant ids are null and other are non-null
    // Case 3 is invalid and should never happen in production.

    const audio = period.streams.filter((s) => s.contentType == AUDIO);
    const video = period.streams.filter((s) => s.contentType == VIDEO);

    // Case 2 - There is nothing we need to do, so let's just get out of here.
    if (audio.every((s) => s.variantIds) && video.every((s) => s.variantIds)) {
      return;
    }

    // Case 3... We don't want to be in case three.
    goog.asserts.assert(
        audio.every((s) => !s.variantIds),
        'Some audio streams have variant ids and some do not.');
    goog.asserts.assert(
        video.every((s) => !s.variantIds),
        'Some video streams have variant ids and some do not.');

    // Case 1 - Populate all the variant ids (putting us back to case 2).
    // Since all the variant ids are null, we need to first make them into
    // valid arrays.
    for (const s of audio) {
      s.variantIds = [];
    }
    for (const s of video) {
      s.variantIds = [];
    }

    let nextId = 0;

    // It is not possible in Shaka Player's pre-variant world to have audio-only
    // and video-only content mixed in with audio-video content. So we can
    // assume that there is only audio-only or video-only if one group is empty.

    // Everything is video-only content - so each video stream gets to be its
    // own variant.
    if (video.length && !audio.length) {
      shaka.log.debug('Found video-only content. Creating variants for video.');
      const variantId = nextId++;
      for (const s of video) {
        s.variantIds.push(variantId);
      }
    }

    // Everything is audio-only content - so each audio stream gets to be its
    // own variant.
    if (!video.length && audio.length) {
      shaka.log.debug('Found audio-only content. Creating variants for audio.');
      const variantId = nextId++;
      for (const s of audio) {
        s.variantIds.push(variantId);
      }
    }

    // Everything is audio-video content.
    if (video.length && audio.length) {
      shaka.log.debug('Found audio-video content. Creating variants.');
      for (const a of audio) {
        for (const v of video) {
          const variantId = nextId++;
          a.variantIds.push(variantId);
          v.variantIds.push(variantId);
        }
      }
    }
  }
};
