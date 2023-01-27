/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.OfflineManifestParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.util.Error');


/**
 * @summary Creates a new offline manifest parser.
 * @implements {shaka.extern.ManifestParser}
 */
shaka.offline.OfflineManifestParser = class {
  /** */
  constructor() {
    /** @private {shaka.offline.OfflineUri} */
    this.uri_ = null;
  }

  /** @override */
  configure(config) {
    // No-op
  }

  /** @override */
  async start(uriString, playerInterface) {
    /** @type {shaka.offline.OfflineUri} */
    const uri = shaka.offline.OfflineUri.parse(uriString);
    this.uri_ = uri;

    if (uri == null || !uri.isManifest()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
          uriString);
    }

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();

      const cell = await muxer.getCell(uri.mechanism(), uri.cell());

      const manifests = await cell.getManifests([uri.key()]);
      const manifest = manifests[0];

      const converter = new shaka.offline.ManifestConverter(
          uri.mechanism(), uri.cell());

      const finalManifest = converter.fromManifestDB(manifest);
      playerInterface.makeTextStreamsForClosedCaptions(finalManifest);
      return finalManifest;
    } finally {
      await muxer.destroy();
    }
  }

  /** @override */
  stop() {
    return Promise.resolve();
  }

  /** @override */
  update() {
    // No-op
  }

  /** @override */
  async onExpirationUpdated(sessionId, expiration) {
    goog.asserts.assert(
        this.uri_,
        'Should not get update event before start has been called');

    /** @type {!shaka.offline.OfflineUri} */
    const uri = this.uri_;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();

      const cell = await muxer.getCell(uri.mechanism(), uri.cell());

      const manifests = await cell.getManifests([uri.key()]);
      const manifest = manifests[0];

      const foundSession = manifest.sessionIds.includes(sessionId);
      const newExpiration = manifest.expiration == undefined ||
                        manifest.expiration > expiration;

      if (foundSession && newExpiration) {
        shaka.log.debug('Updating expiration for stored content');
        await cell.updateManifestExpiration(uri.key(), expiration);
      }
    } catch (e) {
      // Ignore errors with update.
      shaka.log.error('There was an error updating', uri, e);
    } finally {
      await muxer.destroy();
    }
  }
};


shaka.media.ManifestParser.registerParserByMime(
    'application/x-offline-manifest',
    () => new shaka.offline.OfflineManifestParser());
