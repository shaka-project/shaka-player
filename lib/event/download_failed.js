/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.DownloadFailed');

goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.net.NetworkingEngine');
goog.requireType('shaka.util.Error');


/**
 * Fired when a download has failed, for any reason.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.DownloadFailed = class extends shaka.util.FakeEvent {
  /**
   * @param {!shaka.net.NetworkingEngine.RequestType} requestType
   * @param {!shaka.extern.Request} request
   * @param {(shaka.extern.RequestContext|undefined)} context
   * @param {?shaka.util.Error} error
   * @param {number} httpResponseCode
   * @param {boolean} aborted
   */
  constructor(requestType, request, context, error, httpResponseCode, aborted) {
    super(shaka.util.FakeEvent.EventName.DownloadFailed);

    /** @type {!shaka.net.NetworkingEngine.RequestType} */
    this.requestType = requestType;

    /** @type {!shaka.extern.Request} */
    this.request = request;

    /** @type {(shaka.extern.RequestContext|undefined)} */
    this.context = context;

    /** @type {?shaka.util.Error} */
    this.error = error;

    /** @type {number} */
    this.httpResponseCode = httpResponseCode;

    /** @type {boolean} */
    this.aborted = aborted;
  }
};
