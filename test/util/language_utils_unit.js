/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('LanguageUtils', () => {
  const LanguageUtils = shaka.util.LanguageUtils;

  describe('areLocaleCompatible', () => {
    it('works for language', () => {
      expect(LanguageUtils.areLocaleCompatible('en', 'en')).toBeTruthy();
      expect(LanguageUtils.areLocaleCompatible('en', 'fr')).toBeFalsy();
    });

    it('works for language and region', () => {
      expect(LanguageUtils.areLocaleCompatible('en-US', 'en-US')).toBeTruthy();
      expect(LanguageUtils.areLocaleCompatible('en-US', 'en-CA')).toBeFalsy();
    });

    it('ignores dialect', () => {
      expect(LanguageUtils.areLocaleCompatible(
          'en-US-tx', 'en-US-wa')).toBeTruthy();
    });
  });

  describe('areLanguageCompatible', () => {
    it('works for language', () => {
      expect(LanguageUtils.areLanguageCompatible('en', 'en')).toBeTruthy();
      expect(LanguageUtils.areLanguageCompatible('en', 'fr')).toBeFalsy();
    });

    it('works for language and region', () => {
      expect(LanguageUtils.areLanguageCompatible(
          'en-US', 'en-US')).toBeTruthy();
      expect(LanguageUtils.areLanguageCompatible(
          'en-US', 'en-CA')).toBeTruthy();
      expect(LanguageUtils.areLanguageCompatible('en-CA', 'fr-CA')).toBeFalsy();
    });

    it('works for dialects', () => {
      expect(LanguageUtils.areLanguageCompatible(
          'en-US-tx', 'en-US-wa')).toBeTruthy();
    });
  });

  describe('isSiblingOf', () => {
    it('accepts self', () => {
      expect(LanguageUtils.isSiblingOf('en-US', 'en-US')).toBeTruthy();
    });

    it('rejects other languages', () => {
      expect(LanguageUtils.isSiblingOf('en-CA', 'fr-CA')).toBeFalsy();
    });

    it('requires region', () => {
      expect(LanguageUtils.isSiblingOf('en', 'en')).toBeFalsy();
      expect(LanguageUtils.isSiblingOf('en-US', 'en')).toBeFalsy();
    });
  });

  describe('isParentOf', () => {
    it('rejects self', () => {
      expect(LanguageUtils.isParentOf('en', 'en')).toBeFalsy();
    });

    it('rejects other languages', () => {
      expect(LanguageUtils.isParentOf('en', 'fr')).toBeFalsy();
    });

    it('requires region', () => {
      expect(LanguageUtils.isParentOf('en', 'en-US')).toBeTruthy();
      expect(LanguageUtils.isParentOf('en', 'en-CA')).toBeTruthy();
    });
  });

  describe('findClosestLocale', () => {
    it('returns null when nothing is found', () => {
      const options = ['fr', 'en', 'es'];
      const empty = [];

      expect(LanguageUtils.findClosestLocale('zh', options)).toBe(null);
      expect(LanguageUtils.findClosestLocale('zh', empty)).toBe(null);
    });

    it('finds locale compatible matches', () => {
      const options = ['fr', 'en', 'en-US', 'es'];

      expect(LanguageUtils.findClosestLocale('en', options)).toBe('en');
      expect(LanguageUtils.findClosestLocale('en-US', options)).toBe('en-US');
    });

    it('find language matches', () => {
      const options = ['en', 'fr', 'en-CA'];
      // Should pick 'en' over 'en-CA'.
      expect(LanguageUtils.findClosestLocale('en-US', options)).toBe('en');
    });

    it('finds language compatible matches', () => {
      const options = ['en-CA', 'en-US'];

      // Should return the first one that is language-compatible.
      expect(LanguageUtils.findClosestLocale('en-UK', options)).toBe('en-CA');
    });
  });

  describe('normalize', () => {
    it('standardizes base language', () => {
      expect(LanguageUtils.normalize('eng')).toBe('en');
      expect(LanguageUtils.normalize('ENG')).toBe('en');
      expect(LanguageUtils.normalize('EN')).toBe('en');
    });

    it('standardized region', () => {
      expect(LanguageUtils.normalize('en-US')).toBe('en-US');
      expect(LanguageUtils.normalize('en-us')).toBe('en-US');
    });

    it('ignored unknown base languages', () => {
      expect(LanguageUtils.normalize('elvish')).toBe('elvish');
      expect(LanguageUtils.normalize(
          'elvish-woodland')).toBe('elvish-WOODLAND');
    });
  });

  describe('getLocaleForText', () => {
    const notNormalEnglish = 'eng';
    const english = 'en';

    it('normalizes language', () => {
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

  describe('getLocaleForVariant', () => {
    const notNormalEnglish = 'eng';
    const english = 'en';
    const french = 'fr';

    it('normalizes language from variant', () => {
      const variant = makeVariant(notNormalEnglish, '', '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('normalizes language from audio', () => {
      const variant = makeVariant('', notNormalEnglish, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('normalizes language from video', () => {
      const variant = makeVariant('', '', notNormalEnglish);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in variant', () => {
      const variant = makeVariant(english, '', '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in audio stream', () => {
      const variant = makeVariant('', english, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('gets language when only in video stream', () => {
      const variant = makeVariant('', '', english);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', () => {
      const variant = makeVariant(english, french, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', () => {
      const variant = makeVariant(english, french, '');
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers variant over video', () => {
      const variant = makeVariant(english, '', french);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('prefers audio over video', () => {
      const variant = makeVariant('', english, french);
      expect(LanguageUtils.getLocaleForVariant(variant)).toBe(english);
    });

    it('falls back to und', () => {
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
