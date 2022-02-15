/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Localization');
goog.provide('shaka.ui.Localization.ConflictResolution');

goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.LanguageUtils');


// TODO: link to the design and usage documentation here
// b/117679670
/**
 * Localization system provided by the shaka ui library.
 * It can be used to store the various localized forms of
 * strings that are expected to be displayed to the user.
 * If a string is not available, it will return the localized
 * form in the closest related locale.
 *
 * @final
 * @export
 */
shaka.ui.Localization = class extends shaka.util.FakeEventTarget {
  /**
   * @param {string} fallbackLocale
   *    The fallback locale that should be used. It will be assumed that this
   *    locale should have entries for just about every request.
   */
  constructor(fallbackLocale) {
    super();

    /** @private {string} */
    this.fallbackLocale_ = shaka.util.LanguageUtils.normalize(fallbackLocale);

    /**
     * The current mappings that will be used when requests are made. Since
     * nothing has been loaded yet, there will be nothing in this map.
     *
     * @private {!Map.<string, string>}
     */
    this.currentMap_ = new Map();

    /**
     * The locales that were used when creating |currentMap_|. Since we don't
     * have anything when we first initialize, an empty set means "no
     * preference".
     *
     * @private {!Set.<string>}
     */
    this.currentLocales_ = new Set();

    /**
     * A map of maps where:
     *  - The outer map is a mapping from locale code to localizations.
     *  - The inner map is a mapping from id to localized text.
     *
     * @private {!Map.<string, !Map.<string, string>>}
     */
    this.localizations_ = new Map();
  }

  /**
   * @override
   * @export
   */
  release() {
    // Placeholder so that readers know this implements IReleasable (via
    // FakeEventTarget)
    super.release();
  }

  /**
   * Request the localization system to change which locale it serves. If any of
   * of the preferred locales cannot be found, the localization system will fire
   * an event identifying which locales it does not know. The localization
   * system will then continue to operate using the closest matches it has.
   *
   * @param {!Iterable.<string>} locales
   *    The locale codes for the requested locales in order of preference.
   * @export
   */
  changeLocale(locales) {
    const Class = shaka.ui.Localization;

    // Normalize the locale so that matching will be easier. We need to reset
    // our internal set of locales so that we have the same order as the new
    // set.
    this.currentLocales_.clear();
    for (const locale of locales) {
      this.currentLocales_.add(shaka.util.LanguageUtils.normalize(locale));
    }

    this.updateCurrentMap_();

    // Check if we have support for the exact locale requested. Even through we
    // will do our best to return the most relevant results, we need to tell
    // app that some data may be missing.
    const missing = shaka.util.Iterables.filter(
        this.currentLocales_,
        (locale) => !this.localizations_.has(locale));

    if (missing.length) {
      this.dispatchEvent(new shaka.util.FakeEvent(
          Class.UNKNOWN_LOCALES,
          (new Map()).set('locales', missing)));
    }

    const found = shaka.util.Iterables.filter(
        this.currentLocales_,
        (locale) => this.localizations_.has(locale));

    const data = (new Map()).set(
        'locales', found.length ? found : [this.fallbackLocale_]);
    this.dispatchEvent(new shaka.util.FakeEvent(
        Class.LOCALE_CHANGED,
        data));
  }

  /**
   * Insert a set of localizations for a single locale. This will amend the
   * existing localizations for the given locale.
   *
   * @param {string} locale
   *   The locale that the localizations should be added to.
   * @param {!Map.<string, string>} localizations
   *   A mapping of id to localized text that should used to modify the internal
   *   collection of localizations.
   * @param {shaka.ui.Localization.ConflictResolution=} conflictResolution
   *   The strategy used to resolve conflicts when the id of an existing entry
   *   matches the id of a new entry. Default to |USE_NEW|, where the new
   *   entry will replace the old entry.
   * @return {!shaka.ui.Localization}
   *   Returns |this| so that calls can be chained.
   * @export
   */
  insert(locale, localizations, conflictResolution) {
    const Class = shaka.ui.Localization;
    const ConflictResolution = shaka.ui.Localization.ConflictResolution;
    const FakeEvent = shaka.util.FakeEvent;

    // Normalize the locale so that matching will be easier.
    locale = shaka.util.LanguageUtils.normalize(locale);

    // Default |conflictResolution| to |USE_NEW| if it was not given. Doing it
    // here because it would create too long of a parameter list.
    if (conflictResolution === undefined) {
      conflictResolution = ConflictResolution.USE_NEW;
    }

    // Make sure we have an entry for the locale because we are about to
    // write to it.
    const table = this.localizations_.get(locale) || new Map();
    localizations.forEach((value, id) => {
      // Set the value if we don't have an old value or if we are to replace
      // the old value with the new value.
      if (!table.has(id) || conflictResolution == ConflictResolution.USE_NEW) {
        table.set(id, value);
      }
    });
    this.localizations_.set(locale, table);

    // The data we use to make our map may have changed, update the map we pull
    // data from.
    this.updateCurrentMap_();

    this.dispatchEvent(new FakeEvent(Class.LOCALE_UPDATED));

    return this;
  }

  /**
   * Set the value under each key in |dictionary| to the resolved value.
   * Convenient for apps with some kind of data binding system.
   *
   * Equivalent to:
   *    for (const key of dictionary.keys()) {
   *      dictionary.set(key, localization.resolve(key));
   *    }
   *
   * @param {!Map.<string, string>} dictionary
   * @export
   */
  resolveDictionary(dictionary) {
    for (const key of dictionary.keys()) {
      // Since we are not changing what keys are in the map, it is safe to
      // update the map while iterating it.
      dictionary.set(key, this.resolve(key));
    }
  }

  /**
   * Request the localized string under the given id. If there is no localized
   * version of the string, then the fallback localization will be given
   * ("en" version). If there is no fallback localization, a non-null empty
   * string will be returned.
   *
   * @param {string} id The id for the localization entry.
   * @return {string}
   * @export
   */
  resolve(id) {
    const Class = shaka.ui.Localization;
    const FakeEvent = shaka.util.FakeEvent;

    /** @type {string} */
    const result = this.currentMap_.get(id);

    // If we have a result, it means that it was found in either the current
    // locale or one of the fall-backs.
    if (result) {
      return result;
    }

    // Since we could not find the result, it means it is missing from a large
    // number of locales. Since we don't know which ones we actually checked,
    // just tell them the preferred locale.

    const data = new Map()
        // Make a copy to avoid leaking references.
        .set('locales', Array.from(this.currentLocales_))
        .set('missing', id);
    this.dispatchEvent(new FakeEvent(Class.UNKNOWN_LOCALIZATION, data));

    return '';
  }

  /**
   * @private
   */
  updateCurrentMap_() {
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {!Map.<string, !Map.<string, string>>} */
    const localizations = this.localizations_;
    /** @type {string} */
    const fallbackLocale = this.fallbackLocale_;
    /** @type {!Iterable.<string>} */
    const preferredLocales = this.currentLocales_;

    /**
     * We want to create a single map that gives us the best possible responses
     * for the current locale. To do this, we will go through be loosest
     * matching locales to the best matching locales. By the time we finish
     * flattening the maps, the best result will be left under each key.
     *
     * Get the locales we should use in order of preference. For example with
     * preferred locales of "elvish-WOODLAND" and "dwarfish-MOUNTAIN" and a
     * fallback of "common-HUMAN", this would look like:
     *
     * new Set([
     *    // Preference 1
     *    'elvish-WOODLAND',
     *    // Preference 1 Base
     *    'elvish',
     *    // Preference 1 Siblings
     *    'elvish-WOODLAND', 'elvish-WESTWOOD', 'elvish-MARSH,
     *    // Preference 2
     *    'dwarfish-MOUNTAIN',
     *    // Preference 2 base
     *    'dwarfish',
     *    // Preference 2 Siblings
     *    'dwarfish-MOUNTAIN', 'dwarfish-NORTH', "dwarish-SOUTH",
     *    // Fallback
     *    'common-HUMAN',
     * ])
     *
     * @type {!Set.<string>}
     */
    const localeOrder = new Set();

    for (const locale of preferredLocales) {
      localeOrder.add(locale);
      localeOrder.add(LanguageUtils.getBase(locale));

      const siblings = shaka.util.Iterables.filter(
          localizations.keys(),
          (other) => LanguageUtils.areSiblings(other, locale));

      // Sort the siblings so that they will always appear in the same order
      // regardless of the order of |localizations|.
      siblings.sort();
      for (const locale of siblings) {
        localeOrder.add(locale);
      }

      const children = shaka.util.Iterables.filter(
          localizations.keys(),
          (other) => LanguageUtils.getBase(other) == locale);

      // Sort the children so that they will always appear in the same order
      // regardless of the order of |localizations|.
      children.sort();
      for (const locale of children) {
        localeOrder.add(locale);
      }
    }

    // Finally we add our fallback (something that should have all expected
    // entries).
    localeOrder.add(fallbackLocale);

    // Add all the sibling maps.
    /** @type {!Array.<!Map.<string, string>>} */
    const mergeOrder = [];
    for (const locale of localeOrder) {
      const map = localizations.get(locale);
      if (map) {
        mergeOrder.push(map);
      }
    }

    // We need to reverse the merge order. We build the order based on most
    // preferred to least preferred. However, the merge will work in the
    // opposite order so we must reverse our maps so that the most preferred
    // options will be applied last.
    mergeOrder.reverse();

    // Merge all the options into our current map.
    this.currentMap_.clear();
    for (const map of mergeOrder) {
      map.forEach((value, key) => {
        this.currentMap_.set(key, value);
      });
    }

    // Go through every key we have and see if any preferred locales are
    // missing entries. This will allow app developers to find holes in their
    // localizations.

    /** @type {!Iterable.<string>} */
    const allKeys = this.currentMap_.keys();

    /** @type {!Set.<string>} */
    const missing = new Set();

    for (const locale of this.currentLocales_) {
      // Make sure we have a non-null map. The diff will be easier that way.
      const map = this.localizations_.get(locale) || new Map();
      shaka.ui.Localization.findMissingKeys_(map, allKeys, missing);
    }

    if (missing.size > 0) {
      const data = new Map()
          // Make a copy of the preferred locales to avoid leaking references.
          .set('locales', Array.from(preferredLocales))
          // Because more people like arrays more than sets, convert the set to
          // an array.
          .set('missing', Array.from(missing));

      this.dispatchEvent(new shaka.util.FakeEvent(
          shaka.ui.Localization.MISSING_LOCALIZATIONS,
          data));
    }
  }

  /**
   * Go through a map and add all the keys that are in |keys| but not in
   * |map| to |missing|.
   *
   * @param {!Map.<string, string>} map
   * @param {!Iterable.<string>} keys
   * @param {!Set.<string>} missing
   * @private
   */
  static findMissingKeys_(map, keys, missing) {
    for (const key of keys) {
      // Check if the value is missing so that we are sure that it does not
      // have a value. We get the value and not just |has| so that a null or
      // empty string will fail this check.
      if (!map.get(key)) {
        missing.add(key);
      }
    }
  }
};


/**
 * An enum for how the localization system should resolve conflicts between old
 * translations and new translations.
 *
 * @enum {number}
 * @export
 */
shaka.ui.Localization.ConflictResolution = {
  'USE_OLD': 0,
  'USE_NEW': 1,
};

/**
 * The event name for when locales were requested, but we could not find any
 * entries for them. The localization system will continue to use the closest
 * matches it has.
 *
 * @const {string}
 * @export
 */
shaka.ui.Localization.UNKNOWN_LOCALES = 'unknown-locales';

/**
 * The event name for when an entry could not be found in the preferred locale,
 * related locales, or the fallback locale.
 *
 * @const {string}
 * @export
 */
shaka.ui.Localization.UNKNOWN_LOCALIZATION = 'unknown-localization';

/**
 * The event name for when entries are missing from the user's preferred
 * locale, but we were able to find an entry in a related locale or the fallback
 * locale.
 *
 * @const {string}
 * @export
 */
shaka.ui.Localization.MISSING_LOCALIZATIONS = 'missing-localizations';

/**
 * The event name for when a new locale has been requested and any previously
 * resolved values should be updated.
 *
 * @const {string}
 * @export
 */
shaka.ui.Localization.LOCALE_CHANGED = 'locale-changed';

/**
 * The event name for when |insert| was called and it changed entries that could
 * affect previously resolved values.
 *
 * @const {string}
 * @export
 */
shaka.ui.Localization.LOCALE_UPDATED = 'locale-updated';

/**
 * @event shaka.ui.Localization.UnknownLocalesEvent
 * @property {string} type
 *   'unknown-locales'
 * @property {!Array.<string>} locales
 *    The locales that the user wanted but could not be found.
 * @exportDoc
 */

/**
 * @event shaka.ui.Localization.MissingLocalizationsEvent
 * @property {string} type
 *   'unknown-localization'
 * @property {!Array.<string>} locales
 *    The locales that the user wanted.
 * @property {string} missing
 *    The id of the unknown entry.
 * @exportDoc
 */

/**
 * @event shaka.ui.Localization.MissingLocalizationsEvent
 * @property {string} type
 *   'missing-localizations'
 * @property {string} locale
 *    The locale that the user wanted.
 * @property {!Array.<string>} missing
 *    The ids of the missing entries.
 * @exportDoc
 */

/**
 * @event shaka.ui.Localization.LocaleChangedEvent
 * @property {string} type
 *   'locale-changed'
 * @property {!Array.<string>} locales
 *    The new set of locales that user wanted,
 *    and that were successfully found.
 * @exportDoc
 */
