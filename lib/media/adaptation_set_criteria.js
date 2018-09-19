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
   */
  static filterByLanguage_(variants, preferredLanguage) {
    const LanguageUtils = shaka.util.LanguageUtils;

    preferredLanguage = LanguageUtils.normalize(preferredLanguage);

    if (!preferredLanguage) {
      return [];
    }

    // Order from best to worst.
    const matchTypes = [
        LanguageUtils.MatchType.EXACT,
        LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
        LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
    ];

    for (const matchType of matchTypes) {
      const matching = variants.filter((variant) => {
        const language = LanguageUtils.normalize(variant.language);
        return LanguageUtils.match(matchType, preferredLanguage, language);
      });

      // Since we are going from best to worst, we can stop once we find a
      // group with items.
      if (matching.length) {
        return matching;
      }
    }

    return [];
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
