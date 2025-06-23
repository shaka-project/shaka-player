/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:words Österreich ﺎﻠﻋﺮﺒﻳﺓ

goog.provide('shaka.ui.LanguageUtils');

goog.require('mozilla.LanguageMapping');
goog.require('shaka.log');
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
   * @param {shaka.ui.Overlay.TrackLabelFormat} trackLabelFormat
   * @param {boolean} showAudioChannelCountVariants
   * @param {boolean} showAudioCodec
   */
  static updateAudioTracks(tracks, langMenu, onTrackSelected, updateChosen,
      currentSelectionElement, localization, trackLabelFormat,
      showAudioChannelCountVariants, showAudioCodec) {
    const LocIds = shaka.ui.Locales.Ids;

    // TODO: Do the benefits of having this common code in a method still
    // outweigh the complexity of the parameter list?
    const selectedTrack = tracks.find((track) => {
      return track.active == true;
    });

    if (tracks.length > 1 && tracks[0].label &&
        trackLabelFormat != shaka.ui.Overlay.TrackLabelFormat.LABEL &&
        shaka.ui.LanguageUtils.areAudioTracksEqualExceptLabel_(tracks)) {
      trackLabelFormat = shaka.ui.Overlay.TrackLabelFormat.LABEL;
    }

    /** @type {!Map<string, !Set<string>>} */
    const codecsByLanguage = new Map();
    for (const track of tracks) {
      if (!track.codecs) {
        continue;
      }
      if (!codecsByLanguage.has(track.language)) {
        codecsByLanguage.set(track.language, new Set());
      }
      codecsByLanguage.get(track.language).add(
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

    const getCombination = (language, rolesString, label, channelsCount,
        audioCodec, spatialAudio) => {
      const keys = [
        language,
        rolesString,
        spatialAudio,
      ];
      if (showAudioChannelCountVariants && channelsCount != null) {
        keys.push(channelsCount);
      }
      if (showAudioCodec && hasDifferentAudioCodecs(language) && audioCodec) {
        keys.push(audioCodec);
      }
      if (label &&
          trackLabelFormat == shaka.ui.Overlay.TrackLabelFormat.LABEL) {
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
        selectedTrack.label, selectedTrack.channelsCount,
        selectedTrack.codecs &&
        shaka.util.MimeUtils.getNormalizedCodec(selectedTrack.codecs),
        selectedTrack.spatialAudio) : '';

    for (const track of tracks) {
      const language = track.language;
      const rolesString = getRolesString(track);
      const label = track.label;
      const channelsCount = track.channelsCount;
      const audioCodec = track.codecs &&
          shaka.util.MimeUtils.getNormalizedCodec(track.codecs);
      const spatialAudio = track.spatialAudio;
      const combinationName =
          getCombination(language, rolesString, label, channelsCount,
              audioCodec, spatialAudio);
      if (combinationsMade.has(combinationName)) {
        continue;
      }
      combinationsMade.add(combinationName);

      const button = shaka.util.Dom.createButton();
      button.addEventListener('click', () => {
        onTrackSelected(track);
      });

      const span = shaka.util.Dom.createHTMLElement('span');
      button.appendChild(span);

      span.textContent =
          shaka.ui.LanguageUtils.getLanguageName(language, localization);
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
      switch (trackLabelFormat) {
        case shaka.ui.Overlay.TrackLabelFormat.LANGUAGE:
          span.textContent += basicInfo;
          break;
        case shaka.ui.Overlay.TrackLabelFormat.ROLE:
          span.textContent += basicInfo;
          if (!rolesString) {
            // Fallback behavior. This probably shouldn't happen.
            shaka.log.alwaysWarn('Track #' + JSON.stringify(track) +
                ' does not have a role, but the UI is configured to ' +
                'only show role.');
            span.textContent = '?';
          } else {
            span.textContent = rolesString;
          }
          break;
        case shaka.ui.Overlay.TrackLabelFormat.LANGUAGE_ROLE:
          span.textContent += basicInfo;
          if (rolesString) {
            span.textContent += ': ' + rolesString;
          }
          break;
        case shaka.ui.Overlay.TrackLabelFormat.LABEL:
          if (label) {
            span.textContent = label;
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
        button.ariaSelected = 'true';
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
   * @param {shaka.ui.Overlay.TrackLabelFormat} trackLabelFormat
   */
  static updateTextTracks(tracks, langMenu, onTrackSelected, updateChosen,
      currentSelectionElement, localization, trackLabelFormat) {
    const LocIds = shaka.ui.Locales.Ids;

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

    const getCombination = (language, rolesString, label) => {
      const keys = [
        language,
        rolesString,
      ];
      if (label &&
          trackLabelFormat == shaka.ui.Overlay.TrackLabelFormat.LABEL) {
        keys.push(label);
      }
      return keys.join(': ');
    };

    // 5. Add new buttons
    /** @type {!Set<string>} */
    const combinationsMade = new Set();
    const selectedCombination = selectedTrack ? getCombination(
        selectedTrack.language, getRolesString(selectedTrack),
        selectedTrack.label) : '';

    for (const track of tracks) {
      const language = track.language;
      const forced = track.forced;
      const forcedString = localization.resolve(LocIds.SUBTITLE_FORCED);
      const rolesString = getRolesString(track);
      const label = track.label;
      const combinationName =
          getCombination(language, rolesString, label);
      if (combinationsMade.has(combinationName)) {
        continue;
      }
      combinationsMade.add(combinationName);

      const button = shaka.util.Dom.createButton();
      button.addEventListener('click', () => {
        onTrackSelected(track);
      });

      const span = shaka.util.Dom.createHTMLElement('span');
      button.appendChild(span);

      span.textContent =
          shaka.ui.LanguageUtils.getLanguageName(language, localization);
      switch (trackLabelFormat) {
        case shaka.ui.Overlay.TrackLabelFormat.LANGUAGE:
          if (forced) {
            span.textContent += ' (' + forcedString + ')';
          }
          break;
        case shaka.ui.Overlay.TrackLabelFormat.ROLE:
          if (!rolesString) {
            // Fallback behavior. This probably shouldn't happen.
            shaka.log.alwaysWarn('Track #' + track.id + ' does not have a ' +
                'role, but the UI is configured to only show role.');
            span.textContent = '?';
          } else {
            span.textContent = rolesString;
          }
          if (forced) {
            span.textContent += ' (' + forcedString + ')';
          }
          break;
        case shaka.ui.Overlay.TrackLabelFormat.LANGUAGE_ROLE:
          if (rolesString) {
            span.textContent += ': ' + rolesString;
          }
          if (forced) {
            span.textContent += ' (' + forcedString + ')';
          }
          break;
        case shaka.ui.Overlay.TrackLabelFormat.LABEL:
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
        button.ariaSelected = 'true';
        currentSelectionElement.textContent = span.textContent;
      }
      langMenu.appendChild(button);
    }
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
   * @param {string} locale
   * @param {shaka.ui.Localization} localization
   * @return {string} The language's name for itself in its own script, or as
   *   close as we can get with the information we have.
   */
  static getLanguageName(locale, localization) {
    if (!locale && !localization) {
      return '';
    }

    // Shorthand for resolving a localization ID.
    const resolve = (id) => localization.resolve(id);

    // Handle some special cases first.  These are reserved language tags that
    // are used to indicate something that isn't one specific language.
    switch (locale) {
      case 'mul':
        return resolve(shaka.ui.Locales.Ids.MULTIPLE_LANGUAGES);
      case 'und':
        return resolve(shaka.ui.Locales.Ids.UNDETERMINED_LANGUAGE);
      case 'zxx':
        return resolve(shaka.ui.Locales.Ids.NOT_APPLICABLE);
    }

    // Extract the base language from the locale as a fallback step.
    const language = shaka.util.LanguageUtils.getBase(locale);

    // First try to resolve the full language name.
    // If that fails, try the base.
    // Finally, report "unknown".
    // When there is a loss of specificity (either to a base language or to
    // "unknown"), we should append the original language code.
    // Otherwise, there may be multiple identical-looking items in the list.
    if (locale in mozilla.LanguageMapping) {
      return mozilla.LanguageMapping[locale];
    } else if (language in mozilla.LanguageMapping) {
      return mozilla.LanguageMapping[language] + ' (' + locale + ')';
    } else {
      return resolve(shaka.ui.Locales.Ids.UNRECOGNIZED_LANGUAGE) +
          ' (' + locale + ')';
    }
  }
};
