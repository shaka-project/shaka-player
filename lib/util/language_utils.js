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
 * @namespace shaka.util.LanguageUtils
 * @summary A set of language utility functions.
 */


/**
 * Compares two language tags as defined by RFC 5646 and ISO 639.  The
 * comparison takes sublanguages into account via the |fuzz| parameter.
 * The caller is expected to normalize the inputs first.
 *
 * @see shaka.util.LanguageUtils.normalize()
 * @see IETF RFC 5646
 * @see ISO 639
 *
 * @param {shaka.util.LanguageUtils.MatchType} fuzz What kind of match is
 *   acceptable.
 * @param {string} preference The user's preferred language tag.
 * @param {string} candidate An available language tag.
 * @return {boolean}
 */
shaka.util.LanguageUtils.match = function(fuzz, preference, candidate) {
  // Alias.
  var LanguageUtils = shaka.util.LanguageUtils;

  goog.asserts.assert(preference == LanguageUtils.normalize(preference),
                      'Language pref should be normalized first');
  goog.asserts.assert(candidate == LanguageUtils.normalize(candidate),
                      'Language candidate should be normalized first');

  if (candidate == preference) {
    return true;
  }

  if (fuzz >= shaka.util.LanguageUtils.MatchType.BASE_LANGUAGE_OKAY &&
      candidate == preference.split('-')[0]) {
    return true;
  }

  if (fuzz >= shaka.util.LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY &&
      candidate.split('-')[0] == preference.split('-')[0]) {
    return true;
  }

  return false;
};


/**
 * A match type for fuzzy-matching logic.
 *
 * @enum {number}
 */
shaka.util.LanguageUtils.MatchType = {
  /** Accepts an exact match. */
  EXACT: 0,
  /** Accepts a less-specific version of the preferred sublanguage. */
  BASE_LANGUAGE_OKAY: 1,
  /** Accepts a different sublanguage of the preferred base language. */
  OTHER_SUB_LANGUAGE_OKAY: 2
};


/**
 * Normalize the language tag.
 *
 * RFC 5646 specifies that language tags are case insensitive and that the
 * shortest representation of the base language should always be used.
 * This will convert the tag to lower-case and map 3-letter codes (ISO 639-2)
 * to 2-letter codes (ISO 639-1) whenever possible.
 *
 * @param {string} lang
 * @return {string}
 *
 * @see IETF RFC 5646
 * @see ISO 639
 */
shaka.util.LanguageUtils.normalize = function(lang) {
  var fields = lang.toLowerCase().split('-');
  var base = fields[0];
  var replacement = shaka.util.LanguageUtils.isoMap_[base];
  if (replacement) {
    fields[0] = replacement;
  }
  return fields.join('-');
};


/**
 * A map from 3-letter language codes (ISO 639-2) to 2-letter language codes
 * (ISO 639-1) for all languages which have both in the registry.
 *
 * @const {!Object.<string, string>}
 * @private
 */
shaka.util.LanguageUtils.isoMap_ = {
  'aar': 'aa', 'abk': 'ab', 'afr': 'af', 'aka': 'ak', 'alb': 'sq', 'amh': 'am',
  'ara': 'ar', 'arg': 'an', 'arm': 'hy', 'asm': 'as', 'ava': 'av', 'ave': 'ae',
  'aym': 'ay', 'aze': 'az', 'bak': 'ba', 'bam': 'bm', 'baq': 'eu', 'bel': 'be',
  'ben': 'bn', 'bih': 'bh', 'bis': 'bi', 'bod': 'bo', 'bos': 'bs', 'bre': 'br',
  'bul': 'bg', 'bur': 'my', 'cat': 'ca', 'ces': 'cs', 'cha': 'ch', 'che': 'ce',
  'chi': 'zh', 'chu': 'cu', 'chv': 'cv', 'cor': 'kw', 'cos': 'co', 'cre': 'cr',
  'cym': 'cy', 'cze': 'cs', 'dan': 'da', 'deu': 'de', 'div': 'dv', 'dut': 'nl',
  'dzo': 'dz', 'ell': 'el', 'eng': 'en', 'epo': 'eo', 'est': 'et', 'eus': 'eu',
  'ewe': 'ee', 'fao': 'fo', 'fas': 'fa', 'fij': 'fj', 'fin': 'fi', 'fra': 'fr',
  'fre': 'fr', 'fry': 'fy', 'ful': 'ff', 'geo': 'ka', 'ger': 'de', 'gla': 'gd',
  'gle': 'ga', 'glg': 'gl', 'glv': 'gv', 'gre': 'el', 'grn': 'gn', 'guj': 'gu',
  'hat': 'ht', 'hau': 'ha', 'heb': 'he', 'her': 'hz', 'hin': 'hi', 'hmo': 'ho',
  'hrv': 'hr', 'hun': 'hu', 'hye': 'hy', 'ibo': 'ig', 'ice': 'is', 'ido': 'io',
  'iii': 'ii', 'iku': 'iu', 'ile': 'ie', 'ina': 'ia', 'ind': 'id', 'ipk': 'ik',
  'isl': 'is', 'ita': 'it', 'jav': 'jv', 'jpn': 'ja', 'kal': 'kl', 'kan': 'kn',
  'kas': 'ks', 'kat': 'ka', 'kau': 'kr', 'kaz': 'kk', 'khm': 'km', 'kik': 'ki',
  'kin': 'rw', 'kir': 'ky', 'kom': 'kv', 'kon': 'kg', 'kor': 'ko', 'kua': 'kj',
  'kur': 'ku', 'lao': 'lo', 'lat': 'la', 'lav': 'lv', 'lim': 'li', 'lin': 'ln',
  'lit': 'lt', 'ltz': 'lb', 'lub': 'lu', 'lug': 'lg', 'mac': 'mk', 'mah': 'mh',
  'mal': 'ml', 'mao': 'mi', 'mar': 'mr', 'may': 'ms', 'mkd': 'mk', 'mlg': 'mg',
  'mlt': 'mt', 'mon': 'mn', 'mri': 'mi', 'msa': 'ms', 'mya': 'my', 'nau': 'na',
  'nav': 'nv', 'nbl': 'nr', 'nde': 'nd', 'ndo': 'ng', 'nep': 'ne', 'nld': 'nl',
  'nno': 'nn', 'nob': 'nb', 'nor': 'no', 'nya': 'ny', 'oci': 'oc', 'oji': 'oj',
  'ori': 'or', 'orm': 'om', 'oss': 'os', 'pan': 'pa', 'per': 'fa', 'pli': 'pi',
  'pol': 'pl', 'por': 'pt', 'pus': 'ps', 'que': 'qu', 'roh': 'rm', 'ron': 'ro',
  'rum': 'ro', 'run': 'rn', 'rus': 'ru', 'sag': 'sg', 'san': 'sa', 'sin': 'si',
  'slk': 'sk', 'slo': 'sk', 'slv': 'sl', 'sme': 'se', 'smo': 'sm', 'sna': 'sn',
  'snd': 'sd', 'som': 'so', 'sot': 'st', 'spa': 'es', 'sqi': 'sq', 'srd': 'sc',
  'srp': 'sr', 'ssw': 'ss', 'sun': 'su', 'swa': 'sw', 'swe': 'sv', 'tah': 'ty',
  'tam': 'ta', 'tat': 'tt', 'tel': 'te', 'tgk': 'tg', 'tgl': 'tl', 'tha': 'th',
  'tib': 'bo', 'tir': 'ti', 'ton': 'to', 'tsn': 'tn', 'tso': 'ts', 'tuk': 'tk',
  'tur': 'tr', 'twi': 'tw', 'uig': 'ug', 'ukr': 'uk', 'urd': 'ur', 'uzb': 'uz',
  'ven': 've', 'vie': 'vi', 'vol': 'vo', 'wel': 'cy', 'wln': 'wa', 'wol': 'wo',
  'xho': 'xh', 'yid': 'yi', 'yor': 'yo', 'zha': 'za', 'zho': 'zh', 'zul': 'zu'
};

