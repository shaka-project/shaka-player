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
goog.require('shaka.offline.OfflineUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MapUtils');



/**
 * This manages downloading segments and notifying the app of progress.
 *
 * @param {shaka.offline.IStorageEngine} storageEngine
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shakaExtern.RetryParameters} retryParams
 * @param {shakaExtern.OfflineConfiguration} config
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.DownloadManager = function(
    storageEngine, netEngine, retryParams, config) {
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
  this.storedSegments_ = [];

  /** @private {?shakaExtern.OfflineConfiguration} */
  this.config_ = config;

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

  /**
   * The total number of bytes for segments that include a byte range.
   * @private {number}
   */
  this.givenBytesTotal_ = 0;

  /**
   * The number of bytes downloaded for segments that include a byte range.
   * @private {number}
   */
  this.givenBytesDownloaded_ = 0;

  /**
   * The total number of bytes estimated based on bandwidth for segments that
   * do not include a byte range.
   * @private {number}
   */
  this.bandwidthBytesTotal_ = 0;

  /**
   * The estimated number of bytes downloaded for segments that do not have
   * a byte range.
   * @private {number}
   */
  this.bandwidthBytesDownloaded_ = 0;
};


/**
 * @typedef {{
 *   uris: !Array.<string>,
 *   startByte: number,
 *   endByte: ?number,
 *   bandwidthSize: number,
 *   segmentDb: shakaExtern.SegmentDataDB
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
 * @property {shakaExtern.SegmentDataDB} segmentDb
 *   The data to store in the database.
 */
shaka.offline.DownloadManager.Segment;


/** @override */
shaka.offline.DownloadManager.prototype.destroy = function() {
  var storage = this.storageEngine_;
  var segments = this.storedSegments_;
  var p = this.promise_ || Promise.resolve();
  p = p.then(function() {
    return Promise.all(segments.map(function(id) {
      return storage.remove('segment', id);
    }));
  });
  // Don't destroy() storageEngine since it is owned by Storage.

  this.segments_ = {};
  this.storedSegments_ = [];
  this.config_ = null;
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
 * @param {shakaExtern.SegmentDataDB} segmentDb
 *   The data to store in the database with the data.  The |data| field of this
 *   object will contain the downloaded data.
 */
shaka.offline.DownloadManager.prototype.addSegment = function(
    type, ref, bandwidthSize, segmentDb) {
  this.segments_[type] = this.segments_[type] || [];
  this.segments_[type].push({
    uris: ref.getUris(),
    startByte: ref.startByte,
    endByte: ref.endByte,
    bandwidthSize: bandwidthSize,
    segmentDb: segmentDb
  });
};


/**
 * Downloads all the segments, stores them in the database, and stores the given
 * manifest object.
 *
 * @param {shakaExtern.ManifestDB} manifest
 * @return {!Promise}
 */
shaka.offline.DownloadManager.prototype.downloadAndStore = function(manifest) {
  var MapUtils = shaka.util.MapUtils;
  // Calculate progress estimates.
  this.givenBytesTotal_ = 0;
  this.givenBytesDownloaded_ = 0;
  this.bandwidthBytesTotal_ = 0;
  this.bandwidthBytesDownloaded_ = 0;
  MapUtils.values(this.segments_).forEach(function(segments) {
    segments.forEach(function(segment) {
      if (segment.endByte != null)
        this.givenBytesTotal_ += (segment.endByte - segment.startByte + 1);
      else
        this.bandwidthBytesTotal_ += segment.bandwidthSize;
    }.bind(this));
  }.bind(this));

  this.manifest_ = manifest;
  // Will be updated as we download for segments without a byte-range.
  this.manifest_.size = this.givenBytesTotal_;

  // Create separate download chains for different content types.  This will
  // allow audio and video to be downloaded in parallel.
  var async = MapUtils.values(this.segments_).map(function(segments) {
    var i = 0;
    var downloadNext = (function() {
      if (!this.config_) {
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
    return this.storageEngine_.insert('manifest', manifest);
  }.bind(this)).then(function() {
    this.storedSegments_ = [];
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
  goog.asserts.assert(this.retryParams_, 'Must not be destroyed');
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

        this.storedSegments_.push(segment.segmentDb.key);
        segment.segmentDb.data = response.data;
        return this.storageEngine_.insert('segment', segment.segmentDb);
      }.bind(this))
      .then(function() {
        if (!this.manifest_) {
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.OPERATION_ABORTED));
        }
        if (segment.endByte == null) {
          // We didn't know the size, so it was an estimate.
          this.manifest_.size += byteCount;
          this.bandwidthBytesDownloaded_ += segment.bandwidthSize;
        } else {
          goog.asserts.assert(
              byteCount == (segment.endByte - segment.startByte + 1),
              'Incorrect download size');
          this.givenBytesDownloaded_ += byteCount;
        }
        this.updateProgress_();
      }.bind(this));
};


/**
 * Calls the progress callback.
 * @private
 */
shaka.offline.DownloadManager.prototype.updateProgress_ = function() {
  var progress = (this.givenBytesDownloaded_ + this.bandwidthBytesDownloaded_) /
      (this.givenBytesTotal_ + this.bandwidthBytesTotal_);

  goog.asserts.assert(this.manifest_, 'Must not be destroyed');
  var manifest = shaka.offline.OfflineUtils.getStoredContent(this.manifest_);
  this.config_.progressCallback(manifest, progress);
};
