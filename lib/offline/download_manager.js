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

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MapUtils');

/**
 * @typedef {{
 *   request: shakaExtern.Request,
 *   estimatedSize: number,
 *   onDownloaded: function(!ArrayBuffer):!Promise
 * }}
 *
 * @property {shakaExtern.Request}
 *   The network request that will give us the bytes we want to download.
 * @property {number} estimatedSize
 *   The size of the segment as estimated by the bandwidth and segment duration.
 * @property {function(!ArrayBuffer):!Promise} onDownloaded
 *   A callback for when a request has been downloaded and can be used by
 *   the caller. Callback should return a promise so that downloading will
 *   not continue until we are done with the current response.
 */
shaka.offline.DownloadRequest;


/**
 * This manages downloading segments and notifying the app of progress.
 *
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.DownloadManager = function() {
  /**
   * We sill store download requests in groups. The groups will be downloaded in
   * parallel but the segments in each group will be done serially.
   *
   * @private {!Object.<number, !Array.<shaka.offline.DownloadRequest>>}
   */
  this.groups_ = {};

  /** @private {!Promise} */
  this.promise_ = Promise.resolve();

  /** @private {number} */
  this.downloadExpected_ = 0;

  /** @private {number} */
  this.downloadActual_ = 0;

  /** @private {number} */
  this.size_ = 0;

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
  this.destroyed_ = true;

  const noop = () => {};
  let wait = this.promise_.catch(noop);

  this.downloadActual_ = 0;
  this.downloadExpected_ = 0;
  this.progressListeners_ = [];
  this.promise_ = Promise.resolve();
  this.requests_ = [];
  this.size_ = 0;
  this.totalDownloaded_ = 0;

  return wait;
};


/**
 * Add a request to be downloaded as part of a group.
 *
 * @param {number} group The group to add this segment to. If the group does
 *                       not exists, a new group will be created.
 * @param {shakaExtern.Request} request
 * @param {number} estimatedSize
 * @param {function(!ArrayBuffer):!Promise} onDownloaded
 *   A callback for when a request has been downloaded and can be used by
 *   the caller. Callback should return a promise so that downloading will
 *   not continue until we are done with the current response.
 */
shaka.offline.DownloadManager.prototype.queue = function(
    group, request, estimatedSize, onDownloaded) {
  this.groups_[group] = this.groups_[group] || [];
  this.groups_[group].push({
    request: request,
    estimatedSize: estimatedSize,
    onDownloaded: onDownloaded
  });
};


/**
 * @param {!shaka.net.NetworkingEngine} net
 * @return {!Promise.<number>}
 */
shaka.offline.DownloadManager.prototype.download = function(net) {
  // Clear any old progress.
  this.downloadExpected_ = 0;
  this.downloadActual_ = 0;

  let groups = shaka.util.MapUtils.values(this.groups_);
  this.groups_ = {};  // Clear the map to create a clean slate.

  groups.forEach((segments) => {
    segments.forEach((segment) => this.markAsPending_(segment.estimatedSize));
  });

  /** @type {!Promise.<number>} */
  let p = Promise.resolve().then(() => {
    this.checkDestroyed_();
    return Promise.all(groups.map((group) => this.downloadGroup_(net, group)));
  });

  // Amend our new promise chain to our internal promise so that when we destroy
  // the download manger we will wait for all the downloads to stop.
  this.promise_ = this.promise_.then(() => p);

  return p;
};


/**
 * @param {!shaka.net.NetworkingEngine} net
 * @param {!Array.<shaka.offline.DownloadRequest>} group
 * @return {!Promise}
 * @private
 */
shaka.offline.DownloadManager.prototype.downloadGroup_ = function(net, group) {
  let p = Promise.resolve();

  group.forEach((segment) => {
    p = p.then(() => {
      this.checkDestroyed_();
      return this.downloadSegment_(net, segment);
    });
  });

  return p;
};


/**
 * @param {!shaka.net.NetworkingEngine} net
 * @param {shaka.offline.DownloadRequest} segment
 * @return {!Promise}
 * @private
 */
shaka.offline.DownloadManager.prototype.downloadSegment_ = function(
    net, segment) {
  return Promise.resolve().then(() => {
    this.checkDestroyed_();

    let type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    return net.request(type, segment.request).promise;
  }).then((response) => {
    this.checkDestroyed_();

    this.markAsDone_(segment.estimatedSize, response.data.byteLength);
    this.updateProgress_();

    return segment.onDownloaded(response.data);
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
  this.size_ += actual;
};


/**
 * Calls the progress callback, with the current progress.
 * @private
 */
shaka.offline.DownloadManager.prototype.updateProgress_ = function() {
  /** @type {number} */
  let progress = this.downloadExpected_ == 0 ?
      0 :
      (this.downloadActual_ / this.downloadExpected_);

  this.progressListeners_.forEach((listener) => listener(progress, this.size_));
};
