/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ManifestParserUtils');

goog.require('goog.Uri');
goog.require('shaka.util.Functional');


/**
 * @summary Utility functions for manifest parsing.
 */
shaka.util.ManifestParserUtils = class {
  /**
   * Resolves an array of relative URIs to the given base URIs. This will result
   * in M*N number of URIs.
   *
   * @param {!Array.<string>} baseUris
   * @param {!Array.<string>} relativeUris
   * @return {!Array.<string>}
   */
  static resolveUris(baseUris, relativeUris) {
    const Functional = shaka.util.Functional;
    if (relativeUris.length == 0) {
      return baseUris;
    }

    const relativeAsGoog = relativeUris.map((uri) => new goog.Uri(uri));
    // Resolve each URI relative to each base URI, creating an Array of Arrays.
    // Then flatten the Arrays into a single Array.
    return baseUris.map((uri) => new goog.Uri(uri))
        .map((base) => relativeAsGoog.map((i) => base.resolve(i)))
        .reduce(Functional.collapseArrays, [])
        .map((uri) => uri.toString());
  }


  /**
   * Creates a DrmInfo object from the given info.
   *
   * @param {string} keySystem
   * @param {Array.<shaka.extern.InitDataOverride>} initData
   * @return {shaka.extern.DrmInfo}
   */
  static createDrmInfo(keySystem, initData) {
    return {
      keySystem: keySystem,
      licenseServerUri: '',
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      initData: initData || [],
      keyIds: [],
    };
  }
};


/**
 * @enum {string}
 */
shaka.util.ManifestParserUtils.ContentType = {
  VIDEO: 'video',
  AUDIO: 'audio',
  TEXT: 'text',
  IMAGE: 'image',
  APPLICATION: 'application',
};


/**
 * @enum {string}
 */
shaka.util.ManifestParserUtils.TextStreamKind = {
  SUBTITLE: 'subtitle',
  CLOSED_CAPTION: 'caption',
};


/**
 * Specifies how tolerant the player is of inaccurate segment start times and
 * end times within a manifest. For example, gaps or overlaps between segments
 * in a SegmentTimeline which are greater than or equal to this value will
 * result in a warning message.
 *
 * @const {number}
 */
shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS = 1 / 15;
