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

goog.provide('shaka.offline.OfflineScheme');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.OfflineUtils');
goog.require('shaka.util.Error');


/**
 * @namespace
 * @summary A plugin that handles requests for offline content.
 * @param {string} uri
 * @param {shakaExtern.Request} request
 * @return {!Promise.<shakaExtern.Response>}
 * @export
 */
shaka.offline.OfflineScheme = function(uri, request) {
  var manifestParts = /^offline:([0-9]+)$/.exec(uri);
  if (manifestParts) {
    /** @type {shakaExtern.Response} */
    var response = {
      uri: uri,
      data: new ArrayBuffer(0),
      headers: {'content-type': 'application/x-offline-manifest'}
    };
    return Promise.resolve(response);
  }

  var segmentParts = /^offline:[0-9]+\/[0-9]+\/([0-9]+)$/.exec(uri);
  if (segmentParts) {
    var segmentId = Number(segmentParts[1]);
    var scheme = shaka.offline.OfflineUtils.DB_SCHEME;
    var storageEngine = shaka.offline.OfflineUtils.createStorageEngine();

    if (!storageEngine) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.STORAGE_NOT_SUPPORTED));
    }

    return storageEngine.init(scheme)
        .then(function() { return storageEngine.get('segment', segmentId); })
        .then(function(segment) {
          return storageEngine.destroy().then(function() {
            if (!segment) {
              throw new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, segmentId);
            }
            return {uri: uri, data: segment.data, headers: {}};
          });
        });
  }

  return Promise.reject(new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.NETWORK,
      shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
};


shaka.net.NetworkingEngine.registerScheme(
    'offline', shaka.offline.OfflineScheme);
