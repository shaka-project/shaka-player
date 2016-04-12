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

goog.provide('shaka.net.HttpPlugin');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');


/**
 * @namespace
 * @summary A networking plugin to handle http and https URIs via XHR.
 * @param {string} uri
 * @param {shakaExtern.Request} request
 * @return {!Promise.<shakaExtern.Response>}
 */
shaka.net.HttpPlugin = function(uri, request) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();

    xhr.open(request.method, uri, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = request.retryParameters.timeout;
    xhr.withCredentials = request.allowCrossSiteCredentials;

    xhr.onload = function(event) {
      var target = event.target;
      goog.asserts.assert(target, 'XHR onload has no target!');
      if (target.status >= 200 && target.status <= 299) {
        // All 2xx HTTP codes are success cases.
        var headers = target.getAllResponseHeaders().split('\r\n').reduce(
            function(all, part) {
              var header = part.split(': ');
              all[header[0].toLowerCase()] = header.slice(1).join(': ');
              return all;
            },
            {});
        if (target.responseURL) {
          uri = target.responseURL;
        }
        /** @type {shakaExtern.Response} */
        var response = {uri: uri, data: target.response, headers: headers};
        resolve(response);
      } else {
        var responseText = null;
        try {
          responseText = shaka.util.StringUtils.fromBytesAutoDetect(
              target.response);
        } catch (exception) {}
        shaka.log.debug('HTTP error text:', responseText);
        reject(new shaka.util.Error(
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.BAD_HTTP_STATUS,
            uri,
            target.status,
            responseText));
      }
    };
    xhr.onerror = function(event) {
      reject(new shaka.util.Error(
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR,
          uri));
    };
    xhr.ontimeout = function(event) {
      reject(new shaka.util.Error(
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.TIMEOUT,
          uri));
    };

    for (var k in request.headers) {
      xhr.setRequestHeader(k, request.headers[k]);
    }
    xhr.send(request.body);
  });
};


shaka.net.NetworkingEngine.registerScheme('http', shaka.net.HttpPlugin);
shaka.net.NetworkingEngine.registerScheme('https', shaka.net.HttpPlugin);

