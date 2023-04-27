/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

    /** @private {?BufferSource} */
    this.defaultResponse_ = null;

    /** @private {?shaka.util.PublicPromise} */
    this.delayNextRequestPromise_ = null;

    /** @type {!jasmine.Spy} */
    this.request = jasmine.createSpy('request')
        .and.callFake((type, request) => this.requestImpl_(type, request));

    /** @type {!jasmine.Spy} */
    this.registerResponseFilter =
        jasmine.createSpy('registerResponseFilter')
            .and.callFake((filter) => this.setResponseFilter(filter));

    /** @type {!jasmine.Spy} */
    this.unregisterResponseFilter =
        jasmine.createSpy('unregisterResponseFilter').and.callFake(
            (filter) => this.unregisterResponseFilterImpl_(filter));

    /** @private {?shaka.extern.ResponseFilter} */
    this.responseFilter_ = null;

    /** @type {!jasmine.Spy} */
    this.setForceHTTPS = jasmine.createSpy('setForceHTTPS').and.stub();

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

    let isAborted = false;
    const abortOp = () => {
      isAborted = true;
      return Promise.resolve();
    };
    const abortCheck = () => isAborted;

    // Wrap all the async operations into one function so that we can pass it to
    // abortable operation.
    const asyncOp = async () => {
      if (delay) {
        await delay;
      }

      const result = await resultCallback(abortCheck);
      if (isAborted) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED);
      }

      if (!result && request.method != 'HEAD') {
        // Provide some more useful information.
        shaka.log.error('Expected', requestedUri, 'to be in the response map');

        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.UNEXPECTED_TEST_REQUEST,
            requestedUri);
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
    };

    return new shaka.util.AbortableOperation(asyncOp(), abortOp);
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
   * @param {shaka.extern.RequestContext=} context
   */
  expectRequest(uri, type, context) {
    shaka.test.FakeNetworkingEngine.expectRequest(
        this.request, uri, type, context);
  }

  /**
   * Expects that no request for the given segment has occurred.
   *
   * @param {string} uri
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.RequestContext=} context
   */
  expectNoRequest(uri, type, context) {
    shaka.test.FakeNetworkingEngine.expectNoRequest(
        this.request, uri, type, context);
  }

  /**
   * Expects that a range request for the given segment has occurred.
   *
   * @param {string} uri
   * @param {number} startByte
   * @param {?number} endByte
   * @param {boolean} isInit
   */
  expectRangeRequest(uri, startByte, endByte, isInit) {
    shaka.test.FakeNetworkingEngine.expectRangeRequest(
        this.request, uri, startByte, endByte, isInit);
  }

  /**
   * Set a callback for when the given uri is called.
   *
   * @param {string} uri
   * @param {shaka.test.FakeNetworkingEngine.MockedResponse} callback
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
   * @param {BufferSource} value
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
   * @param {BufferSource} defaultResponse The default value to return.
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
   * @param {shaka.extern.RequestContext=} context
   */
  static expectRequest(requestSpy, uri, type, context) {
    // Jasmine "toHaveBeenCalledWith" doesn't handle optional parameters well.
    if (context != undefined) {
      expect(requestSpy).toHaveBeenCalledWith(
          type, jasmine.objectContaining({uris: [uri]}),
          jasmine.objectContaining({type: context.type}));
    } else {
      expect(requestSpy).toHaveBeenCalledWith(
          type, jasmine.objectContaining({uris: [uri]}));
    }
  }

  /**
   * Expects that no request for the given segment has occurred.
   *
   * @param {!Object} requestSpy
   * @param {string} uri
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.RequestContext=} context
   */
  static expectNoRequest(requestSpy, uri, type, context) {
    // Jasmine "toHaveBeenCalledWith" doesn't handle optional parameters well.
    if (context != undefined) {
      expect(requestSpy).not.toHaveBeenCalledWith(
          type, jasmine.objectContaining({uris: [uri]}),
          jasmine.objectContaining({type: context.type}));
    } else {
      expect(requestSpy).not.toHaveBeenCalledWith(
          type, jasmine.objectContaining({uris: [uri]}));
    }
  }

  /**
   * Expects that a range request for the given segment has occurred.
   *
   * @param {!Object} requestSpy
   * @param {string} uri
   * @param {number} startByte
   * @param {?number} endByte
   * @param {boolean} isInit
   */
  static expectRangeRequest(requestSpy, uri, startByte, endByte, isInit) {
    const headers = {};
    if (startByte == 0 && endByte == null) {
      // No header required.
    } else {
      let range = 'bytes=' + startByte + '-';
      if (endByte != null) {
        range += endByte;
      }
      headers['Range'] = range;
    }

    const type = isInit ?
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT :
        shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;

    expect(requestSpy).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [uri],
          headers: headers,
        }),
        jasmine.objectContaining({type}));
  }
};


/**
 * A callback that creates a response for a given URI.
 * The callback passed in to this method, "abortCheck", returns whether or not
 * the network request has been aborted, at time of call.
 * @typedef {function(function():boolean):!Promise.<BufferSource>}
 */
shaka.test.FakeNetworkingEngine.MockedResponse;
