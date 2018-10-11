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
    const getLanguageForText = shaka.util.LanguageUtils.getLanguageForText;

    const notNormalEnglish = 'eng';
    const english = 'en';

    it('normalizes language', function() {
      const stream = makeTextStream(notNormalEnglish);
      expect(getLanguageForText(stream)).toBe(english);
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
    const getLanguageForVariant = LanguageUtils.getLanguageForVariant;

    const notNormalEnglish = 'eng';
    const english = 'en';
    const french = 'fr';

    it('normalizes language from variant', function() {
      const variant = makeVariant(notNormalEnglish, '', '');
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('normalizes language from audio', function() {
      const variant = makeVariant('', notNormalEnglish, '');
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('normalizes language from video', function() {
      const variant = makeVariant('', '', notNormalEnglish);
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('gets language when only in variant', function() {
      const variant = makeVariant(english, '', '');
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('gets language when only in audio stream', function() {
      const variant = makeVariant('', english, '');
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('gets language when only in video stream', function() {
      const variant = makeVariant('', '', english);
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', function() {
      const variant = makeVariant(english, french, '');
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('prefers variant over audio', function() {
      const variant = makeVariant(english, french, '');
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('prefers variant over video', function() {
      const variant = makeVariant(english, '', french);
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('prefers audio over video', function() {
      const variant = makeVariant('', english, french);
      expect(getLanguageForVariant(variant)).toBe(english);
    });

    it('falls back to und', function() {
      const variant = makeVariant('', '', '');
      expect(getLanguageForVariant(variant)).toBe('und');
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
