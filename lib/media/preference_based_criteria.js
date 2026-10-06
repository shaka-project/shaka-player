/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.PreferenceBasedCriteria');

goog.require('shaka.config.CodecSwitchingStrategy');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.media.AdaptationSet');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MimeUtils');


/**
 * @implements {shaka.extern.AdaptationSetCriteria}
 * @final
 */
shaka.media.PreferenceBasedCriteria = class {
  constructor() {
    /** @private {?shaka.extern.AdaptationSetCriteria.Configuration} */
    this.config_ = null;

    /** @private {?shaka.media.AdaptationSet} */
    this.lastAdaptationSet_ = null;
  }

  /**
   * @override
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @override
   */
  getConfiguration() {
    return this.config_;
  }

  /**
   * @override
   */
  create(variants) {
    const Class = shaka.media.PreferenceBasedCriteria;

    // Apply audio preferences
    let current = Class.applyAudioPreferences_(
        variants, this.config_.preferredAudio,
        this.config_.audioCodec, this.config_.activeAudioCodec);

    // Apply video preferences
    current = Class.applyVideoPreferences_(
        current, this.config_.preferredVideo);

    const device = shaka.device.DeviceFactory.getDevice();
    const keySystem = this.config_.keySystem;
    const supportsSmoothCodecTransitions =
      this.config_.codecSwitchingStrategy ==
      shaka.config.CodecSwitchingStrategy.SMOOTH &&
        device.supportsSmoothCodecSwitching(keySystem);

    const compareCodecs = !supportsSmoothCodecTransitions;
    const root = Class.chooseVariantWithLargestLadder_(current, compareCodecs);
    this.lastAdaptationSet_ =
        new shaka.media.AdaptationSet(root, current, compareCodecs);

    return this.lastAdaptationSet_;
  }

  /**
   * @override
   */
  getLastAdaptationSet() {
    return this.lastAdaptationSet_;
  }

  /**
   * Choose the variant that the adaptation set is built around (its root).
   * By default it's the first one, the most preferred.  But when codecs can't
   * be switched smoothly, the adaptation set only holds the root's codecs, so
   * pick the variant whose video codec leaves the most variants to adapt
   * between.  Otherwise, a codec that is only used for a few resolutions
   * would pin playback to those resolutions.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {boolean} compareCodecs
   * @return {shaka.extern.Variant}
   * @private
   */
  static chooseVariantWithLargestLadder_(variants, compareCodecs) {
    const AdaptationSet = shaka.media.AdaptationSet;
    const MimeUtils = shaka.util.MimeUtils;

    const preferred = variants[0];
    if (!compareCodecs || !preferred.video) {
      return preferred;
    }

    const getVideoKey = (variant) => {
      const bases = MimeUtils.splitCodecs(variant.video.codecs)
          .map((codec) => MimeUtils.getCodecBase(codec)).sort();
      return variant.video.mimeType + ';' + bases.join(',');
    };
    const countAdaptable = (root) => {
      return variants.filter(
          (variant) => AdaptationSet.areAdaptable(root, variant, true)).length;
    };

    let best = preferred;
    let bestCount = countAdaptable(preferred);
    const triedKeys = new Set([getVideoKey(preferred)]);
    for (const variant of variants) {
      if (!variant.video || triedKeys.has(getVideoKey(variant))) {
        continue;
      }
      // Only the video codec may differ from the preferred root, so that
      // the audio chosen by the preferences is kept.
      if (!AdaptationSet.areAdaptable(preferred, variant, false) ||
          (preferred.audio && variant.audio &&
          !AdaptationSet.areAudiosCompatible(
              preferred.audio, variant.audio, true))) {
        continue;
      }
      triedKeys.add(getVideoKey(variant));
      const count = countAdaptable(variant);
      if (count > bestCount) {
        best = variant;
        bestCount = count;
      }
    }
    return best;
  }

  /**
   * Apply audio preference entries in priority order.
   * For each entry, filter candidates by all specified fields (AND logic).
   * First entry with results wins. Falls back to primary then all variants.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!Array<!shaka.extern.AudioPreference>} preferredAudio
   * @param {string} audioCodec Runtime audio codec override
   * @param {string} activeAudioCodec Runtime active audio codec override
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static applyAudioPreferences_(
      variants, preferredAudio, audioCodec, activeAudioCodec) {
    const Class = shaka.media.PreferenceBasedCriteria;

    for (const pref of preferredAudio) {
      let candidates = variants;

      if (pref.language) {
        const byLanguage = Class.filterByLanguage_(candidates, pref.language);
        if (byLanguage.length) {
          candidates = byLanguage;
        } else {
          continue;
        }
      }

      if (pref.role) {
        const byRole =
            Class.filterVariantsByAudioRole_(candidates, pref.role);
        if (byRole.length) {
          candidates = byRole;
        } else {
          continue;
        }
      }

      if (pref.label) {
        const byLabel =
            Class.filterVariantsByAudioLabel_(candidates, pref.label);
        if (byLabel.length) {
          candidates = byLabel;
        } else {
          continue;
        }
      }

      if (pref.channelCount) {
        const byChannel = Class.filterVariantsByAudioChannelCount_(
            candidates, pref.channelCount);
        if (byChannel.length) {
          candidates = byChannel;
        } else {
          continue;
        }
      }

      // Build codec list: preference codec + runtime codecs
      const codecs = [];
      if (pref.codec) {
        codecs.push(pref.codec);
      }
      if (audioCodec) {
        codecs.push(audioCodec);
      }
      if (activeAudioCodec) {
        codecs.push(activeAudioCodec);
      }
      // Remove duplicates
      const uniqueCodecs =
          codecs.filter((c, i) => codecs.indexOf(c) === i);
      if (uniqueCodecs.length) {
        let codecMatched = false;
        for (const codec of uniqueCodecs) {
          // The runtime codecs come from tracks, which stand for every
          // profile of their codec family (e.g. HE-AAC and AAC-LC).
          const byCodec = Class.filterVariantsByAudioCodec_(
              candidates, codec, /* normalize= */ codec != pref.codec);
          if (byCodec.length) {
            candidates = byCodec;
            codecMatched = true;
            break;
          }
        }
        if (!codecMatched && pref.codec) {
          // If the preference explicitly specified a codec and it didn't
          // match, skip this entry
          continue;
        }
      }

      if (pref.spatialAudio !== undefined) {
        const bySpatial = Class.filterVariantsBySpatialAudio_(
            candidates, pref.spatialAudio);
        if (bySpatial.length) {
          candidates = bySpatial;
        } else {
          continue;
        }
      }

      if (candidates.length) {
        return candidates;
      }
    }

    // If no audio preferences or none matched, try runtime codec preferences
    // on all variants, then fall back to primary → all.
    let current = variants;

    // Apply runtime codec preferences even without audio preference entries
    const runtimeCodecs = [];
    if (audioCodec) {
      runtimeCodecs.push(audioCodec);
    }
    if (activeAudioCodec) {
      runtimeCodecs.push(activeAudioCodec);
    }
    const uniqueRuntimeCodecs =
        runtimeCodecs.filter((c, i) => runtimeCodecs.indexOf(c) === i);
    if (uniqueRuntimeCodecs.length) {
      for (const codec of uniqueRuntimeCodecs) {
        const byCodec = Class.filterVariantsByAudioCodec_(
            current, codec, /* normalize= */ true);
        if (byCodec.length) {
          current = byCodec;
          break;
        }
      }
    }

    const byPrimary = current.filter((variant) => variant.primary);
    if (byPrimary.length) {
      return byPrimary;
    }
    return current;
  }

  /**
   * Apply video preference entries in priority order.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!Array<!shaka.extern.VideoPreference>} preferredVideo
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static applyVideoPreferences_(variants, preferredVideo) {
    const Class = shaka.media.PreferenceBasedCriteria;

    for (const pref of preferredVideo) {
      let candidates = variants;

      if (pref.role) {
        const byRole =
            Class.filterVariantsByVideoRole_(candidates, pref.role);
        if (byRole.length) {
          candidates = byRole;
        } else {
          continue;
        }
      }

      if (pref.language) {
        const byLanguage =
            Class.filterVariantsByVideoLanguage_(candidates, pref.language);
        if (byLanguage.length) {
          candidates = byLanguage;
        } else {
          continue;
        }
      }

      if (pref.label) {
        const byLabel =
            Class.filterVariantsByVideoLabel_(candidates, pref.label);
        if (byLabel.length) {
          candidates = byLabel;
        } else {
          continue;
        }
      }

      if (pref.hdrLevel) {
        const byHdr = Class.filterVariantsByHDRLevel_(
            candidates, pref.hdrLevel);
        if (byHdr.length) {
          candidates = byHdr;
        } else {
          continue;
        }
      }

      if (pref.layout) {
        const byLayout = Class.filterVariantsByVideoLayout_(
            candidates, pref.layout);
        if (byLayout.length) {
          candidates = byLayout;
        } else {
          continue;
        }
      }

      if (pref.codec) {
        const byCodec = Class.filterVariantsByVideoCodec_(
            candidates, pref.codec);
        if (byCodec.length) {
          candidates = byCodec;
        } else {
          continue;
        }
      }

      if (candidates.length) {
        return candidates;
      }
    }

    // No preferences matched or no preferences given - return input
    return variants;
  }

  /**
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} preferredLanguage
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterByLanguage_(variants, preferredLanguage) {
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {string} */
    const preferredLocale = LanguageUtils.normalize(preferredLanguage);

    /** @type {?string} */
    const closestLocale = LanguageUtils.findClosestLocale(
        preferredLocale,
        variants.map((variant) => LanguageUtils.getLocaleForVariant(variant)));

    // There were no locales close to what we preferred.
    if (!closestLocale) {
      return [];
    }

    // Find the variants that use the closest variant.
    return variants.filter((variant) => {
      return closestLocale == LanguageUtils.getLocaleForVariant(variant);
    });
  }

  /**
   * Filter Variants by audio role.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} preferredRole
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByAudioRole_(variants, preferredRole) {
    return variants.filter((variant) => {
      if (!variant.audio) {
        return false;
      }

      if (preferredRole) {
        return variant.audio.roles.includes(preferredRole);
      } else {
        return variant.audio.roles.length == 0;
      }
    });
  }

  /**
   * Filter Variants by video role.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} preferredRole
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByVideoRole_(variants, preferredRole) {
    return variants.filter((variant) => {
      if (!variant.video) {
        return false;
      }

      if (preferredRole) {
        return variant.video.roles.includes(preferredRole);
      } else {
        return variant.video.roles.length == 0;
      }
    });
  }

  /**
   * Filter Variants by video language. Used to disambiguate video tracks
   * that share the same role but differ in language, e.g. multiple
   * sign-language video tracks.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} preferredLanguage
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByVideoLanguage_(variants, preferredLanguage) {
    const LanguageUtils = shaka.util.LanguageUtils;
    const preferredLocale = LanguageUtils.normalize(preferredLanguage);

    return variants.filter((variant) => {
      if (!variant.video || !variant.video.language) {
        return false;
      }
      return LanguageUtils.normalize(variant.video.language) ==
          preferredLocale;
    });
  }

  /**
   * Filter Variants by audio label.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} preferredLabel
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByAudioLabel_(variants, preferredLabel) {
    return variants.filter((variant) => {
      if (!variant.audio || !variant.audio.label) {
        return false;
      }

      const label1 = variant.audio.label.toLowerCase();
      const label2 = preferredLabel.toLowerCase();
      return label1 == label2;
    });
  }

  /**
   * Filter Variants by video label.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} preferredLabel
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByVideoLabel_(variants, preferredLabel) {
    return variants.filter((variant) => {
      if (!variant.video || !variant.video.label) {
        return false;
      }

      const label1 = variant.video.label.toLowerCase();
      const label2 = preferredLabel.toLowerCase();
      return label1 == label2;
    });
  }

  /**
   * Filter Variants by channelCount.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {number} channelCount
   * @return {!Array<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByAudioChannelCount_(variants, channelCount) {
    return variants.filter((variant) => {
      // Filter variants with channel count less than or equal to desired value.
      if (variant.audio && variant.audio.channelsCount &&
          variant.audio.channelsCount > channelCount) {
        return false;
      }
      return true;
    }).sort((v1, v2) => {
      // We need to sort variants list by channels count, so the most close one
      // to desired value will be first on the list. It's important for the call
      // to shaka.media.AdaptationSet, which will base set of variants based on
      // first variant.
      if (!v1.audio && !v2.audio) {
        return 0;
      }
      if (!v1.audio) {
        return -1;
      }
      if (!v2.audio) {
        return 1;
      }
      return (v2.audio.channelsCount || 0) - (v1.audio.channelsCount || 0);
    });
  }

  /**
   * Filters variants according to the given hdr level config.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} hdrLevel
   * @private
   */
  static filterVariantsByHDRLevel_(variants, hdrLevel) {
    if (hdrLevel == 'AUTO') {
      const someHLG = variants.some((variant) => {
        if (variant.video && variant.video.hdr &&
            variant.video.hdr == 'HLG') {
          return true;
        }
        return false;
      });
      const device = shaka.device.DeviceFactory.getDevice();
      hdrLevel = device.getHdrLevel(someHLG);
    }
    return variants.filter((variant) => {
      if (variant.video && variant.video.hdr && variant.video.hdr != hdrLevel) {
        return false;
      }
      return true;
    });
  }


  /**
   * Filters variants according to the given video layout config.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} videoLayout
   * @private
   */
  static filterVariantsByVideoLayout_(variants, videoLayout) {
    return variants.filter((variant) => {
      if (variant.video && variant.video.videoLayout &&
          variant.video.videoLayout != videoLayout) {
        return false;
      }
      return true;
    });
  }


  /**
   * Filters variants according to the given spatial audio config.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {boolean} spatialAudio
   * @private
   */
  static filterVariantsBySpatialAudio_(variants, spatialAudio) {
    return variants.filter((variant) => {
      if (variant.audio && variant.audio.spatialAudio != spatialAudio) {
        return false;
      }
      return true;
    });
  }


  /**
   * Filters variants according to the given audio codec.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} audioCodec
   * @param {boolean} normalize If true, any codec of the same family matches.
   * @private
   */
  static filterVariantsByAudioCodec_(variants, audioCodec, normalize) {
    const MimeUtils = shaka.util.MimeUtils;
    const expected =
        normalize ? MimeUtils.getNormalizedCodec(audioCodec) : audioCodec;
    return variants.filter((variant) => {
      if (!variant.audio) {
        return true;
      }
      const codec = normalize ?
          MimeUtils.getNormalizedCodec(variant.audio.codecs) :
          variant.audio.codecs;
      return codec == expected;
    });
  }


  /**
   * Filters variants according to the given video codec.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {string} videoCodec
   * @private
   */
  static filterVariantsByVideoCodec_(variants, videoCodec) {
    return variants.filter((variant) => {
      if (variant.video && variant.video.codecs != videoCodec) {
        return false;
      }
      return true;
    });
  }
};
