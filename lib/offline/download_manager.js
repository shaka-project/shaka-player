/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.DownloadManager');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.DownloadProgressEstimator');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Destroyer');
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
   * @param {function(!Uint8Array)} onInitData
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

    /** @private {!shaka.util.Destroyer} */
    this.destroyer_ = new shaka.util.Destroyer(() => {
      const promises = Array.from(this.groups_.values());
      // Add a "catch" block to stop errors from being returned.
      return Promise.all(promises.map((p) => p.catch(() => {})));
    });

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
     * @private {function(!Uint8Array)}
     */
    this.onInitData_ = onInitData;

    /** @private {shaka.offline.DownloadProgressEstimator} */
    this.estimator_ = new shaka.offline.DownloadProgressEstimator();
  }

  /** @override */
  destroy() {
    return this.destroyer_.destroy();
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
    this.destroyer_.ensureNotDestroyed();

    const id = this.estimator_.open(estimatedByteLength);

    const group = this.groups_.get(groupId) || Promise.resolve();

    // Add another download to the group.
    this.groups_.set(groupId, group.then(async () => {
      const response = await this.fetchSegment_(request);

      // Make sure we stop downloading if we have been destroyed.
      if (this.destroyer_.destroyed()) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED);
      }

      // Update initData
      if (isInitSegment) {
        const segmentBytes = shaka.util.BufferUtils.toUint8(response);
        const pssh = new shaka.util.Pssh(segmentBytes);
        for (const elem of pssh.data) {
          this.onInitData_(elem);
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
   * @return {!Promise.<BufferSource>}
   * @private
   */
  async fetchSegment_(request) {
    const type = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const action = this.networkingEngine_.request(type, request);
    const response = await action.promise;
    return response.data;
  }
};
