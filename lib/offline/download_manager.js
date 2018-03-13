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

goog.provide('shaka.offline.DownloadManager');

goog.require('goog.asserts');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.IStorageEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MapUtils');



/**
 * This manages downloading segments and notifying the app of progress.
 *
 * @param {shaka.offline.IStorageEngine} storageEngine
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shakaExtern.RetryParameters} retryParams
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.DownloadManager = function(
    storageEngine, netEngine, retryParams) {
  /**
   * @private {!Object.<
   *     string, !Array.<shaka.offline.DownloadManager.Segment>>}
   */
  this.segments_ = {};

  /**
   * The IDs of the segments that have been stored for an in-progress
   * download().  This is used to cleanup in destroy().
   * @private {!Array.<number>}
   */
  this.storedSegmentIds_ = [];

  /** @private {shaka.offline.IStorageEngine} */
  this.storageEngine_ = storageEngine;

  /** @private {shaka.net.NetworkingEngine} */
  this.netEngine_ = netEngine;

  /** @private {?shakaExtern.RetryParameters} */
  this.retryParams_ = retryParams;

  /** @private {?shakaExtern.ManifestDB} */
  this.manifest_ = null;

  /** @private {Promise} */
  this.promise_ = null;

  /** @private {number} */
  this.downloadExpected_ = 0;

  /** @private {number} */
  this.downloadActual_ = 0;

  /** @private {!Array.<function(number, number)>} */
  this.progressListeners_ = [];
};


/**
 * @param {function(number, number)} callback
 */
shaka.offline.DownloadManager.prototype.followProgress = function(callback) {
  this.progressListeners_.push(callback);
};


/**
 * @typedef {{
 *   uris: !Array.<string>,
 *   startByte: number,
 *   endByte: ?number,
 *   bandwidthSize: number,
 *   onStore: function(number)
 * }}
 *
 * @property {!Array.<string>} uris
 *   The URIs to download the segment.
 * @property {number} startByte
 *   The byte index the segment starts at.
 * @property {?number} endByte
 *   The byte index the segment ends at, if present.
 * @property {number} bandwidthSize
 *   The size of the segment as estimated by the bandwidth and segment duration.
 * @property {function(number)} onStore
 *   A callback for when a segment as been added to the storage.
 */
shaka.offline.DownloadManager.Segment;


/** @override */
shaka.offline.DownloadManager.prototype.destroy = function() {
  var storage = this.storageEngine_;
  var segments = this.storedSegmentIds_;
  var p = this.promise_ || Promise.resolve();

  // Don't try to remove segments if there are none.  That may trigger an error
  // in storage if the DB connection was never created.
  if (segments.length) {
    p = p.then(function() { return storage.removeSegments(segments, null); });
  }

  // Don't destroy() storageEngine since it is owned by Storage.

  this.segments_ = {};
  this.storedSegmentIds_ = [];
  this.storageEngine_ = null;
  this.netEngine_ = null;
  this.retryParams_ = null;
  this.manifest_ = null;
  this.promise_ = null;
  return p;
};


/**
 * Adds a segment to the list to be downloaded.
 *
 * @param {string} type
 * @param {!shaka.media.SegmentReference|!shaka.media.InitSegmentReference} ref
 * @param {number} bandwidthSize
 * @param {function(number)} onStore
 *    A callback for when the segment has been saved to storage. The parameter
 *    will be the id the segment was saved under.
 */
shaka.offline.DownloadManager.prototype.addSegment = function(
    type, ref, bandwidthSize, onStore) {
  this.segments_[type] = this.segments_[type] || [];
  this.segments_[type].push({
    uris: ref.getUris(),
    startByte: ref.startByte,
    endByte: ref.endByte,
    bandwidthSize: bandwidthSize,
    onStore: onStore
  });
};


/**
 * Downloads all the segments, stores them in the database, and stores the given
 * manifest object.
 *
 * @param {shakaExtern.ManifestDB} manifest
 * @return {!Promise<number>}
 */
shaka.offline.DownloadManager.prototype.downloadAndStore = function(manifest) {
  var MapUtils = shaka.util.MapUtils;

  // Clear any old progress.
  this.downloadExpected_ = 0;
  this.downloadActual_ = 0;

  MapUtils.values(this.segments_).forEach(function(segments) {
    segments.forEach(this.markAsPending_.bind(this));
  }.bind(this));

  this.manifest_ = manifest;

  // Create separate download chains for different content types.  This will
  // allow audio and video to be downloaded in parallel.
  var async = MapUtils.values(this.segments_).map(function(segments) {
    var i = 0;
    var downloadNext = (function() {
      if (!this.manifest_) {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED));
      }
      if (i >= segments.length) return Promise.resolve();
      var segment = segments[i++];
      return this.downloadSegment_(segment).then(downloadNext);
    }.bind(this));
    return downloadNext();
  }.bind(this));
  this.segments_ = {};

  this.promise_ = Promise.all(async).then(function() {
    return this.storageEngine_.addManifest(manifest);
  }.bind(this)).then(function(id) {
    this.storedSegmentIds_ = [];
    return id;
  }.bind(this));
  return this.promise_;
};


/**
 * Downloads the given segment and calls the callback.
 *
 * @param {shaka.offline.DownloadManager.Segment} segment
 * @return {!Promise}
 * @private
 */
shaka.offline.DownloadManager.prototype.downloadSegment_ = function(segment) {
  goog.asserts.assert(this.retryParams_,
                      'DownloadManager must not be destroyed');
  var type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  var request =
      shaka.net.NetworkingEngine.makeRequest(segment.uris, this.retryParams_);
  if (segment.startByte != 0 || segment.endByte != null) {
    var end = segment.endByte == null ? '' : segment.endByte;
    request.headers['Range'] = 'bytes=' + segment.startByte + '-' + end;
  }

  var byteCount;
  return this.netEngine_.request(type, request)
      .then(function(response) {
        if (!this.manifest_) {
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.OPERATION_ABORTED));
        }
        byteCount = response.data.byteLength;

        /** @type {shakaExtern.SegmentDataDB} */
        var segmentDb = {
          data: response.data
        };

        return this.storageEngine_.addSegment(segmentDb);
      }.bind(this))
      .then(function(id) {
        if (!this.manifest_) {
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.OPERATION_ABORTED));
        }

        this.manifest_.size += byteCount;

        this.markAsDone_(segment);
        this.storedSegmentIds_.push(id);
        segment.onStore(id);

        this.updateProgress_();
      }.bind(this));
};


/**
 * @param {!shaka.offline.DownloadManager.Segment} segment
 * @private
 */
shaka.offline.DownloadManager.prototype.markAsPending_ = function(segment) {
  /** @type {number} */
  var estimatedSize = segment.endByte == null ?
      segment.bandwidthSize :
      (segment.endByte - segment.startByte + 1);

  this.downloadExpected_ += estimatedSize;
};


/**
 * @param {!shaka.offline.DownloadManager.Segment} segment
 * @private
 */
shaka.offline.DownloadManager.prototype.markAsDone_ = function(segment) {
  /** @type {number} */
  var estimatedSize = segment.endByte == null ?
      segment.bandwidthSize :
      (segment.endByte - segment.startByte + 1);

  this.downloadActual_ += estimatedSize;
};


/**
 * Calls the progress callback.
 * @private
 */
shaka.offline.DownloadManager.prototype.updateProgress_ = function() {
  goog.asserts.assert(this.manifest_, 'Must not be destroyed');

  /** @type {number} */
  var progress = this.downloadExpected_ == 0 ?
      0 :
      (this.downloadActual_ / this.downloadExpected_);

  /** @type {number} */
  var size = this.manifest_.size;

  this.progressListeners_.forEach(function(listener) {
    listener(progress, size);
  });
};
