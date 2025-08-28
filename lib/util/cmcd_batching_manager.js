/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.CmcdBatchingManager');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Timer');
goog.require('shaka.util.CmcdUtils');
goog.require('shaka.util.StringUtils');
goog.requireType('shaka.Player');

/**
 * @summary
 * A CmcdBatchingManager handles batching of CMCD reports for efficient
 * delivery to collection endpoints.
 */
shaka.util.CmcdBatchingManager = class {
  /**
   * @param {shaka.Player} player
   */
  constructor(player) {
    /** @private {shaka.Player} */
    this.player_ = player;

    /** @private {!Map<string, shaka.util.CmcdBatchingManager.Batch>} */
    this.batches_ = new Map();

    /** @private {!Map<string, !shaka.util.Timer>} */
    this.timers_ = new Map();

    /** @private {!Array<shaka.util.CmcdBatchingManager.RetryItem>} */
    this.retryQueue_ = [];

    /** @private {!Map<string, !shaka.util.Timer>} */
    this.retryTimers_ = new Map();

    /** @private {!Array<number>} */
    this.retryDelays_ = [100, 500, 1000, 3000, 5000]; // ms

    /** @private {!Set<string>} */
    this.goneUrls_ = new Set();
  }

  /**
   * Add a CMCD report to be batched and sent to the specified target.
   *
   * @param {!shaka.extern.CmcdTarget} target The CMCD target configuration
   * @param {!CmcdData} cmcdData The CMCD data to batch
   * @suppress {checkDebuggerStatement}
   */
  addReport(target, cmcdData) {
    if (this.goneUrls_.has(target.url)) {
      return;
    }

    const key = this.generateTargetKey_(target);
    const serializedCmcd = shaka.util.CmcdUtils.serialize(cmcdData);
    const urlEncoded = encodeURIComponent(serializedCmcd);

    if (!this.batches_.has(key)) {
      this.batches_.set(key, {
        cmcdData: '',
        target: target,
      });
    }

    const batch = this.batches_.get(key);
    if (batch.cmcdData === '') {
      batch.cmcdData = urlEncoded;
    } else {
      batch.cmcdData += '\n' + urlEncoded;
    }

    // Set up batch timer if configured and not already set
    if (target.batchTimer && !this.timers_.has(key)) {
      const timer = new shaka.util.Timer(() => {
        this.flushByTargetKey_(key);
      });
      timer.tickEvery(target.batchTimer);
      this.timers_.set(key, timer);
    }

    // Check if batch size limit is reached
    if (target.batchSize &&
        batch.cmcdData.split('\n').length >= target.batchSize) {
      this.flushByTargetKey_(key);
    }
  }

  /**
   * Flush all batches for a specific URL.
   *
   * @param {string} url The URL to flush batches for
   */
  flushBatch(url) {
    for (const key of this.batches_.keys()) {
      const batch = this.batches_.get(key);
      if (batch && batch.target && batch.target.url === url) {
        this.flushByTargetKey_(key);
      }
    }
  }

  /**
   * Reset the batching manager, clearing all batches and timers.
   */
  reset() {
    for (const timer of this.timers_.values()) {
      timer.stop();
    }
    for (const timer of this.retryTimers_.values()) {
      timer.stop();
    }
    this.batches_.clear();
    this.timers_.clear();
    this.retryQueue_ = [];
    this.retryTimers_.clear();
    this.goneUrls_.clear();
  }

  /**
   * Generate a unique key for a target configuration.
   *
   * @param {!shaka.extern.CmcdTarget} target
   * @return {string}
   * @private
   */
  generateTargetKey_(target) {
    return JSON.stringify({
      url: target.url,
      mode: target.mode,
      batchSize: target.batchSize,
      batchTimer: target.batchTimer,
    });
  }

  /**
   * Flush a batch by its target key.
   *
   * @param {string} key
   * @private
   */
  flushByTargetKey_(key) {
    const batch = this.batches_.get(key);
    if (!batch || batch.cmcdData.length === 0) {
      return;
    }

    const {target, cmcdData} = batch;
    const retryParams = shaka.net.NetworkingEngine.defaultRetryParameters();

    const request = shaka.net.NetworkingEngine.makeRequest(
        [target.url], retryParams);
    request.method = 'POST';
    request.body = shaka.util.StringUtils.toUTF8(cmcdData);
    request.headers['Content-Type'] = 'txt/cmcd';

    this.sendBatchReport_(request)
        .then((response) => {
          if (response && response.status === 410) {
            this.goneUrls_.add(target.url);
            shaka.log.info('CMCD endpoint returned 410 Gone, ' +
                'removing from future batches:', target.url);
          } else if (response && response.status === 429) {
            // Rate limited, add to retry queue
            this.retryQueue_.push({
              request: request,
              retryCount: 0,
              sendTime: Date.now() + this.retryDelays_[0],
            });
            if (this.retryQueue_.length === 1) {
              const timer = new shaka.util.Timer(() => {
                this.processRetryQueue_();
              });
              timer.tickAfter(this.retryDelays_[0] / 1000);
              this.retryTimers_.set('retry', timer);
            }
          }
        })
        .catch((error) => {
          shaka.log.warning('Failed to send CMCD batch report:', error);
        });

    // Clear the batch data
    batch.cmcdData = '';
  }

  /**
   * Send a batch report request.
   *
   * @param {!shaka.extern.Request} request
   * @return {!Promise<!shaka.extern.Response>}
   * @private
   */
  async sendBatchReport_(request) {
    const requestType = shaka.net.NetworkingEngine.RequestType.CMCD;
    const networkingEngine = this.player_.getNetworkingEngine();

    try {
      const operation = networkingEngine.request(requestType, request);
      const response = await operation.promise;
      return response;
    } catch (error) {
      // Return the response from the error if available
      if (error.response) {
        return error.response;
      }
      throw error;
    }
  }

  /**
   * Process the retry queue for rate-limited requests.
   *
   * @private
   */
  async processRetryQueue_() {
    const now = Date.now();
    const reportsToProcess = this.retryQueue_.filter(
        (report) => report.sendTime <= now);
    const remainingReports = this.retryQueue_.filter(
        (report) => report.sendTime > now);
    const newRetryReports = [];

    const processingPromises = reportsToProcess.map(async (report) => {
      try {
        const response = await this.sendBatchReport_(report.request);
        if (response && response.status === 410) {
          this.goneUrls_.add(report.request.uris[0]);
        } else if (response && response.status === 429) {
          report.retryCount++;
          if (report.retryCount < this.retryDelays_.length) {
            report.sendTime = Date.now() +
                this.retryDelays_[report.retryCount];
            newRetryReports.push(report);
          }
        }
      } catch (error) {
        shaka.log.warning('Retry attempt failed for CMCD batch:', error);
      }
    });

    await Promise.all(processingPromises);

    this.retryQueue_ = remainingReports.concat(newRetryReports);

    if (this.retryQueue_.length > 0) {
      const nextRetryTime = Math.min(
          ...this.retryQueue_.map((r) => r.sendTime),
      );
      const key = 'retry';
      if (this.retryTimers_.has(key)) {
        this.retryTimers_.get(key).stop();
      }
      const delay = Math.max(0, nextRetryTime - Date.now());
      const timer = new shaka.util.Timer(() => {
        this.processRetryQueue_();
      });
      timer.tickAfter(delay / 1000);
      this.retryTimers_.set(key, timer);
    }
  }
};


/**
 * @typedef {{
 *   cmcdData: string,
 *   target: shaka.extern.CmcdTarget,
 * }}
 *
 * @property {string} cmcdData
 *   The batched CMCD data as a newline-separated string
 * @property {shaka.extern.CmcdTarget} target
 *   The target configuration for this batch
 */
shaka.util.CmcdBatchingManager.Batch;

/**
 * @typedef {{
 *   request: shaka.extern.Request,
 *   retryCount: number,
 *   sendTime: number,
 * }}
 *
 * @property {shaka.extern.Request} request
 *   The request to retry
 * @property {number} retryCount
 *   Current retry attempt count
 * @property {number} sendTime
 *   Timestamp when the next retry should be attempted
 */
shaka.util.CmcdBatchingManager.RetryItem;
