/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.StoredContentUtils');

goog.require('goog.asserts');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.util.StreamUtils');


/**
 * A utility class used to create |shaka.extern.StoredContent| from different
 * types of input.
 */
shaka.offline.StoredContentUtils = class {
  /**
   * @param {string} originalUri
   * @param {shaka.extern.Manifest} manifest
   * @param {number} size
   * @param {!Object} metadata
   * @return {shaka.extern.StoredContent}
   */
  static fromManifest(originalUri, manifest, size, metadata) {
    goog.asserts.assert(
        manifest.variants.length,
        'Cannot create stored content from manifest with no variants.');

    /** @type {number} */
    const duration = manifest.presentationTimeline.getDuration();

    /** @type {!Array.<shaka.extern.Track>} */
    const tracks = shaka.offline.StoredContentUtils.getTracks_(manifest);

    /** @type {shaka.extern.StoredContent} */
    const content = {
      offlineUri: null,
      originalManifestUri: originalUri,
      duration: duration,
      size: size,
      // This expiration value is temporary and will be used in progress reports
      // during the storage process.  The real value would have to come from
      // DrmEngine.
      expiration: Infinity,
      tracks: tracks,
      appMetadata: metadata,
      isIncomplete: false,
    };

    return content;
  }

  /**
   * @param {!shaka.offline.OfflineUri} offlineUri
   * @param {shaka.extern.ManifestDB} manifestDB
   * @return {shaka.extern.StoredContent}
   */
  static fromManifestDB(offlineUri, manifestDB) {
    goog.asserts.assert(
        manifestDB.streams.length,
        'Cannot create stored content from manifestDB with no streams.');

    const converter = new shaka.offline.ManifestConverter(
        offlineUri.mechanism(), offlineUri.cell());

    /** @type {shaka.extern.Manifest} */
    const manifest = converter.fromManifestDB(manifestDB);

    /** @type {!Object} */
    const metadata = manifestDB.appMetadata || {};

    /** @type {!Array.<shaka.extern.Track>} */
    const tracks = shaka.offline.StoredContentUtils.getTracks_(manifest);

    goog.asserts.assert(
        manifestDB.expiration != null,
        'Manifest expiration must be set by now!');

    /** @type {shaka.extern.StoredContent} */
    const content = {
      offlineUri: offlineUri.toString(),
      originalManifestUri: manifestDB.originalManifestUri,
      duration: manifestDB.duration,
      size: manifestDB.size,
      expiration: manifestDB.expiration,
      tracks: tracks,
      appMetadata: metadata,
      isIncomplete: (manifestDB.isIncomplete || false),
    };

    return content;
  }

  /**
   * Gets track representations of all playable variants and all text streams.
   *
   * @param {shaka.extern.Manifest} manifest
   * @return {!Array.<shaka.extern.Track>}
   * @private
   */
  static getTracks_(manifest) {
    const StreamUtils = shaka.util.StreamUtils;

    const tracks = [];

    const variants = StreamUtils.getPlayableVariants(manifest.variants);
    for (const variant of variants) {
      tracks.push(StreamUtils.variantToTrack(variant));
    }

    const textStreams = manifest.textStreams;
    for (const stream of textStreams) {
      tracks.push(StreamUtils.textStreamToTrack(stream));
    }

    return tracks;
  }
};
