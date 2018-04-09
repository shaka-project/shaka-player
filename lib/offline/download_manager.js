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
 *   estimatedByteLength: number,
 *   onDownloaded: function(!ArrayBuffer):!Promise
 * }}
 *
 * @property {shakaExtern.Request}
 *   The network request that will give us the bytes we want to download.
 * @property {number} estimatedByteLength
 *   The size of the segment as estimated by the bandwidth and segment duration.
 * @property {function(!ArrayBuffer):!Promise} onDownloaded
 *   A callback for when a request has been downloaded and can be used by
 *   the caller. Callback should return a promise so that downloading will
 *   not continue until we are done with the current response.
 */
shaka.offline.DownloadRequest;


/**
 * This manages downloading segments.
 *
 * @param {function(number, number)} onProgress
 *
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.DownloadManager = function(onProgress) {
  /**
   * We sill store download requests in groups. The groups will be downloaded in
   * parallel but the segments in each group will be done serially.
   *
   * @private {!Object.<number, !Array.<shaka.offline.DownloadRequest>>}
   */
  this.groups_ = {};

  /** @private {!Promise} */
  this.promise_ = Promise.resolve();

  /** @private {boolean} */
  this.destroyed_ = false;

  /**
   * Callback for after a segment has been downloaded. The first parameter
   * will be the progress of the download. It will be a number between 0.0
   * (0% complete) and 1.0 (100% complete). The second parameter will be the
   * the total number of bytes that have been downloaded.
   *
   * @private {function(number, number)}
   */
  this.onProgress_ = onProgress;

  /**
   * When a segment is downloaded, the estimated size of that segment will be
   * added to this value. It will allow us to track how much progress we have
   * made in downloading all segments.
   *
   * @private {number}
   */
  this.downloadedEstimatedBytes_ = 0;

  /**
   * When we queue a segment to be downloaded, the estimated size of that
   * segment will be added to this value. This will allow us to estimate
   * how many bytes of content we plan to download.
   *
   * @private {number}
   */
  this.expectedEstimatedBytes_ = 0;

  /**
   * When a segment is downloaded, the actual size of the segment will be added
   * to this value so that we know exactly how many bytes we have downloaded.
   *
   * @private {number}
   */
  this.downloadedBytes_ = 0;
};


/** @override */
shaka.offline.DownloadManager.prototype.destroy = function() {
  this.destroyed_ = true;

  const noop = () => {};
  let wait = this.promise_.catch(noop);

  this.promise_ = Promise.resolve();
  this.requests_ = [];

  return wait;
};


/**
 * Add a request to be downloaded as part of a group.
 *
 * @param {number} group The group to add this segment to. If the group does
 *                       not exists, a new group will be created.
 * @param {shakaExtern.Request} request
 * @param {number} estimatedByteLength
 * @param {function(!ArrayBuffer):!Promise} onDownloaded
 *   A callback for when a request has been downloaded and can be used by
 *   the caller. Callback should return a promise so that downloading will
 *   not continue until we are done with the current response.
 */
shaka.offline.DownloadManager.prototype.queue = function(
    group, request, estimatedByteLength, onDownloaded) {
  this.groups_[group] = this.groups_[group] || [];
  this.groups_[group].push({
    request: request,
    estimatedByteLength: estimatedByteLength,
    onDownloaded: onDownloaded
  });
};


/**
 * @param {!shaka.net.NetworkingEngine} net
 * @return {!Promise}
 */
shaka.offline.DownloadManager.prototype.download = function(net) {
  let groups = shaka.util.MapUtils.values(this.groups_);
  this.groups_ = {};  // Clear the map to create a clean slate.

  groups.forEach((segments) => {
    segments.forEach((segment) => {
      this.expectedEstimatedBytes_ += segment.estimatedByteLength;
    });
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

    // Update all our internal stats.
    this.downloadedEstimatedBytes_ += segment.estimatedByteLength;
    this.downloadedBytes_ += response.data.byteLength;

    let progress =
        this.expectedEstimatedBytes_ ?
        this.downloadedEstimatedBytes_ / this.expectedEstimatedBytes_ :
        0;

    this.onProgress_(progress, this.downloadedBytes_);

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
