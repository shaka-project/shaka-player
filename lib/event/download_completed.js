/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.DownloadCompleted');

goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.net.NetworkingEngine');


/**
 * Fired when a download has completed.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.DownloadCompleted = class extends shaka.util.FakeEvent {
  /**
   * @param {!shaka.net.NetworkingEngine.RequestType} requestType
   * @param {!shaka.extern.Request} request
   * @param {(shaka.extern.RequestContext|undefined)} context
   * @param {!shaka.extern.Response} response
   */
  constructor(requestType, request, context, response) {
    super(shaka.util.FakeEvent.EventName.DownloadCompleted);

    /** @type {!shaka.net.NetworkingEngine.RequestType} */
    this.requestType = requestType;

    /** @type {!shaka.extern.Request} */
    this.request = request;

    /** @type {(shaka.extern.RequestContext|undefined)} */
    this.context = context;

    /** @type {!shaka.extern.Response} */
    this.response = response;
  }
};
