/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:words العربية

describe('LanguageUtils (UI)', () => {
  const LanguageUtils = shaka.ui.LanguageUtils;

  describe('looksLikeUnresolvedCode_', () => {
    /**
     * @param {string} name
     * @return {boolean}
     * @suppress {accessControls}
     */
    const looksLikeUnresolvedCode = (name) =>
      LanguageUtils.looksLikeUnresolvedCode_(name);

    it('rejects strings that are just a raw language code', () => {
      expect(looksLikeUnresolvedCode('dse')).toBe(true);
      expect(looksLikeUnresolvedCode('zzz')).toBe(true);
      expect(looksLikeUnresolvedCode('sgn')).toBe(true);
      expect(looksLikeUnresolvedCode('xx (YY)')).toBe(true);
    });

    it('accepts real, title-cased display names', () => {
      expect(looksLikeUnresolvedCode('English')).toBe(false);
      expect(looksLikeUnresolvedCode('Ewe')).toBe(false);
      expect(looksLikeUnresolvedCode('American Sign Language')).toBe(false);
    });

    it('accepts names in scripts without letter case', () => {
      expect(looksLikeUnresolvedCode('العربية')).toBe(false);
      expect(looksLikeUnresolvedCode('中文')).toBe(false);
    });
  });

  describe('getLanguageName', () => {
    /** @type {!shaka.ui.Localization} */
    let localization;

    beforeEach(() => {
      localization = new shaka.ui.Localization('en');
      shaka.ui.Locales.addTo(localization);
    });

    it('resolves well-known languages', () => {
      expect(LanguageUtils.getLanguageName('en', localization, true))
          .toBe('English');
    });

    it('does not show a raw re-canonicalized code as a language name', () => {
      // Regression test for
      // https://github.com/shaka-project/shaka-player/issues/10198
      // Some ICU implementations canonicalize the deprecated 'sgn-NL' tag to
      // 'dse' and, lacking a display name for it, echo 'dse' back verbatim.
      // We must not present that string as if it were a real language name.
      const name = LanguageUtils.getLanguageName('sgn-NL', localization, true);
      expect(name).not.toBe('Dse');
      expect(name).not.toBe('dse');
    });

    it('resolves the deprecated sgn-XX form to its RFC 5645 replacement',
        () => {
          expect(LanguageUtils.getLanguageName('sgn-US', localization, true))
              .toBe('American Sign Language');
          expect(LanguageUtils.getLanguageName('sgn-NL', localization, true))
              .toBe('Dutch Sign Language');
          expect(LanguageUtils.getLanguageName('sgn-FR', localization, true))
              .toBe('French Sign Language');
        });

    it('resolves sign-language names without Intl.DisplayNames', () => {
      // preferIntlDisplayNames=false must still work, proving the name
      // comes from our own table and not from the platform.
      expect(LanguageUtils.getLanguageName('sgn-NL', localization, false))
          .toBe('Dutch Sign Language');
      expect(LanguageUtils.getLanguageName('sgn-US', localization, false))
          .toBe('American Sign Language');
    });

    it('resolves the plain ISO 639-3 sign-language code directly', () => {
      // Some manifests may already use the modern code instead of the
      // deprecated 'sgn-XX' form.
      expect(LanguageUtils.getLanguageName('dse', localization, false))
          .toBe('Dutch Sign Language');
    });
  });
});
