/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdReportRecorder');

goog.require('cml.cmcd.CMCD_PARAM');
goog.require('cml.cmcd.CMCD_RECORDED_REPORT_MODE_EVENT');
goog.require('cml.cmcd.CMCD_RECORDED_REPORT_MODE_HEADER');
goog.require('cml.cmcd.CMCD_RECORDED_REPORT_MODE_QUERY');
goog.require('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_EVENT');
goog.require('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_MANIFEST');
goog.require('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_SEGMENT');
goog.require('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_UNKNOWN');
goog.require('cml.cmcd.createFetchTransport');
goog.require('cml.cmcd.createXhrTransport');
goog.requireType('cml.cmcd.CmcdRecordedReport');
goog.requireType('cml.cmcd.CmcdReportRecorderOptions');
goog.requireType('cml.cmcd.CmcdReportRecorderWaitOptions');
goog.requireType('cml.cmcd.CmcdTransportAdapter');


/** @const {!RegExp} @private */
cml.cmcd.CmcdReportRecorder_MANIFEST_EXTENSIONS_ =
    /\.(m3u8|mpd)(\?|$|\/)/i;

/** @const {!RegExp} @private */
cml.cmcd.CmcdReportRecorder_SEGMENT_EXTENSIONS_ =
    /\.(m4s|m4v|m4a|mp4|ts|aac)(\?|$|\/)/i;


/**
 * @param {string} url
 * @param {boolean} isEventTarget
 * @return {string}
 * @private
 */
cml.cmcd.CmcdReportRecorder_classifyUrl_ = function(url, isEventTarget) {
  if (isEventTarget) {
    return cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_EVENT;
  }
  if (cml.cmcd.CmcdReportRecorder_MANIFEST_EXTENSIONS_.test(url)) {
    return cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_MANIFEST;
  }
  if (cml.cmcd.CmcdReportRecorder_SEGMENT_EXTENSIONS_.test(url)) {
    return cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_SEGMENT;
  }
  return cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_UNKNOWN;
};


/**
 * @param {(!Object<string, string>|undefined)} headers
 * @return {boolean}
 * @private
 */
cml.cmcd.CmcdReportRecorder_hasCmcdHeader_ = function(headers) {
  if (!headers) {
    return false;
  }
  for (const name in headers) {
    if (name.toLowerCase().startsWith('cmcd-')) {
      return true;
    }
  }
  return false;
};


/**
 * @param {string} url
 * @param {(!Object<string, string>|undefined)} headers
 * @param {boolean} isEventTarget
 * @return {?string}
 * @private
 */
cml.cmcd.CmcdReportRecorder_detectReportingMode_ =
    function(url, headers, isEventTarget) {
  if (isEventTarget) {
    return cml.cmcd.CMCD_RECORDED_REPORT_MODE_EVENT;
  }
  if (cml.cmcd.CmcdReportRecorder_hasCmcdHeader_(headers)) {
    return cml.cmcd.CMCD_RECORDED_REPORT_MODE_HEADER;
  }
  return url.includes(cml.cmcd.CMCD_PARAM + '=') ?
      cml.cmcd.CMCD_RECORDED_REPORT_MODE_QUERY :
      null;
};


/**
 * Test helper that records CMCD-bearing reports across XHR and fetch
 * transports. Each captured request is normalized to a plain
 * HttpRequest-shaped object.
 */
cml.cmcd.CmcdReportRecorder = class {
  constructor() {
    /** @private {!Array<!cml.cmcd.CmcdRecordedReport>} */
    this.reports_ = [];
    /** @private {!Array<function():void>} */
    this.detachers_ = [];
    /** @private {boolean} */
    this.attached_ = false;
    /** @private {!Array<string>} */
    this.eventTargetUrls_ = [];
    /** @private {!Map<number, !Object>} */
    this.waiters_ = new Map();
    /** @private {?function(!cml.cmcd.CmcdRecordedReport):void} */
    this.onReport_ = null;
    /** @private {number} */
    this.waitTimeout_ = 15000;

    /** @private {!cml.cmcd.CmcdRequestDeliver} */
    this.deliver_ = (request) => {
      const url = /** @type {string} */ (request['url']);
      const method = (/** @type {string} */ (request['method']) || 'GET')
          .toUpperCase();
      const isEventTarget = method === 'POST' &&
          this.eventTargetUrls_.some((t) => url.startsWith(t));

      const reportingMode = cml.cmcd.CmcdReportRecorder_detectReportingMode_(
          url,
          /** @type {!Object<string, string>} */ (request['headers']),
          isEventTarget);
      if (reportingMode === null) {
        return undefined;
      }

      /** @type {!cml.cmcd.CmcdRecordedReport} */
      const captured = {
        request: request,
        type: cml.cmcd.CmcdReportRecorder_classifyUrl_(url, isEventTarget),
        reportingMode: reportingMode,
        timestamp: Date.now(),
      };
      this.reports_.push(captured);
      if (this.onReport_) {
        try {
          this.onReport_(captured);
        } catch (err) {
          console.error('CmcdReportRecorder onReport listener threw:', err);
        }
      }
      this.notifyWaiters_();

      return isEventTarget ? new Response(null, {status: 204}) : undefined;
    };
  }

  /**
   * @param {(string|undefined)} type
   * @return {!Array<!cml.cmcd.CmcdRecordedReport>}
   * @private
   */
  getMatching_(type) {
    return type === undefined ?
        this.reports_.slice() :
        this.reports_.filter((r) => r.type === type);
  }

  /** @private */
  notifyWaiters_() {
    for (const [timer, waiter] of this.waiters_) {
      const matching = this.getMatching_(waiter.type);
      if (matching.length >= waiter.count) {
        clearTimeout(timer);
        this.waiters_.delete(timer);
        waiter.resolve(matching);
      }
    }
  }

  /**
   * @param {(string|undefined)} type
   * @param {!cml.cmcd.CmcdReportRecorderWaitOptions} options
   * @return {!Promise<!Array<!cml.cmcd.CmcdRecordedReport>>}
   * @private
   */
  waitFor_(type, options) {
    const count = options.count || 1;
    const timeout = (options.timeout != null) ?
        options.timeout :
        this.waitTimeout_;

    const matching = this.getMatching_(type);
    if (matching.length >= count) {
      return Promise.resolve(matching);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters_.delete(timer);
        const current = this.getMatching_(type);
        reject(new Error(
            'Timeout waiting for ' + count + ' ' + (type || 'any') +
            ' CMCD report(s). Got ' + current.length +
            '. Total recorded: ' + this.reports_.length + '.'));
      }, timeout);

      this.waiters_.set(timer, {type, count, resolve, reject});
    });
  }

  /**
   * Install transport patches and begin recording. No-op if already
   * attached.
   *
   * @param {!cml.cmcd.CmcdReportRecorderOptions=} options
   */
  attach(options = {}) {
    if (this.attached_) {
      return;
    }
    this.attached_ = true;
    this.eventTargetUrls_ = options.eventTargetUrls ?
        options.eventTargetUrls.slice() :
        [];
    this.onReport_ = options.onReport || null;
    this.waitTimeout_ = (options.waitTimeout != null) ?
        options.waitTimeout :
        15000;

    const transports = options.transports ?
        options.transports.slice() :
        [cml.cmcd.createXhrTransport(), cml.cmcd.createFetchTransport()];
    for (const transport of transports) {
      this.detachers_.push(transport.attach(this.deliver_));
    }
  }

  /**
   * Remove transport patches. Rejects any pending waiters.
   */
  detach() {
    if (!this.attached_) {
      return;
    }
    for (const detacher of this.detachers_) {
      detacher();
    }
    this.detachers_ = [];
    this.attached_ = false;
    this.eventTargetUrls_ = [];
    this.onReport_ = null;

    for (const [timer, waiter] of this.waiters_) {
      clearTimeout(timer);
      waiter.reject(new Error('Recorder detached while waiting'));
    }
    this.waiters_.clear();
  }

  /**
   * Discard all recorded reports.
   */
  clear() {
    this.reports_ = [];
  }

  /**
   * @return {!Array<!cml.cmcd.CmcdRecordedReport>}
   */
  getReports() {
    return this.reports_.slice();
  }

  /**
   * @param {!cml.cmcd.CmcdReportRecorderWaitOptions=} options
   * @return {!Promise<!Array<!cml.cmcd.CmcdRecordedReport>>}
   */
  waitForReports(options = {}) {
    return this.waitFor_(undefined, options);
  }

  /**
   * @param {!cml.cmcd.CmcdReportRecorderWaitOptions=} options
   * @return {!Promise<!Array<!cml.cmcd.CmcdRecordedReport>>}
   */
  waitForManifest(options = {}) {
    return this.waitFor_(
        cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_MANIFEST, options);
  }

  /**
   * @param {!cml.cmcd.CmcdReportRecorderWaitOptions=} options
   * @return {!Promise<!Array<!cml.cmcd.CmcdRecordedReport>>}
   */
  waitForSegments(options = {}) {
    return this.waitFor_(
        cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_SEGMENT, options);
  }

  /**
   * @param {!cml.cmcd.CmcdReportRecorderWaitOptions=} options
   * @return {!Promise<!Array<!cml.cmcd.CmcdRecordedReport>>}
   */
  waitForEvents(options = {}) {
    return this.waitFor_(
        cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_EVENT, options);
  }
};
