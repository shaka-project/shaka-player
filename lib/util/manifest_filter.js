/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ManifestFilter');


/**
 * This utility class contains all the functions used to filter manifests
 * before playback and before storage.
 */
shaka.util.ManifestFilter = class {
  /**
   * Filter the variants in |manifest| to only include the variants that meet
   * the given restrictions.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.Restrictions} restrictions
   * @param {{width: number, height:number}} maxHwResolution
   */
  static filterByRestrictions(manifest, restrictions, maxHwResolution) {
    manifest.variants = manifest.variants.filter((variant) => {
      return shaka.util.StreamUtils.meetsRestrictions(
          variant, restrictions, maxHwResolution);
    });
  }


  /**
   * Filter the variants in the |manifest| to only include those that are
   * supported by media source.
   *
   * @param {shaka.extern.Manifest} manifest
   */
  static filterByMediaSourceSupport(manifest) {
    const MediaSourceEngine = shaka.media.MediaSourceEngine;

    manifest.variants = manifest.variants.filter((variant) => {
      let supported = true;
      if (variant.audio) {
        supported =
            supported && MediaSourceEngine.isStreamSupported(variant.audio);
      }
      if (variant.video) {
        supported =
            supported && MediaSourceEngine.isStreamSupported(variant.video);
      }
      return supported;
    });
  }

  /**
   * Filter the variants in |manifest| to only include those that are supported
   * by |drm|.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {!shaka.media.DrmEngine} drmEngine
   */
  static filterByDrmSupport(manifest, drmEngine) {
    manifest.variants = manifest.variants.filter((variant) => {
      return drmEngine.supportsVariant(variant);
    });
  }
};
