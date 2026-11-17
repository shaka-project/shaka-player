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
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');


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
    try {
      shaka.util.MapUtils.asMap(request.headers).forEach((value, key) => {
        headers.append(key, value);
      });
    } catch (error) {
      shaka.log.debug('Failed to create headers:', error);
      return shaka.util.AbortableOperation.failed(
          new shaka.util.Error(
              shaka.util.Error.Severity.RECOVERABLE,
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.HTTP_ERROR,
              uri, error, requestType));
    }

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

      // Only stream the body of a successful response.  An error body (e.g. a
      // 404 for a low-latency segment requested just before it is available)
      // is not media, and the stream data callback's state outlives this
      // attempt: if a retry succeeds, the error body would be parsed together
      // with the segment, and nothing of it appended.
      if (!shaka.net.HttpPluginUtils.isSuccessStatus(response.status)) {
        streamDataCallback = null;
      }

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
          // Read the body with a single reader, to observe the download
          // progress and to stream the data, and keep it as it comes.  Neither
          // cloning the response nor reading it a second time with
          // arrayBuffer(): both keep another copy of the body in memory while
          // it is downloaded.
          const {reader, byob} = shaka.net.HttpFetchPlugin.getReader_(
              response.body, contentLength, response.headers);

          /**
           * Streams the data of a read, and reports the progress.
           * @param {?Uint8Array} chunk The data, or null at the end.
           * @return {!Promise}
           */
          const onRead = async (chunk) => {
            if (chunk) {
              loaded += chunk.byteLength;
              if (streamDataCallback) {
                await streamDataCallback(chunk);
              }
            }

            const currentTime = Date.now();
            const chunkSize = loaded - lastLoaded;
            // If the time between last time and this time we got progress
            // event is long enough, or if a whole segment is downloaded, call
            // progressUpdated().
            if ((currentTime - lastTime > 100 && chunkSize >= minBytes) ||
                !chunk) {
              const numBytesRemaining = chunk ? contentLength - loaded : 0;
              progressUpdated(currentTime - lastTime, chunkSize,
                  numBytesRemaining);
              lastLoaded = loaded;
              lastTime = currentTime;
            }
          };

          if (byob) {
            arrayBuffer = await shaka.net.HttpFetchPlugin.readWithByob_(
                /** @type {!ReadableStreamBYOBReader} */ (reader),
                contentLength, onRead, !!streamDataCallback);
          } else {
            arrayBuffer = await shaka.net.HttpFetchPlugin.readWithDefault_(
                /** @type {!ReadableStreamDefaultReader} */ (reader),
                contentLength, onRead);
          }
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
   * Gets a reader of the body.  A BYOB ("bring your own buffer") reader is
   * used when the browser supports it for fetch bodies and the size of the
   * body is known: the data is then read straight into the buffer of the
   * response, without allocating every chunk.  Otherwise, a default reader.
   *
   * @param {!ReadableStream} body
   * @param {number} contentLength
   * @param {!Headers} headers
   * @return {{
   *   reader: (!ReadableStreamDefaultReader|!ReadableStreamBYOBReader),
   *   byob: boolean,
   * }}
   * @private
   */
  static getReader_(body, contentLength, headers) {
    const BYOBReader = shaka.net.HttpFetchPlugin.ReadableStreamBYOBReader_;
    // With a compressed response, Content-Length is the size before decoding,
    // not the size of the body.
    if (BYOBReader && contentLength > 0 && !headers.get('Content-Encoding')) {
      let reader = null;
      try {
        reader = body.getReader({mode: 'byob'});
      } catch (e) {
        // The body is not a byte stream (e.g. Chrome 89 to 115).  The stream
        // is not locked, so a default reader can still be used.
      }
      if (reader) {
        // An implementation that ignores the mode gives a default reader.  The
        // stream is locked by it, so it has to be used anyway.
        return {reader, byob: reader instanceof BYOBReader};
      }
    }
    return {reader: body.getReader(), byob: false};
  }

  /**
   * Reads a body with a default reader.
   *
   * @param {!ReadableStreamDefaultReader} reader
   * @param {number} contentLength
   * @param {function(?Uint8Array):!Promise} onRead
   * @return {!Promise<!ArrayBuffer>}
   * @private
   */
  static async readWithDefault_(reader, contentLength, onRead) {
    const body = new shaka.net.HttpFetchPlugin.BodyBuffer_(contentLength);
    let done = false;
    while (!done) {
      // The chunks of a stream can only be read one after another.
      // eslint-disable-next-line no-await-in-loop
      const readObj = await reader.read();
      done = readObj.done;
      const chunk = done ? null : /** @type {!Uint8Array} */ (readObj.value);
      if (chunk) {
        body.append(chunk);
      }
      // Chunks are passed on in order, one at a time.
      // eslint-disable-next-line no-await-in-loop
      await onRead(chunk);
    }
    return body.getArrayBuffer();
  }

  /**
   * Reads a body with a BYOB reader, into a buffer of the expected length.
   * Every read transfers that buffer: the view given to read() is detached,
   * and the same memory comes back as the buffer of the result.
   *
   * @param {!ReadableStreamBYOBReader} reader
   * @param {number} contentLength
   * @param {function(?Uint8Array):!Promise} onRead
   * @param {boolean} copyChunks Whether onRead gets copies of the data.  The
   *   data read is a view of the buffer, which the next read detaches, so it
   *   must be copied if it is kept, as a stream data callback may do.
   * @return {!Promise<!ArrayBuffer>}
   * @private
   */
  static async readWithByob_(reader, contentLength, onRead, copyChunks) {
    // The statics are not used through an alias of the class: in an async
    // function, the compiler collapses them but keeps the alias.
    let buffer = new ArrayBuffer(contentLength);
    let offset = 0;
    // If the body is larger than expected, the rest is read into new buffers,
    // and everything is joined at the end.
    /** @type {?shaka.net.HttpFetchPlugin.BodyBuffer_} */
    let overflow = null;
    let done = false;
    while (!done) {
      const intoBuffer = !overflow && offset < contentLength;
      // Once the buffer is full, a read is still needed to see the end.
      const view = intoBuffer ?
          new Uint8Array(buffer, offset, contentLength - offset) :
          new Uint8Array(shaka.net.HttpFetchPlugin.BYOB_OVERFLOW_CHUNK_SIZE_);
      // The chunks of a stream can only be read one after another.
      // eslint-disable-next-line no-await-in-loop
      const readObj = await reader.read(view);
      const value = readObj.value;
      if (intoBuffer && value) {
        buffer = shaka.util.BufferUtils.getTransferredBuffer(value);
      }
      done = readObj.done;
      let chunk = null;
      if (!done) {
        goog.asserts.assert(value, 'A read that is not done has data');
        chunk = /** @type {!Uint8Array} */ (value);
        if (intoBuffer) {
          offset += chunk.byteLength;
        } else {
          if (!overflow) {
            overflow = new shaka.net.HttpFetchPlugin.BodyBuffer_(0);
            overflow.append(new Uint8Array(buffer, 0, offset));
          }
          overflow.append(chunk);
        }
        if (copyChunks) {
          chunk = chunk.slice();
        }
      }
      // Chunks are passed on in order, one at a time.
      // eslint-disable-next-line no-await-in-loop
      await onRead(chunk);
    }
    if (overflow) {
      return overflow.getArrayBuffer();
    }
    // No copy is made if the body has the expected size.
    return shaka.util.BufferUtils.toArrayBuffer(
        new Uint8Array(buffer, 0, offset));
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
 * Collects the chunks of a response body.  When the size of the body is known,
 * the chunks are written into a buffer of that size, so that the body is held
 * once, and no copy is made at the end.  Otherwise, or if the body turns out to
 * be larger (e.g. a compressed response, where Content-Length is the size
 * before decoding), the chunks are kept and joined at the end.
 *
 * @private
 */
shaka.net.HttpFetchPlugin.BodyBuffer_ = class {
  /**
   * @param {number} expectedLength The Content-Length, or 0 if unknown.
   */
  constructor(expectedLength) {
    /** @private {?Uint8Array} */
    this.buffer_ = null;
    if (expectedLength > 0) {
      try {
        this.buffer_ = new Uint8Array(expectedLength);
      } catch (e) {
        // An invalid or too large length.  Keep the chunks instead.
      }
    }

    /** @private {number} */
    this.length_ = 0;

    /** @private {!Array<!Uint8Array>} */
    this.chunks_ = [];
  }

  /**
   * @param {!Uint8Array} chunk
   */
  append(chunk) {
    if (this.buffer_ &&
        this.length_ + chunk.byteLength > this.buffer_.byteLength) {
      // Larger than expected, so the chunks are joined at the end.
      this.chunks_.push(this.buffer_.subarray(0, this.length_));
      this.buffer_ = null;
    }
    if (this.buffer_) {
      this.buffer_.set(chunk, this.length_);
    } else {
      this.chunks_.push(chunk);
    }
    this.length_ += chunk.byteLength;
  }

  /**
   * @return {!ArrayBuffer}
   */
  getArrayBuffer() {
    const BufferUtils = shaka.util.BufferUtils;
    if (this.buffer_) {
      // No copy is made if the body has the expected size.
      return BufferUtils.toArrayBuffer(this.buffer_.subarray(0, this.length_));
    }
    return BufferUtils.toArrayBuffer(
        shaka.util.Uint8ArrayUtils.concatRange(this.chunks_));
  }
};


/**
 * The size of the buffers read into with a BYOB reader once the body is larger
 * than its Content-Length.
 *
 * @const {number}
 * @private
 */
shaka.net.HttpFetchPlugin.BYOB_OVERFLOW_CHUNK_SIZE_ = 65536;


/**
 * Overridden in unit tests, but compiled out in production.  It is an
 * interface in the externs, so it can't be typed as a constructor.
 *
 * @const {(Function|undefined)}
 * @private
 */
shaka.net.HttpFetchPlugin.ReadableStreamBYOBReader_ =
    window['ReadableStreamBYOBReader'];


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
