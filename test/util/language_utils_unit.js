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
  const LanguageUtils = shaka.util.LanguageUtils;

  describe('areLocaleCompatible', function() {
    it('works for language', function() {
      expect(LanguageUtils.areLocaleCompatible('en', 'en')).toBeTruthy();
      expect(LanguageUtils.areLocaleCompatible('en', 'fr')).toBeFalsy();
    });

    it('works for language and region', function() {
      expect(LanguageUtils.areLocaleCompatible('en-US', 'en-US')).toBeTruthy();
      expect(LanguageUtils.areLocaleCompatible('en-US', 'en-CA')).toBeFalsy();
    });

    it('ignores dialect', function() {
      expect(LanguageUtils.areLocaleCompatible(
          'en-US-tx', 'en-US-wa')).toBeTruthy();
    });
  });

  describe('areLanguageCompatible', function() {
    it('works for language', function() {
      expect(LanguageUtils.areLanguageCompatible('en', 'en')).toBeTruthy();
      expect(LanguageUtils.areLanguageCompatible('en', 'fr')).toBeFalsy();
    });

    it('works for language and region', function() {
      expect(LanguageUtils.areLanguageCompatible(
          'en-US', 'en-US')).toBeTruthy();
      expect(LanguageUtils.areLanguageCompatible(
          'en-US', 'en-CA')).toBeTruthy();
      expect(LanguageUtils.areLanguageCompatible('en-CA', 'fr-CA')).toBeFalsy();
    });

    it('works for dialects', function() {
      expect(LanguageUtils.areLanguageCompatible(
          'en-US-tx', 'en-US-wa')).toBeTruthy();
    });
  });

  describe('isSiblingOf', function() {
    it('accepts self', function() {
      expect(LanguageUtils.isSiblingOf('en-US', 'en-US')).toBeTruthy();
    });

    it('rejects other languages', function() {
      expect(LanguageUtils.isSiblingOf('en-CA', 'fr-CA')).toBeFalsy();
    });

    it('requires region', function() {
      expect(LanguageUtils.isSiblingOf('en', 'en')).toBeFalsy();
      expect(LanguageUtils.isSiblingOf('en-US', 'en')).toBeFalsy();
    });
  });

  describe('isParentOf', function() {
    it('rejects self', function() {
      expect(LanguageUtils.isParentOf('en', 'en')).toBeFalsy();
    });

    it('rejects other languages', function() {
      expect(LanguageUtils.isParentOf('en', 'fr')).toBeFalsy();
    });

    it('requires region', function() {
      expect(LanguageUtils.isParentOf('en', 'en-US')).toBeTruthy();
      expect(LanguageUtils.isParentOf('en', 'en-CA')).toBeTruthy();
    });
  });

  describe('findClosestLocale', function() {
    it('returns null when nothing is found', function() {
      const options = ['fr', 'en', 'es'];
      const empty = [];

      expect(LanguageUtils.findClosestLocale('zh', options)).toBe(null);
      expect(LanguageUtils.findClosestLocale('zh', empty)).toBe(null);
    });

    it('finds locale compatible matches', function() {
      const options = ['fr', 'en', 'en-US', 'es'];

      expect(LanguageUtils.findClosestLocale('en', options)).toBe('en');
      expect(LanguageUtils.findClosestLocale('en-US', options)).toBe('en-US');
    });

    it('find language matches', function() {
      const options = ['en', 'fr', 'en-CA'];
      // Should pick 'en' over 'en-CA'.
      expect(LanguageUtils.findClosestLocale('en-US', options)).toBe('en');
    });

    it('finds language compatible matches', function() {
      const options = ['en-CA', 'en-US'];

      // Should return the first one that is language-compatible.
      expect(LanguageUtils.findClosestLocale('en-UK', options)).toBe('en-CA');
    });
  });

  describe('normalize', function() {
    it('standardizes base language', function() {
      expect(LanguageUtils.normalize('eng')).toBe('en');
      expect(LanguageUtils.normalize('ENG')).toBe('en');
      expect(LanguageUtils.normalize('EN')).toBe('en');
    });

    it('standardized region', function() {
      expect(LanguageUtils.normalize('en-US')).toBe('en-US');
      expect(LanguageUtils.normalize('en-us')).toBe('en-US');
    });

    it('ignored unknown base languages', function() {
      expect(LanguageUtils.normalize('elvish')).toBe('elvish');
      expect(LanguageUtils.normalize(
          'elvish-woodland')).toBe('elvish-WOODLAND');
    });
  });

  describe('getLocaleForText', function() {
    const notNormalEnglish = 'eng';
    const english = 'en';

    it('normalizes language', function() {
      const stream = makeTextStream(notNormalEnglish);
      expect(LanguageUtils.getLocaleForText(stream)).toBe(english);
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

  describe('getLocaleForVariant', function() {
    const notNormalEnglish = 'eng';
    const english = 'en';
    const french = 'fr';

    it('normalizes language from variant', function() {
      const variant = makeVariant(notNormalEnglish, '', '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('normalizes language from audio', function() {
      const variant = makeVariant('', notNormalEnglish, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('normalizes language from video', function() {
      const variant = makeVariant('', '', notNormalEnglish);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in variant', function() {
      const variant = makeVariant(english, '', '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in audio stream', function() {
      const variant = makeVariant('', english, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in video stream', function() {
      const variant = makeVariant('', '', english);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', function() {
      const variant = makeVariant(english, french, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', function() {
      const variant = makeVariant(english, french, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over video', function() {
      const variant = makeVariant(english, '', french);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers audio over video', function() {
      const variant = makeVariant('', english, french);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('falls back to und', function() {
      const variant = makeVariant('', '', '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe('und');
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
