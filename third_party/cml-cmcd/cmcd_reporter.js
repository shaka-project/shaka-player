/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdReporter');

goog.require('cml.cmcd.CMCD_DEFAULT_TIME_INTERVAL');
goog.require('cml.cmcd.CMCD_EVENT_MODE');
goog.require('cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED');
goog.require('cml.cmcd.CMCD_EVENT_TIME_INTERVAL');
goog.require('cml.cmcd.CMCD_HEADERS');
goog.require('cml.cmcd.CMCD_MIME_TYPE');
goog.require('cml.cmcd.CMCD_PARAM');
goog.require('cml.cmcd.CMCD_QUERY');
goog.require('cml.cmcd.CMCD_REQUEST_MODE');
goog.require('cml.cmcd.CMCD_V2');
goog.require('cml.cmcd.CmcdEventType');
goog.require('cml.cmcd.encodeCmcd');
goog.require('cml.cmcd.encodePreparedCmcd');
goog.require('cml.cmcd.prepareCmcdData');
goog.require('cml.cmcd.toPreparedCmcdHeaders');
goog.require('cml.cmcd.uuid');
goog.requireType('cml.cmcd.Cmcd');
goog.requireType('cml.cmcd.CmcdEncodeOptions');
goog.requireType('cml.cmcd.CmcdEventReportConfig');
goog.requireType('cml.cmcd.CmcdReportConfig');
goog.requireType('cml.cmcd.CmcdReporterConfig');
goog.requireType('cml.cmcd.CmcdRequestReport');


/**
 * @typedef {{
 *   sn: number,
 *   msdSent: boolean
 * }}
 * @private
 */
cml.cmcd.CmcdReporter_CmcdTarget_;


/**
 * @typedef {{
 *   sn: number,
 *   msdSent: boolean,
 *   intervalId: (number|undefined),
 *   queue: !Array<!cml.cmcd.Cmcd>
 * }}
 * @private
 */
cml.cmcd.CmcdReporter_CmcdEventTarget_;


/**
 * Build the encoder options for a given reporting mode + report config.
 *
 * @param {string} reportingMode
 * @param {!cml.cmcd.CmcdReportConfig} config
 * @param {string=} baseUrl
 * @return {!cml.cmcd.CmcdEncodeOptions}
 * @private
 */
cml.cmcd.CmcdReporter_createEncodingOptions_ = function(
    reportingMode, config, baseUrl) {
  const enabledKeySet = new Set(config.enabledKeys || []);

  return {
    version: config.version || cml.cmcd.CMCD_V2,
    reportingMode: reportingMode,
    filter: (key) => enabledKeySet.has(key),
    baseUrl: baseUrl,
  };
};


/**
 * Apply config defaults to produce a fully-normalized
 * `CmcdReporterConfigNormalized`-equivalent shape.
 *
 * Upstream returns a TS intersection type
 * (`CmcdReporterConfig & {sid, eventTargets, version, transmissionMode}`);
 * we return a plain object literal with the same keys.
 *
 * @param {!cml.cmcd.CmcdReporterConfig} config
 * @return {!cml.cmcd.CmcdReporterConfig}
 * @private
 */
cml.cmcd.CmcdReporter_createCmcdReporterConfig_ = function(config) {
  // Apply top-level config defaults
  const version = config.version || cml.cmcd.CMCD_V2;
  const eventTargets = config.eventTargets || [];
  const sid = config.sid || cml.cmcd.uuid();
  const transmissionMode = config.transmissionMode || cml.cmcd.CMCD_QUERY;

  /** @type {!Array<!cml.cmcd.CmcdEventReportConfig>} */
  const normalizedEventTargets = [];

  for (const target of eventTargets) {
    if (target && target.url && target.events && target.events.length) {
      /** @type {!Array<string>} */
      const enabledKeysCopy = target.enabledKeys ?
          /** @type {!Array<string>} */ ([]).concat(target.enabledKeys) : [];
      /** @type {!Array<string>} */
      const eventsCopy =
          /** @type {!Array<string>} */ ([]).concat(target.events);
      normalizedEventTargets.push({
        version: target.version || cml.cmcd.CMCD_V2,
        enabledKeys: enabledKeysCopy,
        url: target.url,
        events: eventsCopy,
        interval: target.interval != null ?
            target.interval : cml.cmcd.CMCD_DEFAULT_TIME_INTERVAL,
        batchSize: target.batchSize || 1,
      });
    }
  }

  /** @type {!cml.cmcd.CmcdReporterConfig} */
  const normalized = /** @type {!cml.cmcd.CmcdReporterConfig} */ (
      Object.assign({}, config, {
        version: version,
        transmissionMode: transmissionMode,
        sid: sid,
        cid: config.cid,
        enabledKeys: config.enabledKeys,
        eventTargets: normalizedEventTargets,
      }));

  return normalized;
};


/**
 * The CMCD reporter.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#reporting-modes-when-we-send-data}
 */
cml.cmcd.CmcdReporter = class {
  /**
   * Creates a new CMCD reporter.
   *
   * @param {!cml.cmcd.CmcdReporterConfig} config The configuration for
   *   the CMCD reporter.
   * @param {(function(!Object): !Promise<{status: number}>)=} requester
   *   The function to use to send the request. The default is a simple
   *   wrapper around the native `fetch` API.
   */
  constructor(config, requester) {
    /** @private {number} */
    this.timeOrigin_ = performance.timeOrigin ||
        (performance.timing && performance.timing.fetchStart) ||
        (Date.now() - performance.now());

    /** @private {!cml.cmcd.Cmcd} */
    this.data_ = /** @type {!cml.cmcd.Cmcd} */ ({});

    /** @private {!cml.cmcd.CmcdReporterConfig} */
    this.config_ = cml.cmcd.CmcdReporter_createCmcdReporterConfig_(config);

    /** @private {number} */
    this.msd_ = NaN;

    /**
     * @private {!Map<!cml.cmcd.CmcdEventReportConfig,
     *   !cml.cmcd.CmcdReporter_CmcdEventTarget_>}
     */
    this.eventTargets_ = new Map();

    /** @private {!cml.cmcd.CmcdReporter_CmcdTarget_} */
    this.requestTarget_ = {
      sn: 0,
      msdSent: false,
    };

    /** @private {function(!Object): !Promise<{status: number}>} */
    this.requester_ = requester;

    this.data_ = /** @type {!cml.cmcd.Cmcd} */ ({
      cid: this.config_.cid,
      sid: this.config_.sid,
      v: this.config_.version,
    });

    for (const target of this.config_.eventTargets || []) {
      this.eventTargets_.set(target, {
        intervalId: undefined,
        sn: 0,
        msdSent: false,
        queue: [],
      });
    }
  }

  /**
   * Starts the CMCD reporter. Called by the player when the reporter
   * is enabled.
   *
   * Note: This fires an initial time-interval event immediately
   * (synchronously) before the first interval elapses. Ensure CMCD
   * data (sid, cid, etc.) is populated before calling start().
   */
  start() {
    this.eventTargets_.forEach((target, config) => {
      // If the interval is 0 or the TIME_INTERVAL event is not enabled,
      // do not start the interval.
      if (config.interval === 0 ||
          !config.events ||
          !config.events.includes(cml.cmcd.CmcdEventType.TIME_INTERVAL)) {
        return;
      }

      const timeIntervalEvent = () => {
        this.recordTargetEvent_(
            target, config, cml.cmcd.CMCD_EVENT_TIME_INTERVAL);
        this.processEventTargets_();
      };

      target.intervalId = setInterval(
          timeIntervalEvent, /** @type {number} */ (config.interval) * 1000);
      timeIntervalEvent();
    });
  }

  /**
   * Stops the CMCD reporter. Called by the player when the reporter is
   * disabled.
   *
   * @param {boolean=} flush Whether to flush the event targets.
   */
  stop(flush = false) {
    if (flush) {
      this.flush();
    }

    this.eventTargets_.forEach((target) => {
      clearInterval(target.intervalId);
    });
  }

  /**
   * Forces the sending of all event reports, regardless of the batch
   * size or interval. Useful for sending outstanding reports when the
   * player is destroyed or a playback session ends.
   */
  flush() {
    this.processEventTargets_(true);
  }

  /**
   * Updates the CMCD data. Called by the player when the data changes.
   *
   * @param {!cml.cmcd.Cmcd} data The data to update.
   */
  update(data) {
    if (data.sid && data.sid !== this.data_.sid) {
      this.resetSession_();
    }

    if (data.msd && !isNaN(data.msd)) {
      this.msd_ = data.msd;
    }

    // msd is tracked separately via this.msd_ and sent once per target,
    // so it is stripped from the persistent data store after each
    // update.
    this.data_ = /** @type {!cml.cmcd.Cmcd} */ (
        Object.assign({}, this.data_, data, {msd: undefined}));
  }

  /**
   * Records an event. Called by the player when an event occurs.
   *
   * @param {string} type The type of event to record.
   * @param {!cml.cmcd.Cmcd=} data Additional data to record with the
   *   event. This data only applies to this event report. Persistent
   *   data should be updated using `update()`.
   */
  recordEvent(type, data) {
    const eventData = data || /** @type {!cml.cmcd.Cmcd} */ ({});
    this.eventTargets_.forEach((target, config) => {
      this.recordTargetEvent_(target, config, type, eventData);
    });

    this.processEventTargets_();
  }

  /**
   * Records an event for a target. Called by the reporter when an
   * event occurs.
   *
   * @param {!cml.cmcd.CmcdReporter_CmcdEventTarget_} target The target
   *   to record the event for.
   * @param {!cml.cmcd.CmcdEventReportConfig} config The configuration
   *   for the target.
   * @param {string} type The type of event to record.
   * @param {!cml.cmcd.Cmcd=} data Additional data to record with the
   *   event. This data only applies to this event report. Persistent
   *   data should be updated using `update()`.
   * @private
   */
  recordTargetEvent_(target, config, type, data) {
    const eventData = data || /** @type {!cml.cmcd.Cmcd} */ ({});
    if (!config.events || !config.events.includes(type)) {
      return;
    }

    /** @type {!cml.cmcd.Cmcd} */
    const item = /** @type {!cml.cmcd.Cmcd} */ (
        Object.assign({}, this.data_, eventData, {
          e: type,
          ts: eventData.ts != null ? eventData.ts : Date.now(),
          sn: target.sn++,
        }));

    if (!isNaN(this.msd_) && !target.msdSent) {
      item.msd = this.msd_;
      target.msdSent = true;
    }

    target.queue.push(item);
  }

  /**
   * Records a response-received event. Called by the player when a
   * media request response has been fully received.
   *
   * This method automatically derives the `rr` event keys from the
   *
   * - `url` - the original requested URL (before any redirects)
   * - `rc` - the HTTP response status code
   * - `ts` - the request initiation time (from `resourceTiming.startTime`)
   * - `ttfb` - time to first byte (from `resourceTiming.responseStart`)
   * - `ttlb` - time to last byte (from `resourceTiming.duration`)
   *
   * Additional keys like `ttfbb`, `cmsdd`, `cmsds`, and `smrt` can be
   * supplied via the `data` parameter if the player has access to
   * them.
   *
   * @param {!Object} response The HTTP response received. Upstream
   *   shape: `HttpResponse<HttpRequest<{cmcd?: Cmcd}>>` —
   *   `{request: {url, customData?: {cmcd?: Cmcd}}, status?,
   *   resourceTiming?: {startTime, responseStart, duration}}`.
   * @param {!cml.cmcd.Cmcd=} data Additional CMCD data to include with
   *   the event. Values provided here override any auto-derived
   *   values.
   */
  recordResponseReceived(response, data) {
    const responseData = data || /** @type {!cml.cmcd.Cmcd} */ ({});
    const r = /** @type {!Object<string, *>} */ (response);
    const request = /** @type {!Object<string, *>} */ (r['request'] || {});
    const status = /** @type {(number|undefined)} */ (r['status']);
    const timing = /** @type {?{startTime: (number|undefined),
        responseStart: (number|undefined), duration: (number|undefined)}} */ (
        r['resourceTiming'] || null);

    const url = responseData.url != null ?
        responseData.url :
        /** @type {(string|undefined)} */ (request['url']);

    if (!url) {
      return;
    }

    const urlObj = new URL(/** @type {string} */ (url));
    urlObj.searchParams.delete(cml.cmcd.CMCD_PARAM);

    /** @type {!cml.cmcd.Cmcd} */
    const derived = /** @type {!cml.cmcd.Cmcd} */ ({
      url: urlObj.toString(),
      rc: status,
    });

    if (timing) {
      if (timing.startTime != null) {
        derived.ts = Math.round(this.timeOrigin_ + timing.startTime);

        if (timing.responseStart != null) {
          derived.ttfb = Math.round(timing.responseStart - timing.startTime);
        }
      }

      if (timing.duration != null) {
        derived.ttlb = Math.round(timing.duration);
      }
    }

    const reqCustomData =
        /** @type {!Object<string, *>} */ (request['customData'] || {});
    const cmcd = /** @type {!cml.cmcd.Cmcd} */ (
        reqCustomData['cmcd'] != null ?
            reqCustomData['cmcd'] : /** @type {!cml.cmcd.Cmcd} */ ({}));

    this.recordEvent(
        cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED,
        /** @type {!cml.cmcd.Cmcd} */ (
            Object.assign({}, cmcd, derived, responseData)));
  }

  /**
   * Applies the CMCD request report data to the request. Called by the
   * player before sending the request.
   *
   * @param {!Object} req The request to apply the CMCD request report
   *   to.
   * @return {!Object} The request with the CMCD request report
   *   applied.
   *
   * @deprecated Use `createRequestReport` instead.
   */
  applyRequestReport(req) {
    const result = this.createRequestReport(req);
    return result != null ? result : req;
  }

  /**
   * Checks if the request reporting is enabled.
   *
   * @return {boolean} `true` if the request reporting is enabled,
   *   `false` otherwise.
   */
  isRequestReportingEnabled() {
    return !!(this.config_.enabledKeys && this.config_.enabledKeys.length);
  }

  /**
   * Creates a new request with the CMCD request report data applied.
   * Called by the player before sending the request.
   *
   * Upstream signature is generic
   * (`<R extends HttpRequest>(request: R, data?: Partial<Cmcd>): R &
   * CmcdRequestReport<R['customData']>`); the generic erases in
   * Closure.
   *
   * @param {!Object} request The request to apply the CMCD request
   *   report to.
   * @param {!cml.cmcd.Cmcd=} data The data to apply to the request.
   *   This data only applies to this request report. Persistent data
   *   should be updated using `update()`.
   * @return {!cml.cmcd.CmcdRequestReport} The request with the CMCD
   *   request report applied.
   */
  createRequestReport(request, data) {
    const r = /** @type {!Object<string, *>} */ (request);
    const customData =
        /** @type {!Object<string, *>} */ (r['customData'] || {});
    const headers =
        /** @type {!Object<string, string>} */ (r['headers'] || {});

    /** @type {!cml.cmcd.CmcdRequestReport} */
    const report = /** @type {!cml.cmcd.CmcdRequestReport} */ (
        Object.assign({}, request, {
          headers: Object.assign({}, headers),
          customData: Object.assign({}, customData, {
            cmcd: /** @type {!cml.cmcd.Cmcd} */ ({}),
          }),
        }));

    if (!this.config_.enabledKeys ||
        !this.config_.enabledKeys.length ||
        !report.url) {
      return report;
    }

    const url = new URL(report.url);
    /** @type {!cml.cmcd.Cmcd} */
    const cmcdData = /** @type {!cml.cmcd.Cmcd} */ (
        Object.assign({}, this.data_, data || {}, {
          sn: this.requestTarget_.sn++,
        }));
    const options = cml.cmcd.CmcdReporter_createEncodingOptions_(
        cml.cmcd.CMCD_REQUEST_MODE, this.config_, url.origin);

    if (!isNaN(this.msd_) && !this.requestTarget_.msdSent) {
      cmcdData.msd = this.msd_;
      this.requestTarget_.msdSent = true;
    }

    const cmcd = report.customData.cmcd =
        cml.cmcd.prepareCmcdData(cmcdData, options);

    switch (this.config_.transmissionMode) {
      case cml.cmcd.CMCD_QUERY: {
        const param = cml.cmcd.encodePreparedCmcd(cmcd);
        if (param) {
          url.searchParams.set(cml.cmcd.CMCD_PARAM, param);
          report.url = url.toString();
        }
        break;
      }

      case cml.cmcd.CMCD_HEADERS:
        Object.assign(
            report.headers,
            cml.cmcd.toPreparedCmcdHeaders(cmcd, options.customHeaderMap));
        break;
    }

    return report;
  }

  /**
   * Processes the event targets. Called by the reporter when an event
   * occurs.
   *
   * @param {boolean=} flush Whether to flush the event targets.
   * @private
   */
  processEventTargets_(flush = false) {
    let reprocess = false;

    this.eventTargets_.forEach((target, config) => {
      const queue = target.queue;

      if (!queue.length) {
        return;
      }

      if (queue.length < /** @type {number} */ (config.batchSize) && !flush) {
        return;
      }

      const deleteCount = flush ?
          queue.length : /** @type {number} */ (config.batchSize);
      const events = queue.splice(0, deleteCount);
      this.sendEventReport_(config, events).catch(() => {
        // Re-queue events that failed to send
        target.queue.unshift(...events);
      });

      reprocess = reprocess || queue.length > 0;
    });

    if (reprocess) {
      this.processEventTargets_();
    }
  }

  /**
   * Sends an event report. Called by the reporter when a batch is
   * ready to be sent.
   *
   * @param {!cml.cmcd.CmcdEventReportConfig} target The target to send
   *   the event report to.
   * @param {!Array<!cml.cmcd.Cmcd>} data The data to send in the event
   *   report.
   * @return {!Promise<void>}
   * @private
   */
  async sendEventReport_(target, data) {
    const options = cml.cmcd.CmcdReporter_createEncodingOptions_(
        cml.cmcd.CMCD_EVENT_MODE, target);
    const response = await this.requester_({
      url: target.url,
      method: 'POST',
      headers: {
        'Content-Type': cml.cmcd.CMCD_MIME_TYPE,
      },
      body: data.map((item) => cml.cmcd.encodeCmcd(item, options)).join('\n') +
          '\n',
    });

    const status = response.status;

    if (status === 410) {
      // Clear the interval and drain the queue before removing the target
      // so the orphaned setInterval does not keep firing after the Map
      // entry is gone (which would prevent stop() from reaching it).
      const state = this.eventTargets_.get(target);
      if (state) {
        clearInterval(state.intervalId);
        state.queue = [];
      }
      this.eventTargets_.delete(target);
    } else if (status === 429 || (status > 499 && status < 600)) {
      throw new Error(`Event report failed with status ${status}`);
    }
  }

  /**
   * Resets the session related data. Called when the session ID
   * changes.
   *
   * @private
   */
  resetSession_() {
    this.eventTargets_.forEach((target) => {
      target.sn = 0;
    });
    this.requestTarget_.sn = 0;
  }
};
