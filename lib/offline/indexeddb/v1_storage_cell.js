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

goog.provide('shaka.offline.indexeddb.V1StorageCell');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.offline.indexeddb.BaseStorageCell');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
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
  updateManifestExpiration(key, newExpiration) {
    let op = this.connection_.startReadWriteOperation(this.manifestStore_);
    let store = op.store();

    let p = new shaka.util.PublicPromise();

    store.get(key).onsuccess = (event) => {
      // Make sure a defined value was found. Indexeddb treats "no value found"
      // as a success with an undefined result.
      let manifest = event.target.result;

      // Indexeddb does not fail when you get a value that is not in the
      // database. It will return an undefined value. However, we expect
      // the value to never be null, so something is wrong if we get a
      // falsey value.
      if (manifest) {
        // Since this store's scheme uses in-line keys, we don't need to specify
        // the key with |put|.
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

    // Only return our promise after the operation completes.
    return op.promise().then(() => p);
  }

  /** @override */
  convertManifest(old) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    // Old Manifest Format:
    // {
    //   key: number,
    //   originalManifestUri: string,
    //   duration: number,
    //   size: number,
    //   expiration: number,
    //   periods: !Array.<shaka.extern.PeriodDB>,
    //   sessionIds: !Array.<string>,
    //   drmInfo: ?shaka.extern.DrmInfo,
    //   appMetadata: Object
    //  }

    goog.asserts.assert(
        old.originalManifestUri != null,
        'Old manifest format should have an originalManifestUri field');
    goog.asserts.assert(
        old.duration != null,
        'Old manifest format should have a duration field');
    goog.asserts.assert(
        old.size != null,
        'Old manifest format should have a size field');
    goog.asserts.assert(
        old.periods != null,
        'Old manifest format should have a periods field');
    goog.asserts.assert(
        old.sessionIds != null,
        'Old manifest format should have a session ids field');
    goog.asserts.assert(
        old.appMetadata != null,
        'Old manifest format should have an app metadata field');

    return {
      originalManifestUri: old.originalManifestUri,
      duration: old.duration,
      size: old.size,
      expiration: old.expiration == null ? Infinity : old.expiration,
      periods: old.periods.map(V1StorageCell.convertPeriod_),
      sessionIds: old.sessionIds,
      drmInfo: old.drmInfo,
      appMetadata: old.appMetadata,
    };
  }

  /**
   * @param {!Object} old
   * @return {shaka.extern.PeriodDB}
   * @private
   */
  static convertPeriod_(old) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    // Old Period Format:
    // {
    //   startTime: number,
    //   streams: !Array.<shaka.extern.StreamDB>
    // }

    goog.asserts.assert(
      old.startTime != null,
      'Old period format should have a start time field');
    goog.asserts.assert(
      old.streams != null,
      'Old period format should have a streams field');

    // In the case that this is really old (like really old, like dinosaurs
    // roaming the Earth old) there may be no variants, so we need to add those.
    V1StorageCell.fillMissingVariants_(old);

    old.streams.forEach((stream) => {
      const message = 'After filling in missing variants, ' +
                      'each stream should have variant ids';
      goog.asserts.assert(stream.variantIds, message);
    });

    return {
      startTime: old.startTime,
      streams: old.streams.map(V1StorageCell.convertStream_),
    };
  }

  /**
   * @param {!Object} old
   * @return {shaka.extern.StreamDB}
   * @private
   */
  static convertStream_(old) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    // Old Stream Format
    // {
    //   id: number,
    //   primary: boolean,
    //   presentationTimeOffset: number,
    //   contentType: string,
    //   mimeType: string,
    //   codecs: string,
    //   frameRate: (number|undefined),
    //   kind: (string|undefined),
    //   language: string,
    //   label: ?string,
    //   width: ?number,
    //   height: ?number,
    //   initSegmentUri: ?string,
    //   encrypted: boolean,
    //   keyId: ?string,
    //   segments: !Array.<shaka.extern.SegmentDB>,
    //   variantIds: ?Array.<number>
    // }

    goog.asserts.assert(
        old.id != null,
        'Old stream format should have an id field');
    goog.asserts.assert(
        old.primary != null,
        'Old stream format should have a primary field');
    goog.asserts.assert(
        old.presentationTimeOffset != null,
        'Old stream format should have a presentation time offset field');
    goog.asserts.assert(
        old.contentType != null,
        'Old stream format should have a content type field');
    goog.asserts.assert(
        old.mimeType != null,
        'Old stream format should have a mime type field');
    goog.asserts.assert(
        old.codecs != null,
        'Old stream format should have a codecs field');
    goog.asserts.assert(
        old.language != null,
        'Old stream format should have a language field');
    goog.asserts.assert(
        old.encrypted != null,
        'Old stream format should have an encrypted field');
    goog.asserts.assert(
        old.segments != null,
        'Old stream format should have a segments field');

    const initSegmentKey = old.initSegmentUri ?
        V1StorageCell.getKeyFromSegmentUri_(old.initSegmentUri) : null;

    return {
      id: old.id,
      originalId: null,
      primary: old.primary,
      presentationTimeOffset: old.presentationTimeOffset,
      contentType: old.contentType,
      mimeType: old.mimeType,
      codecs: old.codecs,
      frameRate: old.frameRate,
      pixelAspectRatio: undefined,
      kind: old.kind,
      language: old.language,
      label: old.label,
      width: old.width,
      height: old.height,
      initSegmentKey: initSegmentKey,
      encrypted: old.encrypted,
      keyId: old.keyId,
      segments: old.segments.map(V1StorageCell.convertSegment_),
      variantIds: old.variantIds,
    };
  }

  /** @override */
  static convertSegment_(old) {
    const V1StorageCell = shaka.offline.indexeddb.V1StorageCell;

    // Old Segment Format
    // {
    //   startTime: number,
    //   endTime: number,
    //   uri: string
    // }

    goog.asserts.assert(
        old.startTime != null,
        'The old segment format should have a start time field');
    goog.asserts.assert(
        old.endTime != null,
        'The old segment format should have an end time field');
    goog.asserts.assert(
        old.uri != null,
        'The old segment format should have a uri field');

    // Since we don't want to use the uri anymore, we need to parse the key
    // from it.
    const dataKey = V1StorageCell.getKeyFromSegmentUri_(old.uri);

    return {
      startTime: old.startTime,
      endTime: old.endTime,
      dataKey: dataKey,
    };
  }

  /** @override */
  convertSegmentData(old) {
    // Old Segment Format:
    // {
    //   key: number,
    //   data: ArrayBuffer
    // }

    goog.asserts.assert(
        old.key != null,
        'The old segment data format should have a key field');
    goog.asserts.assert(
        old.data != null,
        'The old segment data format should have a data field');

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
   * @param {!Object} period
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

    let audio = period.streams.filter((s) => s.contentType == AUDIO);
    let video = period.streams.filter((s) => s.contentType == VIDEO);

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
    audio.forEach((s) => { s.variantIds = []; });
    video.forEach((s) => { s.variantIds = []; });

    let nextId = 0;

    // It is not possible in Shaka Player's pre-variant world to have audio-only
    // and video-only content mixed in with audio-video content. So we can
    // assume that there is only audio-only or video-only if one group is empty.

    // Everything is video-only content - so each video stream gets to be its
    // own variant.
    if (video.length && !audio.length) {
      shaka.log.debug('Found video-only content. Creating variants for video.');
      let variantId = nextId++;
      video.forEach((s) => { s.variantIds.push(variantId); });
    }

    // Everything is audio-only content - so each audio stream gets to be its
    // own variant.
    if (!video.length && audio.length) {
      shaka.log.debug('Found audio-only content. Creating variants for audio.');
      let variantId = nextId++;
      audio.forEach((s) => { s.variantIds.push(variantId); });
    }

    // Everything is audio-video content.
    if (video.length && audio.length) {
      shaka.log.debug('Found audio-video content. Creating variants.');
      audio.forEach((a) => {
        video.forEach((v) => {
          let variantId = nextId++;
          a.variantIds.push(variantId);
          v.variantIds.push(variantId);
        });
      });
    }
  }
};
