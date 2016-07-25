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

goog.require('shaka.util.StringUtils');



/**
 * A fake networking engine that returns constant data.  The request member
 * is a jasmine spy and can be used to check the actual calls that occurred.
 *
 * @param {Object.<string, !ArrayBuffer>=} opt_responseMap A map from URI to
 *   the data to return.
 * @param {!ArrayBuffer=} opt_defaultResponse The default value to return; if
 *   null, a jasmine expect will fail if a request is made that is not in
 *   |opt_data|.
 *
 * @constructor
 * @struct
 * @extends {shaka.net.NetworkingEngine}
 */
shaka.test.FakeNetworkingEngine = function(
    opt_responseMap, opt_defaultResponse) {
  /** @private {!Object.<string, !ArrayBuffer>} */
  this.responseMap_ = opt_responseMap || {};

  /** @private {ArrayBuffer} */
  this.defaultResponse_ = opt_defaultResponse || null;

  /** @private {?shaka.util.PublicPromise} */
  this.delayNextRequestPromise_ = null;

  // The prototype has already been applied; create spies for the
  // methods but still call it by default.
  spyOn(this, 'request').and.callThrough();

  spyOn(this, 'registerResponseFilter').and.callThrough();

  spyOn(this, 'unregisterResponseFilter').and.callThrough();
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
 * Expects that a range request for the given segment has occurred.
 *
 * @param {!Object} requestSpy
 * @param {string} uri
 * @param {number} startByte
 * @param {?number} endByte
 */
shaka.test.FakeNetworkingEngine.expectRangeRequest = function(
    requestSpy, uri, startByte, endByte) {
  var range = 'bytes=' + startByte + '-';
  if (endByte != null) range += endByte;

  expect(requestSpy).toHaveBeenCalledWith(
      shaka.net.NetworkingEngine.RequestType.SEGMENT,
      jasmine.objectContaining({
        uris: [uri],
        headers: jasmine.objectContaining({'Range': range})
      }));
};


/** @override */
shaka.test.FakeNetworkingEngine.prototype.request = function(type, request) {
  expect(request).toBeTruthy();
  expect(request.uris.length).toBe(1);

  var result = this.responseMap_[request.uris[0]] || this.defaultResponse_;
  if (!result) {
    // Give a more helpful error message to jasmine.
    expect(request.uris[0]).toBe('in the response map');
    return Promise.reject();
  }

  /** @type {shakaExtern.Response} */
  var response = {uri: request.uris[0], data: result, headers: {}};

  if (this.delayNextRequestPromise_) {
    var delay = this.delayNextRequestPromise_;
    this.delayNextRequestPromise_ = null;
    return delay.then(function() { return response; });
  }
  else
    return Promise.resolve(response);
};


/** @override */
shaka.test.FakeNetworkingEngine.prototype.registerResponseFilter =
    function(filter) {
  expect(filter).toEqual(jasmine.any(Function));
};


/** @override */
shaka.test.FakeNetworkingEngine.prototype.unregisterResponseFilter =
    function(filter) {
  expect(filter).toEqual(jasmine.any(Function));
};


/**
 * Delays the next response until the returned PublicPromise resolves.
 * @return {!shaka.util.PublicPromise}
 */
shaka.test.FakeNetworkingEngine.prototype.delayNextRequest = function() {
  if (!this.delayNextRequestPromise_)
    this.delayNextRequestPromise_ = new shaka.util.PublicPromise();
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
    var data = shaka.util.StringUtils.toUTF8(textMap[key]);
    obj[key] = data;
    return obj;
  }, {});
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
  var data = null;
  if (defaultText) {
    data = shaka.util.StringUtils.toUTF8(defaultText);
  }
  this.defaultResponse_ = data;
};
