/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:words Österreich ﺎﻠﻋﺮﺒﻳﺓ subtags

goog.provide('shaka.ui.LanguageUtils');

goog.require('mozilla.LanguageMapping');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Overlay.TrackLabelFormat');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.MimeUtils');
goog.requireType('shaka.ui.Localization');


shaka.ui.LanguageUtils = class {
  /**
   * @param {!Array<shaka.extern.AudioTrack>} tracks
   * @return {boolean}
   * @private
   */
  static areAudioTracksEqualExceptLabel_(tracks) {
    const basicTrack = (track) => {
      return {
        codecs: track.codecs,
        channelCount: track.channelCount,
        language: track.language,
        roles: track.roles,
        spatialAudio: track.spatialAudio,
      };
    };
    const reference = basicTrack(tracks[0]);
    return tracks.every((track) => {
      return JSON.stringify(basicTrack(track)) === JSON.stringify(reference);
    });
  }

  /**
   * @param {!Array<shaka.extern.AudioTrack>} tracks
   * @param {!HTMLElement} langMenu
   * @param {function(!shaka.extern.AudioTrack)} onTrackSelected
   * @param {boolean} updateChosen
   * @param {!HTMLElement} currentSelectionElement
   * @param {shaka.ui.Localization} localization
   * @param {!shaka.extern.UIConfiguration} config
   */
  static updateAudioTracks(tracks, langMenu, onTrackSelected, updateChosen,
      currentSelectionElement, localization, config) {
    const AccessibilityPurpose =
        shaka.media.ManifestParser.AccessibilityPurpose;
    const LocIds = shaka.ui.Locales.Ids;
    const TrackLabelFormat = shaka.ui.Overlay.TrackLabelFormat;

    let trackLabelFormat = config.trackLabelFormat;
    const showAudioChannelCountVariants = config.showAudioChannelCountVariants;
    const showAudioCodec = config.showAudioCodec;
    const preferIntlDisplayNames = config.preferIntlDisplayNames;

    // TODO: Do the benefits of having this common code in a method still
    // outweigh the complexity of the parameter list?
    const selectedTrack = tracks.find((track) => {
      return track.active == true;
    });

    if (tracks.length > 1 && tracks[0].label &&
        trackLabelFormat != TrackLabelFormat.LABEL &&
        shaka.ui.LanguageUtils.areAudioTracksEqualExceptLabel_(tracks)) {
      trackLabelFormat = TrackLabelFormat.LABEL;
    }

    /** @type {!Map<string, !Set<string>>} */
    const codecsByLanguage = new Map();
    for (const track of tracks) {
      if (!track.codecs) {
        continue;
      }
      codecsByLanguage.getOrInsertComputed(track.language, () => new Set()).add(
          shaka.util.MimeUtils.getNormalizedCodec(track.codecs));
    }
    const hasDifferentAudioCodecs = (language) =>
      codecsByLanguage.has(language) && codecsByLanguage.get(language).size > 1;

    // Remove old tracks
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        langMenu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(langMenu);

    // 3. Add the backTo Menu button back
    langMenu.appendChild(backButton);

    // 4. Figure out which languages have multiple roles.
    const getRolesString = (track) => {
      return track.roles.join(', ');
    };

    const getCombination = (language, rolesString, accessibilityPurpose, label,
        channelsCount, audioCodec, spatialAudio) => {
      const keys = [
        language,
        rolesString,
        accessibilityPurpose,
        spatialAudio,
      ];
      if (showAudioChannelCountVariants && channelsCount != null) {
        keys.push(channelsCount);
      }
      if (showAudioCodec && hasDifferentAudioCodecs(language) && audioCodec) {
        keys.push(audioCodec);
      }
      if (label && trackLabelFormat == TrackLabelFormat.LABEL) {
        keys.push(label);
      }
      return keys.join(': ');
    };

    const getChannelsCountName = (channelsCount) => {
      let name = '';
      if (channelsCount >= 5) {
        name = ' ' + localization.resolve(LocIds.SURROUND);
      }
      return name;
    };

    const getAudioCodecName = (audioCodec) => {
      let name = '';
      if (audioCodec == 'aac') {
        name = 'AAC';
      } else if (audioCodec === 'ac-3') {
        name = 'Dolby';
      } else if (audioCodec === 'ec-3') {
        name = 'DD+';
      } else if (audioCodec === 'ac-4') {
        name = 'Dolby AC-4';
      } else if (audioCodec === 'opus') {
        name = 'Opus';
      } else if (audioCodec === 'flac') {
        name = 'fLaC';
      }
      return name ? ' ' + name : name;
    };

    // 5. Add new buttons
    /** @type {!Set<string>} */
    const combinationsMade = new Set();
    const selectedCombination = selectedTrack ? getCombination(
        selectedTrack.language, getRolesString(selectedTrack),
        selectedTrack.accessibilityPurpose,
        selectedTrack.label, selectedTrack.channelsCount,
        selectedTrack.codecs &&
        shaka.util.MimeUtils.getNormalizedCodec(selectedTrack.codecs),
        selectedTrack.spatialAudio) : '';

    for (const track of tracks) {
      const language = track.language;
      const rolesString = getRolesString(track);
      const displayRolesString =
          shaka.ui.LanguageUtils.getDisplayRolesString_(track);
      const machineGeneratedSuffix =
          shaka.ui.LanguageUtils.getMachineGeneratedSuffix_(
              track, localization);
      const label = track.label;
      const channelsCount = track.channelsCount;
      const accessibilityPurpose = track.accessibilityPurpose;
      const audioCodec = track.codecs &&
          shaka.util.MimeUtils.getNormalizedCodec(track.codecs);
      const spatialAudio = track.spatialAudio;
      const combinationName =
          getCombination(language, rolesString, accessibilityPurpose, label,
              channelsCount, audioCodec, spatialAudio);
      if (combinationsMade.has(combinationName)) {
        continue;
      }
      combinationsMade.add(combinationName);

      const button = shaka.util.Dom.createButton();
      button.addEventListener('click', () => {
        onTrackSelected(track);
      });
      // ARIA: single-select menu item
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', 'false');

      const span = shaka.util.Dom.createHTMLElement('span');
      button.appendChild(span);

      let defaultLabel = shaka.ui.LanguageUtils.getLanguageName(
          language, localization, preferIntlDisplayNames);
      if (config.customTrackLabel) {
        const customLabel = config.customTrackLabel(
            defaultLabel, track, 'audio');
        if (customLabel) {
          defaultLabel = customLabel;
        }
      }
      if (!defaultLabel) {
        defaultLabel = localization.resolve(
            shaka.ui.Locales.Ids.UNRECOGNIZED_LANGUAGE) +
            ' (' + language + ')';
      }
      span.textContent = defaultLabel;
      let basicInfo = '';
      if (showAudioCodec && showAudioChannelCountVariants &&
          spatialAudio && (audioCodec == 'ec-3' || audioCodec == 'ac-4')) {
        basicInfo += ' Dolby Atmos';
      } else {
        if (showAudioCodec && hasDifferentAudioCodecs(language)) {
          basicInfo += getAudioCodecName(audioCodec);
        }
        if (showAudioChannelCountVariants) {
          basicInfo += getChannelsCountName(channelsCount);
        }
      }
      let labelFormat = trackLabelFormat;
      if (labelFormat === TrackLabelFormat.LABEL_OR_LANGUAGE) {
        labelFormat = label ?
            TrackLabelFormat.LABEL : TrackLabelFormat.LANGUAGE;
      } else if (labelFormat === TrackLabelFormat.LANGUAGE_OR_LABEL) {
        labelFormat = (language && language !== 'und') ?
            TrackLabelFormat.LANGUAGE : TrackLabelFormat.LABEL;
      }
      switch (labelFormat) {
        case TrackLabelFormat.LANGUAGE:
          span.textContent += basicInfo;
          if (accessibilityPurpose == AccessibilityPurpose.VISUALLY_IMPAIRED) {
            span.textContent += ' - ' +
                localization.resolve(shaka.ui.Locales.Ids.AUDIO_DESCRIPTION);
          }
          span.textContent += machineGeneratedSuffix;
          break;
        case TrackLabelFormat.ROLE:
          span.textContent += basicInfo;
          if (!displayRolesString) {
            if (machineGeneratedSuffix) {
              span.textContent += machineGeneratedSuffix;
            } else {
              // Fallback behavior. This probably shouldn't happen.
              shaka.log.alwaysWarn('Track #' + JSON.stringify(track) +
                  ' does not have a role, but the UI is configured to ' +
                  'only show role.');
              span.textContent = '?';
            }
          } else {
            span.textContent = displayRolesString + machineGeneratedSuffix;
          }
          break;
        case TrackLabelFormat.LANGUAGE_ROLE:
          span.textContent += basicInfo;
          span.textContent += machineGeneratedSuffix;
          if (displayRolesString) {
            span.textContent += ': ' + displayRolesString;
          }
          break;
        case TrackLabelFormat.LABEL:
          if (label) {
            span.textContent = label + basicInfo;
          } else {
            // Fallback behavior. This probably shouldn't happen.
            shaka.log.alwaysWarn('Track #' + JSON.stringify(track) +
                ' does not have a label, but the UI is configured to ' +
                'only show labels.');
            span.textContent = '?';
          }
          break;
      }

      if (updateChosen && (combinationName == selectedCombination)) {
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        button.setAttribute('aria-checked', 'true');
        currentSelectionElement.textContent = span.textContent;
      }
      langMenu.appendChild(button);
    }
  }


  /**
   * @param {!Array<shaka.extern.TextTrack>} tracks
   * @param {!HTMLElement} langMenu
   * @param {function(!shaka.extern.TextTrack)} onTrackSelected
   * @param {boolean} updateChosen
   * @param {!HTMLElement} currentSelectionElement
   * @param {shaka.ui.Localization} localization
   * @param {!shaka.extern.UIConfiguration} config
   */
  static updateTextTracks(tracks, langMenu, onTrackSelected, updateChosen,
      currentSelectionElement, localization, config) {
    const LocIds = shaka.ui.Locales.Ids;
    const TrackLabelFormat = shaka.ui.Overlay.TrackLabelFormat;

    const trackLabelFormat = config.textTrackLabelFormat;
    const preferIntlDisplayNames = config.preferIntlDisplayNames;

    // TODO: Do the benefits of having this common code in a method still
    // outweigh the complexity of the parameter list?
    const selectedTrack = tracks.find((track) => {
      return track.active == true;
    });

    // Remove old tracks
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        langMenu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(langMenu);

    // 3. Add the backTo Menu button back
    langMenu.appendChild(backButton);

    // 4. Figure out which languages have multiple roles.
    const getRolesString = (track) => {
      return track.roles.join(', ');
    };

    const getCombination = (language, rolesString, label, forced) => {
      const keys = [
        language,
        rolesString,
        forced,
      ];
      if (label && trackLabelFormat == TrackLabelFormat.LABEL) {
        keys.push(label);
      }
      return keys.join(': ');
    };

    // 5. Add new buttons
    /** @type {!Set<string>} */
    const combinationsMade = new Set();
    const selectedCombination = selectedTrack ? getCombination(
        selectedTrack.language, getRolesString(selectedTrack),
        selectedTrack.label, selectedTrack.forced) : '';

    for (const track of tracks) {
      const language = track.language;
      const forced = track.forced;
      const forcedString = localization.resolve(LocIds.SUBTITLE_FORCED);
      const rolesString = getRolesString(track);
      const displayRolesString =
          shaka.ui.LanguageUtils.getDisplayRolesString_(track);
      const machineGeneratedSuffix =
          shaka.ui.LanguageUtils.getMachineGeneratedSuffix_(
              track, localization);
      const label = track.label;
      const combinationName =
          getCombination(language, rolesString, label, forced);
      if (combinationsMade.has(combinationName)) {
        continue;
      }
      combinationsMade.add(combinationName);

      const button = shaka.util.Dom.createButton();
      button.addEventListener('click', () => {
        onTrackSelected(track);
      });
      // ARIA: single-select menu item
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', 'false');

      const span = shaka.util.Dom.createHTMLElement('span');
      button.appendChild(span);

      let defaultLabel;
      if (track.originalLanguage == 'speech-to-text') {
        // Necessary when there are multiple speech-to-text tracks and they
        // translate into different languages.
        if (language) {
          defaultLabel = [
            shaka.ui.LanguageUtils.getLanguageName(
                language, localization, preferIntlDisplayNames),
            ' (',
            localization.resolve(shaka.ui.Locales.Ids.AUTO_GENERATED),
            ')',
          ].join('');
        } else {
          defaultLabel =
              localization.resolve(shaka.ui.Locales.Ids.AUTO_GENERATED);
        }
      } else {
        defaultLabel =
            shaka.ui.LanguageUtils.getLanguageName(
                language, localization, preferIntlDisplayNames);
      }
      if (config.customTrackLabel) {
        const customLabel = config.customTrackLabel(
            defaultLabel, track, 'text');
        if (customLabel) {
          defaultLabel = customLabel;
        }
      }
      if (!defaultLabel) {
        defaultLabel = localization.resolve(
            shaka.ui.Locales.Ids.UNRECOGNIZED_LANGUAGE) +
            ' (' + language + ')';
      }
      span.textContent = defaultLabel;
      let labelFormat = trackLabelFormat;
      if (labelFormat === TrackLabelFormat.LABEL_OR_LANGUAGE) {
        labelFormat = label ?
            TrackLabelFormat.LABEL : TrackLabelFormat.LANGUAGE;
      } else if (labelFormat === TrackLabelFormat.LANGUAGE_OR_LABEL) {
        labelFormat = (language && language !== 'und') ?
            TrackLabelFormat.LANGUAGE : TrackLabelFormat.LABEL;
      }
      switch (labelFormat) {
        case TrackLabelFormat.LANGUAGE:
          span.textContent += machineGeneratedSuffix;
          if (forced) {
            span.textContent += ' (' + forcedString + ')';
          }
          break;
        case TrackLabelFormat.ROLE:
          if (!displayRolesString) {
            if (machineGeneratedSuffix) {
              // The only roles are machine-generated characteristics; surface
              // them via the language name + suffix so the button is not empty.
              span.textContent += machineGeneratedSuffix;
            } else {
              // Fallback behavior. This probably shouldn't happen.
              shaka.log.alwaysWarn('Track #' + track.id + ' does not have a ' +
                  'role, but the UI is configured to only show role.');
              span.textContent = '?';
            }
          } else {
            span.textContent = displayRolesString + machineGeneratedSuffix;
          }
          if (forced) {
            span.textContent += ' (' + forcedString + ')';
          }
          break;
        case TrackLabelFormat.LANGUAGE_ROLE:
          span.textContent += machineGeneratedSuffix;
          if (displayRolesString) {
            span.textContent += ': ' + displayRolesString;
          }
          if (forced) {
            span.textContent += ' (' + forcedString + ')';
          }
          break;
        case TrackLabelFormat.LABEL:
          if (label) {
            span.textContent = label;
          } else {
            // Fallback behavior. This probably shouldn't happen.
            shaka.log.alwaysWarn('Track #' + track.id + ' does not have a ' +
                'label, but the UI is configured to only show labels.');
            span.textContent = '?';
          }
          break;
      }

      if (updateChosen && (combinationName == selectedCombination)) {
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        button.setAttribute('aria-checked', 'true');
        currentSelectionElement.textContent = span.textContent;
      }
      langMenu.appendChild(button);
    }
  }


  /**
   * Checks whether a string returned by Intl.DisplayNames looks like a raw,
   * unresolved BCP-47/ISO-639 code rather than an actual display name.
   * Language subtags are always lowercase; real display names are
   * title-cased, or start with a character that has no letter case at all
   * (e.g. CJK, Arabic, Hebrew scripts).
   *
   * @param {string} name
   * @return {boolean}
   * @private
   */
  static looksLikeUnresolvedCode_(name) {
    const firstChar = name.charAt(0);
    return firstChar === firstChar.toLowerCase() &&
        firstChar !== firstChar.toUpperCase();
  }

  /**
   * @param {shaka.extern.AudioTrack|shaka.extern.TextTrack} track
   * @return {string}
   * @private
   */
  static getDisplayRolesString_(track) {
    return track.roles.filter(
        (r) => r !== shaka.ui.LanguageUtils.MACHINE_GENERATED_CHAR_ &&
            r !== shaka.ui.LanguageUtils.TRANSLATION_CHAR_,
    ).join(', ');
  }

  /**
   * @param {shaka.extern.AudioTrack|shaka.extern.TextTrack} track
   * @param {shaka.ui.Localization} localization
   * @return {string}
   * @private
   */
  static getMachineGeneratedSuffix_(track, localization) {
    if (!track.roles.includes(shaka.ui.LanguageUtils.MACHINE_GENERATED_CHAR_)) {
      return '';
    }
    const LocIds = shaka.ui.Locales.Ids;
    if (track.roles.includes(shaka.ui.LanguageUtils.TRANSLATION_CHAR_)) {
      return ' ' + localization.resolve(LocIds.MACHINE_TRANSLATED);
    }
    return ' ' + localization.resolve(LocIds.MACHINE_GENERATED);
  }

  /**
   * Returns the language's name for itself in its own script (autoglottonym),
   * if we have it.
   *
   * If the locale, including region, can be mapped to a name, we return a very
   * specific name including the region.  For example, "de-AT" would map to
   * "Deutsch (Österreich)" or Austrian German.
   *
   * If only the language part of the locale is in our map, we append the locale
   * itself for specificity.  For example, "ar-EG" (Egyptian Arabic) would map
   * to "ﺎﻠﻋﺮﺒﻳﺓ (ar-EG)".  In this way, multiple versions of Arabic whose
   * regions are not in our map would not all look the same in the language
   * list, but could be distinguished by their locale.
   *
   * Finally, if language part of the locale is not in our map, we label it
   * "unknown", as translated to the UI locale, and we append the locale itself
   * for specificity.  For example, "sjn" would map to "Unknown (sjn)".  In this
   * way, multiple unrecognized languages would not all look the same in the
   * language list, but could be distinguished by their locale.
   *
   * Sign languages are a special case: deprecated tags like "sgn-US" are
   * resolved to their replacement ISO 639-3 code ("ase") first, and a small
   * built-in table (SIGN_LANGUAGE_NAMES_) supplies an English name for those
   * codes when neither Intl.DisplayNames nor mozilla.LanguageMapping has one.
   *
   * @param {string} locale
   * @param {shaka.ui.Localization} localization
   * @param {boolean} preferIntlDisplayNames
   * @return {?string} The language's name for itself in its own script, or as
   *   close as we can get with the information we have.  Returns null if the
   *   language is not recognized.
   */
  static getLanguageName(locale, localization, preferIntlDisplayNames) {
    if (!locale && !localization) {
      return '';
    }

    // Shorthand for resolving a localization ID.
    const resolve = (id) => localization.resolve(id);

    // Handle some special cases first.  These are reserved language tags that
    // are used to indicate something that isn't one specific language.
    // About qaa and qad:
    // https://mailman.videolan.org/pipermail/vlc-devel/2007-February/029773.html
    // https://www.etsi.org/deliver/etsi_en/300400_300499/300468/01.17.01_20/en_300468v011701a.pdf
    // qaa: defined in DVB, ETSI EN 300 468 V1.17.1 (2022-07), Annex F.
    // qad: defined in DVB, ETSI EN 300 468 V1.17.1 (2022-07), Annex J, J.3.2.
    switch (locale) {
      case 'mul':
        return resolve(shaka.ui.Locales.Ids.MULTIPLE_LANGUAGES);
      case 'qaa':
        return resolve(shaka.ui.Locales.Ids.ORIGINAL_VERSION);
      case 'qad':
        return resolve(shaka.ui.Locales.Ids.AUDIO_DESCRIPTION);
      case 'und':
        return resolve(shaka.ui.Locales.Ids.UNDETERMINED_LANGUAGE);
      case 'zxx':
        return resolve(shaka.ui.Locales.Ids.NOT_APPLICABLE);
    }

    // Some BCP-47 tags are deprecated "grandfathered" forms that RFC 5645
    // replaced with a specific ISO 639-3 code -- most commonly the 'sgn-XX'
    // sign-language tags (e.g. 'sgn-US' -> 'ase', American Sign Language).
    // Manifests routinely still use the deprecated form, but neither our own
    // name table nor (for most of them) Intl.DisplayNames recognize it, so
    // resolve to the canonical code before doing any name lookup.
    const canonicalLocale =
        shaka.ui.LanguageUtils.SIGN_LANGUAGE_ALIASES_.get(
            locale.toLowerCase()) || locale;

    // Extract the base language from the locale as a fallback step.
    const language = shaka.util.LanguageUtils.getBase(canonicalLocale);

    // If Intl.DisplayNames is supported we prefer it, because the list of
    // languages is up to date.
    if (preferIntlDisplayNames && window.Intl && 'DisplayNames' in Intl) {
      try {
        const locales = [...localization.getCurrentLocales()];
        if (!locales.length) {
          locales.push(locale);
        }
        const languageNames = new Intl.DisplayNames(locales,
            {type: 'language', languageDisplay: 'standard'});
        const languageName = languageNames.of(canonicalLocale);
        // Only prefer it when it's reliable.  Intl.DisplayNames falls back
        // to echoing the (possibly re-canonicalized) language identifier
        // itself when it has no display name for it -- e.g. 'dse' (Dutch
        // Sign Language) has no display name in some ICU versions, so 'dse'
        // is returned as-is.  Such fallbacks are always still-raw BCP-47
        // subtags, which start with a lowercase letter; real display names
        // are title-cased (or start with an uncased character, for scripts
        // without letter case).  Reject the lowercase-start case so we don't
        // show a code like "Dse" as if it were a real name.
        if (languageName &&
            languageName.toLowerCase() != canonicalLocale.toLowerCase() &&
            !shaka.ui.LanguageUtils.looksLikeUnresolvedCode_(languageName)) {
          return languageName.charAt(0).toUpperCase() + languageName.slice(1);
        }
      } catch (e) {
        // Ignore errors and try the fallback
      }
    }

    // First try to resolve the full language name.
    // If that fails, try the base.
    // Finally, report "unknown".
    // When there is a loss of specificity (either to a base language or to
    // "unknown"), we should append the original language code.
    // Otherwise, there may be multiple identical-looking items in the list.
    const SignNames = shaka.ui.LanguageUtils.SIGN_LANGUAGE_NAMES_;
    if (canonicalLocale in mozilla.LanguageMapping) {
      return mozilla.LanguageMapping[canonicalLocale];
    } else if (language in mozilla.LanguageMapping) {
      return mozilla.LanguageMapping[language] + ' (' + locale + ')';
    } else if (canonicalLocale in SignNames) {
      return SignNames[canonicalLocale];
    } else if (language in SignNames) {
      return SignNames[language] + ' (' + locale + ')';
    } else {
      return null;
    }
  }
};

/**
 * @const {string}
 * @private
 */
shaka.ui.LanguageUtils.MACHINE_GENERATED_CHAR_ = 'public.machine-generated';

/**
 * @const {string}
 * @private
 */
shaka.ui.LanguageUtils.TRANSLATION_CHAR_ = 'public.translation';

/**
 * A map from deprecated "grandfathered" BCP-47 sign-language tags to the
 * specific ISO 639-3 code that replaced them, per RFC 5645
 * (https://www.rfc-editor.org/rfc/rfc5645.html, section 2.5).  For example,
 * 'sgn-US' (American Sign Language) is not itself a valid ISO 639-3 code;
 * its replacement is 'ase'.  Manifests still commonly use the deprecated
 * 'sgn-XX' form, so we resolve it before doing any name lookup.  Keys are
 * lowercase.  Three-part tags (e.g. 'sgn-be-fr') are included for
 * completeness, but shaka.util.LanguageUtils.normalize() currently drops
 * anything past the first two subtags, so they will rarely reach here
 * un-collapsed.
 * @const {!Map<string, string>}
 * @private
 */
shaka.ui.LanguageUtils.SIGN_LANGUAGE_ALIASES_ = new Map([
  ['sgn-be-fr', 'sfb'], ['sgn-be-nl', 'vgt'], ['sgn-br', 'bzs'],
  ['sgn-ch-de', 'sgg'], ['sgn-co', 'csn'], ['sgn-de', 'gsg'],
  ['sgn-dk', 'dsl'], ['sgn-es', 'ssp'], ['sgn-fr', 'fsl'],
  ['sgn-gb', 'bfi'], ['sgn-gr', 'gss'], ['sgn-ie', 'isg'],
  ['sgn-it', 'ise'], ['sgn-jp', 'jsl'], ['sgn-mx', 'mfs'],
  ['sgn-ni', 'ncs'], ['sgn-nl', 'dse'], ['sgn-no', 'nsl'],
  ['sgn-pt', 'psr'], ['sgn-se', 'swl'], ['sgn-us', 'ase'],
  ['sgn-za', 'sfs'],
]);

/**
 * Display names for sign-language ISO 639-3 codes that are missing or
 * unreliable in both mozilla.LanguageMapping and Intl.DisplayNames (verified
 * against Chrome/Node ICU: only 'ase' reliably resolves via Intl, the rest
 * echo the code back unchanged).  Names are the reference names from RFC
 * 5645 / the ISO 639-3 registry; sign languages have no written script of
 * their own, so there is no autoglottonym to prefer here, unlike the rest of
 * mozilla.LanguageMapping.
 * @const {!Object<string, string>}
 * @private
 */
shaka.ui.LanguageUtils.SIGN_LANGUAGE_NAMES_ = {
  'ase': 'American Sign Language',
  'bfi': 'British Sign Language',
  'bzs': 'Brazilian Sign Language',
  'csn': 'Colombian Sign Language',
  'dse': 'Dutch Sign Language',
  'dsl': 'Danish Sign Language',
  'fsl': 'French Sign Language',
  'gsg': 'German Sign Language',
  'gss': 'Greek Sign Language',
  'isg': 'Irish Sign Language',
  'ise': 'Italian Sign Language',
  'jsl': 'Japanese Sign Language',
  'mfs': 'Mexican Sign Language',
  'ncs': 'Nicaraguan Sign Language',
  'nsl': 'Norwegian Sign Language',
  'psr': 'Portuguese Sign Language',
  'sfb': 'French Belgian Sign Language',
  'sfs': 'South African Sign Language',
  'sgg': 'Swiss German Sign Language',
  'ssp': 'Spanish Sign Language',
  'swl': 'Swedish Sign Language',
  'vgt': 'Flemish Sign Language',
};
