/**
 * Copyright 2015 Google Inc.
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
 *
 * @fileoverview Implements a ManifestUpdater.
 */

goog.provide('shaka.media.ManifestUpdater');

goog.require('shaka.media.ManifestInfo');
goog.require('shaka.media.PeriodInfo');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.StreamInfoProcessor');



/**
 * Creates a ManifestUpdater.
 * This function takes ownership of |newManifestInfo|.
 *
 * @param {!shaka.media.ManifestInfo} newManifestInfo
 * @struct
 * @constructor
 */
shaka.media.ManifestUpdater = function(newManifestInfo) {
  /** @private {!shaka.media.ManifestInfo} */
  this.newManifestInfo_ = newManifestInfo;
};


/**
 * Destroys this ManifestUpdater.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.ManifestUpdater.prototype.destroy = function() {
  this.newManifestInfo_.destroy();
  this.newManifestInfo_ = null;
};


/**
 * Updates |currentManifestInfo|.
 *
 * Although this function is asynchronous, all modifications to
 * |currentManifestInfo| occur synchronously immediately before the returned
 * promise resolves.
 *
 * @param {!shaka.media.ManifestInfo} currentManifestInfo
 * @return {!Promise.<!Array.<!shaka.media.StreamInfo>>} A promise to a list of
 *     StreamInfos that were removed from |currentManifestInfo|.
 */
shaka.media.ManifestUpdater.prototype.update = function(currentManifestInfo) {
  // Alias.
  var ManifestUpdater = shaka.media.ManifestUpdater;

  // Pre-create all SegmentIndexes from both manifests. This enables us to
  // update synchronously and in-place safely, i.e., by modifying
  // |currentManifestInfo| directly.
  var promise1 = ManifestUpdater.createSegmentIndexes_(currentManifestInfo);
  var promise2 = ManifestUpdater.createSegmentIndexes_(this.newManifestInfo_);

  return Promise.all([promise1, promise2]).then(
      /** @param {!Array} results */
      function(results) {
        /** @type {!Object.<number, !shaka.media.SegmentIndex>} */
        var currentSegmentIndexesByUid = results[0];

        /** @type {!Object.<number, !shaka.media.SegmentIndex>} */
        var newSegmentIndexesByUid = results[1];

        var processor = new shaka.media.StreamInfoProcessor();
        processor.process(this.newManifestInfo_.periodInfos);

        currentManifestInfo.updatePeriod = this.newManifestInfo_.updatePeriod;
        currentManifestInfo.updateUrl =
            this.newManifestInfo_.updateUrl ?
            new goog.Uri(this.newManifestInfo_.updateUrl) :
            null;
        currentManifestInfo.minBufferTime = this.newManifestInfo_.minBufferTime;

        /** @type {!Array.<!shaka.media.StreamInfo>} */
        var removedStreamInfos = [];

        ManifestUpdater.mergePeriodInfos_(
            currentManifestInfo,
            this.newManifestInfo_,
            currentSegmentIndexesByUid,
            newSegmentIndexesByUid,
            removedStreamInfos);

        // Process |currentManifestInfo| to ensure that the StreamInfos
        // are still sorted by bandwidth.
        processor.process(currentManifestInfo.periodInfos);

        return Promise.resolve(removedStreamInfos);
      }.bind(this)
  );
};


/**
 * Creates every SegmentIndex contained in |manifestInfo|.
 *
 * @param {!shaka.media.ManifestInfo} manifestInfo
 * @return {!Promise.<!Object.<number, !shaka.media.SegmentIndex>>}
 * @private
 */
shaka.media.ManifestUpdater.createSegmentIndexes_ = function(
    manifestInfo) {
  var gather = function(all, part) { return all.concat(part); };
  var streamInfos = manifestInfo.periodInfos
      .map(function(periodInfo) { return periodInfo.streamSetInfos; })
      .reduce(gather, [])
      .map(function(streamSetInfo) { return streamSetInfo.streamInfos; })
      .reduce(gather, []);
  var async = streamInfos.map(
      function(streamInfo) {
        return streamInfo.segmentIndexSource.create();
      });
  return Promise.all(async).then(
      /** @param {!Array.<!shaka.media.SegmentIndex>} segmentIndexes */
      function(segmentIndexes) {
        shaka.asserts.assert(streamInfos.length == segmentIndexes.length);

        /** @type {!Object.<number, !shaka.media.SegmentIndex>} */
        var segmentIndexesByUid = {};

        for (var i = 0; i < streamInfos.length; ++i) {
          segmentIndexesByUid[streamInfos[i].uniqueId] = segmentIndexes[i];
        }

        return Promise.resolve(segmentIndexesByUid);
      }
  );
};


/**
 * Merges PeriodInfos from |newManifestInfo_| into |currentManifestInfo|.
 * Populates |removedStreamInfos| with any StreamInfos from
 * |currentManifestInfo| that have been removed.
 *
 * @param {!shaka.media.ManifestInfo} currentManifestInfo
 * @param {!shaka.media.ManifestInfo} newManifestInfo
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     currentSegmentIndexesByUid
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     newSegmentIndexesByUid
 * @param {!Array.<!shaka.media.StreamInfo>} removedStreamInfos
 * @private
 */
shaka.media.ManifestUpdater.mergePeriodInfos_ = function(
    currentManifestInfo,
    newManifestInfo,
    currentSegmentIndexesByUid,
    newSegmentIndexesByUid,
    removedStreamInfos) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.PeriodInfo>} */
  var currentPeriodInfoMap = new shaka.util.MultiMap();
  currentManifestInfo.periodInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    currentPeriodInfoMap.push(id, info);
  });

  /** @type {!shaka.util.MultiMap.<!shaka.media.PeriodInfo>} */
  var newPeriodInfoMap = new shaka.util.MultiMap();
  newManifestInfo.periodInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    newPeriodInfoMap.push(id, info);
  });

  var keys = currentPeriodInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    var currentPeriodInfos = currentPeriodInfoMap.get(id);
    shaka.asserts.assert(currentPeriodInfos && currentPeriodInfos.length != 0);
    if (currentPeriodInfos.length > 1) {
      shaka.log.warning('Cannot update Period ' + id + ' because more ' +
                        'than one existing Period has the same ID.');
      continue;
    }

    var newPeriodInfos = newPeriodInfoMap.get(id);
    if (!newPeriodInfos || newPeriodInfos.length == 0) {
      continue;
    } else if (newPeriodInfos.length == 1) {
      shaka.media.ManifestUpdater.mergeStreamSetInfos_(
          currentPeriodInfos[0],
          newPeriodInfos[0],
          currentSegmentIndexesByUid,
          newSegmentIndexesByUid,
          removedStreamInfos);
      currentPeriodInfos[0].duration = newPeriodInfos[0].duration;
    } else {
      shaka.log.warning('Cannot update Period ' + id + ' because more ' +
                        'than one new Period has the same ID.');
    }
  }
};


/**
 * Merges StreamSetInfos from |newPeriodInfo| into |currentPeriodInfo|.
 *
 * @param {!shaka.media.PeriodInfo} currentPeriodInfo
 * @param {!shaka.media.PeriodInfo} newPeriodInfo
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     currentSegmentIndexesByUid
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     newSegmentIndexesByUid
 * @param {!Array.<!shaka.media.StreamInfo>} removedStreamInfos
 * @private
 */
shaka.media.ManifestUpdater.mergeStreamSetInfos_ = function(
    currentPeriodInfo,
    newPeriodInfo,
    currentSegmentIndexesByUid,
    newSegmentIndexesByUid,
    removedStreamInfos) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>} */
  var currentStreamSetInfoMap = new shaka.util.MultiMap();
  currentPeriodInfo.streamSetInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    currentStreamSetInfoMap.push(id, info);
  });

  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamSetInfo>} */
  var newStreamSetInfoMap = new shaka.util.MultiMap();
  newPeriodInfo.streamSetInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    newStreamSetInfoMap.push(id, info);
  });

  var keys = currentStreamSetInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    var currentStreamSetInfos = currentStreamSetInfoMap.get(id);
    shaka.asserts.assert(currentStreamSetInfos &&
                         currentStreamSetInfos.length != 0);
    if (currentStreamSetInfos.length > 1) {
      shaka.log.warning('Cannot update StreamSet ' + id + ' because more ' +
                        'than one existing StreamSet has the same ID.');
      continue;
    }

    var newStreamSetInfos = newStreamSetInfoMap.get(id);
    if (!newStreamSetInfos || newStreamSetInfos.length == 0) {
      continue;
    } else if (newStreamSetInfos.length == 1) {
      shaka.media.ManifestUpdater.mergeStreamInfos_(
          currentStreamSetInfos[0],
          newStreamSetInfos[0],
          currentSegmentIndexesByUid,
          newSegmentIndexesByUid,
          removedStreamInfos);
    } else {
      shaka.log.warning('Cannot update StreamSet ' + id + ' because more ' +
                        'than one new StreamSet has the same ID.');
    }
  }
};


/**
 * Merges StreamInfos from |newStreamSetInfo| into |currentStreamSetInfo|.
 *
 * @param {!shaka.media.StreamSetInfo} currentStreamSetInfo
 * @param {!shaka.media.StreamSetInfo} newStreamSetInfo
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     currentSegmentIndexesByUid
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     newSegmentIndexesByUid
 * @param {!Array.<!shaka.media.StreamInfo>} removedStreamInfos
 * @private
 */
shaka.media.ManifestUpdater.mergeStreamInfos_ = function(
    currentStreamSetInfo,
    newStreamSetInfo,
    currentSegmentIndexesByUid,
    newSegmentIndexesByUid,
    removedStreamInfos) {
  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamInfo>} */
  var currentStreamInfoMap = new shaka.util.MultiMap();
  currentStreamSetInfo.streamInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    currentStreamInfoMap.push(id, info);
  });

  /** @type {!shaka.util.MultiMap.<!shaka.media.StreamInfo>} */
  var newStreamInfoMap = new shaka.util.MultiMap();
  newStreamSetInfo.streamInfos.forEach(function(info, index) {
    var id = info.id || ('' + index);
    newStreamInfoMap.push(id, info);
  });

  /** @type {!Object.<string, string>} */
  var visitedStreamInfoSet = {};

  var keys = currentStreamInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    visitedStreamInfoSet[id] = id;

    var currentStreamInfos = currentStreamInfoMap.get(id);
    shaka.asserts.assert(currentStreamInfos && currentStreamInfos.length != 0);
    if (currentStreamInfos.length > 1) {
      shaka.log.warning('Cannot update Stream ' + id + ' because more ' +
                        'than one existing Stream has the same ID.');
      continue;
    }

    var newStreamInfos = newStreamInfoMap.get(id);
    if (!newStreamInfos || newStreamInfos.length == 0) {
      removedStreamInfos.push(currentStreamInfos[0]);
      currentStreamSetInfo.streamInfos.splice(
          currentStreamSetInfo.streamInfos.indexOf(currentStreamInfos[0]), 1);
    } else if (newStreamInfos.length == 1) {
      shaka.media.ManifestUpdater.integrateSegmentIndexes_(
          currentStreamInfos[0],
          newStreamInfos[0],
          currentSegmentIndexesByUid,
          newSegmentIndexesByUid);

      // Transfer ownership of the SegmentInitSource.
      currentStreamInfos[0].segmentInitSource =
          newStreamInfos[0].segmentInitSource;
      newStreamInfos[0].segmentInitSource = null;

      currentStreamInfos[0].timestampOffset = newStreamInfos[0].timestampOffset;
    } else {
      shaka.log.warning('Cannot update Stream ' + id + ' because more ' +
                        'than one new Stream has the same ID.');
    }
  }

  keys = newStreamInfoMap.keys();
  for (var i = 0; i < keys.length; ++i) {
    var id = keys[i];

    if (visitedStreamInfoSet[id]) continue;
    visitedStreamInfoSet[id] = id;

    var newStreamInfos = newStreamInfoMap.get(id);
    shaka.asserts.assert(newStreamInfos && newStreamInfos.length != 0);
    if (newStreamInfos.length > 1) {
      shaka.log.warning('Cannot add Stream ' + id + ' because more ' +
                        'than one new Stream has the same ID.');
    }

    currentStreamSetInfo.streamInfos.push(newStreamInfos[0]);
    shaka.log.info('Added Stream ' + id + '.');
  }
};


/**
 * Integrates |newStreamInfo|'s SegmentIndex into |currentStreamSet|'s
 * SegmentIndex.
 *
 * @param {!shaka.media.StreamInfo} currentStreamInfo
 * @param {!shaka.media.StreamInfo} newStreamInfo
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     currentSegmentIndexesByUid
 * @param {!Object.<number, !shaka.media.SegmentIndex>}
 *     newSegmentIndexesByUid
 * @private
 */
shaka.media.ManifestUpdater.integrateSegmentIndexes_ = function(
    currentStreamInfo,
    newStreamInfo,
    currentSegmentIndexesByUid,
    newSegmentIndexesByUid) {
  var currentSegmentIndex =
      currentSegmentIndexesByUid[currentStreamInfo.uniqueId];
  shaka.asserts.assert(currentSegmentIndex);

  var newSegmentIndex =
      newSegmentIndexesByUid[newStreamInfo.uniqueId];
  shaka.asserts.assert(newSegmentIndex);

  var originalLength = currentSegmentIndex.length();
  if (currentSegmentIndex.integrate(newSegmentIndex)) {
    shaka.log.info('Updated SegmentIndex', currentStreamInfo.uniqueId + ':',
                   originalLength, '->', currentSegmentIndex.length(),
                   'SegmentReference(s).');
  } else {
    shaka.log.warning('Failed to update SegmentIndex',
                      newStreamInfo.uniqueId);
  }
};

