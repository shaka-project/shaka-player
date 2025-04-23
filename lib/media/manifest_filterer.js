/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ManifestFilterer');

goog.require('goog.asserts');
goog.require('shaka.drm.DrmEngine');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.Error');

/**
 * A class that handles the filtering of manifests.
 * Allows for manifest filtering to be done both by the player and by a
 * preload manager.
 */
shaka.media.ManifestFilterer = class {
  /**
   * @param {?shaka.extern.PlayerConfiguration} config
   * @param {shaka.extern.Resolution} maxHwRes
   * @param {?shaka.drm.DrmEngine} drmEngine
   */
  constructor(config, maxHwRes, drmEngine) {
    goog.asserts.assert(config, 'Must have config');

    /** @private {!shaka.extern.PlayerConfiguration} */
    this.config_ = config;

    /** @private {shaka.extern.Resolution} */
    this.maxHwRes_ = maxHwRes;

    /** @private {?shaka.drm.DrmEngine} drmEngine */
    this.drmEngine_ = drmEngine;
  }

  /** @param {!shaka.drm.DrmEngine} drmEngine */
  setDrmEngine(drmEngine) {
    this.drmEngine_ = drmEngine;
  }

  /**
   * Filters a manifest, removing unplayable streams/variants and  choosing
   * the codecs.
   *
   * @param {?shaka.extern.Manifest} manifest
   * @return {!Promise<boolean>} tracksChanged
   */
  async filterManifest(manifest) {
    goog.asserts.assert(manifest, 'Manifest should exist!');
    await shaka.util.StreamUtils.filterManifest(this.drmEngine_, manifest,
        this.config_.drm.preferredKeySystems,
        this.config_.drm.keySystemsMapping);
    if (!this.config_.streaming.dontChooseCodecs) {
      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(
          manifest,
          this.config_.preferredVideoCodecs,
          this.config_.preferredAudioCodecs,
          this.config_.preferredDecodingAttributes,
          this.config_.preferredTextFormats);
    }
    this.checkPlayableVariants_(manifest);
    return this.filterManifestWithRestrictions(manifest);
  }


  /**
   * @param {?shaka.extern.Manifest} manifest
   * @return {boolean} tracksChanged
   */
  applyRestrictions(manifest) {
    return shaka.util.StreamUtils.applyRestrictions(
        manifest.variants, this.config_.restrictions, this.maxHwRes_);
  }


  /**
   * Apply the restrictions configuration to the manifest, and check if there's
   * a variant that meets the restrictions.
   *
   * @param {?shaka.extern.Manifest} manifest
   * @return {boolean} tracksChanged
   */
  filterManifestWithRestrictions(manifest) {
    const tracksChanged = this.applyRestrictions(manifest);

    if (manifest) {
      // We may need to create new sessions for any new init data.
      const currentDrmInfo =
          this.drmEngine_ ? this.drmEngine_.getDrmInfo() : null;
      // DrmEngine.newInitData() requires mediaKeys to be available.
      if (currentDrmInfo && this.drmEngine_.getMediaKeys()) {
        const streams = new Set();
        for (const variant of manifest.variants) {
          if (variant.audio) {
            streams.add(variant.audio);
          }
          if (variant.video) {
            streams.add(variant.video);
          }
        }
        for (const stream of streams) {
          this.processDrmInfos(currentDrmInfo.keySystem, stream);
        }
      }
      this.checkRestrictedVariants(manifest);
    }

    return tracksChanged;
  }

  /**
   * Confirm some variants are playable. Otherwise, throw an exception.
   * @param {!shaka.extern.Manifest} manifest
   * @private
   */
  checkPlayableVariants_(manifest) {
    const valid = manifest.variants.some(shaka.util.StreamUtils.isPlayable);

    // If none of the variants are playable, throw
    // CONTENT_UNSUPPORTED_BY_BROWSER.
    if (!valid) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER);
    }
  }

  /**
   * @param {string} keySystem
   * @param {!shaka.extern.Stream} stream
   */
  processDrmInfos(keySystem, stream) {
    for (const drmInfo of stream.drmInfos) {
      // Ignore any data for different key systems.
      if (drmInfo.keySystem == keySystem) {
        for (const initData of (drmInfo.initData || [])) {
          this.drmEngine_.newInitData(
              initData.initDataType, initData.initData);
        }
      }
    }
  }

  /**
   * Checks if the variants are all restricted, and throw an appropriate
   * exception if so.
   *
   * @param {shaka.extern.Manifest} manifest
   */
  checkRestrictedVariants(manifest) {
    const restrictedStatuses = shaka.media.ManifestFilterer.restrictedStatuses;
    const keyStatusMap =
        this.drmEngine_ ? this.drmEngine_.getKeyStatuses() : {};
    const keyIds = Object.keys(keyStatusMap);
    const isGlobalStatus = keyIds.length && keyIds[0] == '00';

    let hasPlayable = false;
    let hasAppRestrictions = false;

    /** @type {!Set<string>} */
    const missingKeys = new Set();

    /** @type {!Set<string>} */
    const badKeyStatuses = new Set();

    const streams = new Set();

    for (const variant of manifest.variants) {
      // TODO: Combine with onKeyStatus_.
      if (variant.audio) {
        streams.add(variant.audio);
      }
      if (variant.video) {
        streams.add(variant.video);
      }

      if (!variant.allowedByApplication) {
        hasAppRestrictions = true;
      } else if (variant.allowedByKeySystem) {
        hasPlayable = true;
      }
    }

    for (const stream of streams) {
      if (stream.keyIds.size) {
        for (const keyId of stream.keyIds) {
          const keyStatus = keyStatusMap[isGlobalStatus ? '00' : keyId];
          if (!keyStatus) {
            missingKeys.add(keyId);
          } else if (restrictedStatuses.includes(keyStatus)) {
            badKeyStatuses.add(keyStatus);
          }
        }
      }  // if (stream.keyIds.size)
    }

    if (!hasPlayable) {
      /** @type {shaka.extern.RestrictionInfo} */
      const data = {
        hasAppRestrictions,
        missingKeys: Array.from(missingKeys),
        restrictedKeyStatuses: Array.from(badKeyStatuses),
      };
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET,
          data);
    }
  }
};

/**
 * These are the EME key statuses that represent restricted playback.
 * 'usable', 'released', 'output-downscaled', 'status-pending' are statuses
 * of the usable keys.  'expired' status is being handled separately in
 * DrmEngine.
 *
 * @const {!Array<string>}
 */
shaka.media.ManifestFilterer.restrictedStatuses =
    ['output-restricted', 'internal-error'];
