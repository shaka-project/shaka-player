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

goog.require('goog.asserts');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');


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
  let offlineUri = shaka.offline.OfflineUri.parse(uri);

  if (offlineUri && offlineUri.isManifest()) {
    return shaka.offline.OfflineScheme.getManifest_(uri);
  }

  if (offlineUri && offlineUri.isSegment()) {
    return shaka.offline.OfflineScheme.getSegment_(
        offlineUri.key(), offlineUri);
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
shaka.offline.OfflineScheme.getManifest_ = function(uri) {
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
 * @param {!shaka.offline.OfflineUri} uri
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.offline.OfflineScheme.getSegment_ = function(id, uri) {
  goog.asserts.assert(
      uri.isSegment(),
      'Only segment uri\'s should be given to getSegment');

  let muxer = new shaka.offline.StorageMuxer();

  let promise = shaka.util.IDestroyable.with([muxer], async () => {
    await muxer.init();
    let cell = await muxer.getCell(uri.mechanism(), uri.cell());
    let segments = await cell.getSegments([uri.key()]);
    let segment = segments[0];
    return {
      uri: uri,
      data: segment.data,
      headers: {}
    };
  });

  // TODO: Support abort() in OfflineScheme.
  return shaka.util.AbortableOperation.notAbortable(promise);
};


shaka.net.NetworkingEngine.registerScheme(
    'offline', shaka.offline.OfflineScheme);
