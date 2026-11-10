/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.OfflineScheme');

goog.require('goog.asserts');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.Storage');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.Timer');


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
      return shaka.offline.OfflineScheme.getManifest_(uri, request);
    }

    if (offlineUri && offlineUri.isSegment()) {
      return shaka.offline.OfflineScheme.getSegment_(
          offlineUri.key(), offlineUri, request);
    }

    if (offlineUri && offlineUri.isPendingSegment()) {
      return shaka.offline.OfflineScheme.getPendingSegment_(
          offlineUri, request);
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
   * @param {shaka.extern.Request} request
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @private
   */
  static getManifest_(uri, request) {
    /** @type {shaka.extern.Response} */
    const response = {
      uri: uri,
      originalUri: uri,
      data: new ArrayBuffer(0),
      headers: {'content-type': 'application/x-offline-manifest'},
      originalRequest: request,
    };

    return shaka.util.AbortableOperation.completed(response);
  }

  /**
   * @param {number} id
   * @param {!shaka.offline.OfflineUri} uri
   * @param {shaka.extern.Request} request
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @private
   */
  static getSegment_(id, uri, request) {
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
            originalRequest: request,
          };
        })
        .finally(() => muxer.destroy());
  }

  /**
   * Waits for a segment of content that is being downloaded to be stored, and
   * returns it.
   *
   * @param {!shaka.offline.OfflineUri} uri
   * @param {shaka.extern.Request} request
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @private
   */
  static getPendingSegment_(uri, request) {
    const pendingSegment = uri.pendingSegment();
    goog.asserts.assert(pendingSegment, 'Not a pending segment uri');
    const contentUri = uri.manifestOfPendingSegment().toString();

    let aborted = false;
    /** @type {?function()} */
    let stopWaiting = null;

    const getSegment = async () => {
      /** @type {!shaka.offline.StorageMuxer} */
      const muxer = new shaka.offline.StorageMuxer();
      try {
        await muxer.init();
        const cell = await muxer.getCell(uri.mechanism(), uri.cell());

        /* eslint-disable no-await-in-loop */
        for (;;) {
          if (aborted) {
            throw new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.PLAYER,
                shaka.util.Error.Code.OPERATION_ABORTED);
          }

          // Check this before reading the manifest.  A download assigns all
          // the segments it stored to the manifest before it ends, so if it
          // has ended by the time the manifest is read, the manifest has them.
          const downloading =
              await shaka.offline.Storage.isDownloading(contentUri);
          const manifests = await cell.getManifests([uri.key()]);
          const key = shaka.offline.OfflineScheme.getStoredKey_(
              manifests[0], pendingSegment, uri);
          if (key != null) {
            const segments = await cell.getSegments([key]);
            /** @type {shaka.extern.Response} */
            const response = {
              uri: uri.toString(),
              originalUri: uri.toString(),
              data: segments[0].data,
              headers: {},
              originalRequest: request,
            };
            return response;
          }

          if (!downloading) {
            throw new shaka.util.Error(
                shaka.util.Error.Severity.RECOVERABLE,
                shaka.util.Error.Category.STORAGE,
                shaka.util.Error.Code.SEGMENT_NOT_STORED,
                contentUri);
          }

          await new Promise((resolve) => {
            if (aborted) {
              // Aborted while reading the manifest.
              resolve();
              return;
            }
            const timer = new shaka.util.Timer(resolve);
            stopWaiting = () => {
              timer.stop();
              resolve();
            };
            timer.tickAfter(
                shaka.offline.OfflineScheme.PENDING_SEGMENT_POLL_INTERVAL_);
          });
          stopWaiting = null;
        }
        /* eslint-enable no-await-in-loop */
      } finally {
        await muxer.destroy();
      }
    };

    return new shaka.util.AbortableOperation(getSegment(), () => {
      aborted = true;
      if (stopWaiting) {
        stopWaiting();
      }
      return Promise.resolve();
    });
  }

  /**
   * @param {shaka.extern.ManifestDB} manifestDB
   * @param {?shaka.offline.OfflineUri.PendingSegment} pendingSegment
   * @param {!shaka.offline.OfflineUri} uri
   * @return {?number}  The key the segment was stored with, or null if it has
   *   not been stored yet.
   * @private
   */
  static getStoredKey_(manifestDB, pendingSegment, uri) {
    goog.asserts.assert(pendingSegment, 'Not a pending segment uri');
    const stream = manifestDB.streams.find((streamDB) => {
      return streamDB.id == pendingSegment.streamId;
    });
    const segment = stream ? stream.segments[pendingSegment.position] : null;
    if (!segment) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
          uri.toString());
    }
    if (pendingSegment.isInit) {
      return segment.pendingInitSegmentRefId ? null : segment.initSegmentKey;
    }
    return segment.pendingSegmentRefId ? null : segment.dataKey;
  }
};


/**
 * How often to check whether a segment that is being downloaded has been
 * stored, in seconds.
 *
 * @const {number}
 * @private
 */
shaka.offline.OfflineScheme.PENDING_SEGMENT_POLL_INTERVAL_ = 0.5;

shaka.net.NetworkingEngine.registerScheme(
    'offline', shaka.offline.OfflineScheme.plugin);
