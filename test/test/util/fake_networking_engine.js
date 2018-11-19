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
 * @param {Object.<string, !ArrayBuffer>=} opt_responseMap A map from URI to
 *   the data to return.
 * @param {!ArrayBuffer=} opt_defaultResponse The default value to return; if
 *   null, a jasmine expect will fail if a request is made that is not in
 *   |opt_data|.
 * @param {Object.<string, !Object.<string, string>>=} opt_headersMap
 *   A map from URI to the headers to return.
 *
 * @constructor
 * @struct
 * @extends {shaka.net.NetworkingEngine}
 */
shaka.test.FakeNetworkingEngine = function(
    opt_responseMap, opt_defaultResponse, opt_headersMap) {
  /** @private {!Object.<string, !ArrayBuffer>} */
  this.responseMap_ = opt_responseMap || {};

  /** @private {!Object.<string, !Object.<string, string>>} */
  this.headersMap_ = opt_headersMap || {};

  /** @private {ArrayBuffer} */
  this.defaultResponse_ = opt_defaultResponse || null;

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

  /** @private {?shakaExtern.ResponseFilter} */
  this.responseFilter_ = null;

  // The prototype has already been applied; create spies for the
  // methods but still call it by default.
  spyOn(this, 'destroy').and.callThrough();
};


/** @override */
shaka.test.FakeNetworkingEngine.prototype.destroy = function() {
  return Promise.resolve();
};


/**
 * Expects that a request for the given segment has occurred.
 *
 * @param {!Object} requestSpy
 * @param {string} uri
 * @param {shaka.net.NetworkingEngine.RequestType} type
 */
shaka.test.FakeNetworkingEngine.expectRequest = function(
    requestSpy, uri, type) {
  expect(requestSpy).toHaveBeenCalledWith(
      type, jasmine.objectContaining({uris: [uri]}));
};


/**
 * Expects that no request for the given segment has occurred.
 *
 * @param {!Object} requestSpy
 * @param {string} uri
 * @param {shaka.net.NetworkingEngine.RequestType} type
 */
shaka.test.FakeNetworkingEngine.expectNoRequest = function(
    requestSpy, uri, type) {
  expect(requestSpy).not.toHaveBeenCalledWith(
      type, jasmine.objectContaining({uris: [uri]}));
};


/**
 * Expects that a range request for the given segment has occurred.
 *
 * @param {!Object} requestSpy
 * @param {string} uri
 * @param {number} startByte
 * @param {?number} endByte
 */
shaka.test.FakeNetworkingEngine.expectRangeRequest = function(
    requestSpy, uri, startByte, endByte) {
  let range = 'bytes=' + startByte + '-';
  if (endByte != null) range += endByte;

  expect(requestSpy).toHaveBeenCalledWith(
      shaka.net.NetworkingEngine.RequestType.SEGMENT,
      jasmine.objectContaining({
        uris: [uri],
        headers: jasmine.objectContaining({'Range': range})
      }));
};


/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.test.FakeNetworkingEngine.prototype.requestImpl_ = function(
    type, request) {
  expect(request).toBeTruthy();
  expect(request.uris.length).toBe(1);

  let headers = this.headersMap_[request.uris[0]] || {};
  let result = this.responseMap_[request.uris[0]] || this.defaultResponse_;
  if (!result && request.method != 'HEAD') {
    // Give a more helpful error message to jasmine.
    expect(request.uris[0]).toBe('in the response map');
    let error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.UNEXPECTED_TEST_REQUEST);
    return shaka.util.AbortableOperation.failed(error);
  }

  /** @type {shakaExtern.Response} */
  let response = {uri: request.uris[0], data: result, headers: headers};

  if (this.responseFilter_) {
    this.responseFilter_(type, response);
  }

  if (this.delayNextRequestPromise_) {
    let delay = this.delayNextRequestPromise_;
    this.delayNextRequestPromise_ = null;
    return shaka.util.AbortableOperation.notAbortable(
        delay.then(function() { return response; }));
  } else {
    return shaka.util.AbortableOperation.completed(response);
  }
};


/**
 * Useable by tests directly.  Library code will only call this via the Spy on
 * registerResponseFilter.
 *
 * @param {shakaExtern.ResponseFilter} filter
 */
shaka.test.FakeNetworkingEngine.prototype.setResponseFilter = function(filter) {
  expect(filter).toEqual(jasmine.any(Function));
  this.responseFilter_ = filter;
};


/**
 * @param {shakaExtern.ResponseFilter} filter
 * @private
 */
shaka.test.FakeNetworkingEngine.prototype.unregisterResponseFilterImpl_ =
    function(filter) {
  expect(filter).toEqual(jasmine.any(Function));
  this.responseFilter_ = null;
};


/**
 * Delays the next response until the returned PublicPromise resolves.
 * @return {!shaka.util.PublicPromise}
 */
shaka.test.FakeNetworkingEngine.prototype.delayNextRequest = function() {
  if (!this.delayNextRequestPromise_) {
    this.delayNextRequestPromise_ = new shaka.util.PublicPromise();
  }
  return this.delayNextRequestPromise_;
};


/**
 * Expects that a request for the given segment has occurred.
 *
 * @param {string} uri
 * @param {shaka.net.NetworkingEngine.RequestType} type
 */
shaka.test.FakeNetworkingEngine.prototype.expectRequest = function(uri, type) {
  shaka.test.FakeNetworkingEngine.expectRequest(this.request, uri, type);
};


/**
 * Expects that no request for the given segment has occurred.
 *
 * @param {string} uri
 * @param {shaka.net.NetworkingEngine.RequestType} type
 */
shaka.test.FakeNetworkingEngine.prototype.expectNoRequest =
    function(uri, type) {
  shaka.test.FakeNetworkingEngine.expectNoRequest(this.request, uri, type);
};


/**
 * Expects that a range request for the given segment has occurred.
 *
 * @param {string} uri
 * @param {number} startByte
 * @param {?number} endByte
 */
shaka.test.FakeNetworkingEngine.prototype.expectRangeRequest = function(
    uri, startByte, endByte) {
  shaka.test.FakeNetworkingEngine.expectRangeRequest(
      this.request, uri, startByte, endByte);
};


/**
 * Sets the response map.
 *
 * @param {!Object.<string, !ArrayBuffer>} responseMap
 */
shaka.test.FakeNetworkingEngine.prototype.setResponseMap = function(
    responseMap) {
  this.responseMap_ = responseMap;
};


/**
 * Sets the response map as text.
 *
 * @param {!Object.<string, string>} textMap
 */
shaka.test.FakeNetworkingEngine.prototype.setResponseMapAsText = function(
    textMap) {
  this.responseMap_ = Object.keys(textMap).reduce(function(obj, key) {
    let data = shaka.util.StringUtils.toUTF8(textMap[key]);
    obj[key] = data;
    return obj;
  }, {});
};


/**
 * Sets the response map.
 *
 * @param {!Object.<string, !Object.<string, string>>} headersMap
 */
shaka.test.FakeNetworkingEngine.prototype.setHeadersMap = function(
    headersMap) {
  this.headersMap_ = headersMap;
};


/**
 * Set a single value in the response map.
 *
 * @param {string} uri
 * @param {!ArrayBuffer} value
 * @return {!shaka.test.FakeNetworkingEngine}
 */
shaka.test.FakeNetworkingEngine.prototype.setResponseValue =
    function(uri, value) {
  this.responseMap_[uri] = value;
  return this;
};


/**
 * Set a single value as text in the response map.
 *
 * @param {string} uri
 * @param {string} value
 * @return {!shaka.test.FakeNetworkingEngine}
 */
shaka.test.FakeNetworkingEngine.prototype.setResponseText =
    function(uri, value) {
  const utf8 = shaka.util.StringUtils.toUTF8(value);
  this.responseMap_[uri] = utf8;
  return this;
};


/**
 * Sets the default return value.
 *
 * @param {ArrayBuffer} defaultResponse The default value to return; or null to
 *   give an error for invalid URIs.
 */
shaka.test.FakeNetworkingEngine.prototype.setDefaultValue = function(
    defaultResponse) {
  this.defaultResponse_ = defaultResponse;
};


/**
 * Sets the default return value as text.
 *
 * @param {?string} defaultText The default value to return; or null to give an
 *   error for invalid URIs.
 */
shaka.test.FakeNetworkingEngine.prototype.setDefaultText = function(
    defaultText) {
  let data = null;
  if (defaultText) {
    data = shaka.util.StringUtils.toUTF8(defaultText);
  }
  this.defaultResponse_ = data;
};
