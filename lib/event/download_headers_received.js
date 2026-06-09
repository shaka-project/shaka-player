/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.event.DownloadHeadersReceived');

goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.net.NetworkingEngine');


/**
 * Fired when the networking engine has received the headers for a download,
 * but before the body has been downloaded.
 * If the HTTP plugin being used does not track this information, this event
 * will default to being fired when the body is received, instead.
 *
 * @extends {shaka.util.FakeEvent}
 * @export
 */
shaka.event.DownloadHeadersReceived = class extends shaka.util.FakeEvent {
  /**
   * @param {!Object<string, string>} headers
   * @param {!shaka.extern.Request} request
   * @param {!shaka.net.NetworkingEngine.RequestType} requestType
   */
  constructor(headers, request, requestType) {
    super(shaka.util.FakeEvent.EventName.DownloadHeadersReceived);

    /** @type {!Object<string, string>} */
    this.headers = headers;

    /** @type {!shaka.extern.Request} */
    this.request = request;

    /** @type {!shaka.net.NetworkingEngine.RequestType} */
    this.requestType = requestType;
  }
};
