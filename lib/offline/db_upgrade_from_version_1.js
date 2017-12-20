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

goog.provide('shaka.offline.DBUpgradeFromVersion1');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.offline.DBUpgrade');



/**
 * @constructor
 * @implements {shaka.offline.DBUpgrade}
 */
shaka.offline.DBUpgradeFromVersion1 = function() { };


/**
 * @override
 */
shaka.offline.DBUpgradeFromVersion1.prototype.upgrade = function(
    db, transaction) {
  /** @const */
  var DBUpgradeFromVersion1 = shaka.offline.DBUpgradeFromVersion1;
  /** @const */
  var forEach = shaka.offline.DBUtils.forEach;
  /** @const */
  var put = DBUpgradeFromVersion1.put_;
  /** @const */
  var convertSegmentData = DBUpgradeFromVersion1.convertSegmentData_;
  /** @const */
  var convertManifest = DBUpgradeFromVersion1.convertManifest_;

  /** @const */
  var newSegments = shaka.offline.DBUtils.StoreV2.SEGMENT;
  /** @const */
  var newManifests = shaka.offline.DBUtils.StoreV2.MANIFEST;
  /** @const */
  var oldSegments = shaka.offline.DBUtils.StoreV1.SEGMENT;
  /** @const */
  var oldManifests = shaka.offline.DBUtils.StoreV1.MANIFEST;

  /** @type {!IDBObjectStore} */
  var newSegmentStore = db.createObjectStore(newSegments);
  /** @type {!IDBObjectStore} */
  var newManifestStore = db.createObjectStore(newManifests);

  /** @type {!IDBObjectStore} */
  var oldSegmentStore = transaction.objectStore(oldSegments);
  /** @type {!IDBObjectStore} */
  var oldManifestStore = transaction.objectStore(oldManifests);

  // When building a transaction, there is no gaurnetee that the transaction
  // will be excuted in the order it was built. This means that we need to wait
  // until all our move operations have been completed before appending the
  // request to delete the store or else the delete could be completed before
  // the cursor is done moving. We are relying on the transaction to ensure
  // that if the transaction fails, the original data will not be destroyed.

  var upgradeSegments = function(oldKey, oldValue, next) {
    /** @type {shakaExtern.SegmentDataDBV1} */
    var oldSegment = /** @type {shakaExtern.SegmentDataDBV1} */ (oldValue);

    /** @type {shakaExtern.SegmentDataDB} */
    var newSegment = convertSegmentData(oldSegment);

    // Use the old key to avoid having to update the mapping between segments
    // and segment datas.
    put(newSegmentStore, oldKey, newSegment, next);
  };

  var upgradeManifest = function(oldKey, oldValue, next) {
    /** @type {shakaExtern.ManifestDBV1} */
    var oldManifest = /** @type {shakaExtern.ManifestDBV1} */ (oldValue);
    /** @type {shakaExtern.ManifestDB} */
    var newValue = convertManifest(oldManifest);

    put(newManifestStore, oldKey, newValue, next);
  };

  var deleteOldStores = function() {
    // Because Edge seems to have problems with us deleting the databases here,
    // clear each store so that we don't waste space storing the old versions
    // of the data.
    oldManifestStore.clear();
    oldSegmentStore.clear();
  };

  // Upgrade all the segments then...
  // Upgrade all the manifests then...
  // Delete the old stores
  forEach(oldSegmentStore, upgradeSegments, function() {
    forEach(oldManifestStore, upgradeManifest, deleteOldStores);
  });
};


/**
 * @param {IDBObjectStore} store
 * @param {number} key
 * @param {!Object} value
 * @param {function()} done
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.put_ = function(store,
                                                    key,
                                                    value,
                                                    done) {
  var request = store.add(value, key);
  request.onsuccess = done;
};


/**
 * @param {shakaExtern.SegmentDataDBV1} oldValue
 * @return {shakaExtern.SegmentDataDB}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.convertSegmentData_ = function(oldValue) {
  /** @type {shakaExtern.SegmentDataDB} */
  var newValue = { data: oldValue.data };

  return newValue;
};


/**
 * @param {shakaExtern.ManifestDBV1} oldValue
 * @return {shakaExtern.ManifestDB}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.convertManifest_ = function(oldValue) {
  // Before, manifests that had no variants, meant that they variants needed
  // to be generated. Generate those variants now.
  var newPeriods = oldValue.periods.map(function(period) {
    return shaka.offline.DBUpgradeFromVersion1.convertPeriod_(period);
  });

  /** @type {shakaExtern.ManifestDB} */
  var newValue = {
    originalManifestUri: oldValue.originalManifestUri,
    duration: oldValue.duration,
    size: oldValue.size,
    expiration: oldValue.expiration,
    periods: newPeriods,
    sessionIds: oldValue.sessionIds,
    drmInfo: oldValue.drmInfo,
    appMetadata: oldValue.appMetadata
  };

  return newValue;
};


/**
 * @param {shakaExtern.PeriodDBV1} oldValue
 * @return {shakaExtern.PeriodDB}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.convertPeriod_ = function(oldValue) {
  shaka.offline.DBUpgradeFromVersion1.fillMissingVariants_(oldValue);

  var newStreams = oldValue.streams.map(function(stream) {
    return shaka.offline.DBUpgradeFromVersion1.convertStream_(stream);
  });

  /** @type {shakaExtern.PeriodDB} */
  var newValue = {
    startTime: oldValue.startTime,
    streams: newStreams
  };

  return newValue;
};


/**
 * @param {shakaExtern.StreamDBV1} oldValue
 * @return {shakaExtern.StreamDB}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.convertStream_ = function(oldValue) {
  /** @const */
  var convertSegment =
      shaka.offline.DBUpgradeFromVersion1.convertSegment_;
  /** @const */
  var uriToSegmentId =
      shaka.offline.DBUpgradeFromVersion1.uriToSegmentId_;

  /** @type {!Array.<shakaExtern.SegmentDB>} */
  var newSegments = oldValue.segments.map(function(segment) {
    return convertSegment(segment);
  });

  /** @type {?number} */
  var initSegmentKey = oldValue.initSegmentUri ?
                       uriToSegmentId(oldValue.initSegmentUri) :
                       null;

  /** @type {shakaExtern.StreamDB} */
  var newValue = {
    id: oldValue.id,
    primary: oldValue.primary,
    presentationTimeOffset: oldValue.presentationTimeOffset,
    contentType: oldValue.contentType,
    mimeType: oldValue.mimeType,
    codecs: oldValue.codecs,
    frameRate: oldValue.frameRate,
    kind: oldValue.kind,
    language: oldValue.language,
    label: oldValue.label,
    width: oldValue.width,
    height: oldValue.height,
    initSegmentKey: initSegmentKey,
    encrypted: oldValue.encrypted,
    keyId: oldValue.keyId,
    segments: newSegments,
    variantIds: oldValue.variantIds
  };

  return newValue;
};


/**
 * @param {shakaExtern.SegmentDBV1} oldValue
 * @return {shakaExtern.SegmentDB}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.convertSegment_ = function(oldValue) {
  /** @type {?number} */
  var dataKey =
      shaka.offline.DBUpgradeFromVersion1.uriToSegmentId_(oldValue.uri);

  goog.asserts.assert(
      dataKey != null,
      'Version 1 segments should have a valid segment uris.');

  /** @type {shakaExtern.SegmentDB} */
  var newSegment = {
    startTime: oldValue.startTime,
    endTime: oldValue.endTime,
    dataKey: dataKey
  };

  return newSegment;
};


/**
 * @param {shakaExtern.PeriodDBV1} period
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.fillMissingVariants_ = function(period) {
  /** @const */
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  // There are three cases:
  //  1. All streams' variant ids are null
  //  2. All streams' variant ids are non-null
  //  3. Some streams' variant ids are null and other are non-null
  // Case 3 is invalid and should never happen in production.

  var allStreams = [];
  allStreams.push.apply(allStreams, period.streams);

  var audioStreams = allStreams.filter(function(stream) {
    return stream.contentType == ContentType.AUDIO;
  });

  var videoStreams = allStreams.filter(function(stream) {
    return stream.contentType == ContentType.VIDEO;
  });

  var audioVideoStreams = [];
  audioVideoStreams.push.apply(audioVideoStreams, audioStreams);
  audioVideoStreams.push.apply(audioVideoStreams, videoStreams);

  var allVariantIdsNull = allStreams.every(function(stream) {
    var ids = stream.variantIds;
    return ids == null;
  });

  var allVariantIdsNonNull = allStreams.every(function(stream) {
    var ids = stream.variantIds;
    return ids != null && ids != undefined;
  });

  // Case 3
  goog.asserts.assert(
      allVariantIdsNull || allVariantIdsNonNull,
      'All variant ids should be null or non-null.');

  // Convert Case 1 to Case 2
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
    if (audioStreams.length == 0 || videoStreams.length == 0) {
      // Create all audio only and all video only variants.
      audioVideoStreams.forEach(function(stream) {
        stream.variantIds.push(currentVariantId);
        currentVariantId++;
      });
    } else {
      // Create all audio and video variants.
      audioStreams.forEach(function(audio) {
        videoStreams.forEach(function(video) {
          audio.variantIds.push(currentVariantId);
          video.variantIds.push(currentVariantId);

          currentVariantId++;
        });
      });
    }
  }
};


/**
 * @param {!string} uri
 * @return {?number}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.v1UriToSegmentId_ = function(uri) {
  var parts = /^offline:[0-9]+\/[0-9]+\/([0-9]+)$/.exec(uri);
  return parts ? Number(parts[1]) : null;
};


/**
 * @param {!string} uri
 * @return {?number}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.v2UriToSegmentId_ = function(uri) {
  var parts = /^offline:segment\/([0-9]+)$/.exec(uri);
  return parts ? Number(parts[1]) : null;
};


/**
 * @param {!string} uri
 * @return {?number}
 * @private
 */
shaka.offline.DBUpgradeFromVersion1.uriToSegmentId_ = function(uri) {
  var id = shaka.offline.DBUpgradeFromVersion1.v1UriToSegmentId_(uri);

  // There was a brief window where we supported v2 uris in v1, so we need
  // to support converting both v1 and v2.
  if (id == null) {
    id = shaka.offline.DBUpgradeFromVersion1.v2UriToSegmentId_(uri);
  }

  if (id == null) {
    shaka.log.error('Failed to parse segment uri', uri);
    shaka.log.error('This content will not be playable.');
  }

  return id;
};
