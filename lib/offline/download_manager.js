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
 * @typedef {{
 *   request: shakaExtern.Request,
 *   estimatedSize: number,
 *   onStore: function(number)
 * }}
 *
 * @property {shakaExtern.Request}
 *   The network request that will give us the bytes we want to download.
 * @property {number} estimatedSize
 *   The size of the segment as estimated by the bandwidth and segment duration.
 * @property {function(number)} onStore
 *   A callback for when a segment has been added to the storage.
 */
shaka.offline.DownloadRequest;


/**
 * This manages downloading segments and notifying the app of progress.
 *
 * @param {shaka.offline.IStorageEngine} storageEngine
 * @param {!shaka.net.NetworkingEngine} netEngine
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.DownloadManager = function(storageEngine, netEngine) {
  /**
   * We sill store download requests in groups. The groups will be downloaded in
   * parallel but the segments in each group will be done serially.
   *
   * @private {!Object.<number, !Array.<shaka.offline.DownloadRequest>>}
   */
  this.groups_ = {};

  /**
   * The IDs of the segments that have been stored for an in-progress
   * download().  This is used for cleanup in destroy().
   * @private {!Array.<number>}
   */
  this.storedSegmentIds_ = [];

  /** @private {shaka.offline.IStorageEngine} */
  this.storageEngine_ = storageEngine;

  /** @private {shaka.net.NetworkingEngine} */
  this.netEngine_ = netEngine;

  /** @private {?shakaExtern.ManifestDB} */
  this.manifest_ = null;

  /** @private {!Promise} */
  this.promise_ = Promise.resolve();

  /** @private {number} */
  this.downloadExpected_ = 0;

  /** @private {number} */
  this.downloadActual_ = 0;

  /** @private {!Array.<function(number, number)>} */
  this.progressListeners_ = [];

  /** @private {boolean} */
  this.destroyed_ = false;
};


/**
 * @param {function(number, number)} callback
 */
shaka.offline.DownloadManager.prototype.followProgress = function(callback) {
  this.progressListeners_.push(callback);
};


/** @override */
shaka.offline.DownloadManager.prototype.destroy = function() {
  let storage = this.storageEngine_;
  let segments = this.storedSegmentIds_;

  // Don't try to remove segments if there are none.  That may trigger an error
  // in storage if the DB connection was never created.
  if (segments.length) {
    this.promise_ = this.promise_.then(() => {
      return storage.removeSegments(segments, null);
    });
  }

  // Don't destroy() storageEngine since it is owned by Storage.
  let p = this.promise_;

  this.groups_ = {};
  this.storedSegmentIds_ = [];
  this.storageEngine_ = null;
  this.netEngine_ = null;
  this.manifest_ = null;
  this.promise_ = Promise.resolve();

  return p;
};


/**
 * Add a request to be downloaded as part of a group.
 *
 * @param {number} group The group to add this segment to. If the group does
 *                       not exists, a new group will be created.
 * @param {shakaExtern.Request} request
 * @param {number} estimatedSize
 * @param {function(number)} onStore
 *    A callback for when the segment has been saved to storage. The parameter
 *    will be the id the segment was saved under.
 */
shaka.offline.DownloadManager.prototype.queue = function(
    group, request, estimatedSize, onStore) {
  this.groups_[group] = this.groups_[group] || [];
  this.groups_[group].push({
    request: request,
    estimatedSize: estimatedSize,
    onStore: onStore
  });
};


/**
 * Downloads all the segments, stores them in the database, and stores the given
 * manifest object.
 *
 * @param {shakaExtern.ManifestDB} manifest
 * @return {!Promise.<number>}
 */
shaka.offline.DownloadManager.prototype.downloadAndStore = function(manifest) {
  // Clear any old progress.
  this.downloadExpected_ = 0;
  this.downloadActual_ = 0;

  this.manifest_ = manifest;

  let groups = shaka.util.MapUtils.values(this.groups_);
  this.groups_ = {};  // Clear the map to create a clean slate.

  groups.forEach((segments) => {
    segments.forEach((segment) => this.markAsPending_(segment.estimatedSize));
  });

  /** @type {!Promise.<number>} */
  let p = Promise.resolve().then(() => {
    this.checkDestroyed_();
    return Promise.all(groups.map((group) => this.downloadGroup_(group)));
  }).then(() => {
    this.checkDestroyed_();
    return this.storageEngine_.addManifest(manifest);
  }).then((id) => {
    this.checkDestroyed_();
    this.storedSegmentIds_ = [];
    return id;
  });

  // Amend our new promise chain to our internal promise so that when we destroy
  // the download manger we will wait for all the downloads to stop.
  this.promise_ = this.promise_.then(() => p);

  return p;
};


/**
 * @param {!Array.<shaka.offline.DownloadRequest>} group
 * @return {!Promise}
 * @private
 */
shaka.offline.DownloadManager.prototype.downloadGroup_ = function(group) {
  let p = Promise.resolve();

  group.forEach((segment) => {
    p = p.then(() => {
      this.checkDestroyed_();
      return this.downloadSegment_(segment);
    });
  });

  return p;
};


/**
 * @param {shaka.offline.DownloadRequest} segment
 * @return {!Promise}
 * @private
 */
shaka.offline.DownloadManager.prototype.downloadSegment_ = function(segment) {
  return Promise.resolve().then(() => {
    this.checkDestroyed_();

    let type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    return this.netEngine_.request(type, segment.request).promise;
  }).then((response) => {
    this.checkDestroyed_();

    this.markAsDone_(segment.estimatedSize, response.data.byteLength);
    this.updateProgress_();

    return this.storageEngine_.addSegment({
      data: response.data
    });
  }).then((id) => {
    this.checkDestroyed_();

    this.storedSegmentIds_.push(id);
    segment.onStore(id);
  });
};


/**
 * Check if the download manager has been destroyed. If so, throw an error to
 * kill the promise chain.
 * @private
 */
shaka.offline.DownloadManager.prototype.checkDestroyed_ = function() {
  if (this.destroyed_) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED);
  }
};


/**
 * @param {number} estimate
 * @private
 */
shaka.offline.DownloadManager.prototype.markAsPending_ = function(estimate) {
  this.downloadExpected_ += estimate;
};


/**
 * @param {number} estimate The estimated number of bytes we need to download.
 * @param {number} actual The actual number of bytes we downloaded.
 * @private
 */
shaka.offline.DownloadManager.prototype.markAsDone_ = function(
    estimate, actual) {
  this.downloadActual_ += estimate;
  this.manifest_.size += actual;
};


/**
 * Calls the progress callback, with the current progress.
 * @private
 */
shaka.offline.DownloadManager.prototype.updateProgress_ = function() {
  goog.asserts.assert(this.manifest_, 'Must not be destroyed');

  /** @type {number} */
  let progress = this.downloadExpected_ == 0 ?
      0 :
      (this.downloadActual_ / this.downloadExpected_);

  /** @type {number} */
  let size = this.manifest_.size;

  this.progressListeners_.forEach(function(listener) {
    listener(progress, size);
  });
};
