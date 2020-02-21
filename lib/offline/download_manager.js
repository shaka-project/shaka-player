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
goog.require('shaka.offline.DownloadProgressEstimator');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Pssh');


/**
 * This manages downloading segments.
 *
 * @implements {shaka.util.IDestroyable}
 * @final
 */
shaka.offline.DownloadManager = class {
  /**
   * Create a new download manager. It will use (but not own) |networkingEngine|
   * and call |onProgress| after each download.
   *
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {function(number, number)} onProgress
   * @param {function(!Uint8Array, string)} onInitData
   */
  constructor(networkingEngine, onProgress, onInitData) {
    /** @private {shaka.net.NetworkingEngine} */
    this.networkingEngine_ = networkingEngine;

    /**
     * We group downloads. Within each group, the requests are executed in
     * series. Between groups, the requests are executed in parallel. We store
     * the promise chain that is doing the work.
     *
     * @private {!Map.<number, !Promise>}
     */
    this.groups_ = new Map();

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
     * A callback for when a segment has new PSSH data and we pass
     * on the initData to storage
     *
     * @private {function(!Uint8Array, string)}
     */
    this.onInitData_ = onInitData;

    /** @private {shaka.offline.DownloadProgressEstimator} */
    this.estimator_ = new shaka.offline.DownloadProgressEstimator();
  }

  /** @override */
  destroy() {
    // Setting this will cause the promise chains to stop.
    this.destroyed_ = true;

    // Append no-ops so that we ensure that no errors escape |destroy|.
    return Promise.all(this.groups_.values()).then(() => {}, () => {});
  }

  /**
   * Add a request to be downloaded as part of a group.
   *
   * @param {number} groupId
   *    The group to add this segment to. If the group does not exist, a new
   *    group will be created.
   * @param {shaka.extern.Request} request
   * @param {number} estimatedByteLength
   * @param {boolean} isInitSegment
   * @param {function(BufferSource):!Promise} onDownloaded
   *   The callback for when this request has been downloaded. Downloading for
   *   |group| will pause until the promise returned by |onDownloaded| resolves.
   */
  queue(groupId, request, estimatedByteLength, isInitSegment, onDownloaded) {
    goog.asserts.assert(
        !this.destroyed_,
        'Do not call |queue| after |destroy|');

    const id = this.estimator_.open(estimatedByteLength);

    const group = this.groups_.get(groupId) || Promise.resolve();

    // Add another download to the group.
    this.groups_.set(groupId, group.then(async () => {
      const response = await this.fetchSegment_(request);

      // Make sure we stop downloading if we have been destroyed.
      if (this.destroyed_) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED);
      }

      // Update initData
      if (isInitSegment) {
        const segmentBytes = new Uint8Array(response);
        const pssh = new shaka.util.Pssh(segmentBytes);
        for (const key in pssh.data) {
          const index = Number(key);
          const data = pssh.data[index];
          const systemId = pssh.systemIds[index];
          this.onInitData_(data, systemId);
        }
      }

      // Update all our internal stats.
      this.estimator_.close(id, response.byteLength);
      this.onProgress_(
          this.estimator_.getEstimatedProgress(),
          this.estimator_.getTotalDownloaded());

      return onDownloaded(response);
    }));
  }

  /**
   * Get a promise that will resolve when all currently queued downloads have
   * finished.
   *
   * @return {!Promise.<number>}
   */
  async waitToFinish() {
    await Promise.all(this.groups_.values());
    return this.estimator_.getTotalDownloaded();
  }

  /**
   * Download a segment and return the data in the response.
   *
   * @param {shaka.extern.Request} request
   * @return {!Promise.<!ArrayBuffer>}
   * @private
   */
  async fetchSegment_(request) {
    const type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const action = this.networkingEngine_.request(type, request);
    const response = await action.promise;

    goog.asserts.assert(response.data, 'Response data should be non-null!');
    return response.data;
  }
};
