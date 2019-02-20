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

describe('Localization', function() {
  const Localization = shaka.ui.Localization;

  // https://bit.ly/2PbzxlD
  const DWARFISH = 'dwarfish';
  const DWARFISH_NORTH = 'dwarfish-NORTH';
  const DWARFISH_SOUTH = 'dwarfish-SOUTH';

  const ELVISH = 'elvish';
  const ELVISH_WOODLAND = 'elvish-WOODLAND';

  const HALFLING = 'halfling';
  const HALFLING_COMMON = 'halfling-COMMON';
  const HALFLING_RIVER = 'halfling-RIVER';
  const HALFLING_SHIRE = 'halfling-SHIRE';

  describe('insert', function() {
    const EN_US = 'en-US';

    it('can add new data', function() {
      /** @type {!shaka.ui.Localization} */
      const localization = new Localization(EN_US);
      localization.insert(EN_US, new Map([
        ['hello', 'howdy'],
        ['good-bye', 'cheerio'],
      ]));

      expect(localization.resolve('hello')).toBe('howdy');
      expect(localization.resolve('good-bye')).toBe('cheerio');
    });

    it('can replace old data when adding new data', function() {
      /** @type {!shaka.ui.Localization} */
      const localization = new Localization(EN_US);
      localization.insert(EN_US, new Map([
        ['hello', 'howdy'],
        ['good-bye', 'cheerio'],
      ]));

      expect(localization.resolve('hello')).toBe('howdy');
      expect(localization.resolve('good-bye')).toBe('cheerio');

      localization.insert(EN_US, new Map([
        ['good-bye', 'farewell'],
        ['thank-you', 'thank-you'],
      ]));

      expect(localization.resolve('hello')).toBe('howdy');
      expect(localization.resolve('good-bye')).toBe('farewell');
      expect(localization.resolve('thank-you')).toBe('thank-you');
    });

    it('can keep old data when adding new', function() {
      const USE_OLD = Localization.ConflictResolution.USE_OLD;

      /** @type {!shaka.ui.Localization} */
      const localization = new Localization(EN_US);
      localization.insert(EN_US, new Map([
        ['hello', 'howdy'],
        ['good-bye', 'cheerio'],
      ]));

      expect(localization.resolve('hello')).toBe('howdy');
      expect(localization.resolve('good-bye')).toBe('cheerio');

      localization.insert(EN_US, new Map([
        ['hello', 'greetings'],
        ['good-bye', 'farewell'],
        ['thank-you', 'thank-you'],
      ]), USE_OLD);

      // Nothing should have changed.
      expect(localization.resolve('hello')).toBe('howdy');
      expect(localization.resolve('good-bye')).toBe('cheerio');
      expect(localization.resolve('thank-you')).toBe('thank-you');
    });
  });

  describe('locale fallback', () => {
    const KEY = 'KEY';

    const FALLBACK = 'FALLBACK';
    const FALLBACK_VALUE = 'FALLBACK VALUE';

    const ELVISH_VALUE = 'ELVISH VALUE';

    const HALFLING_COMMON_VALUE = 'HALFLING-COMMON VALUE';
    const HALFLING_SHIRE_VALUE = 'HALFLING-SHIRE VALUE';

    /** @type {!shaka.ui.Localization} */
    let localization;

    const insert = (locale, value) => {
      localization.insert(locale, new Map([[KEY, value]]));
    };

    const testLocales = (locales, expectedValue) => {
      localization.changeLocale(locales);
      const value = localization.resolve(KEY);
      expect(value).toEqual(expectedValue);
    };

    beforeEach(() => {
      localization = new Localization(FALLBACK);

      // Insert translations to test various scenarios below:
      insert(FALLBACK, FALLBACK_VALUE);
      insert(ELVISH, ELVISH_VALUE);
      insert(HALFLING_COMMON, HALFLING_COMMON_VALUE);
      insert(HALFLING_SHIRE, HALFLING_SHIRE_VALUE);
    });

    it('resorts to final fallback for one unknown locale', () => {
      // For one locale we don't have translations for, go to the fallback.
      testLocales([DWARFISH_NORTH], FALLBACK_VALUE);
    });

    it('resorts to final fallback for multiple unknown locales', () => {
      // For multiple locales in which we don't have translations, go to the
      // fallback.
      testLocales([
        DWARFISH_NORTH,
        DWARFISH_SOUTH,
      ], FALLBACK_VALUE);
    });

    it('prefers a known locale from the list instead of final fallback', () => {
      // If we have a locale in the list for which we _do_ have translations,
      // expect to see the translated value.
      testLocales([
        DWARFISH_NORTH,
        DWARFISH_SOUTH,
        ELVISH,
      ], ELVISH_VALUE);
    });

    it('prefers the first known locale from the list', () => {
      // If we have multiple locales in the list for which we _do_ have
      // translations, expect to see the translated value from the first one.
      testLocales([
        DWARFISH_NORTH,
        DWARFISH_SOUTH,
        HALFLING_COMMON,
        ELVISH,
      ], HALFLING_COMMON_VALUE);
    });

    it('finds translations from the parent locale', () => {
      // If we have a locale in the list for which we have a region-less
      // translation, expect to see the translated value.
      testLocales([ELVISH_WOODLAND], ELVISH_VALUE);
    });

    it('finds translations from a locale with a different region', () => {
      // If there's a locale in the list for which we have translations in a
      // sibling locale (same language, different region), expect to see that
      // value.  Common is chosen over shire because equivalent-distance locales
      // are alphabetically sorted to break ties.
      testLocales([HALFLING_RIVER], HALFLING_COMMON_VALUE);
    });

    it('finds translations from a child locale', () => {
      // If there's a locale in the list for which we have translations in a
      // child locale (same language, but for a specific region), expect to see
      // that value.  Common is chosen over shire because equivalent-distance
      // locales are alphabetically sorted to break ties.
      testLocales([HALFLING], HALFLING_COMMON_VALUE);
    });

    it('prefers a relative of an earlier locale to an exact later one', () => {
      // If we have multiple locales in the list, and an earlier one has
      // relatives with translations, expect to see that chosen over an exact
      // match later in the list.
      testLocales([
        HALFLING,
        ELVISH,
      ], HALFLING_COMMON_VALUE);
    });
  });

  describe('unknown locales event', function() {
    it('fires when we change to a locale we have not loaded', function() {
      const events = [];

      const localization = new Localization(/* fallback */ HALFLING_COMMON);
      collectEvents(localization, Localization.UNKNOWN_LOCALES, events);

      localization.insert(HALFLING_COMMON, new Map());
      localization.changeLocale([ELVISH_WOODLAND]);

      expect(events.length).toBe(1);
      expect(events[0].locales).toEqual([ELVISH_WOODLAND]);
    });


    it('will not fire after we add the locale', function() {
      const events = [];

      const localization = new Localization(/* fallback */ HALFLING_COMMON);
      collectEvents(localization, Localization.UNKNOWN_LOCALES, events);

      // We should see an event telling us that both elvish and dwarfish are
      // missing.
      localization.insert(HALFLING_COMMON, new Map());
      localization.changeLocale([ELVISH_WOODLAND, DWARFISH_NORTH]);

      expect(events.length).toBe(1);
      expect(events[0].locales).toEqual([ELVISH_WOODLAND, DWARFISH_NORTH]);

      // We should see an event telling us that dwarfish is still missing.
      localization.insert(ELVISH_WOODLAND, new Map());
      localization.changeLocale([ELVISH_WOODLAND, DWARFISH_NORTH]);

      expect(events.length).toBe(2);
      expect(events[0].locales).toEqual([ELVISH_WOODLAND, DWARFISH_NORTH]);
      expect(events[1].locales).toEqual([DWARFISH_NORTH]);

      // There should be no more events now that we added the last language.
      localization.insert(DWARFISH_NORTH, new Map());
      localization.changeLocale([ELVISH_WOODLAND, DWARFISH_NORTH]);

      expect(events.length).toBe(2);
      expect(events[0].locales).toEqual([ELVISH_WOODLAND, DWARFISH_NORTH]);
      expect(events[1].locales).toEqual([DWARFISH_NORTH]);
    });
  });

  describe('unknown localization event', function() {
    const HOW_ARE_YOU = 'how are you';

    const HALFLING_COMMON_MAP = new Map().set(
        HOW_ARE_YOU, 'How ye this topa the mornin?');
    const HALFLING_SHIRE_MAP = new Map().set(
        HOW_ARE_YOU, 'How be the day treating ya?');
    const DWARFISH_MAP = new Map().set(
        HOW_ARE_YOU, 'You alive?');
    const DWARFISH_NORTH_MAP = new Map().set(
        HOW_ARE_YOU, 'Is the fire alive in ye soul?');
    const DWARFISH_SOUTH_MAP = new Map().set(
        HOW_ARE_YOU, 'You dead yet?');

    /** @type {!shaka.ui.Localization} */
    let localization;

    beforeEach(function() {
      localization = new shaka.ui.Localization(HALFLING_COMMON);

      // Insert every locale into the system but leave them empty. Each test
      // will add entries as they need them.
      const emptyMap = new Map();
      localization.insert(DWARFISH, emptyMap);
      localization.insert(DWARFISH_NORTH, emptyMap);
      localization.insert(DWARFISH_SOUTH, emptyMap);
      localization.insert(HALFLING_COMMON, emptyMap);
      localization.insert(HALFLING_SHIRE, emptyMap);
    });

    it('will not fire when key is found in preferred', function() {
      localization.insert(DWARFISH_NORTH, DWARFISH_NORTH_MAP);
      localization.changeLocale([DWARFISH_NORTH]);

      const events = [];
      collectEvents(localization, Localization.UNKNOWN_LOCALIZATION, events);

      // We expect to see a non-empty string returned and to see NO "missing
      // localization" events.
      expect(localization.resolve(HOW_ARE_YOU)).toBeTruthy();
      expect(events.length).toBe(0);
    });

    it('will not fire when key is found in base', function() {
      localization.insert(DWARFISH, DWARFISH_MAP);
      localization.changeLocale([DWARFISH_NORTH]);

      const events = [];
      collectEvents(localization, Localization.UNKNOWN_LOCALIZATION, events);

      // We expect to see a non-empty string returned and to see NO "missing
      // localization" events.
      expect(localization.resolve(HOW_ARE_YOU)).toBeTruthy();
      expect(events.length).toBe(0);
    });

    it('will not fire when key is found in sibling', function() {
      localization.insert(DWARFISH_SOUTH, DWARFISH_SOUTH_MAP);
      localization.changeLocale([DWARFISH_NORTH]);

      const events = [];
      collectEvents(localization, Localization.UNKNOWN_LOCALIZATION, events);

      // We expect to see a non-empty string returned and to see NO "missing
      // localization" events.
      expect(localization.resolve(HOW_ARE_YOU)).toBeTruthy();
      expect(events.length).toBe(0);
    });

    it('will not fire when key is found in fallback', function() {
      localization.insert(HALFLING_COMMON, HALFLING_COMMON_MAP);
      localization.changeLocale([DWARFISH_NORTH]);

      const events = [];
      collectEvents(localization, Localization.UNKNOWN_LOCALIZATION, events);

      // We expect to see a non-empty string returned and to see NO "missing
      // localization" events.
      expect(localization.resolve(HOW_ARE_YOU)).toBeTruthy();
      expect(events.length).toBe(0);
    });

    it('fires when key is not found', function() {
      localization.changeLocale([DWARFISH_NORTH]);

      const events = [];
      collectEvents(localization, Localization.UNKNOWN_LOCALIZATION, events);

      // When nothing is found an empty string should be returned and we should
      // see a "missing localization" event.
      expect(localization.resolve(HOW_ARE_YOU)).toBe('');
      expect(events.length).toBe(1);
    });

    // This test is similar to "missing from everything", but the difference
    // here is that the entry can be found in a locale that is not part of
    // search.
    it('fires when key is not found in fallback, siblings, base, or preferred',
        function() {
          localization.insert(HALFLING_SHIRE, HALFLING_SHIRE_MAP);
          localization.changeLocale([DWARFISH_NORTH]);

          const events = [];
          collectEvents(
              localization, Localization.UNKNOWN_LOCALIZATION, events);

          // When nothing is found an empty string should be returned and we
          // should see a "missing localization" event.
          expect(localization.resolve(HOW_ARE_YOU)).toBe('');
          expect(events.length).toBe(1);
        });
  });

  // The "missing localizations event" is fired when all preferred locales do
  // not have the requested localization but a related locale does have the
  // requested localization
  describe('missing localizations event', function() {
    it('fires when key/value is missing from preferred but found in fallback',
        function() {
          // Initialize the localization system so that we have an entry for
          // "hello" in our fallback, but not in our preferred locale.
          const localization = new Localization(HALFLING_COMMON);
          localization.insert(HALFLING_COMMON, new Map([
            ['hello', 'Hallo! Hallo! And who may you be?'],
          ]));
          localization.insert(ELVISH_WOODLAND, new Map());

          const events = [];
          collectEvents(
              localization, Localization.MISSING_LOCALIZATIONS, events);

          // Change locales should cause the missing localizations event to fire
          // and report that we are missing an entry for "hello".
          localization.changeLocale([ELVISH_WOODLAND]);

          // We should be told that we are missing an entry for "hello" because
          // it was in the fallback (HALFLING) but not our preferred language
          // (EVLISH).
          expect(events.length).toBe(1);
          expect(events[0].locales).toEqual([ELVISH_WOODLAND]);
          expect(events[0].missing).toEqual(['hello']);
        });

    it('fires when key/value is missing from preferred but found in base',
        function() {
          // Initialize the localization system so that we have an entry for
          // "Best Wishes" in our base language, but not in our preferred
          // locale.
          const localization = new Localization(HALFLING_COMMON);
          localization.insert(ELVISH_WOODLAND, new Map());
          localization.insert(ELVISH, new Map([
            ['Best Wishes', 'Merin sa haryalye alasse'],
          ]));

          const events = [];
          collectEvents(
              localization, Localization.MISSING_LOCALIZATIONS, events);

          // Change locales should cause the missing localizations event to fire
          // and report that we are missing an entry for "Best Wishes".
          localization.changeLocale([ELVISH_WOODLAND]);

          // We should be told that we are missing an entry for "Best Wishes"
          // because it was in the base (ELVISH) but not our preferred language
          // (EVLISH_WOODLAND).
          expect(events.length).toBe(1);
          expect(events[0].locales).toEqual([ELVISH_WOODLAND]);
          expect(events[0].missing).toEqual(['Best Wishes']);
        });

    it('fires when key/value is missing from preferred but found in sibling',
        function() {
          // Initialize the localization system so that we have an entry for
          // "Do you understand" in a language that shares a base language with
          // our preferred locale, but not in our preferred locale.
          const localization = new Localization(ELVISH_WOODLAND);
          localization.insert(HALFLING_COMMON, new Map());
          localization.insert(HALFLING_SHIRE, new Map([
            ['Do you understand', 'If you take my meaning.'],
          ]));

          const events = [];
          collectEvents(
              localization, Localization.MISSING_LOCALIZATIONS, events);

          // Change locales should cause the missing localizations event to fire
          // and report that we are missing an entry for "Best Wishes".
          localization.changeLocale([HALFLING_COMMON]);

          // We should be told that we are missing an entry for "Do you
          // understand" because it was in a sibling locale (HALFLING_SHIRE)
          // but not our preferred language (HALFLING_COMMON).
          expect(events.length).toBe(1);
          expect(events[0].locales).toEqual([HALFLING_COMMON]);
          expect(events[0].missing).toEqual(['Do you understand']);
        });

    it('fires when key/value is missing from some preferred languages',
        function() {
          // Initialize the localization system so that we have an entry for
          // "may your forge burn bright" in our second preference but not our
          // first.
          const localization = new Localization(HALFLING_COMMON);
          localization.insert(HALFLING_COMMON, new Map());
          localization.insert(ELVISH_WOODLAND, new Map());
          localization.insert(DWARFISH_NORTH, new Map([
            ['may your forge burn bright', 'tan menu selek lanun khun'],
          ]));

          const events = [];
          collectEvents(
              localization, Localization.MISSING_LOCALIZATIONS, events);

          // Changing locales should not fire the missing localization event
          // because the localization for "may your forge burn bright" can
          // be found in our secondary preferred language.
          localization.changeLocale([ELVISH_WOODLAND, DWARFISH_NORTH]);

          // There should have no missing localization events.
          expect(events.length).toBe(1);
          expect(events[0].locales).toEqual([ELVISH_WOODLAND, DWARFISH_NORTH]);
          expect(events[0].missing).toEqual(['may your forge burn bright']);
        });
  });

  describe('locale changed event', function() {
    it('fires when locale changes', function() {
      const localization = new Localization(HALFLING_COMMON);

      const events = [];
      collectEvents(localization, Localization.LOCALE_CHANGED, events);

      // We are going from nothing to something, we should see an event.
      localization.changeLocale([DWARFISH_SOUTH]);
      expect(events.length).toBe(1);

      // We are changing from SOUTH to NORTH, we should see another event.
      localization.changeLocale([DWARFISH_NORTH]);
      expect(events.length).toBe(2);
    });

    it('fires when changing to the same locale', function() {
      const localization = new Localization(HALFLING_COMMON);

      const events = [];
      collectEvents(localization, Localization.LOCALE_CHANGED, events);

      // We are going from nothing to something, we should see an event.
      localization.changeLocale([DWARFISH_SOUTH]);
      expect(events.length).toBe(1);

      // We are going to ask to go our current locale, even through
      // conceptually this would be a no-op, the event should still fire.
      localization.changeLocale([DWARFISH_SOUTH]);
      expect(events.length).toBe(2);
    });
  });

  /**
   * Listen to |localization| for specific events and save them in |out|.
   *
   * @param {!shaka.ui.Localization} localization
   * @param {string} eventName
   * @param {!Array.<!shaka.util.FakeEvent>} out
   */
  function collectEvents(localization, eventName, out) {
    const onEvent = (event) => {
      const fakeEvent = /** @type {!shaka.util.FakeEvent} */ (event);
      out.push(fakeEvent);
    };

    localization.addEventListener(eventName, onEvent);
  }
});
