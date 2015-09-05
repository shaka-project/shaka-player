/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview language_utils.js unit tests.
 */

goog.require('shaka.util.LanguageUtils');

describe('LanguageUtils', function() {
  var LanguageUtils;

  beforeAll(function() {
    LanguageUtils = shaka.util.LanguageUtils;
  });

  describe('match with sublanguage preference', function() {
    it('matches exactly at fuzz level 0', function() {
      expect(LanguageUtils.match(0, 'en-us', 'en-us')).toBeTruthy();
      expect(LanguageUtils.match(0, 'en-us', 'en-gb')).toBeFalsy();
      expect(LanguageUtils.match(0, 'en-us', 'en')).toBeFalsy();
    });

    it('accepts base languages at fuzz level 1', function() {
      expect(LanguageUtils.match(1, 'en-us', 'en-us')).toBeTruthy();
      expect(LanguageUtils.match(1, 'en-us', 'en-gb')).toBeFalsy();
      expect(LanguageUtils.match(1, 'en-us', 'en')).toBeTruthy();
    });

    it('accepts all related languages at fuzz level 2', function() {
      expect(LanguageUtils.match(2, 'en-us', 'en-us')).toBeTruthy();
      expect(LanguageUtils.match(2, 'en-us', 'en-gb')).toBeTruthy();
      expect(LanguageUtils.match(2, 'en-us', 'en')).toBeTruthy();
    });
  });

  describe('match with base language preference', function() {
    it('matches exactly at fuzz level 0', function() {
      expect(LanguageUtils.match(0, 'en', 'en-us')).toBeFalsy();
      expect(LanguageUtils.match(0, 'en', 'en-gb')).toBeFalsy();
      expect(LanguageUtils.match(0, 'en', 'en')).toBeTruthy();
    });

    it('does not accept anything additional at fuzz level 1', function() {
      expect(LanguageUtils.match(1, 'en', 'en-us')).toBeFalsy();
      expect(LanguageUtils.match(1, 'en', 'en-gb')).toBeFalsy();
      expect(LanguageUtils.match(1, 'en', 'en')).toBeTruthy();
    });

    it('accepts all related languages at fuzz level 2', function() {
      expect(LanguageUtils.match(2, 'en', 'en-us')).toBeTruthy();
      expect(LanguageUtils.match(2, 'en', 'en-gb')).toBeTruthy();
      expect(LanguageUtils.match(2, 'en', 'en')).toBeTruthy();
    });
  });

  describe('normalize', function() {
    it('maps all three codes for Greek to the same value', function() {
      var code1 = 'el';
      var code2 = 'ell';
      var code3 = 'gre';
      expect(LanguageUtils.normalize(code1)).toBe(code1);
      expect(LanguageUtils.normalize(code2)).toBe(code1);
      expect(LanguageUtils.normalize(code3)).toBe(code1);
    });
  });
});

