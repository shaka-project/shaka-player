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
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageEngineFactory');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');


/**
 * @namespace
 * @summary A plugin that handles requests for offline content.
 * @param {string} uri
 * @param {shakaExtern.Request} request
 * @param {shaka.net.NetworkingEngine.RequestType=} requestType
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @export
 */
shaka.offline.OfflineScheme = function(uri, request, requestType) {
  let manifestId = shaka.offline.OfflineUri.uriToManifestId(uri);
  if (manifestId != null) {
    return shaka.offline.OfflineScheme.onManifest_(uri);
  }

  let segmentId = shaka.offline.OfflineUri.uriToSegmentId(uri);
  if (segmentId != null) {
    return shaka.offline.OfflineScheme.onSegment_(segmentId, uri);
  }

  return shaka.util.AbortableOperation.failed(
      new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
          uri));
};


/**
 * @param {string} uri
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.offline.OfflineScheme.onManifest_ = function(uri) {
  /** @type {shakaExtern.Response} */
  let response = {
    uri: uri,
    data: new ArrayBuffer(0),
    headers: {'content-type': 'application/x-offline-manifest'}
  };

  return shaka.util.AbortableOperation.completed(response);
};


/**
 * @param {number} id
 * @param {string} uri
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.offline.OfflineScheme.onSegment_ = function(id, uri) {
  /** @type {shaka.offline.IStorageEngine} */
  let storageEngine;
  let segment;

  let promise = shaka.offline.StorageEngineFactory.createStorageEngine()
      .then(function(se) {
        storageEngine = se;
        return storageEngine.getSegment(id);
      })
      .then(function(seg) {
        segment = seg;
        return storageEngine.destroy();
      })
      .then(function() {
        if (!segment) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
              id);
        }

        /** @type {shakaExtern.Response} */
        let response = {
          uri: uri,
          data: segment.data,
          headers: {}
        };

        return response;
      });

  // TODO: support abort() in OfflineScheme
  return shaka.util.AbortableOperation.notAbortable(promise);
};


shaka.net.NetworkingEngine.registerScheme(
    'offline', shaka.offline.OfflineScheme);
