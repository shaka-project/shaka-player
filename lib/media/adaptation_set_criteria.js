/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.AdaptationSetCriteria');
goog.provide('shaka.media.ExampleBasedCriteria');
goog.provide('shaka.media.PreferenceBasedCriteria');

goog.require('shaka.config.CodecSwitchingStrategy');
goog.require('shaka.log');
goog.require('shaka.media.AdaptationSet');
goog.require('shaka.media.Capabilities');
goog.require('shaka.util.LanguageUtils');


/**
 * An adaptation set criteria is a unit of logic that can take a set of
 * variants and return a subset of variants that should (and can) be
 * adapted between.
 *
 * @interface
 */
shaka.media.AdaptationSetCriteria = class {
  /**
   * Take a set of variants, and return a subset of variants that can be
   * adapted between.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @return {!shaka.media.AdaptationSet}
   */
  create(variants) {}
};


/**
 * @implements {shaka.media.AdaptationSetCriteria}
 * @final
 */
shaka.media.ExampleBasedCriteria = class {
  /**
   * @param {shaka.extern.Variant} example
   * @param {shaka.config.CodecSwitchingStrategy=} codecSwitchingStrategy
   * @param {boolean=} enableAudioGroups
   */
  constructor(example,
      codecSwitchingStrategy = shaka.config.CodecSwitchingStrategy.RELOAD,
      enableAudioGroups = false) {
    /** @private {shaka.extern.Variant} */
    this.example_ = example;
    /** @private {shaka.config.CodecSwitchingStrategy} */
    this.codecSwitchingStrategy_ = codecSwitchingStrategy;
    /** @private {boolean} */
    this.enableAudioGroups_ = enableAudioGroups;


    // We can't know if role and label are really important, so we don't use
    // role and label for this.
    const role = '';
    const label = '';
    const hdrLevel = '';
    const videoLayout = '';
    const channelCount = example.audio && example.audio.channelsCount ?
                         example.audio.channelsCount :
                         0;

    /** @private {!shaka.media.AdaptationSetCriteria} */
    this.fallback_ = new shaka.media.PreferenceBasedCriteria(
        example.language, role, channelCount, hdrLevel, videoLayout, label,
        codecSwitchingStrategy, enableAudioGroups);
  }

  /** @override */
  create(variants) {
    const supportsSmoothCodecTransitions = this.codecSwitchingStrategy_ ==
      shaka.config.CodecSwitchingStrategy.SMOOTH &&
        shaka.media.Capabilities.isChangeTypeSupported();
    // We can't assume that the example is in |variants| because it could
    // actually be from another period.
    const shortList = variants.filter((variant) => {
      return shaka.media.AdaptationSet.areAdaptable(this.example_, variant,
          !supportsSmoothCodecTransitions, this.enableAudioGroups_);
    });

    if (shortList.length) {
      // Use the first item in the short list as the root. It should not matter
      // which element we use as all items in the short list should already be
      // compatible.
      return new shaka.media.AdaptationSet(shortList[0], shortList,
          !supportsSmoothCodecTransitions, this.enableAudioGroups_);
    } else {
      return this.fallback_.create(variants);
    }
  }
};


/**
 * @implements {shaka.media.AdaptationSetCriteria}
 * @final
 */
shaka.media.PreferenceBasedCriteria = class {
  /**
   * @param {string} language
   * @param {string} role
   * @param {number} channelCount
   * @param {string} hdrLevel
   * @param {string} videoLayout
   * @param {string=} label
   * @param {shaka.config.CodecSwitchingStrategy=} codecSwitchingStrategy
   * @param {boolean=} enableAudioGroups
   */
  constructor(language, role, channelCount, hdrLevel, videoLayout, label = '',
      codecSwitchingStrategy = shaka.config.CodecSwitchingStrategy.RELOAD,
      enableAudioGroups = false) {
    /** @private {string} */
    this.language_ = language;
    /** @private {string} */
    this.role_ = role;
    /** @private {number} */
    this.channelCount_ = channelCount;
    /** @private {string} */
    this.hdrLevel_ = hdrLevel;
    /** @private {string} */
    this.videoLayout_ = videoLayout;
    /** @private {string} */
    this.label_ = label;
    /** @private {shaka.config.CodecSwitchingStrategy} */
    this.codecSwitchingStrategy_ = codecSwitchingStrategy;
    /** @private {boolean} */
    this.enableAudioGroups_ = enableAudioGroups;
  }

  /** @override */
  create(variants) {
    const Class = shaka.media.PreferenceBasedCriteria;

    let current = [];

    const byLanguage = Class.filterByLanguage_(variants, this.language_);
    const byPrimary = variants.filter((variant) => variant.primary);

    if (byLanguage.length) {
      current = byLanguage;
    } else if (byPrimary.length) {
      current = byPrimary;
    } else {
      current = variants;
    }

    // Now refine the choice based on role preference.  Even the empty string
    // works here, and will match variants without any roles.
    const byRole = Class.filterVariantsByRole_(current, this.role_);
    if (byRole.length) {
      current = byRole;
    } else {
      shaka.log.warning('No exact match for variant role could be found.');
    }

    if (this.videoLayout_) {
      const byVideoLayout = Class.filterVariantsByVideoLayout_(
          current, this.videoLayout_);
      if (byVideoLayout.length) {
        current = byVideoLayout;
      } else {
        shaka.log.warning(
            'No exact match for the video layout could be found.');
      }
    }

    if (this.hdrLevel_) {
      const byHdrLevel = Class.filterVariantsByHDRLevel_(
          current, this.hdrLevel_);
      if (byHdrLevel.length) {
        current = byHdrLevel;
      } else {
        shaka.log.warning(
            'No exact match for the hdr level could be found.');
      }
    }

    if (this.channelCount_) {
      const byChannel = Class.filterVariantsByAudioChannelCount_(
          current, this.channelCount_);
      if (byChannel.length) {
        current = byChannel;
      } else {
        shaka.log.warning(
            'No exact match for the channel count could be found.');
      }
    }

    if (this.label_) {
      const byLabel = Class.filterVariantsByLabel_(current, this.label_);
      if (byLabel.length) {
        current = byLabel;
      } else {
        shaka.log.warning('No exact match for variant label could be found.');
      }
    }

    const supportsSmoothCodecTransitions = this.codecSwitchingStrategy_ ==
      shaka.config.CodecSwitchingStrategy.SMOOTH &&
        shaka.media.Capabilities.isChangeTypeSupported();

    return new shaka.media.AdaptationSet(current[0], current,
        !supportsSmoothCodecTransitions, this.enableAudioGroups_);
  }

  /**
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {string} preferredLanguage
   * @return {!Array.<shaka.extern.Variant>}
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
   * Filter Variants by role.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {string} preferredRole
   * @return {!Array.<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByRole_(variants, preferredRole) {
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
   * Filter Variants by label.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {string} preferredLabel
   * @return {!Array.<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByLabel_(variants, preferredLabel) {
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
   * Filter Variants by channelCount.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {number} channelCount
   * @return {!Array.<shaka.extern.Variant>}
   * @private
   */
  static filterVariantsByAudioChannelCount_(variants, channelCount) {
    return variants.filter((variant) => {
      if (variant.audio && variant.audio.channelsCount &&
          variant.audio.channelsCount != channelCount) {
        return false;
      }
      return true;
    });
  }

  /**
   * Filters variants according to the given hdr level config.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {string} hdrLevel
   * @private
   */
  static filterVariantsByHDRLevel_(variants, hdrLevel) {
    if (hdrLevel == 'AUTO') {
      // Auto detect the ideal HDR level.
      if (window.matchMedia('(color-gamut: p3)').matches) {
        hdrLevel = 'PQ';
      } else {
        hdrLevel = 'SDR';
      }
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
   * @param {!Array.<shaka.extern.Variant>} variants
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
};
