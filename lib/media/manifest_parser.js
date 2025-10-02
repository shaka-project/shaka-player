/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ManifestParser');

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.log');
goog.require('shaka.util.Error');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary An interface to register manifest parsers.
 * @export
 */
shaka.media.ManifestParser = class {
  /**
   * Registers a manifest parser by MIME type.
   *
   * @param {string} mimeType The MIME type of the manifest.
   * @param {shaka.extern.ManifestParser.Factory} parserFactory The factory
   *   used to create parser instances.
   * @export
   */
  static registerParserByMime(mimeType, parserFactory) {
    shaka.media.ManifestParser.parsersByMime.set(mimeType, parserFactory);
  }

  /**
   * Unregisters a manifest parser by MIME type.
   *
   * @param {string} mimeType The MIME type of the manifest.
   * @export
   */
  static unregisterParserByMime(mimeType) {
    shaka.media.ManifestParser.parsersByMime.delete(mimeType);
  }


  /**
   * Returns a map of manifest support for well-known types.
   *
   * @return {!Object<string, boolean>}
   */
  static probeSupport() {
    const ManifestParser = shaka.media.ManifestParser;
    const support = {};

    // Make sure all registered parsers are shown, but only for MSE-enabled
    // platforms where our parsers matter.
    const device = shaka.device.DeviceFactory.getDevice();
    if (device.supportsMediaSource()) {
      for (const type of ManifestParser.parsersByMime.keys()) {
        support[type] = true;
      }
    }

    // Make sure all well-known types are tested as well, just to show an
    // explicit false for things people might be expecting.
    const testMimeTypes = [
      // DASH
      'application/dash+xml',
      // HLS
      'application/x-mpegurl',
      'application/vnd.apple.mpegurl',
      // SmoothStreaming
      'application/vnd.ms-sstr+xml',
    ];

    for (const type of testMimeTypes) {
      // Only query our parsers for MSE-enabled platforms.  Otherwise, query a
      // temporary media element for native support for these types.
      if (device.supportsMediaSource()) {
        support[type] = ManifestParser.parsersByMime.has(type);
      } else {
        support[type] = device.supportsMediaType(type);
      }
    }

    return support;
  }


  /**
   * Get a factory that can create a manifest parser that should be able to
   * parse the manifest at |uri|.
   *
   * @param {string} uri
   * @param {?string} mimeType
   * @return {shaka.extern.ManifestParser.Factory}
   */
  static getFactory(uri, mimeType) {
    const ManifestParser = shaka.media.ManifestParser;

    // Try using the MIME type we were given.
    if (mimeType) {
      const factory = ManifestParser.parsersByMime.get(mimeType.toLowerCase());
      if (factory) {
        return factory;
      }

      shaka.log.warning(
          'Could not determine manifest type using MIME type ', mimeType);
    }

    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
        uri,
        mimeType);
  }


  /**
   * Determines whether or not the MIME type is supported by our own
   * manifest parsers on this platform.  This takes into account whether or not
   * MediaSource is available, as well as which parsers are registered to the
   * system.
   *
   * @param {string} mimeType
   * @return {boolean}
   */
  static isSupported(mimeType) {
    // Without MediaSource, our own parsers are useless.
    const device = shaka.device.DeviceFactory.getDevice();
    if (!device.supportsMediaSource()) {
      return false;
    }

    return shaka.media.ManifestParser.parsersByMime.has(mimeType);
  }
};


/**
 * @const {string}
 */
shaka.media.ManifestParser.HLS = 'HLS';


/**
 * @const {string}
 */
shaka.media.ManifestParser.DASH = 'DASH';


/**
 * @const {string}
 */
shaka.media.ManifestParser.MSS = 'MSS';


/**
 * @const {string}
 */
shaka.media.ManifestParser.UNKNOWN = 'UNKNOWN';


/**
 * @enum {string}
 * @export
 */
shaka.media.ManifestParser.AccessibilityPurpose = {
  VISUALLY_IMPAIRED: 'visually impaired',
  HARD_OF_HEARING: 'hard of hearing',
  SPOKEN_SUBTITLES: 'spoken subtitles',
};


/**
 * Contains the parser factory functions indexed by MIME type.
 *
 * @type {!Map<string, shaka.extern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByMime = new Map();


