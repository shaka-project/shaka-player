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

goog.provide('shaka.test.FakeNetworkingEngine');

/** @fileoverview @suppress {missingRequire} */


/**
 * A fake networking engine that returns constant data.  The request member
 * is a jasmine spy and can be used to check the actual calls that occurred.
 *
 * @final
 * @struct
 * @extends {shaka.net.NetworkingEngine}
 */
shaka.test.FakeNetworkingEngine = class {
  constructor() {
    /**
     * @private {!Map.<
     *    string,
     *    shaka.test.FakeNetworkingEngine.MockedResponse>} */
    this.responseMap_ = new Map();

    /** @private {!Map.<string, !Object.<string, string>>} */
    this.headersMap_ = new Map();

    /** @private {ArrayBuffer} */
    this.defaultResponse_ = null;

    /** @private {?shaka.util.PublicPromise} */
    this.delayNextRequestPromise_ = null;

    /** @type {!jasmine.Spy} */
    this.request =
        jasmine.createSpy('request').and.callFake(this.requestImpl_.bind(this));

    /** @type {!jasmine.Spy} */
    this.registerResponseFilter =
        jasmine.createSpy('registerResponseFilter')
            .and.callFake(this.setResponseFilter.bind(this));

    /** @type {!jasmine.Spy} */
    this.unregisterResponseFilter =
        jasmine.createSpy('unregisterResponseFilter')
            .and.callFake(this.unregisterResponseFilterImpl_.bind(this));

    /** @private {?shaka.extern.ResponseFilter} */
    this.responseFilter_ = null;

    // The prototype has already been applied; create spies for the
    // methods but still call it by default.
    spyOn(this, 'destroy').and.callThrough();
  }

  /** @override */
  destroy() {
    return Promise.resolve();
  }

  /**
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Request} request
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @private
   */
  requestImpl_(type, request) {
    expect(request).toBeTruthy();
    expect(request.uris.length).toBe(1);

    const requestedUri = request.uris[0];

    const headers = this.headersMap_.get(requestedUri) || {};

    const defaultCallback = () => {
      return Promise.resolve(this.defaultResponse_);
    };

    const responses = this.responseMap_;
    const resultCallback = responses.get(requestedUri) || defaultCallback;

    // Cache the delay for this request now so that it does not change if
    // another request comes through.
    const delay = this.delayNextRequestPromise_;
    this.delayNextRequestPromise_ = null;

    // Wrap all the async operations into one function so that we can pass it to
    // abortable operation.
    const asyncOp = Promise.resolve().then(async () => {
      if (delay) {
        await delay;
      }

      const result = await resultCallback();

      if (!result && request.method != 'HEAD') {
        // Provide some more useful information.
        shaka.log.error('Expected', requestedUri, 'to be in the response map');

        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.UNEXPECTED_TEST_REQUEST);
      }

      /** @type {shaka.extern.Response} */
      const response = {
        uri: requestedUri,
        originalUri: requestedUri,
        data: result,
        headers: headers,
      };

      // Modify the response using the response filter, this allows the app
      // to modify the response before giving it to the player.
      if (this.responseFilter_) {
        this.responseFilter_(type, response);
      }

      return response;
    });

    return shaka.util.AbortableOperation.notAbortable(asyncOp);
  }

  /**
   * Useable by tests directly.  Library code will only call this via the Spy on
   * registerResponseFilter.
   *
   * @param {shaka.extern.ResponseFilter} filter
   */
  setResponseFilter(filter) {
    expect(filter).toEqual(jasmine.any(Function));
    this.responseFilter_ = filter;
  }

  /**
   * @param {shaka.extern.ResponseFilter} filter
   * @private
   */
  unregisterResponseFilterImpl_(filter) {
    expect(filter).toEqual(jasmine.any(Function));
    this.responseFilter_ = null;
  }

  /**
   * Delays the next response until the returned PublicPromise resolves.
   * @return {!shaka.util.PublicPromise}
   */
  delayNextRequest() {
    if (!this.delayNextRequestPromise_) {
      this.delayNextRequestPromise_ = new shaka.util.PublicPromise();
    }
    return this.delayNextRequestPromise_;
  }

  /**
   * Expects that a request for the given segment has occurred.
   *
   * @param {string} uri
   * @param {shaka.net.NetworkingEngine.RequestType} type
   */
  expectRequest(uri, type) {
    shaka.test.FakeNetworkingEngine.expectRequest(this.request, uri, type);
  }

  /**
   * Expects that no request for the given segment has occurred.
   *
   * @param {string} uri
   * @param {shaka.net.NetworkingEngine.RequestType} type
   */
  expectNoRequest(uri, type) {
    shaka.test.FakeNetworkingEngine.expectNoRequest(this.request, uri, type);
  }

  /**
   * Expects that a range request for the given segment has occurred.
   *
   * @param {string} uri
   * @param {number} startByte
   * @param {?number} endByte
   */
  expectRangeRequest(uri, startByte, endByte) {
    shaka.test.FakeNetworkingEngine.expectRangeRequest(
        this.request, uri, startByte, endByte);
  }

  /**
   * Set a callback for when the given uri is called.
   *
   * @param {string} uri
   * @param {function():!Promise<!ArrayBuffer>} callback
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setResponse(uri, callback) {
    this.responseMap_.set(uri, callback);
    return this;
  }

  /**
   * Set a single value in the response map.
   *
   * @param {string} uri
   * @param {!ArrayBuffer} value
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setResponseValue(uri, value) {
    return this.setResponse(uri, () => Promise.resolve(value));
  }

  /**
   * Set a single value as text in the response map.
   *
   * @param {string} uri
   * @param {string} value
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setResponseText(uri, value) {
    const utf8 = shaka.util.StringUtils.toUTF8(value);
    return this.setResponseValue(uri, utf8);
  }

  /**
   * Sets the headers for a specific uri.
   *
   * @param {string} uri
   * @param {!Object.<string, string>} headers
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setHeaders(uri, headers) {
    // Copy the header over to a map and then back to an object. This makes
    // a copy of the original header.
    const map = shaka.util.MapUtils.asMap(headers);
    this.headersMap_.set(uri, shaka.util.MapUtils.asObject(map));
    return this;
  }

  /**
   * Sets the default return value.
   *
   * @param {!ArrayBuffer} defaultResponse The default value to return.
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setDefaultValue(defaultResponse) {
    this.defaultResponse_ = defaultResponse;
    return this;
  }

  /**
   * Sets the default return value as text.
   *
   * @param {string} defaultText The default value to return.
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setDefaultText(defaultText) {
    this.defaultResponse_ = shaka.util.StringUtils.toUTF8(defaultText);
    return this;
  }

  /**
   * Sets the default return value to throw an error.
   *
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  setDefaultAsError() {
    this.defaultResponse_ = null;
    return this;
  }

  /**
   * Expects that a request for the given segment has occurred.
   *
   * @param {!Object} requestSpy
   * @param {string} uri
   * @param {shaka.net.NetworkingEngine.RequestType} type
   */
  static expectRequest(requestSpy, uri, type) {
    expect(requestSpy).toHaveBeenCalledWith(
        type, jasmine.objectContaining({uris: [uri]}));
  }

  /**
   * Expects that no request for the given segment has occurred.
   *
   * @param {!Object} requestSpy
   * @param {string} uri
   * @param {shaka.net.NetworkingEngine.RequestType} type
   */
  static expectNoRequest(requestSpy, uri, type) {
    expect(requestSpy).not.toHaveBeenCalledWith(
        type, jasmine.objectContaining({uris: [uri]}));
  }

  /**
   * Expects that a range request for the given segment has occurred.
   *
   * @param {!Object} requestSpy
   * @param {string} uri
   * @param {number} startByte
   * @param {?number} endByte
   */
  static expectRangeRequest(requestSpy, uri, startByte, endByte) {
    const headers = {};
    if (startByte == 0 && endByte == null) {
      // No header required.
    } else {
      let range = 'bytes=' + startByte + '-';
      if (endByte != null) range += endByte;
      headers['Range'] = range;
    }

    expect(requestSpy).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [uri],
          headers: headers,
        }));
  }
};


/**
 * @typedef {function():!Promise.<!ArrayBuffer>}
 */
shaka.test.FakeNetworkingEngine.MockedResponse;
