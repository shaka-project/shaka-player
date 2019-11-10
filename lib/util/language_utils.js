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

goog.provide('shaka.util.LanguageUtils');

goog.require('goog.asserts');


/**
 * @summary A set of language utility functions.
 * @final
 */
shaka.util.LanguageUtils = class {
  /**
   * Check if |locale1| and |locale2| are locale-compatible.
   *
   * Locale-compatible is defined as all components in each locale match. Since
   * we only respect the language and region components, we only check that
   * the language and region components match.
   *
   * Examples:
   *  Locale A | Locale B | Locale Compatible
   *  ---------------------------------------
   *  en-US    | en-US    | true
   *  en       | en-US    | false
   *  en-US    | en-CA    | false
   *
   * @param {string} locale1
   * @param {string} locale2
   * @return {boolean}
   */
  static areLocaleCompatible(locale1, locale2) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // Even through they SHOULD already be normalized, let's just be safe and
    // do it again.
    locale1 = LanguageUtils.normalize(locale1);
    locale2 = LanguageUtils.normalize(locale2);

    return locale1 == locale2;
  }

  /**
   * Check if |locale1| and |locale2| are language-compatible.
   *
   * Language compatible is when the language component of each locale matches.
   * This means that no matter what region they have (or don't have) as long as
   * the language components match, they are language-compatible.
   *
   * Examples:
   *  Locale A | Locale B | Language-Compatible
   *  -----------------------------------------
   *  en-US    | en-US    | true
   *  en-US    | en       | true
   *  en-US    | en-CA    | true
   *  en-CA    | fr-CA    | false
   *
   * @param {string} locale1
   * @param {string} locale2
   * @return {boolean}
   */
  static areLanguageCompatible(locale1, locale2) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // Even through they SHOULD already be normalized, let's just be safe and
    // do it again.
    locale1 = LanguageUtils.normalize(locale1);
    locale2 = LanguageUtils.normalize(locale2);

    // Get all components. This should only be language and region
    // since we do not support dialect.
    /** @type {!Array.<string>} */
    const locale1Components = LanguageUtils.disassembleLocale_(locale1);
    /** @type {!Array.<string>} */
    const locale2Components = LanguageUtils.disassembleLocale_(locale2);

    // We are language compatible if we have the same language.
    return locale1Components[0] == locale2Components[0];
  }

  /**
   * Check if |possibleParent| is the parent locale of |possibleChild|. Because
   * we do not support dialects, the parent-child relationship is a lot simpler.
   * In a parent child relationship:
   *    - The parent and child have the same language-component
   *    - The parent has no region-component
   *    - The child has a region-component
   *
   * Example:
   *  Locale A | Locale B | Is A The parent of B?
   *  --------------------------------------------
   *  en-US    | en-US    | no
   *  en-US    | en       | no
   *  en       | en-US    | yes
   *  en       | en       | no
   *  en       | fr       | no
   *
   * @param {string} possibleParent
   * @param {string} possibleChild
   * @return {boolean}
   */
  static isParentOf(possibleParent, possibleChild) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // Even through they SHOULD already be normalized, let's just be safe and
    // do it again.
    possibleParent = LanguageUtils.normalize(possibleParent);
    possibleChild = LanguageUtils.normalize(possibleChild);

    // Get all components. This should only be language and region
    // since we do not support dialect.
    /** @type {!Array.<string>} */
    const possibleParentComponents =
        LanguageUtils.disassembleLocale_(possibleParent);
    /** @type {!Array.<string>} */
    const possibleChildComponents =
        LanguageUtils.disassembleLocale_(possibleChild);

    return possibleParentComponents[0] == possibleChildComponents[0] &&
           possibleParentComponents.length == 1 &&
           possibleChildComponents.length == 2;
  }

  /**
   * Check if |localeA| shares the same parent with |localeB|. Since we don't
   * support dialect, we will only look at language and region. For two locales
   * to be siblings:
   *    - Both must have language-components
   *    - Both must have region-components
   *    - Both must have the same language-component
   *
   * Example:
   *  Locale A | Locale B | Siblings?
   *  --------------------------------------------
   *  en-US    | en-US    | yes
   *  en-US    | en-CA    | yes
   *  en-US    | en       | no
   *  en       | en-US    | no
   *  en       | en       | no
   *  en       | fr       | no
   *
   * @param {string} localeA
   * @param {string} localeB
   * @return {boolean}
   */
  static isSiblingOf(localeA, localeB) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // Even through they SHOULD already be normalized, let's just be safe and
    // do it again.
    localeA = LanguageUtils.normalize(localeA);
    localeB = LanguageUtils.normalize(localeB);

    // Get all components. This should only be language and region
    // since we do not support dialect.
    /** @type {!Array.<string>} */
    const localeAComponents = LanguageUtils.disassembleLocale_(localeA);
    /** @type {!Array.<string>} */
    const localeBComponents = LanguageUtils.disassembleLocale_(localeB);

    return localeAComponents.length == 2 &&
           localeBComponents.length == 2 &&
           localeAComponents[0] == localeBComponents[0];
  }

  /**
   * Normalize a locale. This will take a locale and canonicalize it to a state
   * that we are prepared to work with.
   *
   * We only support with:
   *   - language
   *   - language-REGION
   *
   * If given a dialect, we will discard it. We will convert any 3-character
   * codes to 2-character codes. We will force language codes to lowercase and
   * region codes to uppercase.
   *
   * @param {string} locale
   * @return {string}
   */
  static normalize(locale) {
    const LanguageUtils = shaka.util.LanguageUtils;

    const components = locale.split('-');

    // We are only going to use the language and the region. If there was
    // a dialect or anything else, we are throwing it a way.
    let language = components[0] || '';
    let region = components[1] || '';

    // Convert the language to lower case. It is standard for the language code
    // to be in lower case, but it will also make the map look-up easier.
    language = language.toLowerCase();
    language = LanguageUtils.isoMap_.get(language) || language;

    // Convert the region to upper case. It is standard for the region to be in
    // upper case. If there is no upper code, then it will be an empty string
    // and this will be a no-op.
    region = region.toUpperCase();

    return region ?
           language + '-' + region :
           language;
  }

  /**
   * Check if two language codes are siblings. Language codes are siblings if
   * they share the same base language while neither one is the base language.
   *
   * For example, "en-US" and "en-CA" are siblings but "en-US" and "en" are not
   * siblings.
   *
   * @param {string} a
   * @param {string} b
   * @return {boolean}
   */
  static areSiblings(a, b) {
    const LanguageUtils = shaka.util.LanguageUtils;

    const baseA = LanguageUtils.getBase(a);
    const baseB = LanguageUtils.getBase(b);

    return a != baseA && b != baseB && baseA == baseB;
  }

  /**
   * Get the normalized base language for a language code.
   *
   * @param {string} lang
   * @return {string}
   */
  static getBase(lang) {
    const LanguageUtils = shaka.util.LanguageUtils;

    const splitAt = lang.indexOf('-');
    let major;

    if (splitAt >= 0) {
      major = lang.substring(0, splitAt);
    } else {
      major = lang;
    }

    // Convert the major code to lower case. It is standard for the major code
    // to be in lower case, but it will also make the map look-up easier.
    major = major.toLowerCase();
    major = LanguageUtils.isoMap_.get(major) || major;

    return major;
  }

  /**
   * Get the normalized language of the given text stream. Will return 'und' if
   * a language is not found on the text stream.
   *
   * This should always be used to get the language from a text stream.
   *
   * @param {shaka.extern.Stream} stream
   * @return {string}
   */
  static getLocaleForText(stream) {
    const LanguageUtils = shaka.util.LanguageUtils;

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    goog.asserts.assert(
        stream.type == ContentType.TEXT,
        'Can only get language from text streams');

    const language = stream.language || 'und';
    return LanguageUtils.normalize(language);
  }

  /**
   * Get the normalized locale for the given variant. This will look through
   * the variant to find the locale that represents the content in the variant.
   * This will return 'und' if no language can be found.
   *
   * This should always be used to get the locale from a variant.
   *
   * @param {shaka.extern.Variant} variant
   * @return {string}
   */
  static getLocaleForVariant(variant) {
    const LanguageUtils = shaka.util.LanguageUtils;

    // Our preference order is:
    //  1. Variant
    //  2. Audio Stream
    //  3. Video Stream
    //
    // We are going to consider all falsy strings to be invalid locales, this
    // will include empty strings.
    if (variant.language) {
      return LanguageUtils.normalize(variant.language);
    }

    if (variant.audio && variant.audio.language) {
      return LanguageUtils.normalize(variant.audio.language);
    }

    if (variant.video && variant.video.language) {
      return LanguageUtils.normalize(variant.video.language);
    }

    // No language was found, but we still want to return a valid string.
    return 'und';
  }

  /**
   * Find the locale in |searchSpace| that comes closest to |target|. If no
   * locale is found to be close to |target|, then |null| will be returned.
   *
   * @param {string} target
   * @param {!Iterable.<string>} searchSpace
   * @return {?string}
   */
  static findClosestLocale(target, searchSpace) {
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {string} */
    const safeTarget = LanguageUtils.normalize(target);
    /** @type {!Set.<string>} */
    const safeSearchSpace = new Set();
    for (const option of searchSpace) {
      safeSearchSpace.add(LanguageUtils.normalize(option));
    }

    // Preference 1 - The option is an exact match. For example, "en-US" is an
    //    exact match of "en-US". So if there is an option that is an exact
    //    match, it would be the best match possible.
    for (const option of safeSearchSpace) {
      if (option == safeTarget) {
        return option;
      }
    }

    // Preference 2 - The option is the parent of the target. For example,
    //    "en" is the parent of "en-US". So if there is an option with
    //    "en", it should be good enough when our preference is "en-US".
    for (const option of safeSearchSpace) {
      if (LanguageUtils.isParentOf(option, safeTarget)) {
        return option;
      }
    }

    // Preference 3 - The option is a sibling of the target. For example,
    //    "en-US" is a sibling of "en-CA". So if there is an option with
    //    "en_CA", it should be good enough when our preference is "en-US".
    for (const option of safeSearchSpace) {
      if (LanguageUtils.isSiblingOf(option, safeTarget)) {
        return option;
      }
    }

    // Preference 4 - The option is a child of the target. For example,
    //    "en-US" is the child of "en". SO it there is an option with
    //    "en-US", it should be good enough when our preference is "en".
    for (const option of safeSearchSpace) {
      if (LanguageUtils.isParentOf(safeTarget, option)) {
        return option;
      }
    }

    // Failed to find anything.
    return null;
  }

  /**
   * Take a locale string and break it into its component. Check that each
   * component matches what we would expect internally for locales. This
   * should ONLY be used to verify locales that have been normalized.
   *
   * @param {string} locale
   * @return {!Array.<string>}
   * @private
   */
  static disassembleLocale_(locale) {
    const components = locale.split('-');

    goog.asserts.assert(
        components.length <= 2,
        [
          'Locales should not have more than 2 components. ',
          locale,
          ' has too many components.',
        ].join());

    return components;
  }
};


/**
 * A map from 3-letter language codes (ISO 639-2) to 2-letter language codes
 * (ISO 639-1) for all languages which have both in the registry.
 *
 * @const {!Map.<string, string>}
 * @private
 */
shaka.util.LanguageUtils.isoMap_ = new Map([
  ['aar', 'aa'], ['abk', 'ab'], ['afr', 'af'], ['aka', 'ak'], ['alb', 'sq'],
  ['amh', 'am'], ['ara', 'ar'], ['arg', 'an'], ['arm', 'hy'], ['asm', 'as'],
  ['ava', 'av'], ['ave', 'ae'], ['aym', 'ay'], ['aze', 'az'], ['bak', 'ba'],
  ['bam', 'bm'], ['baq', 'eu'], ['bel', 'be'], ['ben', 'bn'], ['bih', 'bh'],
  ['bis', 'bi'], ['bod', 'bo'], ['bos', 'bs'], ['bre', 'br'], ['bul', 'bg'],
  ['bur', 'my'], ['cat', 'ca'], ['ces', 'cs'], ['cha', 'ch'], ['che', 'ce'],
  ['chi', 'zh'], ['chu', 'cu'], ['chv', 'cv'], ['cor', 'kw'], ['cos', 'co'],
  ['cre', 'cr'], ['cym', 'cy'], ['cze', 'cs'], ['dan', 'da'], ['deu', 'de'],
  ['div', 'dv'], ['dut', 'nl'], ['dzo', 'dz'], ['ell', 'el'], ['eng', 'en'],
  ['epo', 'eo'], ['est', 'et'], ['eus', 'eu'], ['ewe', 'ee'], ['fao', 'fo'],
  ['fas', 'fa'], ['fij', 'fj'], ['fin', 'fi'], ['fra', 'fr'], ['fre', 'fr'],
  ['fry', 'fy'], ['ful', 'ff'], ['geo', 'ka'], ['ger', 'de'], ['gla', 'gd'],
  ['gle', 'ga'], ['glg', 'gl'], ['glv', 'gv'], ['gre', 'el'], ['grn', 'gn'],
  ['guj', 'gu'], ['hat', 'ht'], ['hau', 'ha'], ['heb', 'he'], ['her', 'hz'],
  ['hin', 'hi'], ['hmo', 'ho'], ['hrv', 'hr'], ['hun', 'hu'], ['hye', 'hy'],
  ['ibo', 'ig'], ['ice', 'is'], ['ido', 'io'], ['iii', 'ii'], ['iku', 'iu'],
  ['ile', 'ie'], ['ina', 'ia'], ['ind', 'id'], ['ipk', 'ik'], ['isl', 'is'],
  ['ita', 'it'], ['jav', 'jv'], ['jpn', 'ja'], ['kal', 'kl'], ['kan', 'kn'],
  ['kas', 'ks'], ['kat', 'ka'], ['kau', 'kr'], ['kaz', 'kk'], ['khm', 'km'],
  ['kik', 'ki'], ['kin', 'rw'], ['kir', 'ky'], ['kom', 'kv'], ['kon', 'kg'],
  ['kor', 'ko'], ['kua', 'kj'], ['kur', 'ku'], ['lao', 'lo'], ['lat', 'la'],
  ['lav', 'lv'], ['lim', 'li'], ['lin', 'ln'], ['lit', 'lt'], ['ltz', 'lb'],
  ['lub', 'lu'], ['lug', 'lg'], ['mac', 'mk'], ['mah', 'mh'], ['mal', 'ml'],
  ['mao', 'mi'], ['mar', 'mr'], ['may', 'ms'], ['mkd', 'mk'], ['mlg', 'mg'],
  ['mlt', 'mt'], ['mon', 'mn'], ['mri', 'mi'], ['msa', 'ms'], ['mya', 'my'],
  ['nau', 'na'], ['nav', 'nv'], ['nbl', 'nr'], ['nde', 'nd'], ['ndo', 'ng'],
  ['nep', 'ne'], ['nld', 'nl'], ['nno', 'nn'], ['nob', 'nb'], ['nor', 'no'],
  ['nya', 'ny'], ['oci', 'oc'], ['oji', 'oj'], ['ori', 'or'], ['orm', 'om'],
  ['oss', 'os'], ['pan', 'pa'], ['per', 'fa'], ['pli', 'pi'], ['pol', 'pl'],
  ['por', 'pt'], ['pus', 'ps'], ['que', 'qu'], ['roh', 'rm'], ['ron', 'ro'],
  ['rum', 'ro'], ['run', 'rn'], ['rus', 'ru'], ['sag', 'sg'], ['san', 'sa'],
  ['sin', 'si'], ['slk', 'sk'], ['slo', 'sk'], ['slv', 'sl'], ['sme', 'se'],
  ['smo', 'sm'], ['sna', 'sn'], ['snd', 'sd'], ['som', 'so'], ['sot', 'st'],
  ['spa', 'es'], ['sqi', 'sq'], ['srd', 'sc'], ['srp', 'sr'], ['ssw', 'ss'],
  ['sun', 'su'], ['swa', 'sw'], ['swe', 'sv'], ['tah', 'ty'], ['tam', 'ta'],
  ['tat', 'tt'], ['tel', 'te'], ['tgk', 'tg'], ['tgl', 'tl'], ['tha', 'th'],
  ['tib', 'bo'], ['tir', 'ti'], ['ton', 'to'], ['tsn', 'tn'], ['tso', 'ts'],
  ['tuk', 'tk'], ['tur', 'tr'], ['twi', 'tw'], ['uig', 'ug'], ['ukr', 'uk'],
  ['urd', 'ur'], ['uzb', 'uz'], ['ven', 've'], ['vie', 'vi'], ['vol', 'vo'],
  ['wel', 'cy'], ['wln', 'wa'], ['wol', 'wo'], ['xho', 'xh'], ['yid', 'yi'],
  ['yor', 'yo'], ['zha', 'za'], ['zho', 'zh'], ['zul', 'zu'],
]);
