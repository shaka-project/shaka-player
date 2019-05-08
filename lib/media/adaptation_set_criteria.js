/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.media.AdaptationSetCriteria');
goog.provide('shaka.media.ExampleBasedCriteria');
goog.provide('shaka.media.PreferenceBasedCriteria');

goog.require('shaka.media.AdaptationSet');


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
   */
  constructor(example) {
    /** @private {shaka.extern.Variant} */
    this.example_ = example;

    // We can't know what role is really the most important, so we don't use
    // role for this.
    const role = '';
    const channelCount = example.audio && example.audio.channelsCount ?
                         example.audio.channelsCount :
                         0;

    /** @private {!shaka.media.AdaptationSetCriteria} */
    this.fallback_ = new shaka.media.PreferenceBasedCriteria(
        example.language, role, channelCount);
  }

  /** @override */
  create(variants) {
    // We can't assume that the example is |variants| because it could actually
    // be from another period.
    const shortList = variants.filter((variant) => {
      return shaka.media.AdaptationSet.areAdaptable(this.example_, variant);
    });

    if (shortList.length) {
      // Use the first item in the short list as the root. It should not matter
      // which element we use as all items in the short list should already be
      // compatible.
      return new shaka.media.AdaptationSet(shortList[0], shortList);
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
   */
  constructor(language, role, channelCount) {
    /** @private {string} */
    this.language_ = language;
    /** @private {string} */
    this.role_ = role;
    /** @private {number} */
    this.channelCount_ = channelCount;
  }

  /** @override */
  create(variants) {
    const Class = shaka.media.PreferenceBasedCriteria;
    const StreamUtils = shaka.util.StreamUtils;

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

    // Now refine the choice based on role preference.
    if (this.role_) {
      const byRole = Class.filterVariantsByRole_(current, this.role_);
      if (byRole.length) {
        current = byRole;
      } else {
        shaka.log.warning('No exact match for variant role could be found.');
      }
    }

    if (this.channelCount_) {
      const byChannel = StreamUtils.filterVariantsByAudioChannelCount(
          current, this.channelCount_);
      if (byChannel.length) {
        current = byChannel;
      } else {
        shaka.log.warning(
            'No exact match for the channel count could be found.');
      }
    }

    // Make sure we only return a valid adaptation set.
    const set = new shaka.media.AdaptationSet(current[0]);
    for (const variant of current) {
      if (set.canInclude(variant)) {
        set.add(variant);
      }
    }

    return set;
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
      const audio = variant.audio;
      const video = variant.video;
      return (audio && audio.roles.indexOf(preferredRole) >= 0) ||
             (video && video.roles.indexOf(preferredRole) >= 0);
    });
  }
};
