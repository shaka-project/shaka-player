/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.HttpFetchPlugin');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.net.HttpPluginUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.Timer');


/**
 * @summary A networking plugin to handle http and https URIs via the Fetch API.
 * @export
 */
shaka.net.HttpFetchPlugin = class {
  /**
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.ProgressUpdated} progressUpdated Called when a
   *   progress event happened.
   * @param {shaka.extern.HeadersReceived} headersReceived Called when the
   *   headers for the download are received, but before the body is.
   * @param {shaka.extern.SchemePluginConfig} config
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @export
   */
  static parse(uri, request, requestType, progressUpdated, headersReceived,
      config) {
    const headers = new shaka.net.HttpFetchPlugin.Headers_();
    shaka.util.MapUtils.asMap(request.headers).forEach((value, key) => {
      headers.append(key, value);
    });

    const controller = new shaka.net.HttpFetchPlugin.AbortController_();

    /** @type {!RequestInit} */
    const init = {
      // Edge does not treat null as undefined for body; https://bit.ly/2luyE6x
      body: request.body || undefined,
      headers: headers,
      method: request.method,
      signal: controller.signal,
      credentials: request.allowCrossSiteCredentials ? 'include' : undefined,
    };

    /** @type {shaka.net.HttpFetchPlugin.AbortStatus} */
    const abortStatus = {
      canceled: false,
      timedOut: false,
    };

    const minBytes = config.minBytesForProgressEvents || 0;

    const pendingRequest = shaka.net.HttpFetchPlugin.request_(
        uri, request, requestType, init, abortStatus, progressUpdated,
        headersReceived, request.streamDataCallback, minBytes);

    /** @type {!shaka.util.AbortableOperation} */
    const op = new shaka.util.AbortableOperation(pendingRequest, () => {
      abortStatus.canceled = true;
      controller.abort();
      return Promise.resolve();
    });

    // The fetch API does not timeout natively, so do a timeout manually using
    // the AbortController.
    const timeoutMs = request.retryParameters.timeout;
    if (timeoutMs) {
      const timer = new shaka.util.Timer(() => {
        abortStatus.timedOut = true;
        controller.abort();
      });

      timer.tickAfter(timeoutMs / 1000);

      // To avoid calling |abort| on the network request after it finished, we
      // will stop the timer when the requests resolves/rejects.
      op.finally(() => {
        timer.stop();
      });
    }

    return op;
  }

  /**
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {!RequestInit} init
   * @param {shaka.net.HttpFetchPlugin.AbortStatus} abortStatus
   * @param {shaka.extern.ProgressUpdated} progressUpdated
   * @param {shaka.extern.HeadersReceived} headersReceived
   * @param {?function(BufferSource):!Promise} streamDataCallback
   * @param {number} minBytes
   * @return {!Promise<!shaka.extern.Response>}
   * @private
   */
  static async request_(uri, request, requestType, init, abortStatus,
      progressUpdated, headersReceived, streamDataCallback, minBytes) {
    const fetch = shaka.net.HttpFetchPlugin.fetch_;
    const ReadableStream = shaka.net.HttpFetchPlugin.ReadableStream_;
    let response;
    let arrayBuffer = new ArrayBuffer(0);
    let loaded = 0;
    let lastLoaded = 0;
    let headers = {};

    // Last time stamp when we got a progress event.
    let lastTime = Date.now();

    try {
      // The promise returned by fetch resolves as soon as the HTTP response
      // headers are available. The download itself isn't done until the promise
      // for retrieving the data (arrayBuffer, blob, etc) has resolved.
      response = await fetch(uri, init);
      // At this point in the process, we have the headers of the response, but
      // not the body yet.
      headers =
          shaka.net.HttpFetchPlugin.headersToGenericObject_(response.headers);
      headersReceived(headers);

      // In new versions of Chromium, HEAD requests now have a response body
      // that is null.
      // So just don't try to download the body at all, if it's a HEAD request,
      // to avoid null reference errors.
      // See: https://crbug.com/1297060
      if (init.method != 'HEAD') {
        goog.asserts.assert(response.body,
            'non-HEAD responses should have a body');

        const contentLengthRaw = response.headers.get('Content-Length');
        const contentLength =
            contentLengthRaw ? parseInt(contentLengthRaw, 10) : 0;

        // Fetch returning a ReadableStream response body is not currently
        // supported by all browsers.
        // Browser compatibility:
        // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
        // If it is not supported, returning the whole segment when
        // it's ready (as xhr)
        if (!response.body) {
          arrayBuffer = await response.arrayBuffer();
          const currentTime = Date.now();
          // If the time between last time and this time we got progress event
          // is long enough, or if a whole segment is downloaded, call
          // progressUpdated().
          progressUpdated(currentTime - lastTime, arrayBuffer.byteLength, 0);
        } else {
          // Getting the reader in this way allows us to observe the process of
          // downloading the body, instead of just waiting for an opaque
          // promise to resolve.
          // We first clone the response because calling getReader lock the body
          // stream; if we didn't clone it here, we would be unable to get the
          // response's arrayBuffer later.
          const reader = response.clone().body.getReader();
          const start = (controller) => {
            const push = async () => {
              let readObj;
              try {
                readObj = await reader.read();
              } catch (e) {
                // If we abort the request, we'll get an error here.
                // Just ignore it
                // since real errors will be reported when we read
                // the buffer below.
                shaka.log.v1('error reading from stream', e.message);
                return;
              }
              if (!readObj.done) {
                loaded += readObj.value.byteLength;
                if (streamDataCallback) {
                  await streamDataCallback(readObj.value);
                }
              }

              const currentTime = Date.now();
              const chunkSize = loaded - lastLoaded;
              // If the time between last time and this time we got
              // progress event is long enough, or if a whole segment
              // is downloaded, call progressUpdated().
              if ((currentTime - lastTime > 100 && chunkSize >= minBytes) ||
                  readObj.done) {
                const numBytesRemaining =
                    readObj.done ? 0 : contentLength - loaded;
                progressUpdated(currentTime - lastTime, chunkSize,
                    numBytesRemaining);
                lastLoaded = loaded;
                lastTime = currentTime;
              }

              if (readObj.done) {
                goog.asserts.assert(!readObj.value,
                    'readObj should be unset when "done" is true.');
                controller.close();
              } else {
                controller.enqueue(readObj.value);
                push();
              }
            };
            push();
          };
          // Create a ReadableStream to use the reader. We don't need to use the
          // actual stream for anything, though, as we are using the response's
          // arrayBuffer method to get the body, so we don't store the
          // ReadableStream.
          new ReadableStream({start}); // eslint-disable-line no-new
          arrayBuffer = await response.arrayBuffer();
        }
      }

      if (request.headers['Range']) {
        const range = request.headers['Range'].replace('bytes=', '').split('-')
            .filter((r) => r).map((r) => parseInt(r, 10));
        if (range.length == 2 &&
            arrayBuffer.byteLength != (range[1] - range[0] + 1)) {
          shaka.log.alwaysWarn(
              'Payload length does not match range requested bytes',
              request, response);
        }
      }
    } catch (error) {
      if (abortStatus.canceled) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.OPERATION_ABORTED,
            uri, requestType);
      } else if (abortStatus.timedOut) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.TIMEOUT,
            uri, requestType);
      } else {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR,
            uri, error, requestType);
      }
    }

    return shaka.net.HttpPluginUtils.makeResponse(headers, arrayBuffer,
        response.status, uri, response.url, request, requestType);
  }

  /**
   * @param {!Headers} headers
   * @return {!Object<string, string>}
   * @private
   */
  static headersToGenericObject_(headers) {
    const headersObj = {};
    headers.forEach((value, key) => {
      // Since Edge incorrectly return the header with a leading new line
      // character ('\n'), we trim the header here.
      headersObj[key.trim()] = value;
    });
    return headersObj;
  }

  /**
   * Determine if the Fetch API is supported in the browser. Note: this is
   * deliberately exposed as a method to allow the client app to use the same
   * logic as Shaka when determining support.
   * @return {boolean}
   * @export
   */
  static isSupported() {
    // On Edge, ReadableStream exists, but attempting to construct it results in
    // an error. See https://bit.ly/2zwaFLL
    // So this has to check that ReadableStream is present AND usable.
    if (window.ReadableStream) {
      try {
        new ReadableStream({}); // eslint-disable-line no-new
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
    // Old fetch implementations hasn't body and ReadableStream implementation
    // See: https://github.com/shaka-project/shaka-player/issues/5088
    if (window.Response) {
      const response = new Response('');
      if (!response.body) {
        return false;
      }
    } else {
      return false;
    }
    return !!(window.fetch && !('polyfill' in window.fetch) &&
      window.AbortController);
  }
};


/**
 * @typedef {{
 *   canceled: boolean,
 *   timedOut: boolean,
 * }}
 * @property {boolean} canceled
 *   Indicates if the request was canceled.
 * @property {boolean} timedOut
 *   Indicates if the request timed out.
 */
shaka.net.HttpFetchPlugin.AbortStatus;


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(string, !RequestInit)}
 * @private
 */
shaka.net.HttpFetchPlugin.fetch_ = window.fetch;


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: AbortController)}
 * @private
 */
shaka.net.HttpFetchPlugin.AbortController_ = window.AbortController;


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: ReadableStream, !Object)}
 * @private
 */
shaka.net.HttpFetchPlugin.ReadableStream_ = window.ReadableStream;


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: Headers)}
 * @private
 */
shaka.net.HttpFetchPlugin.Headers_ = window.Headers;


if (shaka.net.HttpFetchPlugin.isSupported()) {
  shaka.net.NetworkingEngine.registerScheme(
      'http', shaka.net.HttpFetchPlugin.parse,
      shaka.net.NetworkingEngine.PluginPriority.PREFERRED,
      /* progressSupport= */ true);
  shaka.net.NetworkingEngine.registerScheme(
      'https', shaka.net.HttpFetchPlugin.parse,
      shaka.net.NetworkingEngine.PluginPriority.PREFERRED,
      /* progressSupport= */ true);
  shaka.net.NetworkingEngine.registerScheme(
      'blob', shaka.net.HttpFetchPlugin.parse,
      shaka.net.NetworkingEngine.PluginPriority.PREFERRED,
      /* progressSupport= */ true);
}
