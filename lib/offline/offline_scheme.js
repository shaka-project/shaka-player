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
goog.require('shaka.offline.StorageEngineFactory');
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
  var manifestId = shaka.offline.OfflineScheme.uriToManifestId(uri);
  if (manifestId != null) {
    return shaka.offline.OfflineScheme.OnManifestId_(uri, manifestId);
  }

  var segmentId = shaka.offline.OfflineScheme.uriToSegmentId(uri);
  if (segmentId != null) {
    return shaka.offline.OfflineScheme.OnSegmentId_(uri, segmentId);
  }

  return Promise.reject(new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.NETWORK,
      shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
};


/**
 * @param {string} uri
 * @param {number} manifestId
 * @return {!Promise}
 * @private
 */
shaka.offline.OfflineScheme.OnManifestId_ = function(uri, manifestId) {
  /** @type {shakaExtern.Response} */
  var response = {
    uri: uri,
    data: new ArrayBuffer(0),
    headers: {'content-type': 'application/x-offline-manifest'}
  };

  return Promise.resolve(response);
};


/**
 * @param {string} uri
 * @param {number} segmentId
 * @return {!Promise}
 * @private
 */
shaka.offline.OfflineScheme.OnSegmentId_ = function(uri, segmentId) {
  /** @const */
  var scheme = shaka.offline.OfflineUtils.DB_SCHEME;

  /** @type {shaka.offline.IStorageEngine} */
  var storageEngine =
      shaka.offline.StorageEngineFactory.createStorageEngine();

  if (!storageEngine) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORAGE_NOT_SUPPORTED));
  }

  return storageEngine.init(scheme)
      .then(function() {
        return storageEngine.get('segment', segmentId);
      })
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
};


/**
 * @param {!number} id
 * @return {!string}
 */
shaka.offline.OfflineScheme.manifestIdToUri = function(id) {
  return 'offline:' + id;
};


/**
 * @param {!string} uri
 * @return {?number}
 */
shaka.offline.OfflineScheme.uriToManifestId = function(uri) {
  var parts = /^offline:([0-9]+)$/.exec(uri);
  return parts ? Number(parts[1]) : null;
};


/**
 * @param {number} manifestId
 * @param {number} streamId
 * @param {number} segmentId
 * @return {!string}
 */
shaka.offline.OfflineScheme.segmentToUri = function(
    manifestId, streamId, segmentId) {
  return 'offline:' + manifestId + '/' + streamId + '/' + segmentId;
};


/**
 * @param {!string} uri
 * @return {?number}
 */
shaka.offline.OfflineScheme.uriToSegmentId = function(uri) {
  var parts = /^offline:[0-9]+\/[0-9]+\/([0-9]+)$/.exec(uri);
  return parts ? Number(parts[1]) : null;
};


shaka.net.NetworkingEngine.registerScheme(
    'offline', shaka.offline.OfflineScheme);
