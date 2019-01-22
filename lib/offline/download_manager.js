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

/**
 * @typedef {{
 *   request: shaka.extern.Request,
 *   estimatedByteLength: number,
 *   onDownloaded: function(!ArrayBuffer):!Promise
 * }}
 *
 * @property {shaka.extern.Request}
 *   The network request that will give us the bytes we want to download.
 * @property {number} estimatedByteLength
 *   The size of the segment as estimated by the bandwidth and segment duration.
 * @property {function(!ArrayBuffer):!Promise} onDownloaded
 *   A callback for when we get a response and the data can be used. The next
 *   download will not continue until the promise returned by this function is
 *   resolved.
 */
shaka.offline.DownloadRequest;


/**
 * This manages downloading segments.
 *
 * @implements {shaka.util.IDestroyable}
 * @final
 */
shaka.offline.DownloadManager = class {
  /**
   * @param {function(number, number)} onProgress
   */
  constructor(onProgress) {
    /**
     * We group download requests. Within each group, the requests are executed
     * in series. Between groups, the requests are executed in parallel.
     *
     * @private {!Map.<number, !Array.<shaka.offline.DownloadRequest>>}
     */
    this.groups_ = new Map();

    /** @private {!Promise} */
    this.promise_ = Promise.resolve();

    /** @private {boolean} */
    this.destroyed_ = false;

    /**
     * A callback for when a segment has been downloaded. The first parameter
     * is the progress of all segments, a number between 0.0 (0% complete) and
     * 1.0 (100% complete). The second parameter is the total number of bytes
     * that have been downloaded.
     *
     * @private {function(number, number)}
     */
    this.onProgress_ = onProgress;

    /**
     * We track progress using the estimated size (not the actual size) since
     * the denominator (current / total) will be based on estimates.
     *
     * @private {number}
     */
    this.downloadedEstimatedBytes_ = 0;

    /**
     * When we queue a segment, the estimated size is added to this value. This
     * is used to track progress (downloaded / expected).
     *
     * @private {number}
     */
    this.expectedEstimatedBytes_ = 0;

    /**
     * When a segment is downloaded, the actual size of the segment is added to
     * this value. We use this to know how large the final asset is.
     *
     * @private {number}
     */
    this.downloadedBytes_ = 0;
  }

  /** @override */
  destroy() {
    this.destroyed_ = true;

    const noop = () => {};
    let wait = this.promise_.catch(noop);

    this.promise_ = Promise.resolve();

    return wait;
  }

  /**
   * Add a request to be downloaded as part of a group.
   *
   * @param {number} group The group to add this segment to. If the group does
   *                       not exists, a new group will be created.
   * @param {shaka.extern.Request} request
   * @param {number} estimatedByteLength
   * @param {function(!ArrayBuffer):!Promise} onDownloaded
   *   The callback for when this request has been downloaded. Downloading for
   *   |group| will pause until the promise returned by |onDownloaded| resolves.
   */
  queue(group, request, estimatedByteLength, onDownloaded) {
    const queue = this.groups_.get(group) || [];
    queue.push({
      request: request,
      estimatedByteLength: estimatedByteLength,
      onDownloaded: onDownloaded,
    });
    this.groups_.set(group, queue);
  }

  /**
   * @param {!shaka.net.NetworkingEngine} net
   * @return {!Promise}
   */
  download(net) {
    const groups = Array.from(this.groups_.values());
    this.groups_.clear();

    // Create the full estimate first.
    for (const group of groups) {
      for (const segment of group) {
        this.expectedEstimatedBytes_ += segment.estimatedByteLength;
      }
    }

    /** @type {!Array.<!Promise>} */
    const asyncDownloads = [];
    for (const group of groups) {
      asyncDownloads.push(this.downloadGroup_(net, group));
    }

    // Keep track of all the active downloads so that when we destroy ourselves
    // we will only resolve after the download promise chains have resolved.
    this.promise_ = this.promise_.then(() => Promise.all(asyncDownloads));
    return this.promise_;
  }

  /**
   * @param {!shaka.net.NetworkingEngine} net
   * @param {!Array.<shaka.offline.DownloadRequest>} group
   * @return {!Promise}
   * @private
   */
  downloadGroup_(net, group) {
    let p = Promise.resolve();

    group.forEach((segment) => {
      p = p.then(() => this.downloadSegment_(net, segment));
    });

    return p;
  }

  /**
   * @param {!shaka.net.NetworkingEngine} net
   * @param {shaka.offline.DownloadRequest} segment
   * @return {!Promise}
   * @private
   */
  async downloadSegment_(net, segment) {
    const type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const response = await net.request(type, segment.request).promise;
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
  }

  /**
   * Check if the download manager has been destroyed. If so, throw an error to
   * kill the promise chain.
   * @private
   */
  checkDestroyed_() {
    if (this.destroyed_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }
  }
};
