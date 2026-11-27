/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:words العربية Italiano

describe('LanguageUtils (UI)', () => {
  const LanguageUtils = shaka.ui.LanguageUtils;

  // https://github.com/shaka-project/shaka-player/issues/11055
  describe('updateTextTracks', () => {
    /** @type {!shaka.ui.Localization} */
    let localization;
    /** @type {!HTMLElement} */
    let menu;
    /** @type {!HTMLElement} */
    let currentSelection;
    /** @type {!shaka.extern.UIConfiguration} */
    let config;

    beforeEach(() => {
      localization = new shaka.ui.Localization('en');
      shaka.ui.Locales.addTo(localization);
      menu = shaka.util.Dom.createHTMLElement('div');
      const backButton = shaka.util.Dom.createButton();
      backButton.classList.add('shaka-back-to-overflow-button');
      menu.appendChild(backButton);
      currentSelection = shaka.util.Dom.createHTMLElement('span');
      config = /** @type {!shaka.extern.UIConfiguration} */ (
        /** @type {?} */ ({
          textTrackLabelFormat: shaka.ui.Overlay.TrackLabelFormat.LANGUAGE,
          preferIntlDisplayNames: false,
          customTrackLabel: null,
        }));
    });

    /**
     * @param {number} id
     * @param {?shaka.media.ManifestParser.AccessibilityPurpose} purpose
     * @param {boolean} active
     * @return {shaka.extern.TextTrack}
     */
    const makeTrack = (id, purpose, active) => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(id, (stream) => {
          stream.language = 'it';
          stream.accessibilityPurpose = purpose;
        });
      });
      const track =
          shaka.util.StreamUtils.textStreamToTrack(manifest.textStreams[0]);
      track.active = active;
      return track;
    };

    /**
     * @param {boolean} hohActive
     * @return {!Array<string>}
     */
    const update = (hohActive) => {
      const HARD_OF_HEARING =
          shaka.media.ManifestParser.AccessibilityPurpose.HARD_OF_HEARING;
      const tracks = [
        makeTrack(1, null, !hohActive),
        makeTrack(2, HARD_OF_HEARING, hohActive),
      ];
      LanguageUtils.updateTextTracks(tracks, menu, () => {},
          /* updateChosen= */ true, currentSelection, localization, config);
      return Array.from(menu.querySelectorAll('[role="menuitemradio"]'))
          .map((button) => button.textContent);
    };

    it('lists tracks that differ only in accessibility purpose', () => {
      expect(update(/* hohActive= */ false))
          .toEqual(['Italiano', 'Italiano (SDH)']);
    });

    it('marks the active hard of hearing track as chosen', () => {
      update(/* hohActive= */ true);
      const chosen = menu.querySelectorAll('[aria-checked="true"]');
      expect(chosen.length).toBe(1);
      expect(chosen[0].textContent).toBe('Italiano (SDH)');
      expect(currentSelection.textContent).toBe('Italiano (SDH)');
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

    it('accepts localized names that begin with a lowercase letter', () => {
      if (!window.Intl || !('DisplayNames' in Intl)) {
        pending('Intl.DisplayNames is unavailable');
      }
      localization.changeLocale(['fr']);
      expect(LanguageUtils.getLanguageName('en', localization, true))
          .toBe('Anglais');
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
