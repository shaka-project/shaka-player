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

describe('LanguageUtils', function() {
  describe('areLocaleCompatible', function() {
    const areLocaleCompatible = shaka.util.LanguageUtils.areLocaleCompatible;

    it('works for language', function() {
      expect(areLocaleCompatible('en', 'en')).toBeTruthy();
      expect(areLocaleCompatible('en', 'fr')).toBeFalsy();
    });

    it('works for language and region', function() {
      expect(areLocaleCompatible('en-US', 'en-US')).toBeTruthy();
      expect(areLocaleCompatible('en-US', 'en-CA')).toBeFalsy();
    });

    it('ignores dialect', function() {
      expect(areLocaleCompatible('en-US-tx', 'en-US-wa')).toBeTruthy();
    });
  });


  describe('areLanguageCompatible', function() {
    const LanguageUtils = shaka.util.LanguageUtils;
    const areLanguageCompatible = LanguageUtils.areLanguageCompatible;

    it('works for language', function() {
      expect(areLanguageCompatible('en', 'en')).toBeTruthy();
      expect(areLanguageCompatible('en', 'fr')).toBeFalsy();
    });

    it('works for language and region', function() {
      expect(areLanguageCompatible('en-US', 'en-US')).toBeTruthy();
      expect(areLanguageCompatible('en-US', 'en-CA')).toBeTruthy();
      expect(areLanguageCompatible('en-CA', 'fr-CA')).toBeFalsy();
    });

    it('works for dialects', function() {
      expect(areLanguageCompatible('en-US-tx', 'en-US-wa')).toBeTruthy();
    });
  });

  describe('isSiblingOf', function() {
    const isSiblingOf = shaka.util.LanguageUtils.isSiblingOf;

    it('accepts self', function() {
      expect(isSiblingOf('en-US', 'en-US')).toBeTruthy();
    });

    it('rejects other languages', function() {
      expect(isSiblingOf('en-CA', 'fr-CA')).toBeFalsy();
    });

    it('requires region', function() {
      expect(isSiblingOf('en', 'en')).toBeFalsy();
      expect(isSiblingOf('en-US', 'en')).toBeFalsy();
    });
  });

  describe('isParentOf', function() {
    const isParentOf = shaka.util.LanguageUtils.isParentOf;

    it('rejects self', function() {
      expect(isParentOf('en', 'en')).toBeFalsy();
    });

    it('rejects other languages', function() {
      expect(isParentOf('en', 'fr')).toBeFalsy();
    });

    it('requires region', function() {
      expect(isParentOf('en', 'en-US')).toBeTruthy();
      expect(isParentOf('en', 'en-CA')).toBeTruthy();
    });
  });

  describe('findClosestLocale', function() {
    const findClosestLocale = shaka.util.LanguageUtils.findClosestLocale;

    it('returns null when nothing is found', function() {
      const options = ['fr', 'en', 'es'];
      const empty = [];

      expect(findClosestLocale('zh', options)).toBe(null);
      expect(findClosestLocale('zh', empty)).toBe(null);
    });

    it('finds locale compatible matches', function() {
      const options = ['fr', 'en', 'en-US', 'es'];

      expect(findClosestLocale('en', options)).toBe('en');
      expect(findClosestLocale('en-US', options)).toBe('en-US');
    });

    it('find language matches', function() {
      const options = ['en', 'fr', 'en-CA'];
      // Should pick 'en' over 'en-CA'.
      expect(findClosestLocale('en-US', options)).toBe('en');
    });

    it('finds language compatible matches', function() {
      const options = ['en-CA', 'en-US'];

      // Should return the first one that is language-compatible.
      expect(findClosestLocale('en-UK', options)).toBe('en-CA');
    });
  });

  describe('normalize', function() {
    const normalize = shaka.util.LanguageUtils.normalize;

    it('standardizes base language', function() {
      expect(normalize('eng')).toBe('en');
      expect(normalize('ENG')).toBe('en');
      expect(normalize('EN')).toBe('en');
    });

    it('standardized region', function() {
      expect(normalize('en-US')).toBe('en-US');
      expect(normalize('en-us')).toBe('en-US');
    });

    it('ignored unknown base languages', function() {
      expect(normalize('elvish')).toBe('elvish');
      expect(normalize('elvish-woodland')).toBe('elvish-WOODLAND');
    });
  });

  describe('getLanguageForText', function() {
    const getLocaleForText = shaka.util.LanguageUtils.getLocaleForText;

    const notNormalEnglish = 'eng';
    const english = 'en';

    it('normalizes language', function() {
      const stream = makeTextStream(notNormalEnglish);
      expect(getLocaleForText(stream)).toBe(english);
    });

    /**
     * @param {string} language
     * @return {shaka.extern.Stream}
     */
    function makeTextStream(language) {
      const sparse = {
        type: shaka.util.ManifestParserUtils.ContentType.TEXT,
        language: language,
      };

      return /** @type {shaka.extern.Stream} */ (sparse);
    }
  });

  describe('getLanguageForVariant', function() {
    const LanguageUtils = shaka.util.LanguageUtils;
    const getLocaleForVariant = LanguageUtils.getLocaleForVariant;

    const notNormalEnglish = 'eng';
    const english = 'en';
    const french = 'fr';

    it('normalizes language from variant', function() {
      const variant = makeVariant(notNormalEnglish, '', '');
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('normalizes language from audio', function() {
      const variant = makeVariant('', notNormalEnglish, '');
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('normalizes language from video', function() {
      const variant = makeVariant('', '', notNormalEnglish);
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in variant', function() {
      const variant = makeVariant(english, '', '');
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in audio stream', function() {
      const variant = makeVariant('', english, '');
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in video stream', function() {
      const variant = makeVariant('', '', english);
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', function() {
      const variant = makeVariant(english, french, '');
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', function() {
      const variant = makeVariant(english, french, '');
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over video', function() {
      const variant = makeVariant(english, '', french);
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers audio over video', function() {
      const variant = makeVariant('', english, french);
      expect(getLocaleForVariant(variant)).toBe(english);
    });

    it('falls back to und', function() {
      const variant = makeVariant('', '', '');
      expect(getLocaleForVariant(variant)).toBe('und');
    });

    /**
     * @param {string} variantLanguage
     * @param {string} audioLanguage
     * @param {string} videoLanguage
     * @return {shaka.extern.Variant}
     */
    function makeVariant(variantLanguage, audioLanguage, videoLanguage) {
      // This returns a subset of the fields that would be in a variant.
      // However, we know that we are only operating on the language fields
      // so we are going to be lazy and only set them.
      const sparse = {
        language: variantLanguage,
        audio: {
          language: audioLanguage,
        },
        video: {
          language: videoLanguage,
        },
      };

      // Cast the sparse object to a variant to make closure happy.
      return /** @type {shaka.extern.Variant} */ (sparse);
    }
  });
});
