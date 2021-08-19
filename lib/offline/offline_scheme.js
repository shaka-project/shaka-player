/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.OfflineScheme');

goog.require('goog.asserts');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');


/**
 * @summary A plugin that handles requests for offline content.
 * @export
 */
shaka.offline.OfflineScheme = class {
  /**
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.ProgressUpdated} progressUpdated Called when a
   *   progress event happened.
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @export
   */
  static plugin(uri, request, requestType, progressUpdated) {
    const offlineUri = shaka.offline.OfflineUri.parse(uri);

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
  }

  /**
   * @param {string} uri
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @private
   */
  static getManifest_(uri) {
    /** @type {shaka.extern.Response} */
    const response = {
      uri: uri,
      originalUri: uri,
      data: new ArrayBuffer(0),
      headers: {'content-type': 'application/x-offline-manifest'},
    };

    return shaka.util.AbortableOperation.completed(response);
  }

  /**
   * @param {number} id
   * @param {!shaka.offline.OfflineUri} uri
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @private
   */
  static getSegment_(id, uri) {
    goog.asserts.assert(
        uri.isSegment(),
        'Only segment uri\'s should be given to getSegment');

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    return shaka.util.AbortableOperation.completed(undefined)
        .chain(() => muxer.init())
        .chain(() => muxer.getCell(uri.mechanism(), uri.cell()))
        .chain((cell) => cell.getSegments([uri.key()]))
        .chain((segments) => {
          const segment = segments[0];

          return {
            uri: uri,
            data: segment.data,
            headers: {},
          };
        })
        .finally(() => muxer.destroy());
  }
};

shaka.net.NetworkingEngine.registerScheme(
    'offline', shaka.offline.OfflineScheme.plugin);
